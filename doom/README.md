# DOOM-JS: Phobos Sector (网页 DOOM 完整项目)

基于原生 HTML5 Canvas、ES Modules 与 Web Audio API 构建的零依赖 2.5D 射线投射（Raycasting）第一人称射击游戏完整项目。包含模块化引擎源码、3 个渐进式关卡、4 种武器、4 类敌人 AI、程序化 64×64 像素纹理与复古音效合成器、18 项 Node.js 自动化测试，以及单文件打包构建脚本。

## 项目目录结构

```text
web-doom/
├── index.html                  # 模块化本地开发入口
├── package.json                # Node.js 脚本与元数据
├── README.md                   # 项目说明与运行指南
├── dist/
│   └── web-doom.html           # 零依赖单文件离线可玩版（build 脚本生成）
├── scripts/
│   └── build.mjs               # 单文件 HTML 打包器
├── src/
│   ├── constants.js            # 引擎分辨率、瓦片、武器、敌人与道具数值表
│   ├── math.js                 # 角度归一化、DDA 射线投射与视线检测（LOS）
│   ├── levels.js               # E1M1 / E1M2 / E1M3 三关 ASCII 地图与实体配置
│   ├── entities.js             # 敌人、道具、投射物与滑门工厂
│   ├── engine.js               # 纯无头核心仿真引擎（可脱离 DOM 运行与测试）
│   ├── textures.js             # 64x64 墙面/门/精灵程序化像素纹理生成器
│   ├── audio.js                # Web Audio API 复古音效合成器
│   ├── renderer.js             # 2.5D 射线渲染器、1D Z-Buffer 精灵与经典 HUD
│   └── main.js                 # 浏览器主循环、键鼠/触屏输入与界面状态管理
├── tests/
│   ├── math.test.mjs           # 数学工具与视线检测单元测试
│   ├── levels.test.mjs         # 地图边界、实体出生点与 BFS 出口连通性测试
│   ├── raycaster.test.mjs      # DDA 距离精度、滑门穿透与鱼眼校正测试
│   ├── engine.test.mjs         # 移动碰撞、射击击杀、护甲结算、钥匙门与通关测试
│   └── build.test.mjs          # 单文件构建产物完整性验证测试
└── docs/
    └── TECHNICAL_REPORT.md     # 详细技术报告（架构、算法、测试与性能）
```

## 快速开始

### 1. 直接试玩（零配置）
直接用任意现代浏览器打开 `dist/web-doom.html` 即可游玩，无需本地服务器或联网。

### 2. 运行自动化测试（需 Node.js >= 18）
```bash
npm test
# 或
node --test tests/*.test.mjs
```

### 3. 重新构建单文件版本
```bash
npm run build
# 输出至 dist/web-doom.html
```

## 操作说明

| 按键 / 控件 | 功能 |
| :--- | :--- |
| `W / A / S / D` 或方向键 `↑ / ↓` | 前进、后退、左右平移 |
| 鼠标（点击锁定或按住拖拽）或 `← / →` | 视角转向 |
| 鼠标左键 / `Space` / 屏幕 `FIRE` | 开火 |
| `E` / 屏幕 `USE` | 开启滑门 / 激活出口开关 |
| `1 - 4` / 鼠标滚轮 / 屏幕 `WPN` | 切换武器（拳套 / 手枪 / 霰弹枪 / 等离子步枪） |
| `Shift` | 冲刺 |
| `M` 或 `Tab` | 开关探索小地图（Automap） |
| `P` 或 `Esc` | 暂停 / 恢复 |
| `V` | 静音切换 |
