# Royal Hold'em — 网页德州扑克完整项目

一个零外部依赖、模块化设计的无限注德州扑克（No-Limit Texas Hold'em）网页应用，内置精确 7 选 5 牌型评估引擎、多级边池结算系统、5 种性格风格 AI（含蒙特卡洛胜率估算）与 Web Audio 合成音效，并提供完整自动化测试与单文件离线打包方案。

## 目录结构

```text
web-texas-holdem/
├── index.html                     # 模块化网页入口（需通过本地静态服务访问）
├── texas-holdem-standalone.html   # 单文件离线即开版（双击浏览器直接游玩）
├── package.json                   # 项目脚本配置（零外部依赖）
├── README.md                      # 项目说明文档
├── src/
│   ├── engine/
│   │   ├── cards.js               # 52张牌组构建、Fisher-Yates 无偏洗牌与牌面解析
│   │   ├── evaluator.js           # 5~7张牌精确牌型评估引擎（皇家同花顺至高牌）
│   │   ├── potManager.js          # 主池与多级边池切分、余数筹码分配引擎
│   │   ├── gameEngine.js          # 无限注德州扑克完整状态机（盲注/单挑/最小加注/全下跑牌）
│   │   └── aiEngine.js            # 5种风格AI决策引擎（Chen起手牌强度 + 蒙特卡洛胜率）
│   └── ui/
│       ├── sound.js               # Web Audio API 合成音效模块
│       ├── styles.css             # 响应式沉浸式牌桌样式表
│       └── app.js                 # 前端交互控制器、快捷键与视图渲染
├── tests/
│   ├── evaluator.test.js          # 牌型评估单元测试
│   ├── potManager.test.js         # 主池与边池单元测试
│   ├── gameEngine.test.js         # 状态机规则与100+手筹码守恒压力测试
│   └── aiEngine.test.js           # AI 策略与胜率估算测试
├── scripts/
│   ├── build-standalone.mjs       # 单文件离线 HTML 构建脚本
│   └── dev-server.mjs             # 零依赖 Node.js 本地静态服务器
└── docs/
    └── TECHNICAL_REPORT.md        # 项目完整技术报告
```

## 快速开始

### 方式一：直接游玩（无需任何环境）
直接用现代浏览器打开根目录下的 `texas-holdem-standalone.html` 即可离线游玩。

### 方式二：本地开发服务器运行（需 Node.js >= 18）
```bash
# 运行全部自动化测试
npm test

# 重新打包单文件离线版
npm run build

# 启动本地静态服务器（默认 http://localhost:5173）
npm start
```

## 快捷键说明
- `F`：弃牌（Fold）
- `C`：过牌或跟注（Check / Call）
- `R`：按滑块金额下注或加注（Bet / Raise）
- `A`：全下（All-in）
- `Space`：结算后进入下一手牌 / 重新开局
