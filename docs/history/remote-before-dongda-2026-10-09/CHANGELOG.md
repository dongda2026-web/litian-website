# Changelog

All notable changes to Litian Group Website are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [1.1.0] — 2026-06-22

### Security
- Worker: 添加 IP 级别速率限制 (10 req/min)
- Worker: 添加 Bearer Token 身份验证
- Worker: CORS 限定 3 个域名 (取代 `*`)
- CSP: connect-src 精确限定 `api.resend.com`
- 添加 HSTS: `max-age=31536000; includeSubDomains; preload`

### Fixed
- Case 图片去重: 12 张 → 12 张唯一 (8 张新生成)
- 移除重复的 `<meta charset>` 和 `<meta viewport>` 标签
- Worker: 销售邮件失败时不阻塞客户确认邮件

### Added
- `og:image` / `twitter:card` 社交预览标签
- `<link rel="canonical">` + `<link rel="manifest">`
- `<meta name="description">` + `<meta name="robots">`
- `LAUNCH_SOP.md` — 725 行中英双语上线操作手册
- `audit_report.json` — Claude 安全审计报告 (33 项)

### Changed
- 新 Case 图片场景: 生产线 / 吨袋 / 织布 / 航拍 / 微距 / 物流 / 质检 / ESG

---

## [1.0.0] — 2026-06-20

### Added
- 7 页 SPA: Home / Company / Products / Sustainability / Insights / Factory / Inquiry
- 8 语言: EN / RU / 中文 / ҚАЗ / КЫР / ТАЖ / ТКМ / UZ
- AI 客服聊天机器人 (静态模式)
- 询价与报价计算器
- 4 大产品线展示
- Cloudflare Pages 部署 (china-litian.pages.dev)
- PWA manifest + Service Worker

---

## [0.1.0] — 2026-06-16

### Added
- 项目初始化
- 品牌色系 (Navy #1B3A5C + Terracotta #9B2D1F)
- 网站信息汇总 (网站信息汇总.md)
- 初始 12 张 Case 图片
