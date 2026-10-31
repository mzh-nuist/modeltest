# 采集与评分运行器

运行器使用 Python 标准库，支持 OpenAI-compatible 和 Anthropic Messages 流式协议、请求条件记录、预算检查、规则评分与公开导出。当前网站已有答卷；仅运行网站或离线测试不需要 API 密钥。

## 离线检查

```bash
python -X utf8 -m unittest discover -s tests -p "test_*.py"
python -X utf8 -m runner.checkup offline --out results/daily-offline.json
python -X utf8 -m runner.challenge offline --out results/challenge-offline
```

这些命令使用预设输出与本地模拟服务，不证明真实模型能力。公开源码没有封存题库，相关流程回退到公开开发题。

## 计划与真实请求

复制 `config.example.json` 为 `config.local.json`，核实具体模型 ID、完整接口地址、推理档位、价格、输入输出上限和预算。API 密钥放进配置的 `apiKeyEnv` 所指定的环境变量，不写入 JSON。

```bash
python -m runner plan --config config.local.json --dataset datasets/tasks.json
python -m runner run --config config.local.json --dataset datasets/tasks.json --out results/my-batch
```

以上命令仅生成计划。示例配置故意保留未知参数，必须补齐才能执行。真正调用付费接口还需要显式的 `--execute --allow-paid`，并可能消耗账户费用：

```bash
python -m runner run --config config.local.json --dataset datasets/tasks.json --out results/my-paid-batch --execute --allow-paid
python -m runner export results/my-paid-batch/results.json --out results/my-paid-batch/public.json
python -m runner validate results/my-paid-batch/public.json
```

通用运行器示例使用历史 `datasets/tasks.json`，不等于完整重跑当前八项 high 榜单。当前榜单的采集、合并和人工复核流程保存在 `commandcode_high.py`、`commandcode_extended_high.py` 等专用模块；使用前读对应 `--help` 和实现，不能只换模型名就假定协议相同。

## 费用与结果

计划依据配置上界控制预算，未知价格或未明确的推理 token 计费口径会阻断执行。没有用量的请求不当作零成本；输出中断或接口错误保留证据，不能冒充成功。预算控制不能撤销已发生的服务商扣费，实际运行应同时配置服务商侧费用限制。

原始结果存于忽略的 `results/`，先复核、脱敏再导出。人工项保留待评，复核结果绑定原回答，不改写模型输出。网站的测试与版本边界见[评分说明](../docs/EVALUATION.md)。
