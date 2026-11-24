# RimWeb · 边缘世界网页版 (Web RimWorld)

一款基于原生 HTML5 Canvas、ES Modules 与无头模拟引擎架构构建的网页版殖民地模拟游戏，支持确定性地图生成、A* 寻路、殖民者需求与有限状态机 AI、电力与炮塔防线、科技树、AI 叙事者事件以及完整 JSON 存档。

## 快速开始

### 1. 直接游玩（零依赖）
直接用任意现代浏览器打开 `dist/web-rimworld.html` 即可开始游玩，无需安装任何依赖或启动后端服务。

### 2. 开发模式与自动化测试
需要 Node.js 18+：

```bash
# 运行全部单元测试与集成测试
npm test

# 重新打包单文件可运行版本 (dist/web-rimworld.html)
npm run build
```

若以模块化源码方式调试，可在项目根目录启动任意静态服务器（如 `python3 -m http.server 8080`）并访问 `index.html`。

## 目录结构

```text
web-rimworld/
├── index.html              # 模块化入口页面
├── styles.css              # 暗色科幻 HUD 响应式样式
├── package.json            # 项目脚本配置 (test / build)
├── README.md               # 使用说明
├── TECHNICAL_REPORT.md     # 完整技术架构与测试评估报告
├── dist/
│   └── web-rimworld.html   # 单文件自包含可运行构建产物
├── scripts/
│   └── bundle.mjs          # 零依赖 ES Module 打包脚本
├── src/
│   ├── constants.js        # 地形、建筑、资源、特质、科技树与平衡常数
│   ├── mapGen.js           # Mulberry32 确定性 PRNG 与二维值噪声地形生成器
│   ├── pathfinding.js      # 二叉最小堆 A* 寻路（含地形代价与防对角穿墙）
│   ├── colonists.js        # 殖民者/掠夺者实体工厂、需求衰减、想法与心情系统
│   ├── ai.js               # 优先级工作调度器、有限状态机与战斗 AI
│   ├── simulation.js       # 无头模拟引擎（昼夜、天气、电力、炮塔、作物、叙事者、存档）
│   ├── audio.js            # Web Audio API 程序化音效合成器
│   ├── renderer.js         # HTML5 Canvas 2D 视口裁剪渲染器与昼夜光照层
│   └── main.js             # UI 控制器、输入交互、弹窗面板与主循环
└── tests/
    ├── mapGen.test.js      # 地图生成与确定性测试
    ├── pathfinding.test.js # A* 寻路与障碍绕行测试
    ├── ai_and_jobs.test.js # 殖民者需求、砍伐、建造、征召移动测试
    └── simulation.test.js  # 昼夜循环、电力炮塔防御、作物生长与存档序列化测试
```

## 操作指南

- **视角平移与缩放**：`WASD` / 方向键 或 鼠标右键拖拽平移，滚轮缩放。
- **采集与区域**：点击底部「指令」或「区域」，在地图上拖拽框选目标区域。
- **建造与科技**：点击「建造」放置蓝图；建造研究台并在「科技树」中切换研究项目。
- **战斗征召**：选中殖民者后按 `R` 键征召，右键地图任意可行走地块进行战术移动。
- **时间控制**：`Space` 暂停/继续，`1` / `2` / `3` 切换倍速，`Esc` 返回选择模式。
