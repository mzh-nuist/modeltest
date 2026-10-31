# 开发说明

环境：Python 3.12+、Node.js 22.13+、Git。常规预览和离线测试使用标准库，无需 `npm install` 或 `pip install`。

## 网站与预览

`dist/` 本身就是可运行的网站源码。修改 JavaScript、CSS 或页面后可直接用本地 HTTP 服务预览。不要通过 `file://` 打开首页，模块和 JSON 请求需要 HTTP。

完整 Worker 预览前先运行 `python scripts/build_worker.py`，然后运行 `node scripts/preview_worker.mjs`。此构建不需要旧托管平台的账号信息。

本地统计使用 `results/analytics-preview/traffic.sqlite`。原始数据库不应提交到 Git，也不应替换线上 D1。静态预览不提供统计接口，未知访问量保持未知。

## 质量检查

```bash
node --test tests/*.test.mjs
python -X utf8 -m unittest discover -s tests -p "test_*.py"
python scripts/audit_challenge_assets.py
python scripts/audit_checkup_assets.py
git diff --check
```

模型回答及题库文件具有来源哈希；`.gitattributes` 对相关目录禁用换行转换，避免只因跨平台 checkout 就改变证据字节。调整评分时保留原回答和来源，新增版本或留下复核记录。

`scripts/verify_browser.mjs` 和 `scripts/verify_expanded_browser.mjs` 可用于额外浏览器检查，需要另外提供 Puppeteer 和 Chromium；它们不属于无依赖的默认测试。手机视口检查不等同于实体 iPhone 或 Android 验收。

## 提交前

检查 `git diff` 和 `git status`。真实运行的配置放在 `config.local.json` 或 `config.*.local.json`，API 密钥通过环境变量传入。`results/`、`private/`、`artifacts/`、本地数据库、真实 Wrangler 配置和 `.env` 已忽略。

修改网站不需要调用模型。只有在明确要采集新答卷时才进入[运行器流程](../runner/README.md)。
