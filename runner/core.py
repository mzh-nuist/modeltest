"""Auditable, sequential OpenAI-compatible SSE evaluations.

Protocol reference (checked 2026-10-23):
https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
"""
from __future__ import annotations

import copy
import base64
import binascii
import datetime as dt
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from .rates import estimate_rates
from .anthropic import MessagesStream


SCHEMA = "1.0"
METRICS = ("ttftMs", "ttfaMs", "durationMs", "outputTps", "charsPerSec",
           "inputTokens", "outputTokens", "reasoningTokens", "cost")
SECRET_KEYS = re.compile(r"authorization|api.?key|access.?token|secret|cookie|headers", re.I)
MODEL_PUBLIC = ("id", "name", "family", "provider", "endpoint", "version", "reasoning",
                "contextWindow", "maxOutputTokens", "inputPrice", "outputPrice",
                "cachedInputPrice", "currency", "sourceUrl", "sourceDate", "tags",
                "status", "description")
TASK_PUBLIC = ("id", "title", "category", "difficulty", "prompt", "reference", "rubric",
               "maxOutputTokens", "grader", "source", "evaluation")
MAX_FILE_BYTES = 32 * 1024 * 1024
ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,120}$")


class ConfigError(ValueError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def nonnegative(value):
    return number(value) and value >= 0


def token_number(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def load_json(path):
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ConfigError("JSON exceeds the 32 MiB local limit")
    return json.loads(path.read_text(encoding="utf-8-sig"), parse_constant=lambda _: (_ for _ in ()).throw(ConfigError("Non-finite JSON number")))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def clean(value, secrets=()):
    """Redact known credentials and credential-shaped fields, including echoed content."""
    if isinstance(value, dict):
        return {str(k): ("[REDACTED]" if SECRET_KEYS.search(str(k)) else clean(v, secrets)) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v, secrets) for v in value]
    if isinstance(value, str):
        for secret in sorted((s for s in secrets if s), key=len, reverse=True):
            value = value.replace(secret, "[REDACTED]")
        value = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*", "Bearer [REDACTED]", value)
        value = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}", "[REDACTED]", value)
    return value


def safe_url(value, local=False):
    if not isinstance(value, str):
        return False
    try:
        parsed = urllib.parse.urlsplit(value)
        return bool(parsed.hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
                    and (parsed.scheme == "https" or (local and parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1"))))
    except ValueError:
        return False


def task_list(dataset):
    if not isinstance(dataset, (dict, list)):
        raise ConfigError("Dataset must be an object or tasks array")
    tasks = dataset if isinstance(dataset, list) else dataset.get("tasks", [])
    if not isinstance(tasks, list) or not tasks:
        raise ConfigError("Dataset must contain a nonempty tasks array")
    seen = set()
    for task in tasks:
        if not isinstance(task, dict) or not isinstance(task.get("id"), str) or not ID_PATTERN.fullmatch(task["id"]) or task["id"] in seen:
            raise ConfigError("Task IDs must be nonempty and unique")
        seen.add(task["id"])
        if not isinstance(task.get("prompt"), str) or not task["prompt"].strip():
            raise ConfigError("Task prompt must be nonempty")
        if task.get("category") not in ("math", "code", "chinese", "data", "longcontext", "instruction", "visual"):
            raise ConfigError("Unsupported task category")
        if task.get("difficulty") not in ("easy", "medium", "hard"):
            raise ConfigError("Unsupported task difficulty")
        if not token_number(task.get("maxOutputTokens")) or task["maxOutputTokens"] < 1:
            raise ConfigError("Each task needs a positive maxOutputTokens")
        grader = task.get("grader", {})
        if not isinstance(grader, dict) or grader.get("type") not in ("exact", "contains", "json_fields", "manual", "contract"):
            raise ConfigError("Unsupported grader")
        if grader["type"] == "contract":
            from .scoring import validate_spec
            try: validate_spec(grader)
            except (ValueError, TypeError, KeyError) as exc: raise ConfigError("Invalid scoring contract: " + str(exc))
        if grader["type"] == "exact" and not isinstance(grader.get("expected"), str):
            raise ConfigError("exact.expected must be a string")
        if grader["type"] == "contains" and (not isinstance(grader.get("required"), list) or not grader["required"] or not all(isinstance(x, str) and x for x in grader["required"])):
            raise ConfigError("contains.required must be a nonempty string array")
        if grader["type"] == "json_fields" and (not isinstance(grader.get("expected"), dict) or not grader["expected"]):
            raise ConfigError("json_fields.expected must be a nonempty object")
    return tasks


def selected_tasks(config, dataset):
    tasks = task_list(dataset)
    selection = config.get("taskIds")
    if selection is None:
        return tasks
    if not isinstance(selection, list) or not selection or not all(isinstance(x, str) for x in selection) or len(set(selection)) != len(selection):
        raise ConfigError("taskIds must be a nonempty array of unique task IDs, or omitted")
    available = {task["id"]: task for task in tasks}
    if any(task_id not in available for task_id in selection):
        raise ConfigError("taskIds contains a task absent from the supplied dataset")
    return [available[task_id] for task_id in selection]


def make_plan(config, dataset):
    if not isinstance(config, dict):
        raise ConfigError("Config must be an object")
    tasks = selected_tasks(config, dataset)
    if config.get("metricProtocol") not in (None, "core-client-v1"):
        raise ConfigError("Unknown metricProtocol")
    simulation = config.get("simulation", False)
    if not isinstance(simulation, bool):
        raise ConfigError("simulation must be boolean")
    budget = config.get("budgetUsd")
    if not nonnegative(budget) or budget <= 0:
        raise ConfigError("An explicit positive budgetUsd is required")
    repeats = config.get("repeats", 1)
    retries = config.get("maxRetries", 0)
    timeout = config.get("timeoutSeconds", 60)
    if not token_number(repeats) or not 1 <= repeats <= 100:
        raise ConfigError("repeats must be in 1..100")
    if not token_number(retries) or retries > 3:
        raise ConfigError("maxRetries must be in 0..3")
    if not number(timeout) or not 0.05 <= timeout <= 600:
        raise ConfigError("timeoutSeconds must be in 0.05..600")
    if config.get("concurrency", 1) != 1:
        raise ConfigError("This runner deliberately supports concurrency=1 only")
    models = config.get("models")
    if not isinstance(models, list) or not models:
        raise ConfigError("At least one model configuration is required")
    seen = set()
    for model in models:
        if not isinstance(model, dict) or not isinstance(model.get("id"), str) or not ID_PATTERN.fullmatch(model["id"]) or model["id"] in seen:
            raise ConfigError("Model IDs must be nonempty and unique")
        seen.add(model["id"])
        if model.get("adapter", "openai-compatible") not in ("openai-compatible", "anthropic-messages"):
            raise ConfigError("Unsupported adapter")
        if model.get("adapter") == "anthropic-messages" and model.get("reasoningEffort") is not None and model.get('anthropicEffortProtocol') != 'adaptive-v1':
            raise ConfigError("Messages effort controls are not implemented; leave reasoningEffort null")
        if model.get("authMode", "bearer") not in ("bearer", "x-api-key"):
            raise ConfigError("authMode must be bearer or x-api-key")
        if not safe_url(model.get("endpoint"), local=simulation):
            raise ConfigError("Endpoint needs HTTPS without credentials/query/fragment; simulation allows loopback HTTP")
        if simulation and urllib.parse.urlsplit(model["endpoint"]).hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ConfigError("Simulation is restricted to loopback endpoints")
        if not isinstance(model.get("apiModel"), str) or not model["apiModel"]:
            raise ConfigError("apiModel is required")
        if not simulation and (not isinstance(model.get("apiKeyEnv"), str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", model["apiKeyEnv"])):
            raise ConfigError("apiKeyEnv must name an environment variable")
        if any(SECRET_KEYS.search(key) and key != "apiKeyEnv" for key in model):
            raise ConfigError("Inline credentials and custom headers are forbidden")
        if model.get("currency", "USD") != "USD":
            raise ConfigError("Budget accounting requires USD prices")
        for key in ("inputPrice", "outputPrice"):
            if not nonnegative(model.get(key)):
                raise ConfigError("Unknown or invalid pricing blocks execution and budget planning")
        if not token_number(model.get("maxInputTokens")) or model["maxInputTokens"] < 1024:
            raise ConfigError("maxInputTokens must provide an explicit input reservation >= 1024")
        if not token_number(model.get("maxOutputTokens")) or model["maxOutputTokens"] < 1:
            raise ConfigError("maxOutputTokens must be positive")
        if model.get("outputLimitIncludesReasoning") is not True:
            raise ConfigError("A documented output cap including reasoning is required")
        if model.get("maxTokensParameter", "max_completion_tokens") not in ("max_tokens", "max_completion_tokens"):
            raise ConfigError("Unsupported output-limit parameter")
        if model.get("streamUsageMode") not in (None, "cumulative_visible_fixture"):
            raise ConfigError("Unsupported streamUsageMode")
        if model.get("streamUsageMode") and not simulation:
            raise ConfigError("Fixture per-chunk counters are simulation-only")
        if model.get("usageSemantics", "includes_reasoning") not in ("includes_reasoning", "visible_only"):
            raise ConfigError("usageSemantics must be includes_reasoning or visible_only")
        if model.get("temperature") is not None and (not number(model["temperature"]) or not 0 <= model["temperature"] <= 2):
            raise ConfigError("temperature must be null or 0..2")
        if model.get("reasoningEffort") is not None and model["reasoningEffort"] not in ("none", "minimal", "low", "medium", "high", "xhigh"):
            raise ConfigError("Unsupported reasoningEffort; check the provider protocol")
        for task in tasks:
            # UTF-8 bytes + a deliberately large framing allowance. This is a
            # conservative reservation assumption, not a tokenizer measurement.
            if len(task["prompt"].encode("utf-8")) + 1024 > model["maxInputTokens"]:
                raise ConfigError("Prompt exceeds the configured conservative input reservation")
    jobs = []
    for repeat in range(repeats):
        for task_index, task in enumerate(tasks):
            offset = (repeat + task_index) % len(models)
            for model in models[offset:] + models[:offset]:
                output_cap = min(task["maxOutputTokens"], model["maxOutputTokens"])
                reserved = (model["maxInputTokens"] * model["inputPrice"] + output_cap * model["outputPrice"]) / 1_000_000
                if not nonnegative(reserved):
                    raise ConfigError("Price and token bounds overflow a finite budget")
                jobs.append({"modelId": model["id"], "taskId": task["id"], "repeatIndex": repeat,
                             "maxOutputTokens": output_cap, "reservedUsdPerAttempt": reserved})
    upper = sum(job["reservedUsdPerAttempt"] * (retries + 1) for job in jobs)
    return {"schemaVersion": SCHEMA, "kind": "plan", "simulation": simulation, "budgetUsd": budget,
            "plannedRequests": len(jobs), "maximumAttempts": len(jobs) * (retries + 1),
            "taskIds": [task["id"] for task in tasks],
            "reservedUpperBoundUsd": round(upper, 12), "fitsBudget": upper <= budget,
            "assumption": "Input uses the configured conservative token reservation; output cap must include billable reasoning. Provider invoice is authoritative. No requests are sent by plan.",
            "jobs": jobs}


def _same_json_value(actual, expected):
    """Python bool == int is true; JSON grading must preserve nested types."""
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(_same_json_value(actual[k], value) for k, value in expected.items())
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(_same_json_value(a, b) for a, b in zip(actual, expected))
    return actual == expected


def _reject_json_constant(value):
    raise ValueError('Non-finite JSON constant is not permitted')


def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key is not permitted')
        result[key] = value
    return result


def grade(output, grader, status="success"):
    if grader.get("type") == "contract":
        from .scoring import assess
        return assess(output, grader, status)
    if status != "success":
        return {"status": "not_applicable", "score": None, "reason": "请求未成功，不对不完整答案评分。"}
    kind = grader.get("type", "manual")
    if kind == "manual":
        return {"status": "pending", "score": None, "reason": "等待人工按预设 rubric 评分。"}
    if kind == "exact":
        passed = output.strip() == grader["expected"].strip()
        reason = "去除首尾空白后与预设答案逐字比较。"
    elif kind == "contains":
        passed = all(part in output for part in grader["required"])
        reason = "检查预设必需片段；不代表已经核验全文正确性。"
    elif kind == "json_fields":
        try:
            parsed = json.loads(output, parse_constant=_reject_json_constant, object_pairs_hook=_unique_json_object)
            passed = isinstance(parsed, dict) and all(key in parsed and _same_json_value(parsed[key], value) for key, value in grader["expected"].items())
        except (ValueError, TypeError):
            passed = False
        reason = "严格 JSON 解析并比较预设字段和值，允许额外字段。"
    else:
        raise ConfigError("Unknown grader")
    return {"status": "passed" if passed else "failed", "score": 1 if passed else 0, "reason": reason}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward Authorization to an unreviewed location.
        return None


def _socket_of(response):
    try:
        return response.fp.raw._sock
    except AttributeError:
        return None


def request_once(model, task, config, output_cap, secret="", messages=None, input_image=None):
    if messages is None:
        messages = [{"role": "user", "content": task["prompt"]}]
    if (not isinstance(messages, list) or not messages or len(messages) > 101 or len(messages) % 2 != 1
            or any(not isinstance(m, dict) or (set(m) != {"role", "content"} and not (
                   model.get('preserveReasoningHistory') and m.get('role')=='assistant' and set(m)=={'role','content','reasoning_content'} and isinstance(m['reasoning_content'],str)))
                   or m["role"] != ("user" if i % 2 == 0 else "assistant")
                   or not isinstance(m["content"], str) or not m["content"].strip()
                   for i, m in enumerate(messages))):
        raise ConfigError("Conversation must contain alternating text user/assistant turns ending with user")
    messages = copy.deepcopy(messages)
    started = time.perf_counter()
    timeout = config.get("timeoutSeconds", 60)
    if timeout is not None and (not number(timeout) or timeout <= 0):
        raise ConfigError('timeoutSeconds must be positive or explicitly null for no total deadline')
    events, output_parts, reasoning_parts, answer_chunks = [], [], [], []
    chunk_counters = []
    first_content = first_answer = last_answer = first_answer_length = None
    usage = None
    done = finished = False
    completion_reason = None
    status, error, http_status, retryable = "success", None, None, False
    timed_out = threading.Event()
    response = timer = None
    adapter = model.get("adapter", "openai-compatible")
    if input_image is not None:
        if (not isinstance(input_image,dict) or set(input_image)!={'mediaType','base64'}
                or input_image['mediaType'] not in ('image/png','image/jpeg')
                or not isinstance(input_image['base64'],str) or len(input_image['base64'])>6000000):
            raise ConfigError('Image must be a bounded inline PNG or JPEG')
        try:image_bytes=base64.b64decode(input_image['base64'],validate=True)
        except (ValueError,binascii.Error):raise ConfigError('Invalid inline image base64')
        signature=b'\x89PNG\r\n\x1a\n' if input_image['mediaType']=='image/png' else b'\xff\xd8\xff'
        if not image_bytes.startswith(signature) or not 0<len(image_bytes)<=4500000:
            raise ConfigError('Image header or size mismatch')
        prompt=messages[-1]['content']
        if adapter=='anthropic-messages':
            image_block={'type':'image','source':{'type':'base64','media_type':input_image['mediaType'],'data':input_image['base64']}}
        else:image_block={'type':'image_url','image_url':{'url':'data:'+input_image['mediaType']+';base64,'+input_image['base64']}}
        messages[-1]['content']=[{'type':'text','text':prompt},image_block]
    messages_stream = MessagesStream() if adapter == "anthropic-messages" else None
    payload = {"model": model["apiModel"], "messages": messages,
               "stream": True, "stream_options": {"include_usage": True},
               model.get("maxTokensParameter", "max_completion_tokens"): output_cap}
    if messages_stream:
        payload = {"model": model["apiModel"], "messages": messages,
                   "stream": True, "max_tokens": output_cap}
    if model.get("temperature") is not None:
        payload["temperature"] = model["temperature"]
    if model.get("reasoningEffort") is not None:
        if messages_stream:
            if model.get('anthropicEffortProtocol') != 'adaptive-v1' or model['reasoningEffort'] not in ('low','medium','high'):
                raise ConfigError('Messages effort requires an explicit supported adaptive protocol')
            payload['thinking'] = {'type':'adaptive'}
            payload['output_config'] = {'effort':model['reasoningEffort']}
        else:
            payload["reasoning_effort"] = model["reasoningEffort"]
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream", "User-Agent": "ZhufengEval/1.0"}
    if secret:
        if messages_stream and model.get("authMode") == "x-api-key":
            headers["x-api-key"] = secret
        else:
            headers["Authorization"] = "Bearer " + secret
    if messages_stream:
        headers["anthropic-version"] = "2023-06-01"
    request = urllib.request.Request(model["endpoint"], json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers, method="POST")
    try:
        handlers = [NoRedirect()]
        if config.get("simulation", False):
            # Loopback fixtures must never be sent through a system proxy.
            handlers.append(urllib.request.ProxyHandler({}))
        response = urllib.request.build_opener(*handlers).open(request, timeout=timeout)
        http_status = response.status
        if "text/event-stream" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("non_sse_response")
        sock = _socket_of(response)
        def expire():
            timed_out.set()
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
        if timeout is not None:
            remaining = timeout - (time.perf_counter() - started)
            if remaining <= 0:
                raise TimeoutError()
            timer = threading.Timer(remaining, expire)
            timer.daemon = True
            timer.start()
        total_bytes = 0
        data_lines = []
        while True:
            if (timeout is not None and time.perf_counter() - started >= timeout) or timed_out.is_set():
                raise TimeoutError()
            raw_line = response.readline(262145)
            total_bytes += len(raw_line)
            if len(raw_line) > 262144 or total_bytes > MAX_FILE_BYTES:
                raise ValueError("response_size_limit")
            if not raw_line:
                break
            line = raw_line.decode("utf-8").rstrip("\r\n")
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip(" "))
            elif line == "" and data_lines:
                data = "\n".join(data_lines)
                data_lines = []
                stamp = time.perf_counter() - started
                if data == "[DONE]":
                    done = True
                    break
                event = json.loads(data)
                if not isinstance(event, dict):
                    raise ValueError("invalid_sse_object")
                events.append({"elapsedMs": round(stamp * 1000, 3), "data": clean(event, [secret])})
                if messages_stream:
                    event, message_done = messages_stream.normalize(event)
                    if message_done:
                        done = True
                        break
                if event.get("error") is not None:
                    raise ValueError("provider_stream_error")
                if event.get("usage") is not None:
                    if not isinstance(event["usage"], dict):
                        raise ValueError("invalid_usage")
                    usage = event["usage"]
                choices = event.get("choices", [])
                if not isinstance(choices, list):
                    raise ValueError("invalid_choices")
                for choice in choices:
                    if not isinstance(choice, dict) or choice.get("index", 0) != 0:
                        raise ValueError("unsupported_choice")
                    delta = choice.get("delta", {})
                    if not isinstance(delta, dict):
                        raise ValueError("invalid_delta")
                    content = delta.get("content")
                    reasoning = delta.get("reasoning_content", delta.get("reasoning"))
                    if isinstance(reasoning, str) and reasoning:
                        if first_content is None:
                            first_content = stamp
                        reasoning_parts.append(reasoning)
                    if isinstance(content, str) and content:
                        if first_content is None:
                            first_content = stamp
                        if first_answer is None:
                            first_answer = stamp
                            first_answer_length = len(content)
                        last_answer = stamp
                        output_parts.append(content)
                        answer_chunks.append((stamp, content))
                        if model.get("streamUsageMode") == "cumulative_visible_fixture":
                            observed = event.get("usage", {}).get("completion_tokens")
                            chunk_counters.append(observed if token_number(observed) else None)
                    if choice.get("finish_reason") is not None:
                        finished = True
                        completion_reason = choice["finish_reason"]
                        if choice["finish_reason"] == "tool_calls" or delta.get("tool_calls"):
                            raise ValueError("tool_calls_not_supported")
        if timed_out.is_set():
            raise TimeoutError()
        if not done or not finished:
            raise ValueError("incomplete_stream")
        if not output_parts and completion_reason != "length":
            raise ValueError("no_visible_answer")
    except urllib.error.HTTPError as exc:
        http_status = exc.code
        status, error = "error", "http_" + str(exc.code)
        retryable = exc.code in (429, 500, 502, 503, 504)
        # Error bodies and headers may echo credentials; never persist either.
        exc.close()
    except (TimeoutError, socket.timeout):
        status, error = "timeout", "request_timeout"
    except KeyboardInterrupt:
        status, error = "error", "request_interrupted"
    except urllib.error.URLError:
        status, error = "error", "connection_error"
    except (ValueError, UnicodeError, TypeError, OSError, AttributeError, http.client.HTTPException):
        status = "timeout" if timed_out.is_set() else "error"
        error = "request_timeout" if timed_out.is_set() else "invalid_or_incomplete_stream"
    finally:
        if timer:
            timer.cancel()
        if response:
            response.close()
    duration = time.perf_counter() - started
    if status == "success" and completion_reason != "stop":
        status = "error"
        error = "output_limit_reached" if completion_reason == "length" else "nonstandard_finish_reason"
    input_tokens = usage.get("prompt_tokens") if usage else None
    output_tokens = usage.get("completion_tokens") if usage else None
    details = usage.get("completion_tokens_details", {}) if usage else {}
    reasoning_tokens = details.get("reasoning_tokens") if isinstance(details, dict) else None
    input_tokens = input_tokens if token_number(input_tokens) else None
    output_tokens = output_tokens if token_number(output_tokens) else None
    reasoning_tokens = reasoning_tokens if token_number(reasoning_tokens) else None
    if reasoning_tokens is not None and output_tokens is not None and model.get("usageSemantics", "includes_reasoning") == "includes_reasoning" and reasoning_tokens > output_tokens:
        status, error = "error", "inconsistent_usage"
        reasoning_tokens = None
    visible_tokens = None
    if model.get("usageSemantics", "includes_reasoning") == "visible_only":
        visible_tokens = output_tokens
    elif output_tokens is not None and reasoning_tokens is not None:
        visible_tokens = output_tokens - reasoning_tokens
    cost = None
    if input_tokens is not None and output_tokens is not None:
        # No assumed cache discount: nominal uncached price is an explicit estimate.
        billable_output = output_tokens
        if model.get("usageSemantics", "includes_reasoning") == "visible_only":
            billable_output = output_tokens + reasoning_tokens if reasoning_tokens is not None else None
        if billable_output is not None:
            cost = (input_tokens * model["inputPrice"] + billable_output * model["outputPrice"]) / 1_000_000
    span = last_answer - first_answer if last_answer is not None and first_answer is not None else None
    body = "".join(output_parts)
    rates = estimate_rates(status, answer_chunks, visible_tokens)
    tps, chars = rates["outputTps"], rates["charsPerSec"]
    metrics = {"ttftMs": round(first_content * 1000, 3) if first_content is not None else None,
               "ttfaMs": round(first_answer * 1000, 3) if first_answer is not None else None,
               "durationMs": round(duration * 1000, 3), "outputTps": round(tps, 3) if tps is not None else None,
               "charsPerSec": round(chars, 3) if chars is not None else None,
               "inputTokens": input_tokens, "outputTokens": output_tokens,
               "reasoningTokens": reasoning_tokens, "cost": cost}
    measurement = None
    if config.get("metricProtocol") == "core-client-v1":
        from .measurement import measure
        first_count = None
        if (chunk_counters and len(chunk_counters) == len(answer_chunks) and all(token_number(v) for v in chunk_counters)
                and all(a <= b for a,b in zip(chunk_counters, chunk_counters[1:])) and chunk_counters[-1] == visible_tokens):
            first_count = chunk_counters[0]
        evidence_chunks = [(round(stamp * 1000, 3) / 1000, text) for stamp, text in answer_chunks]
        measurement = measure(status, evidence_chunks, visible_tokens, metrics["durationMs"] / 1000, first_count)
        metrics["outputTps"] = measurement["bodyTps"]
        metrics["charsPerSec"] = measurement["charsPerSec"]
    return {"status": status, "output": clean(body, [secret]), "error": error, "metrics": metrics,
            **({"measurement": measurement} if measurement else {}),
            "provenance": {"adapter": adapter, **({"metricProtocol": "core-client-v1", "requestedModel": model["apiModel"], "streamUsageMode": model.get("streamUsageMode")} if measurement else {}), "tokenCountSource": "provider_usage" if usage else "unavailable",
                           "usageSemantics": model.get("usageSemantics", "includes_reasoning"),
                           "timingSource": "client_monotonic_sse", "tpsMethod": "visible tokens after first chunk / first-to-last chunk interval; missing cumulative count stays null" if measurement else "visible tokens / first-to-last visible chunk interval; chunk-boundary estimate, >=500ms, >=3 chunks, >=64 visible tokens" if tps is not None else "unavailable: insufficient rate sample or inseparable token counts",
                           "ratePolicy": "core-client-v1" if measurement else rates["ratePolicy"], "rateSampleSeconds": rates["rateSampleSeconds"], "answerChunkCount": rates["answerChunkCount"],
                           "charsMethod": "Unicode code points after first visible chunk / first-to-last visible chunk interval; includes punctuation and whitespace",
                           "costSource": "nominal_uncached_price_estimate" if cost is not None else "unavailable",
                           "usageComplete": input_tokens is not None and output_tokens is not None},
            "_raw": {"request": payload, "events": events, "reasoningOutput": clean("".join(reasoning_parts), [secret]),
                     **({"durationMs": metrics["durationMs"]} if measurement else {}),
                     "httpStatus": http_status, "streamDone": done, "finishSeen": finished},
            "_retryable": retryable and not output_parts}


def execute(config, dataset, destination, allow_paid=False):
    plan = make_plan(config, dataset)
    if not plan["fitsBudget"]:
        raise ConfigError("Worst-case request and retry reservations exceed budget; no requests sent")
    if not config.get("simulation", False) and not allow_paid:
        raise ConfigError("Paid network requests require the explicit --allow-paid flag")
    destination = Path(destination)
    if destination.exists() and any(destination.iterdir()):
        raise ConfigError("Output directory must be empty; existing evidence is never overwritten")
    models = {m["id"]: m for m in config["models"]}
    tasks = {t["id"]: t for t in selected_tasks(config, dataset)}
    secrets = {}
    for model in models.values():
        name = model.get("apiKeyEnv")
        secret = os.environ.get(name, "") if name else ""
        if not config.get("simulation", False) and not secret:
            raise ConfigError("A configured API credential environment variable is unset")
        secrets[model["id"]] = secret
    destination.mkdir(parents=True, exist_ok=True)
    batch_id = "batch-" + uuid.uuid4().hex[:12]
    data_kind = "demo" if config.get("simulation", False) else "measured"
    batch = {"id": batch_id, "title": config.get("title", "本地评测批次"), "createdAt": now(), "status": "partial",
             "dataKind": data_kind, "description": "本地模拟服务验收；不是模型实测。" if data_kind == "demo" else "客户端 API 测量；价格为标价估算，账单以服务商为准。",
             "config": {"region": config.get("region", "unspecified"), "concurrency": 1, "repeats": config.get("repeats", 1),
                        "timeoutSeconds": config.get("timeoutSeconds", 60), "budgetUsd": config["budgetUsd"]},
             "taskIds": list(tasks), "modelIds": list(models)}
    public_models = []
    for model in models.values():
        public_model = {k: copy.deepcopy(model.get(k)) for k in MODEL_PUBLIC}
        public_model.update({"name": model.get("name", model["id"]), "provider": model.get("provider", "unspecified"),
                             "family": model.get("family") or "", "version": model.get("version") or "",
                             "description": model.get("description") or "",
                             "currency": "USD", "tags": model.get("tags", []), "status": data_kind})
        public_models.append(public_model)
    document = {"schemaVersion": SCHEMA, "meta": {"title": batch["title"], "updatedAt": now(), "kind": data_kind,
                                                "description": batch["description"]}, "models": public_models,
                "tasks": list(tasks.values()), "runs": [], "batches": [batch]}
    if config.get("metricProtocol"):
        document["meta"].update(protocolId=config["metricProtocol"], suiteId=config.get("suiteId", "custom-core"))
    reserved = 0.0
    halted = None
    write_json(destination / "plan.json", plan)
    for job_index, job in enumerate(plan["jobs"]):
        model, task = models[job["modelId"]], tasks[job["taskId"]]
        for attempt in range(config.get("maxRetries", 0) + 1):
            reserve = job["reservedUsdPerAttempt"]
            run_id = f"{batch_id}-{job_index + 1:05d}-{attempt + 1}"
            timestamp = now()
            if halted or reserved + reserve > config["budgetUsd"] + 1e-12:
                result = {"status": "skipped", "output": "", "error": halted or "budget_reservation_exhausted",
                          "metrics": {key: None for key in METRICS},
                          "provenance": {"adapter": "openai-compatible", "tokenCountSource": "unavailable", "timingSource": "not_sent"}}
            else:
                reserved += reserve
                result = request_once(model, task, config, job["maxOutputTokens"], secrets[model["id"]])
                metrics = result["metrics"]
                observed_cost = metrics["cost"]
                if result.get("error") == "request_interrupted":
                    halted = "request_interrupted"
                if ((observed_cost is not None and observed_cost > reserve + 1e-12)
                        or (metrics["inputTokens"] is not None and metrics["inputTokens"] > model["maxInputTokens"])
                        or (metrics["outputTokens"] is not None and metrics["outputTokens"] + (metrics["reasoningTokens"] or 0 if model.get("usageSemantics") == "visible_only" else 0) > job["maxOutputTokens"])):
                    halted = "provider_usage_exceeds_reservation"
                # Unknown usage retains the full reservation. No credit is released.
                # This enforces the configured reservation cap even on retries.
            result.update({"id": run_id, "batchId": batch_id, "modelId": model["id"], "taskId": task["id"],
                           "dataKind": data_kind, "timestamp": timestamp,
                           "config": {"region": config.get("region", "unspecified"), "concurrency": 1,
                                      "temperature": model.get("temperature"), "reasoning": model.get("reasoning", model.get("reasoningEffort")),
                                      "cacheState": "unknown", "repeatIndex": job["repeatIndex"], "attemptIndex": attempt}})
            result["grading"] = grade(result["output"], task["grader"], result["status"])
            retryable = result.pop("_retryable", False)
            raw = result.pop("_raw", None)
            if raw is not None:
                raw.update({"runId": run_id, "timestamp": timestamp, "reservedUsd": reserve,
                            "taskSha256": hashlib.sha256(task["prompt"].encode("utf-8")).hexdigest()})
                write_json(destination / "raw" / f"{run_id}.json", clean(raw, secrets.values()))
            document["runs"].append(result)
            batch["reservedUsd"] = round(reserved, 12)
            batch["knownCostUsd"] = sum(r["metrics"]["cost"] for r in document["runs"] if r["metrics"]["cost"] is not None)
            batch["unknownCostCount"] = sum(r["status"] != "skipped" and r["metrics"]["cost"] is None for r in document["runs"])
            write_json(destination / "results.json", clean(document, secrets.values()))
            if not retryable or halted or result["status"] == "skipped" or attempt >= config.get("maxRetries", 0):
                break
            time.sleep(min(0.25 * (2 ** attempt), 2))
    batch["status"] = "completed" if all(r["status"] == "success" for r in document["runs"]) else "partial"
    batch["haltReason"] = halted
    document["meta"]["updatedAt"] = now()
    write_json(destination / "results.json", clean(document, secrets.values()))
    return document


def public_export(document):
    """Whitelist every nested object; arbitrary raw fields never cross this boundary."""
    def pick(value, keys):
        return {k: copy.deepcopy(value[k]) for k in keys if k in value}
    result = {"schemaVersion": SCHEMA,
              "meta": pick(document.get("meta", {}), ("title", "updatedAt", "kind", "description", "protocolId", "suiteId")),
              "models": [pick(m, MODEL_PUBLIC) for m in document.get("models", [])],
              "tasks": [], "runs": [], "batches": []}
    for task in document.get("tasks", []):
        public = pick(task, TASK_PUBLIC)
        public["grader"] = pick(task.get("grader", {}), ("type", "expected", "required", "version", "kind", "format"))
        for key, fields in {"checks": ("id","label","path","expected","points","absTolerance","relTolerance"), "constraints": ("id","label","type","text","texts","count","min","max"), "criteria": ("id","label","points","passAt","zero","partial","full")}.items():
            if key in task.get("grader", {}): public["grader"][key] = [pick(c,fields) for c in task["grader"][key]]
        if "evaluation" in task: public["evaluation"] = pick(task["evaluation"], ("suiteId","protocolId","familyId","benchmarkRef","reviewState"))
        result["tasks"].append(public)
    for run in document.get("runs", []):
        public = pick(run, ("id", "batchId", "modelId", "taskId", "status", "dataKind", "timestamp", "output", "error"))
        public["metrics"] = pick(run.get("metrics", {}), METRICS)
        public["grading"] = pick(run.get("grading", {}), ("status", "score", "reason"))
        if "assessment" in run.get("grading", {}):
            a = run["grading"]["assessment"]
            public["grading"]["assessment"] = pick(a, ("protocolId","contentState","contentScore","formatState","qualified"))
            for key in ("checks","constraints"):
                public["grading"]["assessment"][key] = [pick(c,("id","label","passed","points","earned")) for c in a.get(key,[])]
        if "rubricReview" in run.get("grading", {}):
            review = run["grading"]["rubricReview"]
            public["grading"]["rubricReview"] = pick(review,("reviewer","reviewedAt"))
            public["grading"]["rubricReview"]["items"] = [pick(c,("id","awarded","reason")) for c in review.get("items",[])]
        if "measurement" in run:
            from .measurement import FIELDS
            public["measurement"] = pick(run["measurement"], FIELDS)
        if "reviews" in run.get("grading", {}):
            public["grading"]["reviews"] = [pick(review, ("reviewer", "reviewedAt", "previousStatus", "decision", "reason"))
                                            for review in run["grading"]["reviews"]]
        public["config"] = pick(run.get("config", {}), ("region", "concurrency", "temperature", "reasoning", "cacheState", "repeatIndex", "attemptIndex"))
        public["provenance"] = pick(run.get("provenance", {}), ("adapter", "tokenCountSource", "timingSource", "tpsMethod", "charsMethod", "costSource", "usageComplete", "usageSemantics", "metricProtocol", "requestedModel", "streamUsageMode", "ratePolicy", "rateSampleSeconds", "answerChunkCount"))
        result["runs"].append(public)
    for batch in document.get("batches", []):
        public = pick(batch, ("id", "title", "createdAt", "status", "dataKind", "description", "taskIds", "modelIds"))
        public["config"] = pick(batch.get("config", {}), ("region", "concurrency", "repeats", "timeoutSeconds", "budgetUsd"))
        result["batches"].append(public)
    environment_secrets = [value for key, value in os.environ.items() if SECRET_KEYS.search(key) and len(value) >= 6]
    result = clean(result, environment_secrets)
    errors = validate_document(result)
    if errors:
        raise ConfigError("Export validation failed: " + "; ".join(errors[:5]))
    return result


def validate_document(document):
    errors = []
    if not isinstance(document, dict):
        return ["Document must be an object"]
    if document.get("schemaVersion") != SCHEMA:
        errors.append("Unsupported schemaVersion")
    meta = document.get("meta")
    if not isinstance(meta, dict) or meta.get("kind") not in ("catalog", "demo", "measured"):
        errors.append("Invalid meta.kind")
    elif any(not isinstance(meta.get(field), str) for field in ("title", "updatedAt", "description")):
        errors.append("Meta title, updatedAt and description must be strings")
    groups = {}
    for group in ("models", "tasks", "runs", "batches"):
        values = document.get(group)
        if not isinstance(values, list):
            errors.append(group + " must be an array")
            groups[group] = {}
            continue
        groups[group] = {}
        for item in values:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"] or item["id"] in groups[group]:
                errors.append(group + " has invalid/duplicate ID")
                continue
            groups[group][item["id"]] = item
    for model in groups["models"].values():
        if not isinstance(model.get("name"), str) or not isinstance(model.get("provider"), str):
            errors.append("Model name/provider must be strings")
        if model.get("status") not in ("catalog", "demo", "measured"):
            errors.append("Invalid model status")
        if not isinstance(model.get("tags"), list) or any(not isinstance(tag, str) for tag in model.get("tags", [])):
            errors.append("Model tags must be a string array")
        for field in ("inputPrice", "outputPrice", "cachedInputPrice", "contextWindow", "maxOutputTokens"):
            if model.get(field) is not None and not nonnegative(model[field]):
                errors.append("Invalid model " + field)
        for field in ("sourceUrl", "endpoint"):
            value = model.get(field)
            if value is not None:
                try:
                    parsed = urllib.parse.urlsplit(value) if isinstance(value, str) else None
                    if not parsed or parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
                        errors.append("Invalid model URL")
                except ValueError:
                    errors.append("Invalid model URL")
    for task in groups["tasks"].values():
        try:
            task_list([task])
        except ConfigError as exc:
            errors.append("Invalid task: " + str(exc))
        if not isinstance(task.get("title"), str) or not isinstance(task.get("rubric"), list) or any(not isinstance(rule, str) for rule in task.get("rubric", [])):
            errors.append("Invalid task title/rubric")
    for batch in groups["batches"].values():
        if batch.get("status") not in ("completed", "partial", "planned") or batch.get("dataKind") not in ("demo", "measured"):
            errors.append("Invalid batch status/kind")
        if not isinstance(batch.get("config"), dict):
            errors.append("Invalid batch config")
        else:
            for field in ("concurrency", "repeats", "timeoutSeconds", "budgetUsd"):
                if batch["config"].get(field) is not None and not nonnegative(batch["config"][field]):
                    errors.append("Invalid batch numeric config")
        for field, group in (("modelIds", "models"), ("taskIds", "tasks")):
            if not isinstance(batch.get(field), list) or any(not isinstance(x, str) or x not in groups[group] for x in batch.get(field, [])):
                errors.append("Invalid batch references")
    for run in groups["runs"].values():
        for field, group in (("modelId", "models"), ("taskId", "tasks"), ("batchId", "batches")):
            if not isinstance(run.get(field), str) or run.get(field) not in groups[group]:
                errors.append("Invalid run reference " + field)
        if run.get("status") not in ("success", "error", "timeout", "skipped") or run.get("dataKind") not in ("demo", "measured"):
            errors.append("Invalid run status/kind")
        if not isinstance(run.get("output"), str):
            errors.append("Run output must be a string")
        if run.get("error") is not None and not isinstance(run["error"], str):
            errors.append("Run error must be a string or null")
        if not isinstance(run.get("timestamp"), str):
            errors.append("Run timestamp must be a string")
        for field in ("config", "provenance"):
            if not isinstance(run.get(field), dict):
                errors.append("Invalid run " + field)
        if isinstance(meta, dict) and meta.get("kind") in ("demo", "measured") and run.get("dataKind") != meta["kind"]:
            errors.append("Mixed demo/measured evidence")
        metrics = run.get("metrics", {})
        if not isinstance(metrics, dict):
            errors.append("Invalid metrics")
            continue
        for field in METRICS:
            if field not in metrics:
                errors.append("Missing metric " + field)
            elif metrics[field] is not None and not nonnegative(metrics[field]):
                errors.append("Invalid metric " + field)
        for field in ("inputTokens", "outputTokens", "reasoningTokens"):
            if metrics.get(field) is not None and not token_number(metrics[field]):
                errors.append("Token counts must be integers")
        if nonnegative(metrics.get("ttftMs")) and nonnegative(metrics.get("ttfaMs")) and metrics["ttftMs"] > metrics["ttfaMs"]:
            errors.append("TTFT cannot occur after TTFA")
        if "measurement" in run:
            from .measurement import validate_measurement
            try:
                validate_measurement(run["measurement"],run.get("status"),metrics.get("durationMs"))
                measurement = run["measurement"]
                provenance = run.get("provenance", {})
                if not isinstance(provenance, dict) or provenance.get("metricProtocol") != "core-client-v1" or provenance.get("usageSemantics") not in ("visible_only", "includes_reasoning"):
                    raise ValueError("Measurement lacks matching provenance")
                if metrics.get("outputTps") != measurement["bodyTps"] or metrics.get("charsPerSec") != measurement["charsPerSec"]:
                    raise ValueError("Legacy mirror fields contradict core measurements")
                visible = metrics.get("outputTokens")
                if provenance["usageSemantics"] == "includes_reasoning":
                    reasoning = metrics.get("reasoningTokens")
                    visible = visible - reasoning if visible is not None and reasoning is not None else None
                if measurement["visibleTokens"] != visible:
                    raise ValueError("Visible count contradicts usage semantics")
                if provenance.get("streamUsageMode") not in (None, "cumulative_visible_fixture"):
                    raise ValueError("Unsupported cumulative stream counter")
                if provenance.get("streamUsageMode") == "cumulative_visible_fixture" and run.get("dataKind") != "demo":
                    raise ValueError("Toy stream counters must remain demo evidence")
                if measurement["firstChunkTokens"] is not None and provenance.get("streamUsageMode") != "cumulative_visible_fixture":
                    raise ValueError("First-chunk count lacks a supported cumulative counter")
            except (ValueError,TypeError,KeyError) as exc: errors.append("Invalid measurement: " + str(exc))
        elif isinstance(run.get("provenance"), dict) and run["provenance"].get("metricProtocol") == "core-client-v1":
            errors.append("Core protocol requires measurement fields")
        grading = run.get("grading", {})
        if not isinstance(grading, dict) or grading.get("status") not in ("passed", "failed", "pending", "not_applicable"):
            errors.append("Invalid grading status")
        elif grading.get("status") in ("pending", "not_applicable") and grading.get("score") is not None:
            errors.append("Pending/ungraded score must be null")
        elif grading.get("status") in ("passed", "failed") and (not number(grading.get("score")) or not 0 <= grading["score"] <= 1):
            errors.append("Completed grade needs a 0..1 score")
        if isinstance(grading, dict) and run.get("status") != "success" and grading.get("status") in ("passed", "failed"):
            errors.append("Unsuccessful request cannot have a completed answer grade")
        task = groups["tasks"].get(run.get("taskId"),{})
        task_grader = task.get("grader", {})
        if isinstance(task_grader, dict) and task_grader.get("type") == "contract":
            from .scoring import validate_assessment
            try:
                if not isinstance(grading, dict): raise ValueError("Assessment must be an object")
                validate_assessment(grading.get("assessment"))
                if task["grader"]["kind"] != "manual" or "rubricReview" not in grading:
                    if grading != grade(run["output"],task["grader"],run["status"]):
                        raise ValueError("Grade contradicts scoring contract")
                else:
                    from .rubric_review import apply_review
                    expected = apply_review(run["output"],task["grader"],grading["rubricReview"])
                    if grading != expected: raise ValueError("Rubric review contradicts awarded points")
            except (ValueError,TypeError,KeyError) as exc: errors.append("Invalid assessment: " + str(exc))
        if isinstance(grading, dict) and "reviews" in grading:
            reviews = grading["reviews"]
            if not isinstance(reviews, list) or len(reviews) > 1000:
                errors.append("Invalid human review history")
            else:
                for review in reviews:
                    if (not isinstance(review, dict) or
                        any(not isinstance(review.get(key), str) or not review[key].strip()
                            for key in ("reviewer", "reviewedAt", "reason", "previousStatus", "decision")) or
                        review.get("decision") not in ("passed", "failed")):
                        errors.append("Invalid human review entry")
    return errors
