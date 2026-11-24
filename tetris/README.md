# 网页俄罗斯方块（Web Tetris）完整项目

基于原生 HTML5 Canvas、ES Modules 与 Web Audio API 构建的零依赖现代网页俄罗斯方块项目，包含核心逻辑引擎、高清渲染层、合成音效、自动化测试套件与技术报告。

## 目录结构

```text
web_tetris_project/
├── index.html                   # 模块化入口页面（需通过本地 HTTP 服务打开）
├── dist/
│   └── tetris_web.html          # 自包含单文件版本（支持双击直接用浏览器打开）
├── src/
│   ├── constants.js             # 棋盘参数、7种方块矩阵、SRS踢墙表、计分与重力曲线
│   ├── engine.js                # 纯逻辑引擎（与DOM解耦，含7-Bag、SRS、T-Spin、锁延迟）
│   ├── audio.js                 # Web Audio API 零依赖合成音效模块
│   ├── renderer.js              # Canvas 2D HiDPI 渲染器（立体斜角、幽灵投影、消行闪光）
│   ├── main.js                  # 主循环调度、键盘 DAS/ARR、触控按钮与本地最高分
│   └── styles.css               # 响应式暗色街机界面样式
├── tests/
│   ├── engine.test.mjs          # 核心引擎单元测试（10 项核心机制与边界场景）
│   └── integration.test.mjs     # 集成与压力测试（40行升级链路、500步随机压测、构建校验）
├── docs/
│   ├── TECHNICAL_REPORT.md      # 项目技术报告（Markdown 版）
│   └── tetris_technical_report.pdf # 项目技术报告（正式排版 PDF 版）
├── package.json                 # 项目配置与测试脚本
└── README.md                    # 项目说明文档
```

## 快速运行

### 1. 直接打开（零配置）
双击 `dist/tetris_web.html`，即可在任意现代浏览器中离线游玩，无需安装依赖或启动服务器。

### 2. 模块化本地开发
在项目根目录启动任意静态服务器（例如 Python 内置服务）：
```bash
python3 -m http.server 8080
```
随后浏览器访问 `http://localhost:8080/index.html`。

### 3. 运行自动化测试
需要 Node.js 18 及以上版本（使用内置 `node:test`，无需 `npm install`）：
```bash
npm test
```

## 键盘与触控操作

| 操作 | 快捷键 | 屏幕按钮 |
| :--- | :--- | :--- |
| 左移 / 右移 | `←` / `→` 或 `A` / `D` | `← 左移` / `右移 →` |
| 顺时针旋转 | `↑` / `X` / `W` | `顺旋 ↻` |
| 逆时针旋转 | `Z` / `Ctrl` | `↺ 逆旋` |
| 软降（+1分/格） | `↓` 或 `S` | `↓ 软降` |
| 硬降到底（+2分/格） | `Space` | `▼ 硬降到底` |
| 暂存交换 HOLD | `C` / `Shift` | `暂存 (C)` |
| 暂停 / 恢复 | `P` / `Esc` | 顶栏 `暂停` |
| 重新开始 | `R` | 顶栏 `重开` |
| 静音切换 | `M` | 顶栏 `音效` |
