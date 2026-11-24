# NEON PAC-ARCADE · 经典街机《吃豆人》网页复刻项目

基于 HTML5 Canvas 2D、Web Audio API 与确定性纯逻辑引擎构建的经典街机《吃豆人》完整网页复刻项目，包含模块化源码、单文件零依赖构建版、自动化测试套件与工程技术报告。

## 快速开始

### 方式一：直接双击运行（推荐）
直接用现代浏览器打开项目根目录下的 `standalone.html`，无需任何本地服务器或依赖安装。

### 方式二：以模块化方式本地运行
在项目根目录启动任意静态服务器（以 Python 为例）：

```bash
python3 -m http.server 8080
```

随后在浏览器访问 `http://localhost:8080/index.html`。

## 操作说明

| 输入方式 | 操作按键 / 手势 | 功能 |
| :--- | :--- | :--- |
| 键盘 | `↑` `↓` `←` `→` 或 `W` `A` `S` `D` | 控制吃豆人移动（支持预输入转弯缓冲） |
| 键盘 | `Enter` / `Space` | 投币开始 / 重新开始 |
| 键盘 | `P` | 暂停 / 继续 |
| 键盘 | `M` | 静音 / 开启合成音效 |
| 键盘 | `R` | 快速重开一局 |
| 触屏 / 鼠标 | 虚拟十字键或画布滑动 | 移动端与平板方向控制 |

## 运行自动化测试

需要 Node.js 18+（使用内置 `node:test` 与 `node:assert/strict`，零第三方依赖）：

```bash
npm test
```

或运行汇总脚本：

```bash
npm run test:report
```

## 项目目录结构

```text
arcade-pacman-web/
├── index.html               # 模块化网页入口
├── standalone.html          # 单文件零依赖可运行版
├── package.json             # 项目配置与测试脚本
├── README.md                # 使用与开发说明
├── styles/
│   └── arcade.css           # 复古霓虹街机机台样式与响应式布局
├── src/
│   ├── constants.js         # 网格尺寸、方向向量、计分规则与关卡曲线
│   ├── maze.js              # 28×31 迷宫地图、墙体/闸门碰撞与隧道回绕
│   ├── ghostAI.js           # 四幽灵个性化寻路目标与有限状态机调度
│   ├── gameEngine.js        # 确定性固定步长核心引擎（无 DOM 依赖）
│   ├── audio.js             # Web Audio API 复古音效合成器
│   ├── renderer.js          # Canvas 2D 霓虹渲染、粒子系统与状态覆盖层
│   └── main.js              # 浏览器主循环、输入监听与本地高分存储
├── tests/
│   ├── maze.test.js         # 迷宫与网格碰撞单元测试
│   ├── ghostAI.test.js      # 四幽灵 AI 与寻路单元测试
│   ├── gameEngine.test.js   # 核心引擎状态机与玩法集成测试
│   └── run-tests.mjs        # 测试执行脚本
└── docs/
    └── TECHNICAL_REPORT.md  # 完整工程技术报告
```
