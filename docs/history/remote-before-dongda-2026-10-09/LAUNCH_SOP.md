# Litian Group 生产上线 SOP / Production Launch SOP

**版本 / Revision**: v1.0  
**日期 / Date**: 2026-06-22  
**项目 / Project**: Litian Group — B2B Industrial Packaging Website  
**当前线上地址 / Current URL**: https://china-litian.pages.dev  
**目标域名 / Target Domain**: china-litian.com  
**部署平台 / Platform**: Cloudflare Pages + Cloudflare Workers

---

## 目录 / Table of Contents

1. [上线前检查清单 / Pre-Launch Checklist](#1-上线前检查清单--pre-launch-checklist)
2. [域名 DNS 配置 / Domain DNS Configuration](#2-域名-dns-配置--domain-dns-configuration)
3. [Worker 部署步骤 / Worker Deployment](#3-worker-部署步骤--worker-deployment)
4. [安全加固清单 / Security Hardening Checklist](#4-安全加固清单--security-hardening-checklist)
5. [上线后监控 / Post-Launch Monitoring](#5-上线后监控--post-launch-monitoring)
6. [紧急回滚程序 / Emergency Rollback Procedure](#6-紧急回滚程序--emergency-rollback-procedure)
7. [Worker 生产就绪评估 / Worker Production Readiness Assessment](#7-worker-生产就绪评估--worker-production-readiness-assessment)
8. [附录 / Appendix](#8-附录--appendix)

---

## 1. 上线前检查清单 / Pre-Launch Checklist

### 1.1 内容与视觉 / Content & Visual

| # | 检查项 / Check Item | 状态 / Status | 备注 / Notes |
|---|---------------------|---------------|---------------|
| 1.1 | WhatsApp 号码确认：`+7 707 559 0188` (`https://wa.me/77075590188`) | ☐ 待确认 | 联系客户确认是否为最终商用号码 |
| 1.2 | 案例图片替换：当前 `case_01.jpg` 至 `case_12.jpg` 存在重复图片 | ☐ 待替换 | 需客户提供最终产品或项目实拍图替换重复项 |
| 1.3 | 公司法定名称确认：Litian Group / 力天集团 | ☐ 待确认 | 与营业执照一致 |
| 1.4 | 隐私联系邮箱确认：`ynakobka@dongdaltd.com` | ☐ 待确认 | 确认此邮箱在生产环境可正常接收邮件 |
| 1.5 | 8 种语言页面逐一视觉审查（英/俄/中/哈/吉/塔/土/乌） | ☐ 待审查 | 由母语者或翻译团队做最终审核 |
| 1.6 | 产品规格数据准确性审核（阀口袋、FIBC、编织袋、纸塑复合袋） | ☐ 待审核 | 年产能 5 亿+、3000+ 人等数据是否准确 |
| 1.7 | 工厂信息确认：阿克苏 1000 亩、撒马尔罕 BOXIN 年产 3 亿只 | ☐ 待确认 | 核实产能数据和工厂实拍图 |

### 1.2 技术检查 / Technical

| # | 检查项 / Check Item | 状态 / Status | 备注 / Notes |
|---|---------------------|---------------|---------------|
| 1.8 | 全站死链扫描（broken link check） | ☐ 待执行 | 使用 `wget --spider` 或在线工具 |
| 1.9 | 静态资源完整性检查：所有图片、视频 (`promo.mp4`) 可正常加载 | ☐ 待执行 | 特别注意 `assets/img/cases/` 下的案例图 |
| 1.10 | `_headers` 文件语法验证 | ✅ 已验证 | 见第 4 节详情 |
| 1.11 | `_redirects` SPA 路由规则验证（`/* /index.html 200`） | ✅ 已验证 | 确保所有路由回退到 index.html |
| 1.12 | 所有语言页面的 `<meta>` OG 标签和 title 正确显示 | ☐ 待检查 | 测试 WhatsApp/Facebook 分享预览 |
| 1.13 | 多语言切换功能无异常 | ☐ 待检查 | 测试所有 8 种语言切换 |
| 1.14 | 表单验证逻辑：询价表单必填字段（公司、联系人、邮箱、产品） | ✅ 已验证 | 前端已验证，后端也需验证 |
| 1.15 | AI 客服机器人基础功能（关键词分类、对话记录） | ✅ 已验证 | 静态模式正常工作 |
| 1.16 | 报价计算器 (Quote Calculator) 多步骤流程 | ☐ 待测试 | 验证产品选择→规格→数量→结果流程 |
| 1.17 | 移动端响应式布局（Mobile responsiveness） | ☐ 待测试 | 测试 iPhone/Android 主流机型 |
| 1.18 | 字体加载（Google Fonts: DM Serif Display, Inter, Noto Sans SC） | ☐ 待测试 | 中国大陆用户可能无法访问 Google Fonts |

### 1.3 合规与法务 / Compliance & Legal

| # | 检查项 / Check Item | 状态 / Status | 备注 / Notes |
|---|---------------------|---------------|---------------|
| 1.19 | 隐私政策页面 / Privacy Policy | ☐ 缺失 | 需添加隐私政策（收集邮箱、WhatsApp 等个人信息） |
| 1.20 | Cookie 同意横幅 / Cookie Consent | ☐ 缺失 | 如使用 Google Fonts / Analytics 则必需 |
| 1.21 | SEDEX/SMETA、BSCI 认证在页面可见 | ☐ 待确认 | 确认认证编号和有效期 |
| 1.22 | 备案号（如面向中国大陆用户） | ☐ 待确认 | 中国大陆 ICP 备案要求 |
| 1.23 | 公司注册地法律合规审查 | ☐ 待确认 | 多国运营（中/乌/哈）的法律要求 |

### 1.4 性能优化 / Performance

| # | 检查项 / Check Item | 状态 / Status | 备注 / Notes |
|---|---------------------|---------------|---------------|
| 1.24 | Google Fonts 国内访问替代方案 | ☐ 待实施 | 建议自托管字体或使用国内 CDN |
| 1.25 | 图片压缩与 WebP 格式转换 | ☐ 待优化 | 当前部分案例图片较大，建议压缩 |
| 1.26 | 视频 `promo.mp4` 尺寸优化 | ☐ 待检查 | 可能影响首屏加载 |
| 1.27 | Lighthouse 性能评分 ≥ 90 | ☐ 待测试 | 分别在移动端和桌面端测试 |

---

## 2. 域名 DNS 配置 / Domain DNS Configuration

### 2.1 前置条件 / Prerequisites

- Cloudflare 账号已注册并登录
- 域名 `china-litian.com` 已购买（或在 Cloudflare Registrar）
- Cloudflare Pages 项目已创建，当前部署在 `china-litian.pages.dev`

### 2.2 DNS 配置步骤 / DNS Configuration Steps

#### 步骤 1：将域名添加到 Cloudflare / Add Domain to Cloudflare

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 点击 **Add a Site** → 输入 `china-litian.com`
3. 选择计划（Free 计划通常足够）
4. Cloudflare 将扫描现有 DNS 记录（如有）

#### 步骤 2：更新域名服务器 / Update Nameservers

1. Cloudflare 将提供两个 nameserver 地址（例如 `alice.ns.cloudflare.com`、`bob.ns.cloudflare.com`）
2. 前往域名注册商（如 Namecheap、GoDaddy、万网等）
3. 将域名的 nameserver 替换为 Cloudflare 提供的地址
4. 等待 DNS 传播（通常 2-48 小时，Cloudflare 通常 <30 分钟）

#### 步骤 3：配置 Cloudflare Pages 自定义域名 / Configure Custom Domain in Pages

1. 进入 Cloudflare Pages 项目 → **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入 `china-litian.com`（根域名）
4. Cloudflare 将自动创建所需的 DNS 记录（CNAME → `china-litian.pages.dev`）
5. 建议同时添加 `www.china-litian.com` 并设置重定向到根域名

#### 步骤 4：DNS 记录确认 / DNS Record Verification

最终 DNS 配置应为：

| 类型 / Type | 名称 / Name | 目标 / Target | 代理 / Proxy | TTL |
|-------------|-------------|---------------|--------------|-----|
| CNAME | `@` (或 `china-litian.com`) | `china-litian.pages.dev` | ✅ Proxied (橙色云) | Auto |
| CNAME | `www` | `china-litian.pages.dev` | ✅ Proxied (橙色云) | Auto |

> **重要**：保持 Cloudflare 代理开启（橙色云朵图标），以获得 CDN、DDoS 防护和 SSL 证书。

#### 步骤 5：SSL/TLS 配置 / SSL/TLS Configuration

1. Cloudflare → `china-litian.com` → **SSL/TLS**
2. 加密模式设置为 **Full (strict)**（推荐）
3. 确认 **Always Use HTTPS** 已开启
4. 确认 **Automatic HTTPS Rewrites** 已开启
5. 等待 SSL 证书自动签发（几分钟内）

#### 步骤 6：验证 / Verification

```bash
# 检查 DNS 解析
dig china-litian.com +short
# 应返回 Cloudflare IP（已代理）

# 检查 HTTPS
curl -I https://china-litian.com
# 应返回 HTTP/2 200 或 301/308

# 检查 www 重定向
curl -I https://www.china-litian.com
# 应重定向到 https://china-litian.com
```

### 2.3 可选：Cloudflare 页面规则 / Optional Page Rules

| 规则 / Rule | 目标 / Target | 操作 / Action |
|-------------|---------------|---------------|
| 强制 HTTPS | `*china-litian.com/*` | Always Use HTTPS |
| www 重定向 | `www.china-litian.com/*` | Forwarding URL (301) → `https://china-litian.com/$1` |
| 缓存规则 | `china-litian.com/assets/*` | Cache Level: Cache Everything, Edge Cache TTL: 1 year |

> **注意**：`_headers` 文件中的缓存规则在 Cloudflare Pages 上自动生效，无需额外的页面规则。

---

## 3. Worker 部署步骤 / Worker Deployment

### 3.1 准备工作 / Preparation

#### 3.1.1 Resend API 配置 / Resend API Setup

1. 注册 [Resend](https://resend.com) 账号
2. 验证发送域名 `china-litian.com`（Resend 要求验证域名的 DNS 记录）：
   - 将 Resend 提供的 TXT/SPF/DKIM 记录添加到 Cloudflare DNS
3. 创建 API Key（用于 Worker 环境变量）
4. 注意免费层级限制：100 封/天（生产环境可能需要升级）

#### 3.1.2 环境变量规划 / Environment Variable Planning

| 变量名 / Variable | 示例值 / Example Value | 说明 / Description |
|-------------------|------------------------|---------------------|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxxx` | Resend API 密钥 |
| `SALES_TO_EMAIL` | `ynakobka@dongdaltd.com` | 询盘接收邮箱（销售团队） |
| `SALES_FROM_EMAIL` | `Litian Group <noreply@china-litian.com>` | 发件人地址（需在 Resend 验证） |

### 3.2 Worker 部署 / Worker Deployment

#### 方式一：通过 Cloudflare Dashboard 部署 / Via Dashboard

1. 进入 Cloudflare Dashboard → **Workers & Pages**
2. 点击 **Create application** → **Create Worker**
3. 为 Worker 命名（例如 `litian-ai-service`）
4. 将 `workers/ai-service-worker.js` 的代码粘贴到编辑器
5. 点击 **Save and Deploy**
6. 进入 Worker 设置 → **Variables** → 添加环境变量：
   - `RESEND_API_KEY`
   - `SALES_TO_EMAIL`
   - `SALES_FROM_EMAIL`
7. 加密所有环境变量（点击 Encrypt）

#### 方式二：通过 Wrangler CLI 部署 / Via Wrangler CLI

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 在 workers/ 目录下创建 wrangler.toml
cat > wrangler.toml << 'EOF'
name = "litian-ai-service"
main = "ai-service-worker.js"
compatibility_date = "2025-01-01"

[vars]
SALES_TO_EMAIL = "ynakobka@dongdaltd.com"
SALES_FROM_EMAIL = "Litian Group <noreply@china-litian.com>"
EOF

# 设置密钥（不写入文件）
wrangler secret put RESEND_API_KEY

# 部署
wrangler deploy
```

#### 3.2.1 Worker 路由配置 / Worker Route Configuration

部署后配置路由，使 Worker 处理特定的 API 路径：

1. 进入 Worker 设置 → **Triggers** → **Routes**
2. 添加路由：
   - Route: `china-litian.com/api/ai-service`
   - Zone: `china-litian.com`

或者使用自定义子域名（如 `ai-service.china-litian.workers.dev`）。

### 3.3 前端配置 / Frontend Configuration

在 `index.html` 的 `</head>` 前添加以下代码以激活生产模式：

```html
<script>
window.LITIAN_AI_ENDPOINT = "https://china-litian.com/api/ai-service";
</script>
```

> **注意**：如配置了不同的 Worker 路由，请相应修改 URL。

> **当前状态**：`LITIAN_AI_ENDPOINT` 未在前端设置，网站运行在静态模式（mailto: 后备方案）。部署 Worker 后需更新 HTML。

### 3.4 Worker 测试 / Worker Testing

```bash
# 测试 Worker 端点
curl -X POST https://litian-ai-service.${YOUR_SUBDOMAIN}.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ai-customer-service",
    "language": "en",
    "page": "https://china-litian.com/inquiry",
    "company": "Test Corp",
    "contact": "John Doe",
    "email": "test@example.com",
    "phone": "+1234567890",
    "product": "Cement valve bag",
    "quantity": "50000",
    "specifications": "50kg, 4-color print",
    "notes": "Need delivery to Dubai",
    "transcript": []
  }'

# 预期响应
# {"ok":true,"reply":"Thank you for your cement valve bag inquiry..."}
```

### 3.5 备选方案：仅使用 Resend SDK / Alternative: Resend SDK Only

如果不需要 Cloudflare Worker，也可以在前端使用 Resend SDK（不推荐，会暴露 API Key）。Worker 方案是推荐的生产方案。

---

## 4. 安全加固清单 / Security Hardening Checklist

### 4.1 当前安全头配置 / Current Security Headers

文件 `_headers` 已配置以下安全头：

| 头部 / Header | 当前值 / Current Value | 评估 / Assessment |
|---------------|------------------------|-------------------|
| `X-Frame-Options` | `SAMEORIGIN` | ✅ 良好，防点击劫持 |
| `X-Content-Type-Options` | `nosniff` | ✅ 良好，防 MIME 嗅探 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ 良好 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ✅ 良好，禁用不必要的 API |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: https:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self' mailto:;` | ⚠️ 见下方详细分析 |

### 4.2 CSP 加固建议 / CSP Hardening Recommendations

当前 CSP 中的问题：

1. **`script-src 'unsafe-inline'`** — 允许内联脚本执行，降低 XSS 防护能力。当前使用内联 JS，如有预算建议抽离。
2. **`style-src 'unsafe-inline'`** — 允许内联样式，CSS 注入风险。
3. **缺少 `report-uri` 或 `report-to`** — 无法收集 CSP 违规报告。

建议的增强 CSP（如将 JS 抽离为外部文件后）：

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https: https://api.resend.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' mailto:; report-uri /csp-violation;
```

> **现实评估**：由于当前项目是内联 JS/CSS 的单文件 SPA，CSP 中使用 `'unsafe-inline'` 是必要的折中。长期建议将 JS 和 CSS 抽取为独立文件并使用 nonce 或 hash。

### 4.3 安全加固操作清单 / Security Hardening Action Items

| # | 加固项 / Item | 优先级 / Priority | 说明 / Description |
|---|---------------|-------------------|---------------------|
| 4.1 | 开启 Cloudflare Bot Fight Mode | 🔴 高 | 防爬虫和自动攻击 |
| 4.2 | 开启 Cloudflare WAF（Web Application Firewall） | 🔴 高 | 至少开启 OWASP 核心规则集 |
| 4.3 | 开启 Cloudflare Rate Limiting（Worker 路由） | 🔴 高 | 限制 `/api/ai-service` 请求频率（如 10 次/分钟/IP） |
| 4.4 | 配置 Cloudflare DDoS 防护 | 🟡 中 | Free 计划已包含基础 DDoS 防护 |
| 4.5 | 开启 DNSSEC | 🟡 中 | 防 DNS 劫持 |
| 4.6 | 开启 HSTS (HTTP Strict Transport Security) | 🟡 中 | Cloudflare → SSL/TLS → HSTS: max-age=31536000, includeSubDomains, preload |
| 4.7 | 确认 TLS 1.2 最低版本 | 🟡 中 | Cloudflare → SSL/TLS → Minimum TLS Version: 1.2 |
| 4.8 | 添加 `Strict-Transport-Security` 到 `_headers` | 🟡 中 | `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` |
| 4.9 | Worker CORS 限制 | 🟡 中 | 将 `Access-Control-Allow-Origin: *` 改为 `https://china-litian.com` |
| 4.10 | Worker 添加请求大小限制 | 🟡 中 | 拒绝 >10KB 的 POST 请求体 |
| 4.11 | Worker 添加 API Key 验证 | 🟢 低 | 添加共享密钥防止未授权调用 |
| 4.12 | 环境变量确认已加密 | 🔴 高 | 确认 RESEND_API_KEY 在 Worker 设置中已加密 |
| 4.13 | 确认 `.env` 文件不在 Git 仓库中 | 🔴 高 | API 密钥永远不进入版本控制 |

### 4.4 `_headers` 文件增强版 / Enhanced `_headers`

建议在现有 `_headers` 基础上添加：

```
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self' mailto:;
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

/index.html
  Cache-Control: no-store

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## 5. 上线后监控 / Post-Launch Monitoring

### 5.1 即时监控（上线后 24 小时） / Immediate Monitoring (First 24 Hours)

| # | 监控项 / Item | 方法 / Method | 阈值 / Threshold |
|---|---------------|---------------|------------------|
| 5.1 | SSL 证书状态 | Cloudflare Dashboard → SSL/TLS | 证书有效，无警告 |
| 5.2 | DNS 解析全球一致性 | https://www.whatsmydns.net | 所有地区解析到 Cloudflare IP |
| 5.3 | 页面访问正常 | 手动访问 + `curl -I` | HTTP 200 |
| 5.4 | HTTPS 强制跳转 | `curl -I http://china-litian.com` | 301 → HTTPS |
| 5.5 | Worker 端点响应 | 手动 POST 测试（见 3.4 节） | 返回 `{"ok":true}` |
| 5.6 | Resend 邮件发送验证 | 提交测试询盘 | 收件箱收到邮件 |
| 5.7 | 静态资源加载（无 404） | 浏览器 DevTools → Network | 所有资源 200/304 |
| 5.8 | AI 客服功能 | 打开 AI 面板 → 发送测试消息 | 收到自动回复 |
| 5.9 | 询价表单提交 | 填写表单 → 提交 | mailto: 或 API 发送成功 |

### 5.2 持续监控指标 / Ongoing Monitoring Metrics

#### 平台监控 / Platform Monitoring (Cloudflare)

| 指标 / Metric | 面板 / Dashboard | 关注点 / Watch For |
|---------------|-------------------|---------------------|
| 请求总数 | Cloudflare Analytics | 异常流量峰值 |
| 带宽用量 | Cloudflare Analytics | 超出免费计划限制 |
| 缓存命中率 | Cloudflare Analytics | 低于 70% 需检查缓存规则 |
| 威胁数量 | Cloudflare Security Events | WAF 拦截事件 |
| Worker 调用次数 | Workers Analytics | 接近免费层级限制（10 万/天） |
| Worker 错误率 | Workers Analytics | 超过 1% 需排查 |
| Worker CPU 时间 | Workers Analytics | 接近 10ms 限制（免费计划） |

#### 功能监控 / Functional Monitoring

| 监控项 / Item | 频率 / Frequency | 检查方法 / Method |
|---------------|-------------------|-------------------|
| 询盘邮件接收 | 每日 | 检查 `ynakobka@dongdaltd.com` 是否收到测试询盘 |
| AI 客服可用性 | 每日 | 发送测试消息确认自动回复 |
| 表单提交完整性 | 每周 | 检查 localStorage `litian_inquiries` 是否正确保存 |
| 多语言页面 | 每周 | 切换 8 种语言，确认无乱码 |
| 案例图片加载 | 每周 | 确认 `assets/img/cases/` 所有图片可加载 |
| 死链检查 | 每月 | 运行全站链接扫描 |

### 5.3 建议添加的监控工具 / Recommended Monitoring Tools

| 工具 / Tool | 用途 / Purpose | 成本 / Cost |
|-------------|----------------|-------------|
| Cloudflare Web Analytics | 基础流量分析（已内置） | 免费 |
| Google Analytics 4 | 详细用户行为分析 | 免费 |
| UptimeRobot | 网站可用性监控 | 免费（50 个监控，5 分钟间隔） |
| Sentry (前端错误追踪) | JS 错误监控 | 免费层级 |
| Cloudflare Email Routing | 询盘邮件转发备份 | 免费 |

### 5.4 警报规则建议 / Suggested Alert Rules

| 警报 / Alert | 条件 / Condition | 通知方式 / Notification |
|--------------|-------------------|-------------------------|
| 网站宕机 | HTTP 状态码 ≠ 200，持续 2 分钟 | Email + 企业微信/WhatsApp |
| SSL 证书过期 | 距离过期 < 7 天 | Email |
| Worker 错误率飙升 | 错误率 > 5% 持续 5 分钟 | Email |
| 邮件发送失败 | Resend 返回错误 | 检查 Resend Dashboard |

---

## 6. 紧急回滚程序 / Emergency Rollback Procedure

### 6.1 回滚触发条件 / Rollback Triggers

出现以下任一情况时，考虑执行回滚：

- Worker 导致客户邮件丢失或发送错误
- DNS 配置错误导致网站不可访问
- 安全漏洞被发现且无法快速修补
- CSP 配置过严导致核心功能不可用
- Cloudflare 配置变更导致服务中断

### 6.2 回滚方案 / Rollback Plan

#### 方案 A：Worker 回滚 / Worker Rollback

优先级最高，因为 Worker 是最可能出问题的组件。

**影响**：回滚后 AI 客服和询盘将退回 mailto: 模式。

**步骤**：

1. **立即操作**（< 2 分钟恢复）：
   ```bash
   # 回滚到上一个 Worker 版本
   wrangler rollback
   # 或在 Cloudflare Dashboard: Workers → litian-ai-service → Deployments → 选择上一个版本 → Rollback
   ```

2. **备选方案**（如果 Wrangler 不可用）：
   - 进入 Cloudflare Dashboard → Workers & Pages → `litian-ai-service`
   - 点击 **Deployments** → 找到上一个正常版本 → **Rollback**

3. **临时禁用 Worker**（最坏情况）：
   - 删除 Worker 路由（Workers → Triggers → Routes → 删除路由）
   - 删除或注释 HTML 中的 `window.LITIAN_AI_ENDPOINT` 配置
   - 系统自动回退到 mailto: 模式
   - **注意**：需清除 CDN 缓存使 HTML 变更生效

#### 方案 B：DNS 回滚 / DNS Rollback

**影响**：恢复使用 `china-litian.pages.dev` 子域名访问。

**步骤**：

1. 进入 Cloudflare DNS 设置
2. 将 CNAME 记录切换到临时状态或删除自定义域名
3. 或在 Cloudflare Pages → Custom domains → 移除 `china-litian.com`
4. 用户可通过 `china-litian.pages.dev` 继续访问

#### 方案 C：全站回滚 / Full Site Rollback

**影响**：恢复到上一个已知良好的部署版本。

**步骤**：

1. 进入 Cloudflare Pages → `china-litian.pages.dev` → **Deployments**
2. 找到上一个正常版本的部署记录
3. 点击 **...** → **Rollback to this deployment**
4. Cloudflare 自动切换流量到该版本（秒级生效）

### 6.3 回滚后检查 / Post-Rollback Verification

| # | 检查项 / Item | 预期结果 / Expected |
|---|---------------|---------------------|
| 6.3.1 | 网站可通过 `china-litian.pages.dev` 访问 | HTTP 200 |
| 6.3.2 | 询价表单恢复 mailto: 模式 | 点击提交打开邮件客户端 |
| 6.3.3 | AI 客服可正常对话 | 自动回复正常工作 |
| 6.3.4 | 无 JS 错误 | 控制台无异常报错 |
| 6.3.5 | 静态资源可加载 | 图片/CSS/字体正常 |

### 6.4 应急联系人 / Emergency Contacts

| 角色 / Role | 联系方式 / Contact | 职责 / Responsibility |
|-------------|-------------------|-----------------------|
| 网站技术负责人 | [待填写 / TBD] | Worker/Pages 部署与回滚 |
| 域名管理员 | [待填写 / TBD] | DNS 配置与变更 |
| 销售负责人 | [待填写 / TBD] | 确认询盘邮件是否正常接收 |
| Cloudflare 支持 | https://support.cloudflare.com | 平台级问题 |

---

## 7. Worker 生产就绪评估 / Worker Production Readiness Assessment

基于对 `workers/ai-service-worker.js` 的审查，以下是**生产就绪问题和改进建议**：

### 7.1 当前代码问题 / Current Issues

| # | 问题 / Issue | 严重程度 / Severity | 说明 / Description |
|---|-------------|---------------------|---------------------|
| 7.1 | **无速率限制 / No Rate Limiting** | 🔴 严重 | 开放端点可被滥用发送大量邮件。需添加 IP 级别速率限制。 |
| 7.2 | **无身份验证 / No Authentication** | 🔴 严重 | 任何人都可以调用端点发送邮件。需添加共享密钥或 Origin 验证。 |
| 7.3 | **请求体大小未限制 / No Payload Size Limit** | 🟡 中等 | 攻击者可发送超大请求体消耗 Worker 资源。应限制为 ~10KB。 |
| 7.4 | **CORS 过于宽松 / CORS Too Permissive** | 🟡 中等 | `Access-Control-Allow-Origin: *` 允许任何网站调用。应限制为 `https://china-litian.com`。 |
| 7.5 | **错误处理不完整 / Incomplete Error Handling** | 🟡 中等 | 若发送销售邮件失败，仍会尝试发送客户确认邮件。应检查第一步结果。 |
| 7.6 | **缺少日志 / No Logging** | 🟡 中等 | 无法追踪邮件发送状态或调试问题。建议添加 `console.log` 到 Cloudflare Logpush。 |
| 7.7 | **助理回复仅支持中英文 / Assistant Only Supports EN+ZH** | 🟢 低 | `assistantReply()` 函数只匹配中英文关键词，不支持俄/哈/吉/塔/土/乌 6 种语言。 |
| 7.8 | **缺少垃圾邮件防护 / No Spam Protection** | 🟢 低 | 无蜜罐字段或 reCAPTCHA 验证。 |
| 7.9 | **客户确认邮件无防重机制 / No Deduplication** | 🟢 低 | 同一请求可能重复发送确认邮件。 |

### 7.2 建议的 Worker 改进代码 / Recommended Worker Code Improvements

以下是针对关键问题的改进版 Worker：

```javascript
// ── Rate Limiter (简单的内存限制，生产建议用 Cloudflare KV) ──
const RATE_LIMIT_MAP = new Map(); // IP → {count, reset}

function checkRateLimit(ip, maxRequests = 10, windowSeconds = 60) {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(ip);
  if (!entry || now > entry.reset) {
    RATE_LIMIT_MAP.set(ip, { count: 1, reset: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

// ── 改进后的 CORS（限制 Origin）──
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const ALLOWED_ORIGINS = [
    "https://china-litian.com",
    "https://www.china-litian.com",
    "https://china-litian.pages.dev"
  ];
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

// ── 验证 API 密钥（可选增强）──
function validateAuth(request, env) {
  if (!env.API_SHARED_SECRET) return true; // 未配置则跳过
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${env.API_SHARED_SECRET}`;
}

export default {
  async fetch(request, env) {
    // 1. CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(request) });
    }

    // 2. 速率限制
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimit = checkRateLimit(ip, 10, 60);
    if (!rateLimit.allowed) {
      return Response.json(
        { ok: false, error: "Too Many Requests", retryAfter: rateLimit.retryAfter },
        { status: 429, headers: corsHeaders(request) }
      );
    }

    // 3. 身份验证
    if (!validateAuth(request, env)) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders(request) });
    }

    // 4. 请求体大小限制（~10KB）
    const contentLength = parseInt(request.headers.get("Content-Length") || "0");
    if (contentLength > 10240) {
      return Response.json({ ok: false, error: "Payload too large" }, { status: 413, headers: corsHeaders(request) });
    }

    // 5. JSON 解析（带大小保护）
    let payload;
    try {
      const raw = await request.text();
      if (raw.length > 10240) throw new Error("Payload too large");
      payload = JSON.parse(raw);
    } catch (error) {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: corsHeaders(request) });
    }

    // 6. 发送邮件（原有逻辑 + 错误处理改进）
    const salesEmail = env.SALES_TO_EMAIL || DEFAULT_SALES_EMAIL;
    const fromEmail = env.SALES_FROM_EMAIL || `Litian Website <no-reply@${new URL(request.url).hostname}>`;
    const reply = assistantReply(payload);
    const subject = `Litian AI RFQ - ${payload.product || payload.company || "Website Lead"}`;

    try {
      await sendResendEmail(env, {
        from: fromEmail,
        to: [salesEmail],
        subject,
        text: emailText(payload, reply)
      });

      // 仅在销售邮件发送成功后才发送客户确认邮件
      if (payload.email) {
        await sendResendEmail(env, {
          from: fromEmail,
          to: [payload.email],
          subject: "Litian Group received your inquiry",
          text: reply
        });
      }

      return Response.json({ ok: true, reply }, { headers: corsHeaders(request) });
    } catch (error) {
      console.error(`Worker error for IP ${ip}:`, error.message);
      return Response.json(
        { ok: false, error: "Email delivery failed" },
        { status: 502, headers: corsHeaders(request) }
      );
    }
  }
};
```

### 7.3 生产部署前必须修复（Minimum Viable） / Must-Fix Before Production

1. ✅ 添加速率限制（Rate Limiting）
2. ✅ 限制 CORS Origin
3. ✅ 限制请求体大小
4. ✅ 改进错误处理（先发销售邮件，成功后再发客户确认）
5. ✅ 添加基础日志

### 7.4 上线后优化 / Post-Launch Optimizations

1. 将速率限制从内存 Map 迁移到 Cloudflare KV（跨 Worker 实例共享）
2. 添加多语言助理回复（俄/哈/吉/塔/土/乌）
3. 添加 PV 计数器或 Analytics Engine 用于邮件发送统计
4. 集成垃圾邮件检测服务
5. 添加邮件发送队列（Cloudflare Queues）保证可靠性

---

## 8. 附录 / Appendix

### 8.1 部署架构图 / Deployment Architecture

```
                           ┌──────────────────┐
                           │   Cloudflare      │
                           │   DNS + CDN + SSL │
                           └────────┬─────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────▼─────┐   ┌────▼─────┐   ┌─────▼─────┐
              │ Pages      │   │ Worker   │   │  WAF +    │
              │ (静态SPA)  │   │ (邮件API)│   │  DDoS防护 │
              └─────┬─────┘   └────┬─────┘   └───────────┘
                    │               │
              ┌─────▼─────┐   ┌────▼─────┐
              │ china-     │   │  Resend   │
              │ litian.com │   │  Email    │
              │ (HTML/CSS/ │   │  API      │
              │  JS/Assets)│   └────┬─────┘
              └────────────┘        │
                              ┌─────▼─────┐
                              │  yna...@   │
                              │  dongdal   │
                              │  td.com    │
                              └───────────┘
```

### 8.2 项目文件清单 / Project File Inventory

| 文件 / File | 用途 / Purpose | 部署 / Deploy |
|------------|----------------|--------------|
| `index.html` | 主 SPA 应用（含 CSS/JS） | ✅ Cloudflare Pages |
| `_headers` | 安全头 + 缓存规则 | ✅ Cloudflare Pages |
| `_redirects` | SPA 路由回退 | ✅ Cloudflare Pages |
| `assets/` | 静态资源（图片/视频） | ✅ Cloudflare Pages |
| `workers/ai-service-worker.js` | AI 客服邮件 Worker | ✅ Cloudflare Workers |
| `DEPLOYMENT.md` | 部署说明文档 | ❌ 不部署 |
| `网站信息汇总.md` | 项目信息汇总 | ❌ 不部署 |
| `LAUNCH_SOP.md` | 本文件 | ❌ 不部署 |

### 8.3 快速参考命令 / Quick Reference Commands

```bash
# DNS 验证
dig china-litian.com A +short
dig china-litian.com AAAA +short
dig china-litian.com MX +short

# HTTPS 验证
curl -I https://china-litian.com
curl -I https://www.china-litian.com

# Worker 测试
curl -X POST https://litian-ai-service.YOUR-SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "Origin: https://china-litian.com" \
  -d '{"type":"ai-customer-service","product":"valve bag","notes":"test"}'

# Worker 部署
cd workers && wrangler deploy

# Worker 日志（实时）
wrangler tail

# 清除 Cloudflare 缓存（按需）
# Dashboard → Caching → Configuration → Purge Everything
```

### 8.4 变更日志 / Changelog

| 日期 / Date | 版本 / Version | 变更 / Change | 作者 / Author |
|-------------|----------------|---------------|---------------|
| 2026-06-22 | v1.0 | 初始版本，基于 DEPLOYMENT.md 和现有代码分析 | Hermes Agent |

---

> **注意 / Note**：本 SOP 基于 2026-06-22 的代码状态编写。上线前请确保所有 ☐ 项已检查并确认为 ☑。所有 [待填写 / TBD] 字段需填入实际联系方式。
