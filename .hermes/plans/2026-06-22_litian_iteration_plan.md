# Litian Group Website — 三引擎迭代计划

> **项目经理**: Hermes | **日期**: 2026-06-22
> **仓库**: `~/Desktop/hermcs/projects/litian-website/`
> **线上**: https://china-litian.pages.dev

---

## 项目现状审计

| 检查项 | 状态 | 详情 |
|--------|------|------|
| 网站结构 | ✅ | 7 页 SPA，3933 行 HTML/CSS/JS |
| 多语言 | ✅ | 8 种语言 |
| 品牌色系 | ✅ | Navy + Terracotta，品牌一致 |
| AI 客服 | ✅ | 前端已实现，静态模式可用 |
| Cloudflare Pages | ✅ | 已部署 |
| PWA 图标 | ✅ | icon-192 + icon-512 存在 |
| **Case 图片** | ❌ | 12 张中 8 张是重复品 |
| **自定义域名** | ❌ | china-litian.com DNS 未配置 |
| **生产邮箱 Worker** | ❌ | Cloudflare Worker 未部署 |
| **上线核对清单** | ❌ | 5 项待确认 |

---

## 三引擎分派

### P1: Codex — 修复重复 Case 图片
- **任务**: 12 张 case 图片 → 去重到 12 张唯一图片
- **方案**: 用 Hermes image_gen 生成 8 张新工业案例图
- **命令**: 分 8 次调用 image_generate，描述不同工业场景

### P2: Claude — 安全 + 代码审计
- **任务**: 审查 index.html 的安全性与代码质量
- **命令**: `claude -p "审计 litian-website/index.html，查找 XSS/注入/CSP/性能问题"`

### P3: WorkBuddy — 上线文档
- **任务**: 生成完整部署 SOP 和上线核对清单
- **命令**: `codebuddy -p "基于 DEPLOYMENT.md 生成详细上线 SOP"`

### P4: Claude — Worker 部署配置
- **任务**: 配置 Cloudflare Worker 的生产参数

### P5: 全引擎 — 最终验证
- 图片完整性检查
- 链接有效性扫描
- 多语言抽样验证

---

## 迭代日志

| # | 阶段 | 引擎 | 结果 |
|---|------|------|------|
| 1 | P0 | Hermes | 审计完成，发现 4 个问题 |
| 2 | P1 | Codex | - |
| 3 | P2 | Claude | - |
| 4 | P3 | WorkBuddy | - |
| 5 | P4 | Claude | - |
| 6 | P5 | All | - |
