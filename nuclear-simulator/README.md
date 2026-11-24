# NukeSim Lab — 核爆效应物理模拟器

基于 Glasstone & Dolan (1977)《The Effects of Nuclear Weapons》经典缩放律构建的交互式网页核爆效应物理模拟器（教学与科普用途），包含模块化源码、零依赖自动化测试套件与完整技术报告。

## 快速开始

### 1. 直接运行网页
直接用任意现代浏览器打开根目录下的 `index.html` 即可运行（无需后端服务器或 `npm install`）。

### 2. 运行自动化测试
需要 Node.js 18 及以上版本：

```bash
npm test
```

或单独运行单元测试 / 集成测试：

```bash
npm run test:physics
npm run test:integration
```

## 项目结构

```text
nuclear-blast-simulator/
├── index.html                 # 独立单文件完整版网页（内置样式与脚本）
├── package.json               # 项目配置与测试命令
├── README.md                  # 项目说明文档
├── src/
│   ├── physics.js             # 核心核效应物理计算引擎（UMD 兼容）
│   ├── presets.js             # 8 种核弹头当量预设与 6 座全球城市坐标
│   ├── app.js                 # 地图渲染、时间轴冲击波、Chart.js 图表与 Web Audio 音效
│   └── styles.css             # 深色战术遥测主题样式
├── tests/
│   ├── physics.test.mjs       # 物理缩放律与边界条件单元测试
│   └── integration.test.mjs   # 预设遍历与单文件 HTML DOM 一致性测试
└── docs/
    └── technical_report.md    # 完整技术报告（含物理推导、测试记录与参考文献）
```

## 主要特性
- **多效应地理可视化**：火球汽化区、20/5/1 psi 冲击波超压、热辐射三度烧伤、500 rem 早期核辐射、触地放射性沉降羽流。
- **空爆 / 地爆连续爆高调节**：支持自动最优 5 psi 爆高及手动滑块调节高空衰减。
- **时间轴动态冲击波（0–60 s）**：支持播放/暂停/拖动，实时呈现冲击波前锋扩散与蘑菇云高度演进。
- **多爆点对比与 JSON 导出**：支持锁定多个对比爆点叠加显示，并一键导出完整模拟遥测 JSON。
- **多底图与离线雷达网格**：内置暗色战术底图、卫星影像、标准街道及离线网格模式。
