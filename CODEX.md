# DongDa 项目上下文与工程规范

维护日期：2026-10-09（America/Los_Angeles）。本文区分实际实现、工程要求和待办；版本与状态以代码、锁文件和同版验收为依据。

## 1. 项目定位与阅读入口

网站面向工业包装的 B2B 采购：产品浏览、选型/比较、需求清单、定制/样品及询盘。系统名为 DongDa；历史项目名 Litian 仅保留在原始资料和兼容路径。当前基于 A39 candidate03 验收并整理为 dongda-2026-10-09.1（1.2.0-rc.1）；Git与阿里云同步结果见项目状态，不将候选版本称为已正式上线。

[项目状态与网站清单](docs/PROJECT_STATUS.md) 管“现在完成到哪里”；[目录索引](docs/DIRECTORY_INDEX.md) 管“代码和证据在哪里”；AGENTS 管执行边界。最新公开部署必须独立核验，旧包、旧 Git HEAD、HTTP 200 均不足以证明同版上线。

## 2. 核心架构与依赖方向

本项目采用静态公众站与私有服务分离的结构，没有套用 DDD/MVC 框架，也没有 React、TypeScript、Tailwind、Vite 或 Redux/Zustand。

```text
content/*.json 规范内容
        ↓
assets/js/*-core.js 共享校验、派生、纯渲染
        ├── *-ui.js + index.html：浏览器交互
        ├── scripts/build-*.mjs：多语言实体页与公开资源
        └── server/*.mjs：独立服务端校验

WordPress 私有编辑 → 专用只读导出 → CMS 合同校验
  → 隔离完整构建 → 哈希/审核/CAS → 待受控激活的完整静态产物

浏览器需求 → 询盘 API → SQLite 事务 + outbox
  → 专用服务身份 → ERP 原子接收 → ERP 员工权限下的销售处理
```

- `index.html` 是现有界面和历史交互入口，逐步复用模块，避免无任务目的整体拆写。
- 浏览器不能依赖 Node、SQL、WordPress 数据库或服务凭据。共享 core 不访问私有服务状态；UI 只组织视图与现有行为。
- ERP 是客户身份、负责人、销售阶段、跟进、报价和订单的权威。网站本地询盘收件不是第二套生产 CRM，也不是财务系统。
- 静态前端通过安全的 runtime endpoints 对接已验收后端；当前 endpoints 为空。
- 私有询盘基于 `node:http` / `node:sqlite`，只适用于带持久卷的单实例；无多实例/HA/FC 临时盘可靠性承诺。
- CMS 当前代码合同 v4/45 是未挂载候选：102 个公司简介 zh/en/ru 文本路径，加既有产品/行业/历史/指南/清单。旧插件及旧选中版本仍保留，不能说真实 v4 迁移完成。

## 3. 技术栈与版本边界

| 部分 | 当前代码/配置 | 约束 |
| --- | --- | --- |
| Node / 模块 | package 要求 >=22.18；记录已测 22.23.0；ESM | node:sqlite 在该 Node 22 环境有实验性边界，升级固定版本后验收 |
| 浏览器 | HTML/CSS/vanilla JavaScript | 原生 dialog、DOM、Fetch、History；保持兼容回退 |
| AST / HTML / CSS | acorn 8.19.0 / parse5 8.0.1 / css-tree 3.2.1 | 结构化解析，不 eval 内容、不用任意字符串切片充当 schema |
| 图标 | lucide 1.53.0 | 通过 catalog 构建生成本地节点和许可 |
| 上传 / 类型 / PDF | busboy 1.6.0 / file-type 22.1.1 / pdf-lib 1.17.1 | 私有候选，依赖存在不等于公开上传可用 |
| 图片查看 | 本地 Panzoom 4.6.2 | 保留发行原件、MIT许可与来源摘要 |
| 图片 worker | 记录为 Pillow 12.3.0 候选 | 独立受限进程/资源预算，当前执行延期 |
| 私有 CMS 配置 | WordPress 7.1.3 / PHP 8.3 / MariaDB 11.4 固定镜像摘要 | 本地 compose 配置，非生产已部署版本 |
| 测试 | node:test + node:assert/strict | 当前 42 个 *.test.mjs 文件；不是 42 个通过的测试用例 |

直接 JS 依赖以 [package.json](package.json) 和 [package-lock.json](package-lock.json) 为准，不能凭本文替换锁文件。默认复用已采用依赖；需要新增依赖时先说明实际缺口、成本和验证方法。

## 4. 内容与模块职责

| 权威来源 | 消费者与重要约束 |
| --- | --- |
| `content/products.json` | 六个产品条目与一个技术模块（产品条目归属五个 family，另有 technical family）；统一 ID/别名、图片角色、配置选项；NW/AL 生产参考不能冒充样品 |
| `content/industries.json` | 四行业；映射必须来自既有产品，待审指南不当认证 |
| `content/insights.json` / `resources.json` | 三采购指南、四需求清单；十二三语 TXT 是需求材料，不是证书 |
| `content/faqs.json` | 八条共享答案映射；复用原答案，不造第二份易漂移内容 |
| `content/company-history.json` / `company-profile.json` | 保留20条历史及原语义；公司数据与授权仍待审核 |
| `content/runtime-config.json` | 仅安全公开端点；不能存任何 secret，字段存在不代表后端已接通 |
| `content/private-review/` | 12类事实/发布审核账本；私有证据 Git忽略、不得公开或进交付包 |

生成文件（如 catalog-data、company-data、content-index、资源/静态指纹清单及 dist）由构建更新，不手工修补。字体 manifest 和原件是固定来源/许可/字节身份输入，常规构建只读校验；变更需要单独采集版本与验收。旧 company/news 字段的兼容价值不代表当前展示源；旧 news.json 不作为当前公众新闻发布依据。

## 5. 编码规范

- 文件与脚本用 kebab-case；变量/函数 camelCase；类 PascalCase；遵循所在文件的缩进/分号，不全库格式化。
- 新 Node 逻辑优先 `.mjs`、具名导出、async/await；浏览器 core 沿用 IIFE + `globalThis.DongDa*` 公共接口，不能擅自改成另一种模块加载方式。
- 优先小型纯函数与不可变 schema；状态留在已有 UI/领域 owner。Node 现有 Store/Error 类继续使用，不加单例工厂/DI框架仅为“统一模式”。
- 复用原路由/本地化/模态框/滚动与提交机制；翻译 hook 只有一个 owner，避免 data-i 与新字段同时写同一节点。
- 表单 draft、busy、retry identity、409冲突、receipt/reset 是业务合同；失败保留草稿，新需求才重置身份。
- 服务端独立 exact-key、类型/枚举、数量/单位、实际流字节上限、语言及ID校验；前端通过不能替代服务端检查。
- 使用既有 RequestError/CmsError/UploadError 与有限错误码；用户可见错误保持可操作且不泄漏内部原文。
- 私有运行日志采用脱敏 JSON event，通过 stdout/stderr输出；不记录客户输入、上游错误正文、令牌或签名URL。现有构建脚本含 console.log，不能宣称全项目已统一 logger；新业务日志不得随意打印对象。
- 现有项目没有 ESLint/Prettier/lint/format 或覆盖率数值门槛。需要采用时独立立项；现在按实际语法检查、域测试、构建审计验收，不写不存在的命令。

## 6. 安全与数据隔离

1. 凭据只放私有环境变量/secret机制；.env、var、SQLite、CMS账号、RAM/ERP服务身份不得硬编码、公开、截图或打包。
2. SQL 使用 prepared statements 和白名单筛选，分页有界。用户文本用 textContent/转义；禁止把任意 HTML/错误原文写入页面。
3. 管理员使用 HttpOnly/SameSite/Secure会话、精确Origin、CSRF与每次权限检查。CORS不等于认证；网站服务身份固定站点/组织/路由，不接受浏览器选择租户或负责人。
4. 原始图稿/附件有私有归属、hash、不可变来源和受限读取；公开ID不是下载授权。未验收的上传/扫描/CDR不得启用，扫描通过也不是技术批准。
5. 迁移先做 SQLite安全私有备份，再增量变更；应用回滚保留现有业务记录和私有权限，不用旧数据库覆盖新询盘。
6. 仅匹配事务提交的 ACK才说明对应保存成功。网关accepted不等于收件箱送达，静态回执不得假装 ERP受理。
7. 发布审核绑定当前来源和授权证据；过期/漂移/撤销/缺失需拒绝，预览和CMS编辑批准不能代替事实或法律审核。

## 7. 测试与质量闭环

核心逻辑变更应增加有意义的成功、边界、异常/权限用例，复用现有 Node 测试，不为简单文档/样式复制实现式测试。

| 改动 | 最小有意义验证 | 完成边界 |
| --- | --- | --- |
| 说明/规则 | 路径、命令、版本与来源核对；备份与链接检查 | 不运行构建或私有矩阵 |
| 纯公开 core | 受影响 node:test，必要的schema/异常用例 | 运行前检查测试导入与副作用 |
| 页面/导航/多语 | 受限静态构建 + 同版HTTP + 真浏览器操作 | zh/en/ru、320/390/768/1200，必要时更宽；检查子元素裁切/触点/历史/焦点/草稿 |
| 内容/资源/字体 | schema、派生清单、完整哈希、静态审计 | 不把存在/下载启动称为已批准或保存完成 |
| 私有询盘/CMS/ERP | 实际HTTP写入/重启读回、权限/失败/冲突/迁移回滚 | 当前延期；模拟fixture不替代私有服务验收 |
| 正式发布 | 内容审查→完整适用质量→内容复核 + 同版云端验收 | 域名/路由/缓存/压缩/SRI/浏览器及接单链路分别验收 |

实际命令来自 package：`npm test`、`build:sites`、`audit:launch`、`preflight:quality`、`preflight:preview`、`preflight:aliyun`。最后一个在完整质量链前后各执行发布审核，不能绕过。`preflight:preview` 只是质量链别名，不表示无私有执行。

**执行前检查副作用**：build:sites 会删除整个 dist；npm test 包含私有/HTTP/SQLite目标。当前Docker/私有目标仍延期，不能直接跑全链。静态工作使用现有受限控制器设计，但每次新建明确归属的候选目录，保留512 MiB构建空间门槛和进程期限，不原样重跑A39固定路径覆盖冻结产物。

A39的342项离线测试/31步骤/165HTTP属于此前证据；完整浏览器矩阵仅部分观察。此次文档核验不重复累计这些次数。

## 8. 自主决策与调优

- 先识别真实问题、当前使用链路和证据缺口，再决定是否改代码。大块业务重构先给简短方案、影响和验收范围，确认后实施；已授权小修、文档整理、只读检查自主完成。
- 优先同版证据与最小检查；用户许可、延期与暂停按具体范围持续有效，不把“整理”变成继续发布或全量开发。
- 性能问题先记录实际指标：布局/网络/耗时/查询数量，再选最小修复。复用RAF/observer、限制DOM更新、避免重复渲染、无界文件读取与N+1查询；没有真实测量不声称P75或国内/国际提速。
- 不为未来可能用到的能力添加第二套状态/路由/CRM；不为“优化”重压原图字体、删除历史或改变业务语义。
- 每轮简短记录：问题→证据→最小修改→适用验证→剩余边界→回滚。维护本项目状态，不擅自写全局用户记忆。
- 自检：生成物是否可追溯；是否泄漏私有数据；权限/错误/幂等是否保留；是否引入多余渲染/查询；证据是否同版；历史结果是否被误当新结果。

## 9. 专项合同索引

完整原规则保存在 [历史规则档案](docs/history/context-before-2026-10-09/workspace-AGENTS.md)。修改相应功能前阅读对应章节，结合后续修订，不能只凭本概要操作。

| 范围 | 原规则章节 |
| --- | --- |
| 产品/实体页/RFQ/行业/样品/定制 | A4–A7、A10–A11 |
| 私有询盘/监控/附件与ERP | A9、A12，及 server/AGENTS.md |
| CMS/历史/指南/公司资料/只读预览 | A8、A31–A32、A35–A36，及 cms/AGENTS.md |
| 搜索/FAQ/选型/公司页/发布审核 | A13–A23 |
| 可访问性/浮层/反馈/状态/动效/重试 | A16、A24–A30 |
| 文件/指纹/SRI/字体/图片查看 | A33–A38 |
| 当前路由恢复与私有云留档 | A39 |

后续不要再向 AGENTS 追加整段验收流水。稳定规则留在就近AGENTS/CODEX；版本现状写PROJECT_STATUS；详细运行证据留在outputs，各自保持可读且有来源。
