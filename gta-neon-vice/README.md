# NEON VICE — 网页版 GTA（霓虹罪恶都市）

基于原生 HTML5 Canvas 2D、纯 JavaScript（零第三方运行依赖）与 Web Audio API 构建的 2.5D 俯视角开放世界动作驾驶游戏完整工程项目。

## 目录结构

```text
web-gta-project/
├── index.html                  # 单文件独立可玩版（浏览器双击即可运行）
├── package.json                # 项目元信息与测试/构建脚本
├── README.md                   # 项目说明与快速上手指南
├── src/                        # 模块化游戏引擎源码（UMD 格式，兼容浏览器与 Node.js）
│   ├── config.js               # 城市尺度、城区、载具参数、武器与电台配置
│   ├── world.js                # 确定性程序化城市生成器（道路、建筑、公园、道具）
│   ├── physics.js              # 2D 载具动力学、漂移侧向摩擦与圆形-AABB碰撞解算
│   ├── ai.js                   # 交通路网导航、行人恐慌逃逸与警车追捕 AI
│   ├── missions.js             # 5 个开放世界任务状态机（取货、竞速、劫案、脱逃、巡游）
│   ├── engine.js               # 无头仿真主循环（载具进出、武器弹道、通缉星级、阵亡重生）
│   ├── audio.js                # Web Audio API 程序化引擎声、枪声、爆炸与警笛合成器
│   └── renderer.js             # 2.5D 建筑视差拉伸、车灯照明、粒子与小地图雷达渲染器
├── tests/                      # 基于 Node.js 原生 node:test 的自动化测试套件
│   ├── world.test.js           # 城市生成与安全出生点测试
│   ├── physics.test.js         # 载具加减速、漂移与碰撞动量传递测试
│   ├── ai.test.js              # 交通避障、警车追击与行人逃逸测试
│   └── engine.test.js          # 核心仿真、上下车、射击、通缉与任务闭环集成测试
├── scripts/
│   └── build_singlefile.js     # 将 src/*.js 零依赖打包为独立 index.html
└── docs/
    └── TECHNICAL_REPORT.md     # 完整架构、算法与测试验证技术报告
```

## 快速运行

1. **直接试玩**：用任意现代浏览器打开根目录的 `index.html` 即可游玩，无需启动后端或安装依赖。
2. **运行自动化测试**（需 Node.js >= 18）：
   ```bash
   npm test
   ```
3. **重新构建单文件版**：
   ```bash
   npm run build
   ```

## 操作按键

| 按键 | 功能 |
| :--- | :--- |
| `W / A / S / D` 或 方向键 | 步行移动 / 载具加速、刹车倒车、转向 |
| `E` 或 `F` | 上车 / 抢车 / 下车 |
| `鼠标左键` | 瞄准射击（步行与车内均支持） |
| `Space` | 驾驶手刹漂移 / 步行开火 |
| `Shift` | 步行冲刺 |
| `1 - 4` 或 `Q` | 切换武器（格斗 / 9mm手枪 / 微型冲锋枪 / 霰弹枪） |
| `M` | 打开/关闭任务列表 |
| `R` | 切换车载电台 |
| `P` / `Esc` | 暂停/恢复游戏 |
