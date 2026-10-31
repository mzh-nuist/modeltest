# 独立部署到 Cloudflare Pages

这个仓库包含静态前端、Worker 和 D1 迁移文件，不依赖 `chatgpt.site`。GitHub 仓库负责版本管理；仅推送代码不会自动改动现有线上网站。

## 只部署静态页面

`dist/` 可以交给支持静态文件的托管服务。静态模式可展示现有题目、答卷、图形和成绩，但不提供 `/api/traffic` 的实时统计功能。

## Pages + D1

准备自己的 Cloudflare 账号、Pages 项目、D1 数据库和已登录的 Wrangler。不要复用其他站长的账号或数据库标识。创建资源、绑定域名与费用以自己的账号设置为准。

先提交源码，再构建到新的结果目录：

```bash
python scripts/build_cloudflare.py --out results/pages-build
```

此命令生成 `public/`、校验清单和 `wrangler.example.json`，不部署，也不访问线上数据库。没有真实数据库 ID 时只会生成示例配置。

准备好自己的 D1 后，用另一个新目录构建：

```bash
python scripts/build_cloudflare.py --out results/pages-production --database-id YOUR_D1_DATABASE_ID
```

脚本要求真实 UUID 格式，且拒绝覆盖既有输出目录。编辑生成的 `wrangler.json`，把项目名称、数据库名称换成自己的值。该配置默认不提交到仓库。

使用 Wrangler 应用迁移并部署（以下操作会写入你的 Cloudflare 账号）：

```bash
wrangler d1 migrations apply DB --remote --config results/pages-production/wrangler.json
cd results/pages-production
wrangler pages deploy public --project-name YOUR_PAGES_PROJECT --branch main
```

最后在 Pages 控制台绑定自己的域名，核对 HTTPS、页面资源、未登录访问和统计接口。`manifest.json` 位于上传目录外，用于比对资源 SHA-256。

## 访客统计

生产 Worker 需要 D1 绑定 `DB`。首次访问或拒绝统计时不创建统计 ID、不上报；经同意才发送事件，QA 验收事件排除在公开 PV/UV 之外。未绑定数据库时接口返回不可用状态，不用演示数据冒充真实访客数。

本站现有域名、生产 D1 与部署凭据不属于公开仓库。GitHub Actions 只做离线检查，不携带生产密钥，不执行自动部署。
