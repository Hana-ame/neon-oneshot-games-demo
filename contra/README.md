# 网页魂斗罗 (Contra Web Edition)

基于原生 HTML5 Canvas 2D、ES Modules 与 Web Audio API 构建的经典横版卷轴动作射击游戏完整项目，零外部运行时依赖，内置模块化源码、双关卡与 Boss 战、5 种经典武器、科乐美 30 命秘籍、单文件打包脚本与 18 项无头自动化测试。

## 快速开始

### 1. 直接试玩（零配置）
直接用现代浏览器双击打开 `dist/contra-standalone.html` 即可开始游戏。

### 2. 本地模块化开发运行
在项目根目录启动任意静态服务器：
```bash
python3 -m http.server 8080
```
随后在浏览器访问 `http://localhost:8080/index.html`。

### 3. 运行自动化测试（需 Node.js 18+）
```bash
npm test
```

### 4. 重新构建单文件独立版
```bash
npm run build
```
构建产物将输出至 `dist/contra-standalone.html`。

## 操作说明

| 操作 | 键盘按键 | 触控/屏幕按钮 |
| :--- | :--- | :--- |
| 移动与 8 方向瞄准 | `W A S D` 或 方向键 `↑ ↓ ← →` | 左侧十字方向键 |
| 射击（支持连发） | `J` 或 `Z` | 右侧红色「射击」键 |
| 跳跃 | `K` 或 `X` | 右侧蓝色「跳跃」键 |
| 匍匐 | 地面按住 `S` 或 `↓` | 方向键「▼」 |
| 下穿单向平台 | `S + K` 或 `↓ + X` | 同时按「▼」与「跳跃」 |
| 暂停 / 继续 | `P` 或 `Esc` | 顶部「暂停」按钮 |
| 静音切换 | `M` | 顶部「音效」按钮 |
| 30 命科乐美秘籍 | 标题界面依次输入 `↑↑↓↓←→←→BA` | 顶部「30命秘籍」按钮 |

## 项目目录结构

- `index.html`：模块化开发入口页面
- `css/style.css`：复古街机风格与响应式触控布局样式
- `src/`：核心游戏模块化源码（`constants.js`、`audio.js`、`input.js`、`level.js`、`entities.js`、`engine.js`、`renderer.js`、`main.js`）
- `scripts/build.mjs`：零依赖单文件构建工具
- `dist/contra-standalone.html`：单文件独立可玩版本
- `tests/`：Node.js 无头自动化测试套件（`engine.test.mjs`、`weapons.test.mjs`、`gameplay.test.mjs`、`run-all.mjs`）
- `docs/TECHNICAL_REPORT.md`：完整工程技术报告
