# 坎巴拉太空计划（网页版）— Kerbal Space Program Web

基于 HTML5 Canvas、四阶龙格-库塔（RK4）轨道物理引擎与 Web Audio API 打造的零依赖网页版《坎巴拉太空计划》火箭装配与 2D 轨道飞行模拟器。

## 快速开始

- **直接游玩**：用任意现代浏览器打开根目录的 `index.html` 即可开始装配与发射（零外部依赖，支持离线运行）。
- **运行自动化测试**（需 Node.js 18+）：
  ```bash
  npm test
  ```
- **重新构建单文件包**：
  ```bash
  npm run build
  ```

## 操作指南

| 按键 / 控件 | 功能说明 |
| :--- | :--- |
| `SPACE` | 分级 / 主发动机点火 / 级间分离 |
| `A` / `D` 或 `←` / `→` | 火箭向左 / 向右偏航（姿态俯仰控制） |
| `W` / `S` 或 `Shift` / `Ctrl` | 连续增加 / 减小发动机油门 |
| `Z` / `X` | 油门一键满推（100%）/ 一键关车（0%） |
| `T` | 开启 / 关闭 SAS 姿态稳定系统（支持稳定 / 顺行 / 逆行） |
| `M` | 切换飞行视角与星图轨道视角（Map View） |
| `P` | 在 25 km 以下大气层展开 Mk16 降落伞 |
| `.` / `,` | 调整时间加速倍率（1x ～ 1000x） |
| 鼠标滚轮 / `＋` `－` | 缩放飞行或星图镜头 |

## 项目结构

```text
kerbal-space-program-web/
├── index.html                 # 独立可运行的单文件网页应用
├── package.json               # 项目配置与测试/构建脚本
├── README.md                  # 项目说明与操作指南
├── src/
│   ├── constants.js           # Kerbin / Mun 物理常数、部件目录与预设火箭
│   ├── physics.js             # 2D 轨道力学、大气阻力、开普勒根数与 RK4 积分器
│   ├── builder.js             # VAB 火箭装配分析、齐奥尔科夫斯基 Δv 与分级仿真
│   ├── audio.js               # Web Audio API 程序化火箭音效合成引擎
│   ├── renderer.js            # 高分屏 Canvas 渲染器（VAB、飞行视角、星图、导航球）
│   ├── app.js                 # 主应用控制器、键鼠/触控交互与重力转弯辅助
│   └── template.html          # 响应式航天座舱 UI 模板
├── tests/
│   ├── physics.test.js        # 物理与轨道力学单元测试（8 项）
│   ├── builder.test.js        # 装配与工程报告单元测试（6 项）
│   └── simulation.test.js     # 全流程升空/入轨/着陆集成测试（3 项）
├── docs/
│   └── TECHNICAL_REPORT.md    # 完整中文技术报告
└── scripts/
    └── build-bundle.js        # 单文件 HTML 构建脚本
```
