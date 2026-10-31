"""Local SSE fixture. All results are simulated, never model measurements.

python -m runner.mock_server --port 8766
Endpoints: /normal, /no_usage, /unknown_reasoning, /partial, /slow,
/bad_json, /error_event, /empty, /retry, /over_cap, /echo, /redirect.
"""
import argparse
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import time


class MockServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address=("127.0.0.1", 0)):
        super().__init__(address, MockHandler)
        self.counts = Counter()
        self.received = []
        self.lock = threading.Lock()


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                self.send_error(413)
                return
            body = json.loads(self.rfile.read(length))
            with self.server.lock:
                self.server.counts[self.path] += 1
                count = self.server.counts[self.path]
                self.server.received.append(body)  # In-memory request bodies only, no headers.
            if self.path == "/retry" and count == 1:
                self.send_response(429)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"simulated throttling"}')
                return
            if self.path == "/redirect":
                self.send_response(307)
                self.send_header("Location", "/normal")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            def event(value):
                self.wfile.write(("data: " + json.dumps(value, ensure_ascii=False) + "\n\n").encode("utf-8"))
                self.wfile.flush()

            if self.path.startswith('/messages'):
                event({'type':'message_start','message':{'id':'fixture-message','usage':{'input_tokens':20,'cache_read_input_tokens':3,'cache_creation_input_tokens':2}}})
                time.sleep(.01)
                event({'type':'content_block_start','index':0,'content_block':{'type':'thinking','thinking':''}})
                event({'type':'content_block_delta','index':0,'delta':{'type':'thinking_delta','thinking':'模拟思考'}})
                time.sleep(.01)
                event({'type':'content_block_stop','index':0})
                event({'type':'content_block_start','index':1,'content_block':{'type':'text','text':''}})
                event({'type':'content_block_delta','index':1,'delta':{'type':'text_delta','text':'答'}})
                if self.path == '/messages-partial':
                    return
                time.sleep(.01)
                event({'type':'content_block_delta','index':1,'delta':{'type':'text_delta','text':'案：42'}})
                event({'type':'content_block_stop','index':1})
                reason='max_tokens' if self.path == '/messages-length' else 'end_turn'
                event({'type':'message_delta','delta':{'stop_reason':reason},'usage':{'output_tokens':8}})
                event({'type':'message_stop'})
                return

            event({"choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}}]})
            if self.path == "/bad_json":
                self.wfile.write(b"data: not-json\n\n")
                self.wfile.flush()
                return
            if self.path == "/error_event":
                event({"error": {"message": "simulated provider failure"}})
                return
            if self.path == "/empty":
                event({"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
                self.wfile.write(b"data: [DONE]\n\n")
                return
            time.sleep(0.01)
            event({"choices": [{"index": 0, "delta": {"reasoning_content": "模拟思考"}}]})
            time.sleep(0.01)
            event({"choices": [{"index": 0, "delta": {"content": "答"}}]})
            if self.path == "/slow":
                time.sleep(1.0)
            if self.path == "/partial":
                return
            time.sleep(0.01)
            event({"choices": [{"index": 0, "delta": {"content": "案：42"}}]})
            if self.path == "/echo":
                event({"choices": [{"index": 0, "delta": {"content": self.headers.get("Authorization", "")}}],
                       "headers": {"Authorization": self.headers.get("Authorization", "")},
                       "api_key": "fixture-key-is-private"})
            reason = "length" if self.path == "/length" else "content_filter" if self.path == "/filtered" else "stop"
            event({"choices": [{"index": 0, "delta": {}, "finish_reason": reason}]})
            if self.path != "/no_usage":
                usage = {"prompt_tokens": 20, "completion_tokens": 8,
                         "completion_tokens_details": {"reasoning_tokens": 2}}
                if self.path == "/unknown_reasoning":
                    usage.pop("completion_tokens_details")
                if self.path == "/over_cap":
                    usage["prompt_tokens"] = 1_000_000
                event({"choices": [], "usage": usage})
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass


def main():
    parser = argparse.ArgumentParser(description="本地模拟 SSE，仅用于验证采集流程")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    server = MockServer(("127.0.0.1", args.port))
    print(f"SIMULATION ONLY: http://127.0.0.1:{server.server_port}/normal", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
