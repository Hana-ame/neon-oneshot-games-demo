# 堡垒防线 · 经典塔防 TD (Tower Defense)

一款基于原生 ES Modules、HTML5 Canvas 2D 与 Web Audio API 构建的零依赖网页塔防游戏完整项目，包含解耦的无头仿真引擎、自动化单元测试套件、单文件直开版本与中文技术报告。

## 目录结构

```text
tower-defense-td/
├── index.html                        # 模块化入口页面（需通过本地 HTTP 服务打开）
├── package.json                      # 项目配置与测试脚本
├── README.md                         # 使用说明
├── TECHNICAL_REPORT.md               # 中文技术报告（架构、算法、测试与性能分析）
├── styles/
│   └── main.css                      # 样式表
├── src/
│   ├── config.js                     # 地图、炮塔、敌人与波次静态配置
│   ├── engine.js                     # 无头核心仿真引擎（与 DOM/Canvas 完全解耦）
│   ├── renderer.js                   # HTML5 Canvas 2D 渲染器
│   ├── audio.js                      # Web Audio API 合成音效引擎
│   └── main.js                       # UI 绑定、快捷键与主循环控制器
├── tests/
│   └── engine.test.mjs               # Node.js 内置 node:test 自动化测试套件
└── dist/
    └── tower_defense_standalone.html # 单文件打包版（双击即可在浏览器运行）
```

## 快速运行

### 方式一：直接试玩（无需服务器）
直接用现代浏览器双击打开 `dist/tower_defense_standalone.html` 即可游玩。

### 方式二：运行模块化源码
在项目根目录启动静态服务器：

```bash
python3 -m http.server 8080
```

随后在浏览器访问 `http://localhost:8080`。

## 运行自动化测试

需 Node.js 18 及以上版本（零外部 npm 依赖）：

```bash
npm test
# 或直接运行：
node --test tests/engine.test.mjs
```

## 快捷键说明

- `1` – `5`：快速选择机枪塔 / 冰霜塔 / 加农炮 / 电磁塔 / 棱镜激光
- `Space`：开始第 1 波，或暂停/继续游戏
- `F`：切换 `1x` / `2x` 游戏倍速
- `U` / `S`：升级 / 出售当前选中的防御塔
- `Esc`：取消当前选塔或关闭属性面板
