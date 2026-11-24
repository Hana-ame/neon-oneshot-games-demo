# 枪弹地牢（Bullet Dungeon）网页版完整项目

一个零外部依赖、基于原生 HTML5 Canvas 2D、ES Modules 与 Web Audio API 构建的网页版 **枪弹地牢（Enter the Gungeon 风格）** 弹幕肉鸽射击游戏。

## 快速开始

### 方式一：直接双击打开单文件版（推荐）
直接用任意现代浏览器打开 `standalone/bullet-dungeon.html`，无需启动本地服务器。

### 方式二：运行模块化开发版
在项目根目录启动任意静态服务器（例如 Python）：
```bash
python3 -m http.server 8080
```
随后访问 `http://localhost:8080/index.html`。

### 运行自动化测试
需要 Node.js 18+：
```bash
npm test
```

### 重新构建单文件版
```bash
npm run build
```

## 操作说明

| 按键 | 功能 |
| :--- | :--- |
| `W / A / S / D` 或方向键 | 移动角色 |
| 鼠标移动 + 左键 | 瞄准与射击 |
| `Space` / `Shift` / 鼠标右键 | 翻滚（前 0.30s 具备无敌帧，可穿越弹幕） |
| `Q` | 释放空白弹（立即清除全屏敌方弹幕并击退敌人） |
| `R` | 手动装弹 |
| `E` | 开启宝箱 / 购买商店道具 / 进入 Boss 传送门 |
| `1 - 4` 或鼠标滚轮 | 切换已解锁武器 |
| `P` / `Esc` | 暂停 / 继续 |

## 目录结构

```text
bullet-dungeon/
├── index.html                  # 模块化入口页面
├── package.json                # 项目配置与测试/构建脚本
├── README.md                   # 项目说明文档
├── standalone/
│   └── bullet-dungeon.html     # 零依赖单文件可玩版本
├── src/
│   ├── engine/
│   │   ├── math.js             # Mulberry32 确定性 PRNG 与几何碰撞
│   │   └── audio.js            # Web Audio API 合成音效引擎
│   ├── game/
│   │   ├── constants.js        # 武器库、敌人配置、楼层主题与商店配置
│   │   ├── dungeon.js          # 程序化房间图与连通性地牢生成器
│   │   ├── gameEngine.js       # 无头兼容核心模拟与战斗引擎
│   │   └── renderer.js         # Canvas 2D 渲染器与小地图
│   ├── styles/
│   │   └── main.css            # 响应式暗色霓虹 UI 与触控布局
│   └── main.js                 # 浏览器主控、输入绑定与 HUD 同步
├── tests/
│   ├── dungeon.test.mjs        # 地牢生成与连通性单元测试
│   ├── combat.test.mjs         # 弹幕战斗、无敌帧、空白弹与武器测试
│   ├── progression.test.mjs    # 房间锁定、宝箱、商店与楼层推进集成测试
│   └── run-tests.mjs           # 测试运行器与报告生成器
├── scripts/
│   └── build-standalone.mjs    # 零依赖单文件 HTML 打包脚本
└── docs/
    └── technical-report.md     # 完整技术报告
```
