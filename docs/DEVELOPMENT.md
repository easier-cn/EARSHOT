# HUSH 开发交接文档

> 最后更新：v0.8.9（2026-11-09）

## 交接约定（每次改动都必须遵守）

1. **自动更新文档**：任何改动完成后，同一次提交里必须同步更新——`CHANGELOG.md` 增加版本条目、`README.md`（玩法/启动方式有变时）、本文件（目录、踩坑、路线图、当前状态有变时）。不允许“代码先上，文档以后补”。
2. **版本号三处一致**：`package.json` 的 `version`、`index.html` 里 `src/main.js?v=…`、`src/selfcheck.js` 的 `VERSION`。启动自检会对比脚本参数与代码版本，不一致会标红。
3. **不要用 `python -m http.server`**：它允许浏览器缓存 ES 模块，会出现“改了没生效 / 只有 Ctrl+F5 才对”的假 bug。用 `play.cmd`（内部 `tools/serve.py`，全部响应 `no-store`）。
4. **启动带随机参数**：`play.ps1` 打开的是 `…/?launch=<时间戳>`，强制取新文档；`index.html` 还有一层兜底脚本，3.2 秒内没启动游戏就自动 `?fresh=` 重载一次。
5. **改完跑三件事**：`npm test`、`npm run playtest`、`node tools/build.mjs`（更新 `dist/hush.html`）。

## 1. 项目是什么

全黑画面里的声呐潜行游戏：看不见任何东西，只能靠声波打在墙上的反弹点知道房间形状，而每一次发声都会把猎手引向你。

现在的完整形态是**肉鸽式地图探索**：

- 主流程：`房间 → 迷宫 → ……` 共 21 张地图，目前建成 3 张（房间 / 迷宫 / 移动迷宫）
- 每张图有钥匙、出口、护符/道具、被动型猎手（听见才动）
- 护符 10 种（含 3 级升级）、道具 8 种、6 格背包 + 4 快捷键 + 4 护符槽 + 2 格工作台
- 另有"五层肉鸽"旧模式（`startRun`）与编辑器模式

---

## 2. 跑起来

| 方式 | 命令 | 说明 |
|---|---|---|
| 一键（推荐） | 双击 `play.cmd` | 自动找空闲端口、起服务、开浏览器；重复运行会复用已在跑的 HUSH |
| 指定端口 | `play.cmd 8135` | 端口被占会自动往后找 |
| 单文件 | 打开 `dist/hush.html` | 无服务器也能玩（file://） |
| 手动 | `python -m http.server 8080 --bind 127.0.0.1` | 然后访问 `http://127.0.0.1:8080/` |

没有 Python 时 `play.ps1` 会退化成直接打开 `dist/hush.html`。

**关标签页不会关服务器**（标签页只是浏览器，Python 还在后台跑）。要停服务：

- 双击 `stop.cmd`，或 `play.cmd stop`
- 或者直接关掉那个启动服务器的控制台窗口

`play.ps1` 启动时会把服务进程号写进 `.hush.pid`，`stop.ps1` 优先按它整棵进程树结束；没有 pid 文件时才会去扫描 8080–8139，用"页面里有没有 `<canvas id="game">`"认出 HUSH 再结束，不会误杀别的服务。

**改了源码必须重新构建单文件**，否则 `dist/` 还是旧版本：

```bash
node tools/build.mjs     # 生成 dist/hush.html（约 250KB）
```

浏览器里改完记得 **Ctrl+F5**：`index.html` 已经加了 `no-store`，但旧标签页仍可能吃缓存。

---

## 3. 目录结构

```
ni/
├─ index.html            # 入口：canvas + UI 根节点，按顺序 import
├─ style.css             # 全量样式（无框架）
├─ play.cmd / play.ps1   # 启动器（端口探测 + 打开浏览器）
├─ dist/hush.html        # 单文件构建产物（由 tools/build.mjs 生成）
├─ docs/
│  ├─ DEVELOPMENT.md     # 本文
│  └─ img/*.jpg          # README 用截图
├─ src/
│  ├─ main.js            # 启动、URL 调试参数、错误浮层
│  ├─ game.js            # 核心状态机（最大文件，约 1700 行）
│  ├─ util.js            # clamp/lerp/dist/mulberry32/echoPan...
│  ├─ input.js           # 键盘鼠标（keys/pressed/consume）
│  ├─ pathfind.js        # A*（8 向、禁止切角）+ 视线检测
│  ├─ levelgen.js        # 旧版"密室"关卡
│  ├─ rooms.js           # 五层肉鸽的房间图生成（走廊优先）
│  ├─ worldgen.js        # 地图模式：buildRoomMap / buildMazeMap / buildMovingMap
│  ├─ maps.js            # 21 张地图的节点表与顺序
│  ├─ entities.js        # Player / Hunter(4 种) / Skitter
│  ├─ loot.js            # CHARMS / ITEMS / Inventory（背包与合成）
│  ├─ desc.js            # 护符与道具的文言文案、SVG 纹样
│  ├─ render.js          # 全部绘制：射线、接触点、实体、UI 世界层
│  ├─ ui.js              # 无字界面：标题/暂停/死亡/结算/背包/选图/浮窗
│  ├─ audio.js           # 全程序化 WebAudio（无音频文件）
│  ├─ chambers.js        # 旧 8 密室配置
│  └─ editor.js          # 创造模式（画墙、放碎片/门/怪）
└─ tools/                # 全部是 Node 脚本，见第 6 节
```

`src/` 里模块之间的依赖是单向的：`util → pathfind → levelgen/rooms/worldgen → maps → entities → loot/desc → audio → chambers → editor → ui → render → game → main`。`tools/build.mjs` 的 `MODULES` 数组就是这个顺序，**新增文件必须同时加进去**。

---

## 4. 核心数据与状态

### 存档（localStorage）

| key | 内容 |
|---|---|
| `hush.save.v1` | `{unlocked, cleared, last, best:{...}, worldCleared, worldBest, bestRun, floorCleared}` |
| `hush.map.v1` | 编辑器里画的地图（`{cells, w, h}`） |

### 游戏状态机（`game.state`）

`title` → `playing` ⇄ `paused`，死亡 `dead`，区域完成 `complete`，通关 `victory`，编辑器 `edit`。

### 三种"区域"模式

| 模式 | 入口 | 说明 |
|---|---|---|
| `mapMode` | `startMap(id, seed)` | 地图模式（当前主线），`mapId/mapSeed/mapKey/mapExits/mapNodes`；移动迷宫另有 `level.moving` 与 `mcHunters` |
| `floorMode` | `startRun(seed)` / `startFloor(depth)` | 五层肉鸽：每层是一张房间图，`depth` 1..5 |
| `worldMode` / `customData` / 密室 | `startWorld` / `startCustom` / `startChamber` | 旧内容，保留可玩 |

**这五种入口都会把 `_entryPending` 置 true**，`update()` 第一帧拍 `entryState` 快照（背包、金币、钻石、生命、应激层数），时间逆流就靠它还原。

### 消耗品的两种按键契约（**改动时不要破坏**）

| 类型 | 按下快捷键 | 左键 | 何时扣数量 |
|---|---|---|---|
| 投掷物 `kind:'throw'`（石子 / 锋利石 / 尸骸 / 驱虫器） | **只绑定**到鼠标：出现瞄准虚线、弹幕「已握紧 X」，再按同一键松开 | 朝鼠标方向掷出 | 掷出的那一刻（`throwItem` 内 `consume`） |
| 非投掷物 `kind:'use'`（维他命 / 图腾 / 无敌星 / 扫描仪） | **立即消耗并生效** | 与它无关（左键仍是声呐） | 按键那一刻（`useItem` 内 `consume`） |

推论（违反即出 bug）：

- 没有绑定任何投掷物时，左键必须是声呐，**不能**"手里有石子就自动丢"。
- 瞄准线只在 `game.activeItem` 非空时绘制。
- 掷出后若背包已无同种物品，`activeItem` 必须清空；还有则保持绑定。
- 拾取只进背包，不自动绑键。

### 背包（`loot.js` 的 `Inventory`）

- `pack[6]`：`{kind:'item', id, n}` 或 `{kind:'charm', id, lvl}`
- `hot[4]`：**引用**背包条目（`take()` 会清引用）
- `charms[4]`：只有装进槽位的护符生效
- `work[2]`：工作台，两枚同名同级 → 成果格合成
- 升级只能在工作台发生；背包里的护符不生效

---

## 5. 操作与调试参数

### 游戏内

| 按键 | 作用 |
|---|---|
| WASD / 方向键 | 移动（按住 Shift 潜行：不出声线、移动变慢，但仍能看见所有声线） |
| 鼠标左键 | 声呐；选中投掷物后改为投掷 |
| 空格 / J | 声呐 |
| F | 交互：拾取道具、拾钥匙、进传送门、下行（靠近时浮窗提示） |
| Tab | 背包 / 拖拽装配 |
| 1 2 3 4 | 快捷键（投掷类为开关，再按一次取消） |
| M | 静音 |
| Esc | 暂停 / 关闭面板 |
| R | 死亡或暂停时重开（**会清空背包**） |
| `~` | 调试模式（显示猎手类型/路径） |
| `1`（调试中） | 冻结所有物体 |
| `2`（调试中） | 打开选图窗 |

### URL 参数（`src/main.js`）

| 参数 | 作用 |
|---|---|
| `?map=room\|maze\|moving&seed=123` | 直接进入某张地图 |
| `?run=123` | 直接开始五层肉鸽 |
| `?c=0..7` | 旧密室 |
| `?world=1` / `?edit=1` | 旧世界 / 编辑器 |
| `?static=1` | 关掉 CSS 动画（无头截图用） |
| `?sim=2.4&every=0.7&wave=0.45` | 推进模拟后冻结（截图定帧） |
| `?ping` / `?move=1` | 模拟中自动发声 / 自动向右走 |
| `?doc=pause\|dead\|clear\|victory\|worldwin` | 直接弹对应面板 |
| `?debug=1` / `?hunt=1` / `?red=1` / `?blue=1` | 调试场景 |

---

## 6. 工具链

全部是 Node 原生脚本（无依赖），需要本机有 Edge（路径写死在 `tools/*.mjs` 顶部）。

| 工具 | 命令 | 用途 |
|---|---|---|
| 构建 | `node tools/build.mjs` | 把 `src/` 里全部模块内联成单文件 |
| 传送门调参 | `python tools/serve.py 8080` 后打开 `/tools/portal-tune.html` | 拖滑块实时预览；保存写 `tools/portal-tune.saved.json`，再抄进 `src/portal-config.js` |
| 单测 | `npm test` | 79 项：连通性、AI、背包、地图生成、迷宫道具分布、投掷瞄准、六项道具效果、交互提示、移动迷宫、首次引导 |
| 端到端 | `node tools/playtest.mjs` | CDP 真实按键：开局→移动→投掷→通关→编辑器 |
| 单表达式 | `node tools/probe.mjs "<js>"` | 在真实页面执行一段代码并回值（最常用） |
| 真实时间截图 | `node tools/live.mjs "<js>" out.png 800` | 注入场景、等真实毫秒、截图（抓"冻结时间看不出来"的渲染问题） |
| 真实按键 | `node tools/keytest.mjs` | 排查快捷键问题（CDP `Input.dispatchKeyEvent`） |
| 投掷复现 | `node tools/repro-throw.mjs` | 按键只选中、左键才消耗的回归验证 |
| 地图 ASCII | `node tools/printmap.mjs` | 把网格打成字符画，肉眼查墙与连通 |
| 房间统计 | `node tools/checkrooms.mjs` | 150 种子连通性/房间数统计 |
| 性能 | `node tools/perf.mjs` | 720 帧 p95 |
| 难度压力 | `node tools/pressure.mjs` | 幽灵走完美路线，统计死亡时间 |

验证约定：

1. 逻辑改动 → `npm test` 必须 79/79。
2. 交互改动 → `node tools/playtest.mjs` 必须 `errors: []`。
3. 视觉改动 → 至少一张 `shots/*.png` 截图，自己看一眼再提交。
4. 改了 `dist` 相关 → 用 `file://` 再跑一次 playtest。

---

## 7. 已经踩过的坑（**别再踩**）

### 构建

- **单文件构建曾经从 v0.7.0 起就是坏的**：`levelgen/rooms/worldgen` 各自 `const TILE`，`pathfind/rooms` 各自 `const DIRS`，内联后重复声明直接白屏；`MODULES` 还漏了 `editor.js`。
  → 构建脚本现在会逐行去重"同名同值的单行 const"，但**新增全局常量请先 grep 是否重名**。
- `python -c` 写文件时 `\b` 会被当退格吃掉，中文脚本请用文件写入或 `write` 工具。

### 生成器

- BSP 曾经**只记录墙的位置用于打洞，却从未把墙写进网格** → 整张"房间图"其实是一个空大厅，连通性测试全绿但玩法完全不对。
  → 房间图必须"先填墙、再开门洞"，并用 `printmap.mjs` 肉眼确认。
- 装饰（柱子、隔断）会堵死走廊：每次装饰后跑全图 `connected()`，失败就回滚网格快照。
- 钥匙坐标已经是像素，别再乘 `tile`（曾把钥匙扔到 4 万 px 外）。
- 迷宫图没有 `level.key`，任何读 `L.key.x` 的代码都要判空（归家期盼曾因此崩溃）。
- 迷宫曾把 `loot` 写死成空数组，而房间图只在 BSP 盒子里撒点 → 迷宫（以及所有走廊）永远捡不到东西。现在 `mazeLoot()` 从出生点跑 BFS 深度、按深度分带取点、优先走廊格（至少 3 个在单格走廊），点间距 5 格（补位 3 格），避开出生点 5 格 / 出口 4 格范围与猎手格；改数量或间距时 `tests/worldgen.test.js` 会挡住。
- `sort(() => rnd() - 0.5)` **不是洗牌**：比较器忽略参数、每次返回新随机数，属于"不一致比较器"；V8/Edge 连比较器调用次数都可能变（JIT 前后不一样）→ 同一个 `seed` 在浏览器里两次生成的迷宫不同（Node 里碰巧稳定，所以单测没抓到）。一律用 `util.shuffle(arr, rng)`（Fisher–Yates）；`maze map: loot is deterministic` 测试用来挡回归。

### 移动迷宫

> **2026-11-08 声线返工（v0.8.3 → v0.8.6）**：这一轮连续踩了三个坑——把声线当特效画（金圈画圆、门洞画短线、核心画辐条）、`startMap` 用 `[]` 覆盖 `coreTrails` 导致核心不动、分段描边+速度快导致拖尾有节点且看不清。结论：声线必须是**粒子头+淡出拖尾**；核心是三颗粒子在正中一格内以 `RAY_SPEED/3` 反弹；渲染只用一条连续渐变路径，不批量描边。

- 只有**一张物理网格**：9 个方块各自缓存两套 25×25 布局，翻转时 `z ^= 1` 后把新布局**原地**写回 `level.grid`。不要重新赋值 `level.grid`——射线、投掷物和猎手都缓存了这个引用。
- 两套布局是**两次独立生成**的单格宽迷宫，门位、外环和中心 3×3 房间固定，只有中间 19×19 的通道不同。不要再做 `rotatePlan`/`carryTurn`：房间不是旋转，而是替换。
- **玩家所在房间永不改写**。`doFlip()` 用 `playerBlocks()` 取当前 tile 覆盖的所有块；玩家站在共享边界 tile 上时可能同时属于两块，`protectedIds` 会把它们一起排除。被抽中的保护块换成另一块未抽中的块，尽量保持 5 块。若保护发生在最后 1 秒，仍播报另一层，但不改玩家脚下布局。
- 方块按 `PITCH = 24` 摆放而布局是 25 格，相邻块共享一条边；角块只有 4 个门、边块 6 个、中心块 8 个，外侧边是实墙。门开在局部 5/17，两端必须同时打开才能通过；`movingDoors()` 用 `b.sides` 计算。
- 迷宫主体：10×10 个奇数格（局部 3..21）、1 格墙、12% 编织；外环只有 1 格宽（局部 1/23），门嘴在局部 2/22；中心 3×3 房有 8 个一格入口。改布局后用 `tests/moving.test.js` 的“no 2×2 open squares outside centre”挡回宽走廊。
- `level.exit` 是 `null`：渲染出口块、`hitEntity` 命中出口都必须先判空。曾被无条件解引用崩过。
- `flipRings` 只在移动迷宫初始化；旧模式的更新循环也要能读它（`this.flipRings || []`）。
- 18 只 `lurker` 数据是 9 个位置 × 2 层、每面一只，但场上始终只有 9 只活守卫：`reserve = layer !== 0` 的副本休眠，`syncMovingHunters()` 只放 9 只非 reserve 的活守卫。房间翻转时守卫不换人、不消失；只清 path，新布局脚下是墙就移到 `nearestOpenInBlock`。击杀置 `h.dead`，翻身不会复活。
- 翻转前 1 秒 `emitFlipSoundLines()` 遍历被抽中块的所有门（`movingDoors()`），每个门洞生成 **8 条半格红声线粒子**：4 条从一侧出发、4 条从另一侧反向出发，沿门洞对穿；垂直分隔边 → 水平运动，水平分隔边 → 垂直运动；共用门按坐标+方向去重。参数是 `speed 44, life 0.55`，只在 pending 的 1 秒内存在，翻转/坍塌立即清空。不要再恢复常驻层界红线或静态短线。
- **声线 = 粒子头 + 淡出拖尾**，不是画出来的线。现有实现只有三类：普通/ghost 的 `rays`（`spawnRays`）、短命的 `soundTrails`、核心的 `coreTrails`。看到“画一圈线、画一排短线”的写法就是特效，和声呐不是一套语言。
- 核心：每个未碎核心 3 颗粒子，初始方向相隔 120°，其中一条从正上偏 38°；粒子从中心出发，在正中 1 格 `口` 内以 `CORE_RAY_SPEED = RAY_SPEED / 3`（≈186.7px/s）反复反弹，**粒子永不消失**，只有拖尾淡出。`updateCoreTrails()` 用 2px 子步进，四条边反弹后 `clamp`；`pts` 上限 32（约 64px）。
- `startMap()` 必须在 `this.level = level` 之后执行 `this.coreTrails = this.makeCoreTrails(level)`；曾把 `this.coreTrails = []` 写回去，导致核心完全不动。`startFloor()` 也要重置。
- 核心渲染用**一条连续路径 + `createLinearGradient`**（尾部透明 → 头部 0.62），并用 `quadraticCurveTo` 平滑；禁止按三段 `stroke` 或逐点 `arc`，否则拖尾会出现节点/圆点。头部另外画 1.8px 圆点；`decor[z] === 'none'`（目标块 z0）不画，`core.broken` 只画冷灰余烬。
- `b2` 坍塌过场由 `mcBurst` 驱动：`breakCore()` 收集 `b2` 内部所有实心格（保留最外圈），`updateMcBurst()` 用线性半径逐圈把墙写 0；半径与墙距都必须用**像素**，写成 tile 会瞬间整片消失。金圈不再是 render 画的圆，而是 **96 条 ghost `rays`**（`speed 420, life .9, ghost:true`）；每面碎墙生成 **6 条淡灰 `soundTrail`**；被扫到的守卫用 `killHunter()`，自带 40 条紫 ghost。冻结与震屏同 `collapseT` 一样持续 1.45 秒；结束才调用 `collapseB2()`。
- ghost 射线由 `spawnRays({ ghost:true })` 产生，`updateRays()` 的 ghost 分支只直线前进、穿墙穿实体、不产生接触；有 `tag` 的射线才会命中。别把 ghost 和普通声呐混在一个分支里，否则金圈会被墙弹回或把守卫提前染红。
- 别把 `now` 换成 `levelTime`：`now` 在暂停时也走，粒子和拖尾才不会僵。
- 玩家房间被保护时，玩家被视为随房间一起升/降：`mcFloor` 取 1/2，`movingFloor()` 负责 HUD；`mcFloorBlock` 记住这个“感知层”属于哪一块，玩家走进另一块时 `movingFloor()` 自动回落到该块真实的 `z + 1`，既不会出现“播报到了二层、HUD 还在一层”，也不会走到别的房间还挂着旧层。
- 核心被投掷物打碎后，`writeMovingBlock` 必须强制把中心格写回 0，否则下一次翻转会把“口”重新封死；正常通关封 `b2` 时则要在写回后强制写 1。
- 移动迷宫内部字段叫 `level.moving`（不是规范里的 `level.mc`），`rng = mulberry32(seed ^ 0x9e3779b9)`；抽翻转用这个 rng，`shuffle(pool, rng).slice(0,5)`。
- 猎手在移动迷宫未警戒速度 64（玩家 92 的 0.7×），警戒 184（2×）；`alertT > 0` 时 `_lurk` 不再闲逛，`_footsteps` 间隔 34、射线 9 条（平时 58 / 22 条）。`hear()` 和诱饵触碰都要续 `alertT`。
- `now` 只在 `frame()` 里推进。用 `game.update(dt)` 直接快进的探针不会让 `flipRings` 过期，这是探针现象，不是正式游玩的泄漏。

### 射线与实体

- 脚步/声呐射线如果从实体中心发出，第一步就会命中自己，全部染成"命中红"并原地反弹 → 表现成"只有一坨红点"。
  → 无标签射线（`tag:null`）只与墙壁交互；有标签射线才与实体交互。
- `updateShocks` 曾插进 `updateTitle()`，正式游玩里永远不更新（看着像没实现）。
- 渲染里大量颜色写死过（射线头部、波前辉光），改 tint 时要顺着"头部/拖尾/接触点/环"四层一起改。

### 状态与存档

- `restart()` 只重建关卡、不重建背包 → 死亡重开带着上一局物品（已修：`resetRunState()`）。
- 时间逆流曾写死 `startFloor(this.depth)`，地图模式下 depth 是旧楼层值 → 复活进"以前的关卡"（已修：`restoreEntry()` 按模式重开）。
- 时间逆流曾不还原背包 → 可以"捡装备→逆流→再捡"无限刷（已修：进区域快照）。
- 不死图腾曾只加 `stressCharges`，而受伤判定读护符等级 → 图腾等于没装（已修：先消耗层数）。
- 投掷物曾经"先生成、后扣数量"，数量为 0 时会白嫖（已修：先 `consume` 再生成）。
- 投掷起点在身体中心，贴墙时第一帧就撞墙 → "按一下就没"（已修：起点前移并回退检查）。
- 投掷方向曾用**未夹紧的 `camX`** 当屏幕中心，而渲染用的是夹紧后的中心 → 玩家靠近地图边缘/相机顶到边界时，玩家不在屏幕正中，投掷方向变成"屏幕中心→指针"而不是"玩家→指针"（已修：抽 `viewCenter()`，`render.draw` 与 `game.aimPoint` 共用同一夹紧中心；`tests/aim.test.js` 覆盖贴边与关卡小于视口两种情形）。
- 尸骸与驱虫器都在抢 `h.pending`：玩家 ping 一到就把猎手拉走，诱饵/驱离等于没有（已修：`Hunter.lureLock` / `repelT` 期间 `hear()` 直接拒绝玩家声源；驱离按 tag 时间戳新盖旧）。
- `Hunter._plan` 把**像素**坐标传给 `nearestOpen()`（它只收 tile）→ 目标落进墙里时返回 `null`，随后读 `open.x` 崩溃（已修：传 tile 并判空）。
- 交互曾经"靠近即触发"：钥匙自动入袋、传送门自动传送、梯口自动下行，路过就被带走；靠近未开通的门还只会刷 deny。已统一为 `interactAt()` 选最近目标 → `showInteractTip()` 浮窗 → `doInteract()` 执行，**只认 F**。浮窗位置改用 `viewCenter()` 换算（与相机同一夹紧中心），贴边不偏；传送门目的地标签的字号要除以 `scale`，否则放大/缩小后忽大忽小。
- 传送门之前固定 13/20px：远处和近处一样大，房间一多就分不清主次。现在半径 `prox = smoothstep(PORTAL.d3, max(60, PORTAL.d3 - PORTAL.fade), dist)`、`R = lerp(PORTAL.far, PORTAL.near, prox)`（当前 11 → 23 世界像素）；**两臂阶段半径恒为 far**，只有第三条臂开始淡入后才一起长大，**每一扇门在任何距离都是完整的 `drawPortalFx()` 涡旋**，粒子数随 R 从 10 加到 110（`clamp(10 + R * 1.9, 10, 110)`），旋臂用 30 段渐变细描边；第三条臂由 `arm3 = smoothstep(PORTAL.d3, PORTAL.d3 - PORTAL.fade, dist)` 淡入（当前 110/30），臂间距 `Math.PI + (TAU/3 - Math.PI) * arm3`（180° → 120°）；全局转速乘 `PORTAL.spin`（当前 3）。线宽保持 1.6（不要再乘/除 k），标签字号不变、y 用 `R + 17 * prox`。参数在 `src/portal-config.js`，改动后用 `tools/portal-tune.html` 预览；八扇门同屏实测仍 60fps，但别把原型那 300 颗粒子照搬进游戏。
- 启动自检的「消耗品」行曾复用同一个背包逐件检查 8 种道具：6 格装满后第 7 件（`bugspray`）必然报"未能入包"，开机就假红。**每件道具用一个新的 `Inventory`**，检查的才是"能不能入包/能不能消耗"，而不是"背包还有没有空格"。

### UI

- 无字 UI 重写时按钮绑定表写成 `g.retry`，而方法叫 `restart` → 三个按钮全炸（已修，并补了"五屏按钮逐个点"回归）。
- 护符副本漏了 `kind:'charm'` → `ITEM_TEXT[sleep]` 未定义 → 读取 `.name` 崩溃。
- HUD 的 SVG 图标曾因缺少 `stroke` 规则而完全不可见。
- 引导只走 `maybeGuide(key, text)`（按 `this.guides` 一局一次），**不要**直接调 `ui.guide()`；否则重开/换图会重复刷屏。
- 需要「先 A 再 B」的两段提示用 `laterGuide(key, text, ms)`（存在 `guideTimers` 里）；条件提前满足时要 `cancelGuide(key)`，`resetRunState()` 会统一 `clearGuideTimers()`。
- 标题只认空格 / 回车：`onAnyKey` 的 keyup 分支没有 event，必须判空。开局后 `beginTutorial()` 会从 `input.pressed` 删掉 Space/Enter，防止开局那一下立刻放声呐。
- 投掷引导跨背包与游戏两层 UI：绑定发生在 `ui.dropDragged()`（回调 `game.onHotkeyBound(obj)`），提示必须等 `toggleInventory` 关闭时由 `game.onInventoryClosed()` 发出——背包打开时 `.guide` 是 `visibility:hidden`，拖完就弹会被盖住。

### 启动与缓存（2026-11 新增，**这组坑最坑人**）

- 浏览器会缓存**文档本身**：旧缓存页里没有 `no-store`，普通打开根本不发请求，只有 Ctrl+F5 才更新 → 表现为“第一次打开没自检动画、还有老 bug，硬刷新就正常”。
  → `play.ps1` 现在打开 `…/?launch=<时间戳>`；`index.html` 另有 3.2 秒兜底自动重载。
- 模块也会被缓存：`python -m http.server` 不禁止缓存 → 必须用 `tools/serve.py`（全部 `no-store`）。
- 单线程 `TCPServer` 在浏览器并发加载十几个模块时会拒绝连接（白屏）→ 已改 `ThreadingTCPServer`。
- 快捷键格只是**指向背包堆叠的引用**：拖上去时如果把整堆搬出背包，第一次按键就会判定“空”并清空引用，整堆丢失。
  → `place('hot')` 只接受仍在 `pack` 里的对象；`useHotkey` 会把“孤儿堆”放回背包。

### 环境

- Windows 的 `http.server` 带 SO_REUSEADDR，**端口被占用时 bind 也会成功**，不能用 bind 判断端口是否空闲；要 TCP connect 探测。
- 无头 Edge 的 `--virtual-time-budget` 下 rAF 推进很慢，靠它截不到真实动画；要定帧请用 `debugSimulate`，要真实时间请用 `tools/live.mjs`。

---

## 8. 当前进度与下一步

### 已完成（截至 v0.8.9）

- 三张地图：房间（BSP 多房间 + 内饰 + 钥匙/出口/三扇门）、迷宫（递归回溯 + 口袋）、移动迷宫（3×3×2 块、每 20 秒抽 5 块替换为另一层布局；玩家所在块被抽中则换块，脚下网格不改写；4/6/8 出口）
- 无字 UI、护符/道具/背包/工作台、投掷与瞄准、区域名、弹幕、引导
- 地图选择窗、调试冻结/选图、单文件构建修复
- 消耗品/快捷键契约（投掷=绑定+左键，使用=按键立即生效）、时间逆流快照、死亡重开清空、图腾/复活原地
- 启动自检：带百分比的加载条，检查脚本/关卡/背包/消耗品/音色/版本
- 投掷瞄准与相机共用夹紧中心（贴边时方向 = 玩家→指针）
- 六项道具/敌人反馈：尸骸长声线锁定、无敌星接触击杀、道具靠近才定身份、扫描仪寻路、驱虫器飞行驱离、击杀统一紫线
- v0.7.22 交互统一：所有地面交互只认 F（拾取/钥匙/传送门/下行），传送门常驻显示目的地与上锁状态，靠近时一个浮窗说清按什么、会发生什么
- v0.7.24 迷宫道具刷新：8-10 个点按 BFS 深度分带、走廊格优先（至少 3 个在单格走廊里）、最小间距 5 格、避开出生点/出口/猎手
- v0.8.6 核心声线速度降为声呐的 1/3（约 186.7px/s），拖尾加长到 32 点并用连续二次曲线+渐变绘制，去掉分段节点。
- v0.8.5 核心三条声线改为在正中一格内反复反弹的永久粒子，不再从中心向外飞。
- v0.8.4 移动迷宫声线粒子化：核心三辐条改为在一格内反复反弹的粒子拖尾（修复 `coreTrails` 被 `startMap` 清空的问题）；坍塌金圈为 96 条 ghost 粒子、每面碎墙 6 条淡灰粒子、守卫死亡 40 条紫粒子；门洞改为 8 条反向半格红粒子
- v0.8.3 移动迷宫表现：b2 碎核后的金色逐圈爆散过场，拆掉中央房间内墙、扫死守卫并炸紫线
- v0.8.2 移动迷宫：3×3×2 块、20 秒一次 5/9 翻转、两层独立单格宽迷宫、玩家房间永不被改写（抽中则换另一块）、4/6/8 出口、翻转前 1 秒声音线、0.7 秒停格 + 震屏、警觉猎手 2× 速度、中心「口」/按钮、b2 彩蛋坍塌、分层 HUD 与播报
- v0.8.9 首次引导：标题常驻「摁下空格键以开始」；进入后提示声呐、第一次发声后提示左下角充能；第一次惊扰猎手提示潜行与声音；拾取护符/可用道具分别提示 Tab 装配/绑定；投掷物拖上快捷键并关背包后提示选中，选中后提示左键掷出、再按取消

### 待做（按优先级）

1. **机械地牢**：左右两半、牢门钥匙、紫色反光门、猎犬/死徒/镇守者（子弹可反弹三次）。
2. **地图连接**：`enterMapExit` 已支持 `to/require/color`；已有 room↔maze，以及迷宫右下角台阶旁 → 移动迷宫的门。移动迷宫暂无回程门，仍可从地图选择/`?map=moving` 进入。补完 21 张图的图结构后，把 `BUILT_MAPS` 逐个放开。
3. **城堡钥匙**：第一个击杀掉落（字段已留 `castleKey`，掉落逻辑未接）。
4. **吸收门**：草原门应吸收声波不再反弹（`absorb` 集合已生成，`updateRays` 未消费）。
5. **科技树**（用户已给格式：缩进父子、`名称 | 前置 | 价格 | 效果`；需先定"局外永久/局内"与货币量级）。
6. 剩余道具效果细化：驱虫器对猎犬/死徒、尸骸对死徒的特殊反应。
7. 移动端适配（触屏摇杆 + 点击发声）。

### 新增一张地图的最小步骤

1. `src/maps.js`：在 `MAPS` 里加节点（`id/name/sub/kind`），并加入 `MAP_ORDER`。
2. `src/worldgen.js`：写 `buildXxxMap(seed)`，返回 `{w,h,grid,tile,spawn,key,exits,absorb,monsters,loot}`，保证 `mapConnected(level) === true`。移动迷宫这类自管状态的图另加 `moving`/`blocks`，并让 `writeMovingBlock` 只原地改网格。
3. `src/game.js`：`startMap()` 里按 `node.kind` 选择生成器；把 id 加进 `BUILT_MAPS`。
4. `node tools/printmap.mjs` 肉眼看图 + `npm test` + `node tools/playtest.mjs`。
5. `CHANGELOG.md` 记一条，提交并打 tag。

---

## 9. 版本与提交约定

- 语义化版本 `v0.x.y`，**每个可见改动都打 tag**，并在 `CHANGELOG.md` 写"改了什么 + 为什么"。
- 提交信息用 `fix:` / `feat:` / `docs:` / `perf:` 前缀，一句话说清根因（例：`fix: rewind revived into a stale floor`）。
- 提交前检查：`npm test` 79/79、`playtest` 无异常、`dist` 已重建（`node tools/build.mjs`）。
- 截图不进仓库（`.gitignore` 忽略 `shots*/`），README 用的图放 `docs/img/`。

---

## 10. 五分钟上手清单

```bash
cd C:\Users\浩\Desktop\ni
npm test                       # 79 项应全绿
node tools/build.mjs           # 重建 dist
play.cmd                       # 自动选端口、不缓存、带自检
```

想直接看某张图：

```
http://127.0.0.1:8080/?map=maze&seed=777&static=1
http://127.0.0.1:8080/?map=room&seed=1234&static=1
http://127.0.0.1:8080/?map=moving&seed=1234&static=1
```

想在控制台里改状态：

```js
const g = window.__hush;
g.startMap('room', 42);
g.inv.addCharm('rewind');       // 进背包
g.inv.showInventory?.();        // 或用 Tab
g.debugInvincible = true;       // 调试无敌（~ 也会开）
```

遇到"改了没反应"：先 `node tools/build.mjs`，再 Ctrl+F5，再看 `dist/hush.html` 的控制台报错。

- 声线是粒子拖尾；`soundTrails`/`coreTrails`/ghost `rays` 都不是静止线。
