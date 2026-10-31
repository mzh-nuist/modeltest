import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from runner.core import ConfigError, execute, grade, make_plan, public_export, validate_document, write_json
from runner.mock_server import MockServer


def task_fixture():
    return {"id": "fixture-task", "title": "模拟答案任务", "category": "math", "difficulty": "easy",
            "prompt": "模拟服务测试，回复答案：42。", "reference": "答案：42", "rubric": ["与预设答案一致"],
            "maxOutputTokens": 32, "grader": {"type": "exact", "expected": "答案：42"}, "source": "本地模拟 fixture"}


class RunnerIntegrationTests(unittest.TestCase):
    def test_output_limit_and_filtered_finish_are_not_successes(self):
        for endpoint in ('/length', '/filtered'):
            self.config['models'][0]['endpoint'] = f'http://127.0.0.1:{self.server.server_port}' + endpoint
            result = execute(self.config, [task_fixture()], self.root / endpoint[1:])
            run = result['runs'][0]
            self.assertEqual(run['status'], 'error')
            self.assertEqual(run['grading']['status'], 'not_applicable')
            self.assertIsNone(run['metrics']['outputTps'])
            self.assertIsNotNone(run['metrics']['cost'])
            self.assertIn('答案：42', run['output'])

    @classmethod
    def setUpClass(cls):
        cls.server = MockServer()
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        scratch = Path(__file__).resolve().parent / ".runner-tmp"
        scratch.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        def remove_owned_fixture():
            Path(self.temp.name).resolve().relative_to(scratch.resolve())
            self.temp.cleanup()
        self.addCleanup(remove_owned_fixture)
        self.root = Path(self.temp.name)
        self.config = {"simulation": True, "budgetUsd": 0.1, "repeats": 1, "maxRetries": 0,
                       "timeoutSeconds": 2, "region": "loopback-fixture", "concurrency": 1,
                       "models": [{"id": "sim-model", "name": "模拟模型", "provider": "本地模拟服务", "apiModel": "fixture",
                                   "endpoint": f"http://127.0.0.1:{self.server.server_port}/normal",
                                   "inputPrice": 1.0, "outputPrice": 2.0, "maxInputTokens": 4096,
                                   "maxOutputTokens": 64, "outputLimitIncludesReasoning": True,
                                   "reasoning": "fixture", "currency": "USD", "tags": []}]}
        self.dataset = {"tasks": [task_fixture()]}

    def endpoint(self, mode):
        self.config["models"][0]["endpoint"] = f"http://127.0.0.1:{self.server.server_port}/{mode}"

    def run_batch(self):
        return execute(self.config, self.dataset, self.root / "output")

    def test_normal_stream_has_timing_reasoning_cost_and_evidence(self):
        result = self.run_batch()
        run = result["runs"][0]
        self.assertEqual(run["status"], "success")
        self.assertEqual(run["dataKind"], "demo")
        self.assertEqual(run["output"], "答案：42")
        self.assertEqual(run["grading"]["status"], "passed")
        metrics = run["metrics"]
        self.assertGreater(metrics["ttfaMs"], metrics["ttftMs"])
        self.assertGreater(metrics["durationMs"], metrics["ttfaMs"])
        self.assertEqual(metrics["reasoningTokens"], 2)
        self.assertIsNone(metrics["outputTps"])
        self.assertIsNone(metrics["charsPerSec"])
        self.assertAlmostEqual(metrics["cost"], 0.000036)
        self.assertEqual(validate_document(public_export(result)), [])
        self.assertEqual(public_export(result)["runs"][0]["provenance"]["usageSemantics"], "includes_reasoning")
        raw = list((self.root / "output" / "raw").glob("*.json"))
        self.assertEqual(len(raw), 1)
        evidence = json.loads(raw[0].read_text(encoding="utf-8"))
        self.assertGreater(len(evidence["events"]), 4)
        self.assertTrue(evidence["streamDone"])
        self.assertEqual(run["provenance"]["answerChunkCount"], 2)
        self.assertLess(run["provenance"]["rateSampleSeconds"], .5)

    def test_missing_usage_never_implies_free_or_count_chunks(self):
        self.endpoint("no_usage")
        result = self.run_batch()
        run = result["runs"][0]
        self.assertEqual(run["status"], "success")
        for key in ("inputTokens", "outputTokens", "reasoningTokens", "cost", "outputTps"):
            self.assertIsNone(run["metrics"][key])
        self.assertEqual(result["batches"][0]["unknownCostCount"], 1)
        self.assertGreater(result["batches"][0]["reservedUsd"], 0)

    def test_unknown_reasoning_keeps_tps_null_even_with_total_usage(self):
        self.endpoint("unknown_reasoning")
        run = self.run_batch()["runs"][0]
        self.assertIsNone(run["metrics"]["outputTps"])
        self.assertIsNotNone(run["metrics"]["cost"])

    def test_partial_stream_keeps_evidence_but_not_grade_or_tps(self):
        self.endpoint("partial")
        run = self.run_batch()["runs"][0]
        self.assertEqual(run["status"], "error")
        self.assertEqual(run["output"], "答")
        self.assertEqual(run["grading"]["status"], "not_applicable")
        self.assertIsNone(run["metrics"]["outputTps"])
        self.assertIsNone(run["metrics"]["cost"])

    def test_bad_json_and_error_event_and_empty_answer_fail(self):
        for mode in ("bad_json", "error_event", "empty"):
            with self.subTest(mode=mode):
                self.endpoint(mode)
                result = execute(self.config, self.dataset, self.root / mode)
                self.assertEqual(result["runs"][0]["status"], "error")
                self.assertEqual(result["runs"][0]["grading"]["status"], "not_applicable")

    def test_timeout_is_bounded_and_partial_text_is_retained(self):
        self.endpoint("slow")
        # Allow Windows HTTP/TLS setup to finish before the fixture emits its first chunk.
        # The server then sleeps 1s; the 0.8s bound still requires a real early timeout.
        self.config["timeoutSeconds"] = 0.35
        started = time.perf_counter()
        run = self.run_batch()["runs"][0]
        self.assertLess(time.perf_counter() - started, 0.8)
        self.assertEqual(run["status"], "timeout")
        self.assertEqual(run["output"], "答")

    def test_bounded_retry_retains_failure_record_and_reservation(self):
        with self.server.lock:
            self.server.counts["/retry"] = 0
        self.endpoint("retry")
        self.config["maxRetries"] = 1
        result = self.run_batch()
        self.assertEqual([r["status"] for r in result["runs"]], ["error", "success"])
        self.assertEqual([r["config"]["attemptIndex"] for r in result["runs"]], [0, 1])
        self.assertIsNone(result["runs"][0]["metrics"]["cost"])
        self.assertEqual(result["batches"][0]["unknownCostCount"], 1)
        self.assertAlmostEqual(result["batches"][0]["reservedUsd"], make_plan(self.config, self.dataset)["reservedUpperBoundUsd"])

    def test_repeat_order_rotates_and_each_repeat_is_explicit(self):
        second = copy.deepcopy(self.config["models"][0])
        second.update({"id": "sim-model-2", "name": "模拟模型二"})
        self.config["models"].append(second)
        self.config["repeats"] = 2
        result = self.run_batch()
        self.assertEqual([r["modelId"] for r in result["runs"]], ["sim-model", "sim-model-2", "sim-model-2", "sim-model"])
        self.assertEqual([r["config"]["repeatIndex"] for r in result["runs"]], [0, 0, 1, 1])
        self.assertEqual(len({r["id"] for r in result["runs"]}), 4)

    def test_manual_is_pending_and_never_fake_pass(self):
        self.dataset["tasks"][0]["grader"] = {"type": "manual"}
        grading = self.run_batch()["runs"][0]["grading"]
        self.assertEqual(grading["status"], "pending")
        self.assertIsNone(grading["score"])

    def test_task_selection_limits_plan_execution_and_export(self):
        other = copy.deepcopy(self.dataset["tasks"][0])
        other["id"] = "unselected-task"
        self.dataset["tasks"].append(other)
        self.config["taskIds"] = ["fixture-task"]
        self.assertEqual(make_plan(self.config, self.dataset)["plannedRequests"], 1)
        result = self.run_batch()
        self.assertEqual([task["id"] for task in result["tasks"]], ["fixture-task"])
        self.assertEqual(result["batches"][0]["taskIds"], ["fixture-task"])
        self.assertEqual(len(result["runs"]), 1)
        for invalid in ([], ["missing"], ["fixture-task", "fixture-task"]):
            self.config["taskIds"] = invalid
            with self.assertRaises(ConfigError):
                make_plan(self.config, self.dataset)

    def test_budget_and_unknown_prices_block_before_network(self):
        before = sum(self.server.counts.values())
        self.config["budgetUsd"] = 0.000001
        with self.assertRaises(ConfigError):
            self.run_batch()
        self.config["budgetUsd"] = 1
        self.config["models"][0]["inputPrice"] = None
        with self.assertRaises(ConfigError):
            self.run_batch()
        self.assertEqual(sum(self.server.counts.values()), before)

    def test_provider_breaching_reservation_halts_next_jobs(self):
        self.endpoint("over_cap")
        self.config["repeats"] = 3
        result = self.run_batch()
        self.assertEqual([r["status"] for r in result["runs"]], ["success", "skipped", "skipped"])
        self.assertEqual(result["batches"][0]["haltReason"], "provider_usage_exceeds_reservation")

    def test_credentials_echo_and_headers_never_persist(self):
        self.endpoint("echo")
        self.config["models"][0]["apiKeyEnv"] = "TEST_EVAL_API_KEY"
        secret = "fixture-credential-super-private"
        with patch.dict(os.environ, {"TEST_EVAL_API_KEY": secret}):
            result = self.run_batch()
            exported = public_export(result)
        all_text = "\n".join(p.read_text(encoding="utf-8") for p in (self.root / "output").rglob("*.json"))
        self.assertNotIn(secret, all_text)
        self.assertNotIn("fixture-key-is-private", all_text)
        self.assertNotIn(secret, json.dumps(exported))
        self.assertIn("[REDACTED]", all_text)

    def test_export_whitelists_nested_fields(self):
        result = self.run_batch()
        result["models"][0]["apiKeyEnv"] = "HIDDEN"
        result["runs"][0]["_raw"] = {"private": "DO_NOT_PUBLISH"}
        result["runs"][0]["config"]["requestHeaders"] = "DO_NOT_PUBLISH"
        result["runs"][0]["metrics"]["private"] = "DO_NOT_PUBLISH"
        result["runs"][0]["grading"]["judgeCredential"] = "DO_NOT_PUBLISH"
        serialized = json.dumps(public_export(result))
        self.assertNotIn("DO_NOT_PUBLISH", serialized)
        self.assertNotIn("HIDDEN", serialized)

    def test_redirect_is_not_followed(self):
        self.endpoint("redirect")
        before = self.server.counts["/normal"]
        run = self.run_batch()["runs"][0]
        self.assertEqual(run["status"], "error")
        self.assertEqual(run["error"], "http_307")
        self.assertEqual(self.server.counts["/normal"], before)

    def test_live_api_requires_explicit_paid_flag_before_network(self):
        self.config["simulation"] = False
        self.config["models"][0].update({"endpoint": "https://api.openai.com/v1/chat/completions", "apiKeyEnv": "MISSING_TEST_API_KEY"})
        with self.assertRaisesRegex(ConfigError, "allow-paid"):
            self.run_batch()

    def test_simulation_cannot_target_external_host(self):
        self.config["models"][0]["endpoint"] = "https://example.com/v1/chat/completions"
        with self.assertRaises(ConfigError):
            make_plan(self.config, self.dataset)

    def test_inline_key_or_credential_url_is_rejected(self):
        self.config["models"][0]["apiKey"] = "inline-secret"
        with self.assertRaises(ConfigError):
            make_plan(self.config, self.dataset)
        del self.config["models"][0]["apiKey"]
        self.config["models"][0]["endpoint"] += "?key=secret"
        with self.assertRaises(ConfigError):
            make_plan(self.config, self.dataset)

    def test_existing_evidence_is_not_overwritten(self):
        self.run_batch()
        with self.assertRaises(ConfigError):
            self.run_batch()

    def test_cli_plan_run_validate_and_export(self):
        config_path, dataset_path = self.root / "config.json", self.root / "tasks.json"
        write_json(config_path, self.config)
        write_json(dataset_path, self.dataset)
        base = [sys.executable, "-X", "utf8", "-m", "runner"]
        before = sum(self.server.counts.values())
        planned = subprocess.run(base + ["run", "--config", str(config_path), "--dataset", str(dataset_path)], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(planned.returncode, 0, planned.stderr)
        self.assertEqual(sum(self.server.counts.values()), before)
        output = self.root / "cli-run"
        executed = subprocess.run(base + ["run", "--config", str(config_path), "--dataset", str(dataset_path), "--out", str(output), "--execute"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(executed.returncode, 0, executed.stderr)
        exported = self.root / "public.json"
        exported_cmd = subprocess.run(base + ["export", str(output / "results.json"), "--out", str(exported)], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(exported_cmd.returncode, 0, exported_cmd.stderr)
        checked = subprocess.run(base + ["validate", str(exported)], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(checked.returncode, 0, checked.stderr)


class GradingAndValidationTests(unittest.TestCase):
    def test_json_grading_preserves_nested_types_and_array_shape(self):
        rule={'type':'json_fields','expected':{'squares':[1,4], 'nested':{'count':0}}}
        self.assertEqual(grade('{"squares":[1,4],"nested":{"count":0},"extra":1}',rule)['status'],'passed')
        for value in ['{"squares":[true,4],"nested":{"count":0}}',
                      '{"squares":[1.0,4],"nested":{"count":0}}',
                      '{"squares":[1,4],"nested":{"count":false}}',
                      '{"squares":[1,4,9],"nested":{"count":0}}']:
            self.assertEqual(grade(value,rule)['status'],'failed')

    def test_json_grading_rejects_nonfinite_values_and_duplicate_keys(self):
        rule={'type':'json_fields','expected':{'answer':1}}
        for value in ['{"answer":1,"extra":NaN}','{"answer":1,"extra":Infinity}',
                      '{"answer":0,"answer":1}','{"answer":1,"extra":{"x":0,"x":1}}']:
            self.assertEqual(grade(value,rule)['status'],'failed')

    def test_exact_contains_and_json_are_deterministic(self):
        self.assertEqual(grade(" 42\n", {"type": "exact", "expected": "42"})["status"], "passed")
        self.assertEqual(grade("alpha beta", {"type": "contains", "required": ["alpha", "gamma"]})["status"], "failed")
        self.assertEqual(grade('{"answer":42,"extra":1}', {"type": "json_fields", "expected": {"answer": 42}})["status"], "passed")
        self.assertEqual(grade('{"answer":true}', {"type": "json_fields", "expected": {"answer": 1}})["status"], "failed")
        self.assertEqual(grade('```json\n{"answer":42}\n```', {"type": "json_fields", "expected": {"answer": 42}})["status"], "failed")

    def test_duplicate_ids_and_invalid_numeric_values_rejected(self):
        doc = {"schemaVersion": "1.0", "meta": {"kind": "catalog"}, "models": [{"id": "a", "inputPrice": -1}, {"id": "a"}], "tasks": [], "runs": [], "batches": []}
        self.assertGreaterEqual(len(validate_document(doc)), 2)


if __name__ == "__main__":
    unittest.main()
