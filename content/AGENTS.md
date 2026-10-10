# 内容规则

- 先读README和源码CODEX，修改规范JSON而非派生seed/index/产物。
- 保持ID/别名/媒体角色/产品映射/原历史及多语语义；严格exact-key与领域schema，不自动批准事实。
- zh/en/ru必填；已有其他语言按既有回退。日期/版次/公司数字/认证/案例授权不得推断或伪造。
- 12类private-review状态仍待审。CMS可编辑或已有published字段不等于发布授权；来源漂移需重审。
- private-review/evidence为私有材料，不能公开、日志输出或打包；公共JSON和README不得含凭据或客户资料。
- runtime-config只允许安全公开端点；配置/上线要按完整受控发布流程，不能编辑OSS单文件绕过审核。
- build会复制本目录的公众部分，新增文件前检查公开边界；本目录AGENTS只写可公开工程规则，不放内部账号/路径/证据。
