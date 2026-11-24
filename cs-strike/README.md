# CS: Web Strike (Dust2 Tactical FPS)

基于纯原生 JavaScript (ES Modules) + HTML5 Canvas + Web Audio API 开发的网页版《反恐精英》(Counter-Strike) 复刻项目，零第三方运行时依赖，支持离线单文件运行与完整模块化工程测试。

## 核心特性
- **自研 3D 光线投射引擎 (`src/engine/renderer.js`)**：DDA 射线检测、64×64 程序化材质纹理（沙石砖墙、木箱、铁门、A/B 包点喷漆、暗道砖墙）、Z-Buffer 深度遮挡精灵渲染、第一人称武器视图模型、AWP 狙击开镜、动态扩散准星与实时战术雷达。
- **完整 CS 枪械与弹道系统 (`src/engine/weapons.js`)**：支持 Tactical Knife、USP-S、Glock-18、Desert Eagle、MP5-SD、AK-47、M4A1-S、AWP，包含射速 (RPM)、弹匣/备弹、换弹计时、移动/下蹲/后坐力散布、距离衰减与头/身/腿分区护甲穿透伤害。
- **经典 CS 经济与回合机制 (`src/engine/economy.js`, `src/engine/bomb.js`, `src/engine/game_state.js`)**：4v4 战术对战（MR8 五胜制）、$800 起始资金、分武器击杀赏金、连败补偿递增、购买阶段与出生点购买区校验、C4 安装（3.2s）/ 40s 倒计时蜂鸣引爆 / 拆弹器（5s vs 10s）。
- **Bot 战术 AI (`src/engine/bot_ai.js`)**：24×24 网格 BFS 寻路、视线遮挡 (LOS) 索敌、三档难度（Easy / Normal / Hard）、对枪横移走位与自动下包/拆包目标协同。
- **程序化 Web Audio 音效 (`src/engine/audio.js`)**：无需外部音频文件，实时合成各枪械枪声、爆头/命中反馈、脚步声、C4 加速蜂鸣与爆炸声，支持一键静音。

## 目录结构
```text
cs-web-strike/
├── index.html                  # 模块化网页入口（需本地静态服务器访问）
├── dist/cs_web_strike.html     # 零依赖单文件离线可玩版本（双击浏览器即可打开）
├── package.json                # 项目配置与测试/构建脚本
├── README.md                   # 项目说明文档
├── docs/TECHNICAL_REPORT.md    # 详细技术架构、算法与测试报告
├── scripts/build_single_file.py# 单文件 HTML 打包构建脚本
├── src/
│   ├── main.js                 # 游戏主循环、键鼠/Pointer Lock/触控输入与 HUD 绑定
│   ├── styles.css              # 响应式战术 HUD、购买菜单与计分板样式
│   └── engine/                 # 纯逻辑引擎模块（可被 Node.js 直接导入测试）
│       ├── constants.js        # 武器参数、经济常数与 Dust2 24×24 地图数据
│       ├── map.js              # 地图碰撞、轴向滑墙、DDA 射线、LOS 与 BFS 寻路
│       ├── weapons.js          # 散布、护甲穿透伤害公式与 Hitscan 命中判定
│       ├── entities.js         # 玩家与 Bot 实体、移动物理与状态计时器
│       ├── bomb.js             # C4 安装/倒计时/拆除状态机
│       ├── economy.js          # 经济账户、购买校验与 Bot 自动配装
│       ├── bot_ai.js           # Bot 状态决策、寻路与对枪逻辑
│       ├── game_state.js       # 回合与对局总控状态机
│       ├── audio.js            # Web Audio API 程序化音效合成器
│       └── renderer.js         # Canvas 2D 3D 光线投射与战术雷达渲染器
└── tests/                      # Node.js 原生自动化测试套件（21 个用例）
    ├── map_collision.test.js
    ├── weapons_ballistics.test.js
    ├── economy.test.js
    ├── bomb_state.test.js
    └── bot_ai_and_match.test.js
```

## 快速运行与测试
1. **直接试玩（推荐）**：在浏览器中直接打开 `dist/cs_web_strike.html`。
2. **本地开发服务器运行模块化版本**：
   ```bash
   python3 -m http.server 8080
   # 浏览器访问 http://localhost:8080
   ```
3. **运行自动化测试（Node.js >= 18）**：
   ```bash
   npm test
   # 或 node --test tests/*.test.js
   ```
4. **重新构建单文件发布包**：
   ```bash
   npm run build
   ```
