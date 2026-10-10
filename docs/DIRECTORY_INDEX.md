# 目录、源码与交付索引

整理日期：2026-10-09。保留真实物理目录，使用入口索引分类；没有搬动源码、私有数据或大包。

## 主要位置

| 用途 | 位置与使用方式 |
| --- | --- |
| 工作区 | [项目入口](../../../../README.md) |
| 现用源码 | [litian-website](../README.md)，不要误用baseline或验收副本开发 |
| 最新A39静态产物 | `work/static-acceptance-a39-03/site/dist/client/`（相对工作区） |
| 本机预览 | [127.0.0.1:4243](http://127.0.0.1:4243/)，需要进程存活 |
| 初始代码基线 | `work/litian-upgrade/litian-website.baseline/`，仅历史比较 |
| ERP集成候选 | `work/dongda-main-integration/`，独立主系统候选；不替代真实用户ERP仓库 |
| 静态控制器/工具 | `work/acceptance-2026-10-08/`，具有写入/启动副作用，先读再选用 |
| 按轮次证据 | `outputs/upgrade-logs/`，冻结历史不覆盖 |
| 本次文档整理 | [outputs/project-context-2026-10-09](../../../../outputs/project-context-2026-10-09/README.md) |
| 桌面交付总入口 | `/Users/x/Desktop/东大独立站升级计划-2026-10-08/阅读说明.md` |
| 最新桌面交付 | `/Users/x/Desktop/东大独立站升级计划-2026-10-08/aliyun-staging-2026-10-09/` |

`work/static-acceptance-*`、`source-archive-verification-*`、`aliyun-staging-*-readback`都是验收/读回副本，不是新增主分支；旧端口记录不表示服务仍在线。

## 源码内部职责

| 路径 | 编辑入口 / 保护边界 |
| --- | --- |
| `index.html` | 现有页面结构与交互；保持原品牌、路由和业务行为 |
| `assets/js/`、`assets/css/` | 共享core/UI、公开样式；遵守就近规则 |
| `assets/img/`、`assets/fonts/` | 原媒体/字体、许可与摘要；不自动重压/替换 |
| `content/` | canonical JSON与派生seed；见content/README |
| `content/private-review/` | 私有发布审查；证据不公开、不打包 |
| `scripts/` | 构建、审计、预览与私有验证；名称不代表安全只读 |
| `tests/` | node:test；逐个判断纯逻辑、HTTP、DB或私有目标 |
| `server/` / `cms/` | 私有服务/编辑发布候选，不进入公众包 |
| `var/` | 私有运行数据/环境/卷；不得打开打印、迁移清空或交付 |
| `aliyun/inquiry-function/` / `workers/` | 历史适配器/模板；不当成生产已接入实现 |
| `dist/` | 可重建产物；build会删除重建，当前冻结A39另有目录 |
| `docs/history/` | 文档原文备份；历史状态不覆盖现行规则 |

## 冻结交付包

工作区留档根为 [2026-10-09-aliyun-staging](../../../../outputs/upgrade-logs/2026-10-09-aliyun-staging/Deployment-Report.md)。桌面对应包按同字节复制；本次已独立hash复核。

| 项目 | 位置 | 字节数 / SHA256 |
| --- | --- | --- |
| 完整静态包 | [website-static.tar.gz](../../../../outputs/upgrade-logs/2026-10-09-aliyun-staging/website-static.tar.gz) | 46,923,094 / `30af66f27f78a398236459e10d452e4fb93900890136dd7e7bfcb12355417760` |
| 选择性源码包 | [source-context.tar.gz](../../../../outputs/upgrade-logs/2026-10-09-route-recovery/source-context.tar.gz) | 5,624,626 / `92eb15e60d00a04df2679f22877dffaf8fbbdbd7ba0d0f9cc42b454f7aadaa46` |
| 云留档回执 | [Cloud-Staging-Receipt.json](../../../../outputs/upgrade-logs/2026-10-09-aliyun-staging/Cloud-Staging-Receipt.json) | 历史2对象private/AES256与认证读回证据 |
| 桌面交付读回 | [Final-Readback.json](../../../../outputs/upgrade-logs/2026-10-09-aliyun-staging/Final-Readback.json) | 当次交付记录 |
| A39源文件清单 | [Source-Manifest.json](../../../../outputs/upgrade-logs/2026-10-09-route-recovery/Source-Manifest.json) | 371个选择性源文件；本次说明变更前完全匹配 |
| A39公众产物清单 | [Public-Artifact-Manifest.json](../../../../outputs/upgrade-logs/2026-10-09-route-recovery/Public-Artifact-Manifest.json) | 481个文件；本轮保持冻结 |

选择性源码包不是包含全部媒体、运行环境及数据库的完整恢复包；公开静态包不是服务端源码。恢复需结合锁文件、原媒体、明确归属的私有备份与部署配置，不能从静态包推导生产凭据。

## 历史规则与文档备份

[context-before-2026-10-09](history/context-before-2026-10-09/workspace-AGENTS.md) 保存原479行工作区AGENTS及本轮更新文档的原文；本次验证记录包含hash。旧桌面阅读说明另备份在桌面 `文档整理备份-2026-10-09/`。

已退役的30个桌面ZIP不需要恢复；其退休记录保留在原A38证据。其他必要回滚、原始图/字体、A12未结记录及独立业务资料均保留。此次不进行大文件去重或清理。
