# 正式支付宝测试前调查与准备（2026-10-26）

本轮仅做正式测试前准备、依赖修复和可重复的容器验收。不切换线上服务、不更改 main 或 feat/mobile-v1、不签约、不启用商品或发起真实资金交易。正式账号状态和部署资料仍待用户提供，不能用沙箱资料替代。

## 现有公网部署的实际观察

对仓库记录的 https://yx.shushubiye.fun 执行无登录探测，HTTPS 请求成功：

| 路径 | HTTP 结果 | 证据边界 |
| --- | --- | --- |
| /api/health | 200，version=2.0.0 | 与当前开发分支的部署契约不一致 |
| /api/auth/session | 404 | 当前会话恢复接口未部署 |
| /api/payments/products | 404 | 支付后端未部署 |
| /api/chat/history | 200，application/json | 未认证请求返回 200，需进一步核验；本轮立即取消响应体，没有读取或保存用户聊天内容 |

因此，当前旧站不能直接用于验证本 PR 的正式支付。先完成受控部署及认证边界检查，再测试公网通知；不能以本地 CI 通过推断线上已经更新。上述观察只代表本次请求，不能据此宣称站点已安全或已完成数据隔离。

## 独立修复

1. 更新兼容范围内的锁文件，包括 urllib 4.9.0 → 4.9.1、Vite 6.4.2 → 6.4.5、brace-expansion、fflate、browserslist 等修复版本。
2. 更正此前判断：urllib 的 latest 标签仍为 4.9.0，但修复版本 4.9.1 已存在于 latest-4 标签。只检查 latest 并据此说没有可用修复版本不准确。
3. 增加真实 HTTP 重定向行为回归，使用官方支付宝 SDK 解析到的 urllib：跨来源不转发 Authorization / Cookie / Proxy-Authorization，同来源保留，且不修改调用者参数。没有声称所有自定义敏感头都会自动清除。
4. Dockerfile 在 npm ci 前复制 postinstall 脚本，在 Web 构建前复制构建脚本，修复干净容器中找不到脚本的确定性缺口。
5. Compose 将支付开关、价格、应用/卖家配置、HTTPS 基地址和 CORS 传入 API；生产固定使用环境配置和正式网关，默认保持停售，真实密钥由运维在服务端本地注入。
6. Docker 构建上下文排除 .alipay-sandbox.json、outputs、运行时账号/会话/支付记录、备份和旧构建；移除全局 *.png 排除，保留业务图片与纹理。
7. 补齐部署文档所引用但缺失的 deploy/.env.production.example；模板没有任何真实密钥，默认回环绑定端口并关闭收款。兼容原有 LAN 模式，只有显式配置才对外暴露所需端口。
8. 增加 Production container smoke CI：实际构建 Nginx/API 镜像、启动隔离 MySQL，通过 Nginx 验证图片交付、生产账号/角色、拒绝演示账号、拒绝未认证访问、关闭 mock 与停售。仅使用随机测试账号及无效模型 Key，不调用模型或支付宝。

## 依赖风险的当前边界

- 官方 npm registry 的全依赖 audit：0 high / 0 critical / 3 moderate。
- npm audit --omit=dev：0 项已知告警。这个结论仅覆盖当前锁文件的 npm 公告，不涵盖容器镜像、操作系统或完整安全审查。
- 剩余三个依赖告警来自 Tailwind 3 / postcss-nested / postcss-selector-parser 的同一构建链。当前仅从仓库可信源码构建 CSS，服务端没有引入这个解析器。官方公告说明普通可信源码构建不在受影响的请求路径场景内；仍保留告警，并不将其描述为已修复。
- 本轮不强制升级 Tailwind 4 或将解析器跨主版本覆盖到 7，避免未经验证的框架/解析语义变化。后续如支持用户上传或解析 CSS，须重新评估输入边界及升级方案。

依据：[urllib 公告及修复版本](https://github.com/advisories/GHSA-hq3h-g68c-hp78)，[CSS 解析公告与适用范围](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)。

## 本地验证及环境限制

- npm test：236 项，177 通过、59 个数据库门控明确跳过、0 失败。
- 隔离真实 MySQL 全量：236/236 通过，0 跳过、0 失败；新增传输回归也实际执行。
- Web 构建通过；支付 Chromium 4/4、评估页 Chromium 9/9。
- Mobile Web 首次遇到 Windows 旧 dist-mobile 重命名 EPERM；未修改构建脚本，使用仓库临时目录重试同一 npm run build:mobile 后通过。
- 依赖升级后的官方沙箱查询再次验签成功，已退款订单仍为 TRADE_CLOSED，金额 ¥0.01；没有新付款。
- docker compose config --quiet 使用本地无效占位测试值校验，不输出解析后的密钥环境。
- 本机 Docker Linux Engine 未运行，未在 Windows 本机宣称容器启动或镜像构建已通过；实际容器验收交由新增 Linux CI，结果以当前 PR Checks 为准。
- 原生 Android APK、镜像漏洞扫描、生产 MySQL 升级和备份恢复均未执行。

## 正式测试还缺什么

| 待核实项目 | 下一步 |
| --- | --- |
| 正式支付宝账号、应用审核和产品开通状态 | 在用户授权的官方控制台或 Skill 授权流程读取真实状态；不把支持个人收款理解为账号已获准入 |
| 确认正式测试域名、服务器、部署方式 | 用户提供已有部署配置位置或已授权会话；不要发送密码、生产私钥或 Key 正文 |
| 已审代码部署及 HTTPS 代理 | 保持 main 不变，先准备可审查的发布版本与回滚方案，再由用户确认具体部署；检查会话/支付接口确实来自新版本 |
| 真实 MySQL 与账号隔离 | 在部署环境实测，不能直接复用隔离数据库的通过结果 |
| 公网 notify_url 与查询补偿 | 用正式应用的匹配配置联调验签、订单/金额/卖家核对、幂等和 success；回跳页不作成功依据 |
| 商品交付、权益执行与退款政策 | 当前接口只记录权益，不代表 AI 服务已限制用量或按商品完成交付；条件满足前保持停售 |
| 一笔小额真实交易 | 明确卖家、商品、金额和退款计划后，由用户确认并操作真实支付授权，再核对支付/退款和权益结果 |

官方路径仍为 AI 网页应用收款（基础收款能力），保留自建订单与权益；没有改成原生 App 支付或智能收款套件。当前准入结果、材料和费率以实际账号的官方页面为准：[官方产品指南](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.html)。
