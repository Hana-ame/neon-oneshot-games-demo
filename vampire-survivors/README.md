# Crimson Night — 网页版《吸血鬼幸存者》

基于原生 HTML5 Canvas 2D、ES Modules 与 Web Audio API 构建的《吸血鬼幸存者》（Vampire Survivors）风格肉鸽弹幕生存网页游戏。项目采用**无头核心引擎 + 渲染视图分离**架构，零外部运行时依赖，内置完整的自动化测试套件与单文件构建流水线。

## 快速开始

### 1. 直接游玩（推荐）
直接用现代浏览器打开 `dist/vampire-survivors.html` 即可开始游戏，无需启动任何后端服务。

### 2. 本地开发运行
在项目根目录启动任意静态服务器（例如 `python3 -m http.server 8080`），然后访问 `http://localhost:8080/index.html`。

### 3. 运行自动化测试
```bash
npm test
# 或
node tests/run-tests.mjs
```

### 4. 重新构建单文件发行版
```bash
npm run build
# 输出至 dist/vampire-survivors.html
```

## 操作说明
- **移动**：`W A S D` 或 `方向键`（触屏/鼠标拖拽自动激活虚拟摇杆）
- **自动攻击**：所有武器按冷却自动索敌或按朝向释放
- **暂停 / 查看构建**：`ESC` 或 `P` 键，或点击右上角暂停按钮
- **升级三选一**：`1 / 2 / 3` 快捷键或鼠标点击卡片

## 目录结构
- `src/config.js`：角色、武器、超武进化配方、被动道具、敌人与波次配置表
- `src/math.js`：二维向量、碰撞检测与空间哈希网格（Spatial Hash Grid）
- `src/engine.js`：纯逻辑无头游戏引擎（独立于 DOM，支持 Node.js 测试与压测）
- `src/renderer.js`：Canvas 2D 程序化暗黑哥特风格渲染器与粒子特效系统
- `src/audio.js`：Web Audio API 实时波形合成音效引擎
- `src/main.js`：浏览器交互桥接层（键盘/触摸摇杆、HUD 更新、本地最高分存储）
- `tests/`：单元测试、集成测试与性能基准测试套件
- `scripts/build-singlefile.mjs`：单文件内联构建脚本
- `docs/TECHNICAL_REPORT.md`：完整架构与测试技术报告
