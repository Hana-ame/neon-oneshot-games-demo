# 网页太鼓达人 · Web Taiko Master

一款基于原生 **HTML5 Canvas + Web Audio API + ES Modules** 构建的完整网页端太鼓节奏音游，零外部音频/图片依赖、开箱即玩。

## 功能特性

- **零资源 Web Audio 合成引擎**：实时合成「咚 / 咔 / 大咚 / 大咔 / 气球爆破 / 50 连击音效」，并基于 `AudioContext.currentTime` 前瞻调度（Lookahead Scheduler）生成节拍精准的和风配乐。
- **高精度判定与魂槽系统**：支持 `良 (±25ms)`、`可 (±75ms)`、`不可 (±108ms)` 三级判定，连击倍率、大音符双倍加分、Go-Go Time 1.2x 加成、连打（Drumroll）与气球（Balloon）机制，以及按难度分级的过关魂槽线（60% / 70% / 80%）。
- **4 首原创和风曲目 × 3 种难度（共 12 套谱面）**：涵盖简单（かんたん）、普通（ふつう）与鬼级（おに）。
- **自定义 TJA-Lite 谱面编辑器**：支持实时语法校验、BPM 变速（`#BPMCHANGE`）、流速控制（`#SCROLL`）与 Go-Go Time 区间（`#GOGOSTART`/`#GOGOEND`），编辑后可立即试玩。
- **完善的可玩性增强**：键盘 `D / F / J / K` 自定义改键、移动端/鼠标触控鼓面、互动 120 BPM 延迟校准工具、流速调节（0.5x–2.0x）、自动演奏（Auto-Play）演示模式与结算偏移分布直方图。

## 目录结构

```text
web-taiko-master/
├── index.html                 # 模块化开发入口页面
├── package.json               # 项目配置与测试/构建脚本
├── README.md                  # 项目说明文档
├── src/
│   ├── styles.css             # 和风祭典主题响应式样式
│   ├── data/
│   │   └── songs.js           # 4 首原创曲目与 12 套 TJA-Lite 谱面
│   ├── engine/
│   │   ├── constants.js       # 音符类型、判定窗口、计分与难度常量
│   │   ├── chart.js           # TJA-Lite 谱面解析器与统计器
│   │   ├── judge.js           # 纯函数/确定性判定、计分与魂槽引擎
│   │   ├── audio.js           # Web Audio 鼓声合成器与前瞻 BGM 音序器
│   │   └── renderer.js        # 高分屏 Canvas 2D 舞台与特效渲染器
│   └── ui/
│       └── app.js             # 页面状态机、输入控制、校准与谱面编辑器
├── tests/
│   ├── chart.test.js          # 谱面解析与时间计算单元测试
│   ├── judge.test.js          # 判定窗口、连击、魂槽与特殊音符单元测试
│   ├── songs.test.js          # 全曲库 12 套谱面完整性与可玩性校验
│   └── integration.test.js    # 完整对局端到端仿真与单文件构建校验
├── scripts/
│   └── build-standalone.mjs   # 零依赖单文件 HTML 打包脚本
├── dist/
│   └── taiko-standalone.html  # 可直接双击打开的独立单文件版
└── docs/
    └── TECHNICAL_REPORT.md    # 完整项目技术报告
```

## 快速启动与测试

```bash
# 1. 运行全量自动化单元测试与集成测试（需 Node.js >= 18）
npm test

# 2. 生成单文件独立版 dist/taiko-standalone.html
npm run build:standalone

# 3. 本地启动静态服务器体验模块化源码版本
npm run serve
# 浏览器访问 http://localhost:8080
```

也可以直接用任意现代浏览器双击打开 `dist/taiko-standalone.html` 立即游玩。
