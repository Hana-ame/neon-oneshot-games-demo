# 网页版 FC 坦克大战（Battle City Web）

基于纯原生 **HTML5 Canvas + ES Modules + Web Audio API** 实现的经典 1985 FC《坦克大战》完整网页项目，零第三方运行时依赖，包含模块化源码、自动化测试套件、技术报告及双击即玩的单文件离线版本。

## 快速开始

### 方式一：直接试玩（无需启动服务器）
直接用任意现代浏览器双击打开项目根目录下的 **`standalone.html`** 即可立即游玩。

### 方式二：本地开发服务器运行模块化源码
在项目根目录运行任意静态服务器：

```bash
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080/index.html
```

### 运行自动化测试（需 Node.js >= 18）

```bash
npm test
# 或查看详细用例列表
npm run test:verbose
```

## 操作说明

| 角色 / 功能 | 键盘按键 | 说明 |
| :--- | :--- | :--- |
| **1P 移动** | `W / A / S / D`（单人模式下亦支持方向键） | 四向移动，带经典转角对齐辅助 |
| **1P 开火** | `Space` / `J` / `Z` | 满级 3 星（Lv.3）可击碎钢墙 |
| **2P 移动** | `↑ / ↓ / ← / →` | 2P 双人合作模式生效 |
| **2P 开火** | `Enter` / `K` | 2P 双人合作模式生效 |
| **暂停 / 静音** | `P` / `M` | 随时暂停或开关 8-bit 合成音效 |
| **移动端触控** | 屏幕下方虚拟十字键 + `FIRE` 按钮 | 支持手机与平板触控操作 |

## 目录结构

```text
fc-battle-city/
├── index.html                  # 模块化源码入口页
├── standalone.html             # 单文件内联离线可玩版
├── package.json                # 项目配置与测试脚本
├── README.md                   # 项目说明文档
├── css/
│   └── style.css               # 复古街机界面与移动端响应式样式
├── src/
│   ├── constants.js            # 网格尺寸、地形枚举、坦克与道具数值表
│   ├── maps.js                 # 5 个经典风格关卡（26×26 子格）与敌军波次
│   ├── entities.js             # 坦克、子弹、道具、爆炸、飘字与出生动画实体
│   ├── audio.js                # Web Audio API 8-bit 程序化音效合成器
│   ├── engine.js               # 无 DOM 依赖的核心物理、AI 与状态机引擎
│   ├── renderer.js             # Canvas 像素级地形、坦克与 HUD 渲染器
│   └── main.js                 # 浏览器主控循环、输入绑定与高分持久化
├── tests/
│   ├── engine.test.js          # 核心引擎单元测试（14 项用例）
│   └── integration.test.js     # 完整局内流程集成测试（5 项用例）
└── docs/
    └── TECHNICAL_REPORT.md     # 完整项目技术报告
```
