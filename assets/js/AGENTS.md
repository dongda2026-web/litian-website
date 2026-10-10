# 公开浏览器模块规则

- 遵守源码根AGENTS/CODEX；修改前阅读历史规则的对应A阶段合同。
- core保存纯校验/派生/渲染，UI复用既有DOM与业务owner。沿用IIFE + globalThis.DongDa*，不加入第二套路由/状态/询盘引擎。
- 以canonical JSON及其生成seed为来源；不要手改catalog-data.js/company-data.js，不复制产品/FAQ答案数组。
- 新界面复制zh/en/ru，保持既有其他语言的明确英文回退；同节点只有一个翻译owner。
- 不存客户联系方式/设计文本/凭据；保留既有非个人选型、固定重试身份和回执的约束。仅新意图重置请求身份。
- 用textContent/转义、既有native dialog/焦点/滚动、有限错误码；不要用overflow隐藏裁切代替修复布局。
- UI验收覆盖实际点击/键盘/返回刷新/语言/草稿及320/390/768/1200宽度；模拟DOM不当实机或持久化证明。
- 保留图片原件、mediaRole、字体许可/SHA和Panzoom本地原发行；公共库不得读取server/cms/var。
