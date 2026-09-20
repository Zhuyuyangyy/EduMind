# 第三方组件与素材说明

本项目原创代码之外使用的主要开源组件，以 `package-lock.json` 锁定版本及各组件随附许可证为准。

## 软件组件

| 组件 | 用途 | 许可证/来源 |
| --- | --- | --- |
| Vue、Vue Router、Pinia | 前端框架与状态管理 | MIT，各 npm 包仓库许可证 |
| Vite、TypeScript、Tailwind CSS | 构建、类型检查和样式 | MIT，各 npm 包仓库许可证 |
| Three.js、PixiJS | 3D 与 2D 渲染 | MIT，各项目仓库许可证 |
| ECharts | 数据可视化 | Apache-2.0，Apache ECharts 项目 |
| GSAP | 页面动画 | GSAP Standard License，https://gsap.com/standard-license |
| mysql2、dotenv | 数据库连接与环境配置 | MIT，各 npm 包仓库许可证 |
| Playwright | 自动化验证 | Apache-2.0，Microsoft Playwright 项目 |

完整依赖列表、版本和上游地址见 `package-lock.json`。本项目未将第三方组件声明为团队原创成果。

## 模型与视觉素材

- `public/agenthub/assets/car/`：Cesium Milk Truck，来源为 Khronos glTF Sample Models，CC BY 4.0；目录内保留原 `LICENSE.md`。
- `public/desktop-pet/live2d/live2dcubismcore.min.js`：Live2D Cubism Core，保留原文件许可声明。其使用与再分发须遵守 Live2D 官方许可条款。
- Live2D 示例角色、GLB 模型、HDRI、纹理和插图仅用于项目演示。团队应在提交前逐项确认原始来源和竞赛分发授权；来源无法确认的素材不得对外宣称为团队原创，也不应进入商业化版本。
- DeepSeek 模型通过 OpenAI-compatible API 调用，模型服务受服务商协议约束；提交包不包含模型权重和真实 API 密钥。

## 使用边界

本清单用于披露已识别的第三方依赖，不替代各权利人的许可证。若素材目录中的单独许可证与本说明不一致，以素材随附许可证及权利人最新条款为准。
