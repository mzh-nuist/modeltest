import argparse
import json
import sys
from .core import ConfigError, execute, load_json, make_plan, public_export, validate_document, write_json


def main(argv=None):
    parser = argparse.ArgumentParser(description="逐风 AI 离线测评：plan 不联网；run 必须显式 --execute")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "run"):
        p = sub.add_parser(name)
        p.add_argument("--config", required=True)
        p.add_argument("--dataset", required=True)
        p.add_argument("--out")
        if name == "run":
            p.add_argument("--execute", action="store_true", help="实际执行；不提供时仅输出计划")
            p.add_argument("--allow-paid", action="store_true", help="允许非模拟付费 API 调用，须另有明确预算和凭据")
    p = sub.add_parser("export")
    p.add_argument("source")
    p.add_argument("--out", required=True)
    p = sub.add_parser("validate")
    p.add_argument("source")
    args = parser.parse_args(argv)
    try:
        if args.command in ("plan", "run"):
            config, dataset = load_json(args.config), load_json(args.dataset)
            if args.command == "run" and args.execute:
                if not args.out:
                    raise ConfigError("run --execute requires an empty --out directory")
                result = execute(config, dataset, args.out, args.allow_paid)
                print(json.dumps({"status": result["batches"][0]["status"], "runCount": len(result["runs"]),
                                  "dataKind": result["meta"]["kind"], "resultFile": str(args.out) + "/results.json"}, ensure_ascii=False))
            else:
                result = make_plan(config, dataset)
                if args.out:
                    write_json(args.out, result)
                print(json.dumps({k: v for k, v in result.items() if k != "jobs"}, ensure_ascii=False, indent=2))
        elif args.command == "export":
            write_json(args.out, public_export(load_json(args.source)))
            print("Public whitelist export written. Review task prompts and answers for personal data before publishing.")
        elif args.command == "validate":
            errors = validate_document(load_json(args.source))
            if errors:
                raise ConfigError("; ".join(errors[:10]))
            print("Valid schema 1.0 document")
        return 0
    except (ConfigError, OSError, ValueError, TypeError, KeyError) as exc:
        # Unexpected provider exceptions are normalized inside the adapter.
        # Config errors are controlled strings, never response headers/body.
        print("ERROR: " + (str(exc) if isinstance(exc, ConfigError) else "Invalid input file or filesystem operation"), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
