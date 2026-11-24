# 以撒的结合：泪之地下室 (Isaac Web Edition)

纯原生 HTML5 Canvas + ES Modules + Web Audio API 实现的网页版《以撒的结合》Roguelike 地牢动作游戏，零外部依赖、内置可复现种子系统、完整自动化测试套件与单文件离线可玩版。

## 目录结构

```text
isaac-web/
├── index.html                  # 模块化版本入口（需通过本地静态服务器打开）
├── package.json                # Node.js 测试与构建脚本配置
├── README.md                   # 项目说明与运行指南
├── src/
│   ├── constants.js            # 房间几何、层级主题、基础属性与敌人数值表
│   ├── rng.js                  # Mulberry32 可复现种子伪随机数生成器
│   ├── items.js                # 12 种被动道具、协同修饰符与主动道具池
│   ├── dungeon.js              # 类以撒 BFS 约束地牢生成器与障碍物模板
│   ├── entities.js             # 实体工厂（玩家、泪弹、敌人、炸弹、拾取物）
│   ├── engine.js               # 无 DOM 依赖的纯逻辑核心引擎（支持 Node 单元测试）
│   ├── audio.js                # Web Audio API 复古程序化音效合成器
│   ├── renderer.js             # Canvas 2D 渲染器、血迹/粒子、HUD 与小地图
│   └── main.js                 # 浏览器主循环、键鼠与触屏双摇杆控制
├── tests/
│   ├── rng.test.js             # 种子随机可复现性与边界测试
│   ├── dungeon.test.js         # 地牢连通性、死胡同与特殊房约束测试
│   ├── combat.test.js          # 泪弹惯性、击退、魂心吸收与无敌帧测试
│   ├── items_and_economy.test.js # 道具协同、蓝石头炸弹掉落与商店经济测试
│   └── progression.test.js     # 房间切换、三层 Boss 战与通关流程集成测试
├── scripts/
│   └── build-standalone.js     # 零依赖单文件 HTML 打包脚本
├── dist/
│   └── isaac-standalone.html   # 可直接双击离线游玩的单文件版
└── docs/
    └── TECHNICAL_REPORT.md     # 完整技术报告
```

## 快速开始

### 1. 直接游玩（推荐）
直接用任意现代浏览器双击打开 `dist/isaac-standalone.html` 即可开始游玩，无需安装依赖或启动服务器。

### 2. 开发模式运行（模块化版）
```bash
# 在项目根目录启动任意本地静态服务器
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080/index.html
```

### 3. 运行自动化测试与重新打包
要求 Node.js >= 18：
```bash
npm test      # 运行全部 5 个测试套件（16 项测试用例）
npm run build # 重新将 src/ 打包为 dist/isaac-standalone.html
```

## 操作说明

| 按键 / 触屏 | 功能 |
| :--- | :--- |
| `W / A / S / D` | 八方向平滑移动（带惯性阻尼） |
| `↑ / ↓ / ← / →` | 四方向发射泪弹（继承角色部分移动惯性） |
| `E` 或 `Shift` | 放置炸弹（可炸毁普通石头、隐藏蓝石头与敌人） |
| `Space` | 释放主动道具「美味的心」（每清 1 房充能 1 格，满 4 格恢复 1 颗红心） |
| `P` / `Esc` | 暂停 / 继续 |
| `M` | 静音 / 开启 Web Audio 程序化音效 |
| `R` | 快速重开新一局 |
