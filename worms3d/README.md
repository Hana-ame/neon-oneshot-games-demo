# 百战天虫 3D 网页复刻版（Worms 3D Web）

基于 **Three.js (r128)**、原生 ES Modules 与 **Web Audio API** 构建的《百战天虫 3D》网页复刻完整工程，包含 3D 可破坏高度场地形、6 种经典武器、风力弹道物理、智能 AI 对手、突然死亡海平面上升、空投补给箱、程序化音效以及零外部依赖的自动化测试套件。

## 快速开始

### 方式一：双击即玩（无需本地服务器）
直接用现代浏览器打开根目录下的 `play-standalone.html` 即可开始游戏。

### 方式二：本地静态服务器运行模块化源码
```bash
python3 -m http.server 8080
# 然后在浏览器访问 http://localhost:8080/index.html
```

### 运行自动化测试
需要 Node.js 18+（无需 `npm install`）：
```bash
npm test
# 或
node tests/run_all.mjs
```

## 目录结构

```text
worms3d-web/
├── index.html                  # 模块化入口页面（需静态服务器）
├── play-standalone.html        # 单文件打包版（双击直接游玩）
├── package.json                # 项目配置与测试脚本
├── README.md                   # 项目说明
├── docs/
│   └── TECHNICAL_REPORT.md     # 完整技术架构与测试报告
├── src/
│   ├── core/
│   │   ├── constants.js        # 世界参数、地图主题、武器目录
│   │   ├── terrain.js          # 3D 可破坏高度场地形与实时弹坑挖掘
│   │   ├── physics.js          # 弹道抛物线、风力偏移、反弹、爆炸击退与摔落伤害
│   │   ├── gameEngine.js       # 回合制状态机、空投补给、突然死亡与胜负判定
│   │   └── ai.js               # 智能 AI 目标评估与风力补偿弹道求解
│   ├── audio/
│   │   └── soundEngine.js      # Web Audio API 程序化音效合成器
│   ├── render/
│   │   └── renderer3d.js       # Three.js 3D 场景、卡通虫子、粒子与三视角相机
│   ├── ui/
│   │   └── hud.js              # HUD、3D 投影血条、武器栏、战报与弹窗
│   └── main.js                 # 浏览器入口与键鼠/触控调度
└── tests/
    ├── terrain.test.js         # 地形生成、插值、法线与弹坑破坏测试
    ├── physics.test.js         # 弹道、风力、反弹、爆炸伤害与击退测试
    ├── gameEngine.test.js      # 回合流转、武器弹药、补给、落水与胜负测试
    ├── ai.test.js              # AI 决策与风力补偿精度测试
    └── run_all.mjs             # 统一测试运行器
```

## 操作说明

- **移动 / 转向**：`W/S` 或 `↑/↓` 前进后退，`A/D` 或 `←/→` 旋转方向
- **精确瞄准**：鼠标在画布上拖拽，或按 `R/F` 调整仰角
- **跳跃**：`J` 或 `Enter`
- **蓄力开火**：按住 `Space`（或点击右下角按钮）蓄力，松开发射
- **切换武器**：数字键 `1 ~ 6` 或点击底部武器栏
- **切换视角**：`C` 键在“第三人称追尾视角”与“战术上帝视角”间切换
- **静音开关**：`M` 键
