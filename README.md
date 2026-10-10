# DongDa 独立站

这是以工业包装采购为中心的多语言网站源码。公众端为静态 HTML/CSS/JavaScript；询盘、CMS 和 ERP 集成在独立私有服务中演进。

- [项目上下文与工程规范](CODEX.md)
- [当前功能、内容审核与上线待办](docs/PROJECT_STATUS.md)
- [源码、交付与证据索引](docs/DIRECTORY_INDEX.md)
- [AI 修改规则](AGENTS.md)
- [当前部署约束](DEPLOYMENT.md)

当前系统名为 DongDa，版本为 `1.2.0-rc.1`，发布身份为 `dongda-2026-10-09.1`，基于 A39 candidate03。历史交付包保持原字节；本次验收、Git与阿里云同步状态见项目状态和发布记录。

现有包要求 Node >=22.18；已测运行时记录为 22.23.0，依赖版本见 package-lock.json。项目尚无通用“一键安全验收”：`npm test` 包含私有目标，`build:sites` 会重建 dist，`preflight:quality`/`preflight:preview` 包含完整测试与写入；执行前必须读取当前工作边界。

本机静态 A39 预览为 [127.0.0.1:4243](http://127.0.0.1:4243/)，仅在本机服务存活时可用。生产询盘、ERP 通知及正式域名上线另有待办，见当前状态。
