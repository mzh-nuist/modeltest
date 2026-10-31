"""Create an explicitly labelled simulation batch without external APIs."""
import argparse
from pathlib import Path
import threading
from .core import ConfigError, execute, public_export, write_json
from .mock_server import MockServer


def main():
    parser = argparse.ArgumentParser(description="一键生成本地 SSE 模拟验收数据；不是模型实测")
    parser.add_argument("--out", required=True, help="新的或空的输出目录")
    args = parser.parse_args()
    root = Path(args.out)
    if root.exists() and any(root.iterdir()):
        raise ConfigError("Demo output directory must be empty")
    server = MockServer()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        models = []
        for index, mode in enumerate(("normal", "no_usage", "unknown_reasoning", "partial"), 1):
            models.append({"id": f"fixture-{index}", "name": f"模拟配置 {index}（{mode}）", "family": "local-fixture",
                           "provider": "本地模拟服务", "apiModel": "fixture", "adapter": "openai-compatible",
                           "endpoint": f"http://127.0.0.1:{server.server_port}/{mode}", "version": "fixture-v1",
                           "reasoning": "模拟事件", "inputPrice": 1, "outputPrice": 2, "cachedInputPrice": None,
                           "maxInputTokens": 4096, "maxOutputTokens": 64, "outputLimitIncludesReasoning": True,
                           "currency": "USD", "tags": ["模拟验收"], "description": "虚构模型，用于校验数据采集和界面。"})
        config = {"title": "本地 SSE 模拟验收（非模型实测）", "simulation": True, "budgetUsd": 1,
                  "region": "127.0.0.1 本机", "concurrency": 1, "repeats": 2, "maxRetries": 0,
                  "timeoutSeconds": 2, "models": models}
        tasks = {"tasks": [
            {"id": "fixture-exact", "title": "模拟固定答案", "category": "math", "difficulty": "easy",
             "prompt": "本地模拟测试：返回预设答案。", "reference": "答案：42", "rubric": ["逐字匹配预设答案"],
             "maxOutputTokens": 32, "grader": {"type": "exact", "expected": "答案：42"}, "source": "模拟 fixture"},
            {"id": "fixture-manual", "title": "模拟人工待评", "category": "chinese", "difficulty": "easy",
             "prompt": "本地模拟测试：检查人工待评流程。", "reference": "人工评审演示，不据此判断模型能力。",
             "rubric": ["人工评审前必须保持 pending"], "maxOutputTokens": 32,
             "grader": {"type": "manual"}, "source": "模拟 fixture"}
        ]}
        document = execute(config, tasks, root / "batch")
        write_json(root / "public.json", public_export(document))
        write_json(root / "config.mock.json", config)
        write_json(root / "tasks.mock.json", tasks)
        print("SIMULATION ONLY. Public import file: " + str((root / "public.json").resolve()))
        print(f"{len(document['runs'])} local requests; no external or paid API calls.")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    main()
