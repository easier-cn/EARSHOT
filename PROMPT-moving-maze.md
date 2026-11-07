# HUSH「移动迷宫」实现任务书 v3

> 这份文档是**给另一个对话里的实现者 AI 的完整任务书**。v3 在你（策划）逐条拍板后定稿：**20 秒一次翻转指令、每次从 9 块里抽 5 块、层界画常驻红色声线、每块一只猎手（共 18 只）、保留 3×3×2 与中心核心房**。技术栈、现状速查、接入点、坑位部分继续有效。
> 阅读顺序：先看 §1 技术栈，再看 §2 现状速查，然后从 §5 开始按顺序实现。

---

## 0. 你的角色与交付物

你是一名在既有代码库里工作的实现工程师。仓库是 `C:\Users\浩\Desktop\ni`，游戏叫 **HUSH**（声呐潜行游戏，全黑画面，靠声呐回波看路，猎手听声抓人）。

你要交付的是**一张新地图**：`moving`（移动迷宫）。它已经出现在地图选择里很久了（`src/maps.js:25`，`kind: 'moving'`），但一直没有生成器和玩法。

**验收的唯一标准**：`npm test` 全绿、`node tools/playtest.mjs` 输出 `errors: []`、`node tools/build.mjs` 成功、在浏览器里能完整通关（正常通关 + 彩蛋各一次）、连续翻转 3 分钟无报错。

**不要做的事**：
- 不要引入任何依赖、框架、构建工具、TypeScript。
- 不要改动其他地图（room / maze）的现有行为。
- 不要删掉已有的调试入口（`?map=`、`?debug`、`window.__hush`）。
- 不要用 `Math.random()` 做地图生成（可复现性会被测试卡住）。
- 不要在文档里写"待补充"——要么实现，要么在 §19 里明确标注为待确认假设。

---

## 1. 技术栈（不可协商）

| 层 | 选型 | 现状 |
| --- | --- | --- |
| 语言 | 原生 JavaScript，ES Modules（`import` / `export`），无转译 | 浏览器直接加载 `src/main.js` |
| 渲染 | Canvas 2D，单 canvas，全量重绘 | `src/render.js` |
| 音频 | WebAudio，全程序化合成，零音频文件 | `src/audio.js`（`AudioEngine`） |
| 存档 | `localStorage` | `src/game.js` |
| 测试 | Node 内置 `node --test`，断言库 `node:assert/strict` | `tests/*.test.js` |
| 打包 | `tools/build.mjs` 把模块按顺序**内联**成单文件 `dist/hush.html` | 无 bundler |
| 依赖 | **零**（`package.json` 无 dependencies） | — |
| 风格 | 2 空格缩进、单引号、分号、短函数、大量行内注释解释"为什么" | — |

三条硬约束，违反任何一条都算失败：

1. **新模块必须注册进 `tools/build.mjs` 的 `MODULES` 数组**（当前 18 个模块，按依赖顺序排列）。单文件构建器只做字符串内联 + 只去重「同名同值单行 const」，不会处理新文件的 import。
2. **版本号三处同步**：`package.json` 的 `version`、`index.html` 里 `src/main.js?v=0.7.24`、`src/selfcheck.js:7` 的 `export const VERSION`。本次升到 `0.8.0`。
3. **存档/回溯只能靠 seed 重建**：`snapshotEntry` 只存背包/钻石/金币/生命，`restoreEntry` 用 `startMap(mapId, mapSeed)` 重开。所以移动迷宫的**初始状态必须完全由 seed 决定**；运行中的翻转相位不进存档。

---

## 2. 现状速查

### 2.1 模块与打包顺序（`tools/build.mjs:14-33`）

```
src/util.js → src/pathfind.js → src/levelgen.js → src/rooms.js → src/maps.js
→ src/worldgen.js → src/entities.js → src/input.js → src/audio.js
→ src/chambers.js → src/loot.js → src/desc.js → src/selfcheck.js
→ src/render.js → src/editor.js → src/ui.js → src/game.js → src/main.js
```

生成器放在 `src/worldgen.js`（`room` / `maze` 的生成器都在这里，`buildMazeMap` 在 `src/worldgen.js:473-551`）。

### 2.2 level 数据契约（生成器必须返回这个形状）

```js
{
  mapId, w, h, tile: TILE,        // TILE = 16（像素）
  size: { w, h },
  grid: Uint8Array(w * h),        // 1 = 实心, 0 = 可走；索引 ty * w + tx
  rooms,                          // 数组，可为空
  spawn: {x, y},                  // 像素坐标
  spawnTile: {x, y},              // tile 坐标
  key: null,                      // 移动迷宫没有钥匙
  exit: null,                     // 没有传统出口
  exitTile: null,
  exits: [],                      // 传送门：{ to, x, y, require, color, silent? }（tile 坐标）
  absorb: [],
  monsters: [],                   // { x, y, type }（tile 坐标）
  loot: [],                       // { x, y, id }（tile 坐标）
  seed,
  valid: true,
}
```

注意：`grid` 是 `Uint8Array`，**不能被替换引用**——射线、投掷物、猎手移动都会缓存它的地址（已在坑位表里）。要换布局只能**原地写回**。

### 2.3 必须接入的位置

| 位置 | 说明 |
| --- | --- |
| `src/game.js:415` `startMap(id, seed)` | 现在是 `node.kind === 'maze' ? buildMazeMap : buildRoomMap`，要加 `'moving'` 分支 |
| `src/game.js:19` `BUILT_MAPS` | `new Set(['room','maze'])` → 加 `'moving'`，否则传送门一律 deny |
| `src/game.js:1875` `updateRays(dt)` | 声呐逐 6px 步进、`isSolid()` 判墙、命中处 push `contacts` |
| `src/game.js:851` `updateThrows(dt)` | 投掷物逐 6px 步进，**打碎核心墙的判定要加在这里** |
| `src/game.js:1783` 附近 | 玩家移动用 `moveCircle(L.grid, L.w, L.h, L.tile, ...)` |
| `src/render.js:101` `draw(game)` | 渲染入口（世界坐标 + 相机，`viewCenter` 夹紧，`fit()` 保证 zoom） |
| `src/ui.js` `updateHUD({...})` | HUD 更新，本次要加"当前层" |
| `src/selfcheck.js:17-21` `AUDIO_VOICES` | 新增的音频方法名必须加进这个数组，否则自检失败 |

### 2.4 命令

```bash
npm test                      # 9 个测试文件（显式列在 package.json 的 test 脚本里，新文件要加进去）
node tools/playtest.mjs       # 结尾必须是 errors: []
node tools/build.mjs          # 产出 dist/hush.html
node tools/printmap.mjs       # 终端画地图（目前硬编码 buildRoomMap，可扩展支持 moving）
node tools/perf.mjs           # 帧耗时
npm run serve                 # 本地静态服务；Windows 双击 play.cmd（全 no-store）
```

调试入口：`?map=moving&seed=42`、`?debug`；控制台 `window.__hush.startMap('moving', 42)`。

---

## 3. 玩法目标（一句话）

在一个 3×3×2 的方块迷宫里，**你永远站在某一层**；每个方块都是一部电梯，会随机把你送到另一层，而楼层一换，方块内部的路就变了。你要找到对角方块在另一层的按钮，按下去，让迷宫停摆。

---

## 4. 规则原文（玩家的设定，逐条实现，不要自行发挥）

1. 尺寸 **3 行 × 3 列 × 2 层**，共 18 个迷宫块。块用 `a1..c3`（行 = a/b/c，列 = 1/2/3）编号。
2. 每个块与相邻块通过**两个固定点位**相通；块内所有门彼此连通，所以**永远不会把路封死**。
3. 门位固定，翻转后**形状不变**：宏观拓扑不变，只是"不同的地图块组合"。
4. 每 **20 秒**发出一次"翻转指令"：从 9 个块里**随机抽 5 块**，被抽中的块**一定**翻转（没有二次概率）。核心已被打碎的块不参与抽签。
5. **所有房间都是电梯井**，只是有几率翻转。
6. 每个块的正中心都有一个 **3×3 的中心房间**（开放、可走）；房间**正中那一格**被四面**无厚度**的墙围成一个"口"，口里是一团不停反弹的声线（永不消失，拖尾持续衰减）。
7. 声线颜色区分层：**一层的声线比二层的浅**；中心块 `b2` 的声线必须是**金色**。
8. **投掷物可以打碎中心房的墙**（玻璃破碎声），任何块都行。打碎后**该块停止翻转**。
9. 打碎 `b2` 的金色中心：整屏剧震 + 全体翻转一次 + 播报"到达 -1 层" → 全图停摆 → **除 b2 以外所有块消失** → 走 b2 任意出口进入**实验室**（未实装）。
10. 正常通关：玩家从 `maze` 的传送门落在**四个角落块之一**的中心房里；**三维对角块**（例：入口 a1 一层 → 目标 c3 二层）的中心装饰弹出**按钮**；按下后停摆 + b2 消失 + `a2/b1/b3/c2` **朝向 b2 的门**变成前往**机械地牢**的传送门（未实装）。
11. 播报：电子合成音"已到达 x 层" + 左下角文字提示。只在两种时机播报：(a) 玩家所在块被抽中并翻转后；(b) 打碎 b2 中心时。玩家初始层级为**一层**。
12. **层界红线**：相邻两块层级不同时，它们共享的那条边上画一条**常驻**红色声线（不是只有翻转瞬间才出现）。红线是"你正跨在两层之间"的永久提示，玩家靠它判断自己站在哪一层的边界上。
13. **每个块里都有 1 只猎手，共 18 只**（聋巡逻型 `lurker`：平时在自己的块里游荡，听到声音才追）。

---

## 5. 核心数据模型（先把这块定死，后面都围绕它写）

**只用一张物理网格，不要做两层数组。**

```
TILE   = 16      // 已有常量
PITCH  = 24      // 相邻块原点间距（块 25×25，边界共享 1 行/1 列）
N      = 3       // 3×3
W = H  = N * PITCH + 1 = 73     // 73 × 73 tile = 1168 × 1168 px
```

`layer`（层）**不是物理图层，而是每个块自己的状态位 `z ∈ {0,1}`**：

- `z = 0` → 一层，核心声线是浅色；
- `z = 1` → 二层，核心声线是深色；
- 玩家的"当前层" = 玩家所在块的 `z + 1`；
- 翻转块 = `z ^= 1`，然后把该块在这一层的内部布局写回网格。因为两套布局的门位、环廊、中心房完全一样，**路永远不会被堵死**；变的只是内部迷宫走法。

这样"电梯井"的设定是成立的：你站在一个块里，块翻了，你所在的这一层就变了（人被电梯带走），但房间轮廓没变——变得是窗外（内部路径）。所有规则（4、5、9、11）都能直接落到这一张网格上。

```js
// level.mc —— 移动迷宫专用数据，挂在 level 上，不污染其他地图
level.mc = {
  pitch: 24, n: 3,
  blocks: [ /* 9 个，索引 i = r * 3 + c，r/c 从 0 开始 */ ],
  spawnBlock: 0,        // 角落块索引（0,2,6,8 之一）
  targetBlock: 8,       // 三维对角块（spawnBlock 的 (2-r, 2-c)）
  targetLayer: 1,       // 目标层（z 值），= 1 - spawn 的初始 z；玩家初始 z=0，所以目标 z=1
  flipT: 4.0,           // 首次翻转倒计时（第一次先给玩家看清房间）
  flipPeriod: 20.0,     // 之后每 20 秒发一次翻转指令
  state: 'running',     // 'running' | 'cleared' | 'collapsed'
  rng: mulberry32(seed ^ 0x9e3779b9),   // 翻转用的可复现随机源
  portals: [],          // 通关/彩蛋后动态生成的传送门
};

// 单个块
{
  r, c, i,
  ox, oy,               // 块原点（tile 坐标）= (c*pitch, r*pitch)
  z: 0,                 // 0 = 一层, 1 = 二层
  variants: [Uint8Array(25*25), Uint8Array(25*25)],  // 两套 25×25 布局
  decor: ['spark', 'spark'],   // 与 variants 一一对应：'spark' | 'none' | 'button'
  core: {
    x: ox + 11, y: oy + 11,   // 3×3 中心房的左上角（开放房间）
    cell: { x: ox + 12, y: oy + 12 },  // 正中那一格 = 口（四面无厚度墙围住的单格）
    broken: false,            // 口 被打碎 → 该块停止翻转
    spark: { x, y, dx, dy, trail: [] },   // 只在 decor === 'spark' 时推进
  },
  label: 'a1',          // 调试用
}
```

**`composeGrid(level)`**：把 9 个块的 `variants[z]` 原地写回 `level.grid`（每块 625 tile，9 块共 5625 次写入，一次翻转的开销可以忽略）。**必须原地写，不能 `level.grid = ...`**。

**玩家的层**：每帧由 `blockAt(player)` 的 `z` 推出，不要单独存一份 `playerFloor`，避免不同步。

---

## 6. 几何（每块 25×25）

以块原点 `(ox, oy)` 为基准，局部坐标 `lx = x - ox`、`ly = y - oy`：

```
ly\lx  0  1  2  3 ... 21 22 23 24
  0    #  #  #  #  #  #  #  #  #     ← 边框（实心，含门洞）
  1    #  .  .  .        .  .  .  #
  2    #  .  .  .        .  .  .  #     ← 外环走廊 2 格宽（恒开）
  3    #  .  ?  ?  ...   ?  ?  .  #
 12    #  .  ?  ?  .  口  .  ?  ?  .  #   ← 正中 1 格 = 口
 21    #  .  ?  ?  ...   ?  ?  .  #
 22    #  .  .  .        .  .  .  #
 23    #  .  .  .        .  .  .  #
 24    #  #  #  #  #  #  #  #  #     ← 边框
```

| 区域 | 局部范围 | 规则 |
| --- | --- | --- |
| 边框 | lx 或 ly ∈ {0, 24} | 实心；**只有门洞是 0** |
| 外环走廊 | lx/ly ∈ {1,2} 或 {22,23} | **恒开**（两套布局完全一样），保证任意两个门互通 |
| 内部迷宫 | lx, ly ∈ [3, 21]（19×19） | 两套布局在这里不同；翻转只改这一块 |
| 中心房 | lx, ly ∈ [11, 13]（3×3） | **8 格可走**的开放房间，与内部迷宫连通；两套布局一样 |
| 口（装饰格） | lx = 12 且 ly = 12（正中 1 格） | `spark` / `button` 时 grid 写 1，但渲染只画 1px 的四条边线；`none` 时是 0 |

**门位（硬编码常量，相邻块必须一致）**：每条边 2 个门，位于该边中段的 1/4 和 3/4 处：

```js
// 局部偏移：门在边框那一格上开一个 1 tile 的洞
// 上边 (ly=0):  lx = 6, 18
// 下边 (ly=24): lx = 6, 18
// 左边 (lx=0):  ly = 6, 18
// 右边 (lx=24): ly = 6, 18
```

因为块间距是 24、块宽 25，相邻两块**共享同一条边框**（块 (0,0) 的 lx=24 就是块 (0,1) 的 lx=0）。两块各自把这条边写成"实心 + 同样两个洞"，结果一致，不会出现双墙或错位。

**角落块的外侧边**（比如 a1 的左边和上边）：照样是实心 + 门洞，但门外是地图边界 → 做成装饰性死路（走过去撞墙，声呐会画出洞的形状），不要通向虚空。

---

## 7. 生成算法

### 7.1 `buildMovingMap(seed)`（写在 `src/worldgen.js`）

```js
export function buildMovingMap(seed) {
  const rng = mulberry32(seed);
  const W = 73, H = 73, grid = new Uint8Array(W * H).fill(1);
  const blocks = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    blocks.push(makeBlock(rng, r, c));
  }
  // 选入口角落：用 rng 从 [0,2,6,8] 里挑一个（玩家从 maze 的传送门落在这里）
  // 目标块 = 对角 (2-r, 2-c)
  // 逐块写回 grid
}
```

### 7.2 `makeBlock(rng, r, c)` —— 每块生成两套布局

对 `v = 0, 1` 各跑一次：

1. **铺底**：局部 25×25 全部填 1（实心）。
2. **挖边框门洞**：四条边按 §6 的门位挖 0。
3. **挖外环**：lx/ly ∈ {1,2} 或 {22,23} 的格子全部置 0（2 格宽的矩形环路）。
4. **挖内部迷宫**：在 19×19（lx,ly ∈ [3,21]）里放一个 9×9 的"格心"迷宫——每个格占 2×2 tile，格与格之间是 1 tile 的墙：
   - 偶数坐标 `lx = 3 + 2*i` 是格心，`lx = 4 + 2*i` 是它的第二格；
   - 用递归回溯（和 `buildMazeMap` 同一个套路）打通相邻格心之间的墙；
   - **编织（braid）**：随机拆掉 15% 的剩余墙，让迷宫有环（中心房压上去之后不容易断）；
   - 从迷宫边界向环廊打 8 个接口（每条边 2 个，位置和门位错开）。
5. **压中心房**：把 3×3（lx,ly ∈ [11,13]）整片写成 0，做成开放房间（8 格可走，与迷宫连通）；正中那一格（12,12）按 `decor` 处理：`spark`/`button` → 写 1（口 的四面墙），`none` → 保持 0。
6. **连通修复**：对整块 25×25 做一次 BFS，从 (1,1) 出发；如果有 0 的格子不可达，就在它和最大连通块之间凿开一格墙，重复最多 20 次。修不好就换一个子 seed 重来（`rng` 继续往下取即可）。
7. 把结果存进 `variants[v]`。

**两套布局的差异**：只有第 4 步的迷宫不同（用 `rng` 的不同偏移）。第 1、2、3 步和中心房 3×3 必须逐格一致；正中那一格允许不同（`spark` / `none` / `button`），因为那是装饰，不是路。测试对比"除装饰格以外全部相同"。

> 为什么内部用 2×2 的格心而不是 1×1：19×19 如果用 1 tile 走廊，看起来像密集的痒疹，声呐一次只能照出几格；2×2 的格心 + 1 格墙，走廊视觉宽度和现有一格走廊接近，但块的大小撑得住 25×25。

### 7.3 入口与目标

- 入口块 = 四角之一（`rng` 选），`spawnTile = (core.cell.x, core.cell.y + 1)`（中心房南侧那格，**不要落在正中那一格上**），`spawn` = 该 tile 的像素中心。
- 所有块初始 `z = 0`。
- 目标块 = `(2 - r, 2 - c)`，`targetLayer = 1`。
- **玩家不是"出生"，是从 `maze` 的传送门落进来的**：不送石子、不做密封教学。中心房是开放房间，落地后直接能走出去。
- 目标块的两层装饰：
  - `z = 0` → `decor = 'none'`：3×3 是一间**空房间**，正中一格可走，没有任何能砸的东西；
  - `z = 1` → `decor = 'button'`：正中一格是按钮基座（实心 + 呼吸圆环），只能按、砸不碎。
  因为"能砸的只有 `spark`"，目标块从结构上就不可能被砸锁死，不需要任何例外逻辑。

### 7.4 loot 与猎手

- loot：6 个，只放在**外环走廊**上（四个角各 1 个 + 两条边中点各 1 个），间距 ≥ 6 tile，避开入口块的中心房。id 从 `['pebbles', 'vitamin', 'totem']` 里按 rng 取。
- 猎手：**每个块恰好 1 只 `lurker`，共 18 只**（v3 由策划拍板）。出生点放在该块外环走廊的随机空格，`speedCap` 用 76（和 maze 一致），初始 `home` 就是自己的块；巡逻/游荡都限制在自己块内（`_lurk` 选点时过滤 `blockAt(tile) === 自己`）。中心房是开放的，猎手理论上能进——`_plan` 的目标点里排除中心房 3×3（让按钮旁边保持"绝对安全"），这个排除要在注释里写清理由。
- `level.key = null`、`level.exit = null`、`level.exits = []`。现有代码里有直接读 `level.exit.seenAt` 的地方（`src/render.js`），**必须加空值判断**，否则一进图就崩。

---

## 8. 翻转系统

每帧在 `game.update(dt)` 里（`state === 'playing'` 时）跑：

```js
mc.flipT -= dt;
if (mc.flipT <= 0) { mc.flipT = mc.flipPeriod; issueFlipCommand(); }

function issueFlipCommand() {
  // v3：每次指令从 9 块里抽 5 块，抽中的一定翻；核心已碎的块不参与抽签。
  // 池子不足 5 块（碎得太多/停摆）时，把剩下的全翻。
  const pool = mc.blocks.filter((b) => !b.core.broken && !b.gone);
  shuffle(pool, mc.rng);
  const picks = pool.slice(0, 5);
  for (const b of picks) flipBlock(b);
  if (picks.length) { audio.swapRumble(); shake += 2; }
}

`flipBlock(b)`：

1. `b.z ^= 1`。
2. `composeBlock(level, b)`：把 `b.variants[b.z]` 原地写进 `level.grid` 对应的 25×25 区域。
3. **如果玩家在这个块里**：
   - 若玩家脚下的新 tile 变成实心 → 找最近的空格（半径 4 格内 BFS，函数 `nearestOpen` 在 `src/pathfind.js:155`，返回 tile 坐标）；找不到就退回外环走廊最近的格子。挪位时 `flash = 1`、`shake = max(shake, 3)`、`invulnT = 0.6`，并发一次能被听见的噪声（`stepEcho`，半径 215），让猎手有机会循声而来。
   - 播报 `announceFloor(b.z + 1)`。
4. 如果猎手在这个块里：同规则挪位，并清空 `path` / `pending` / `state = 'idle'`。
5. 清空 `this.rays` 和 `this.contacts`（避免旧回波挂在新墙上）。

**性能**：一次 flip 只重写 625 个格子 + 重建 9 块中的 1 块，不需要重建整张图。不要每帧 `composeGrid`。

**暂停**：`Esc` 暂停时 `update` 不被调用，`flipT` 自然不推进，不需要额外处理。

---

## 9. 中心房与"停摆"

### 9.1 弹跳声线（纯渲染，不影响玩法）

每个核心内部有一团声线在**正中那一格（口）里**来回弹。因为这一格在 grid 里是实心的，声呐会沿着它的四条边刷出 contacts——**这就是"口"的来源**：四条边线由回波自己画出来，不需要额外画墙；我们额外画的只是那团线。

```js
// 每帧
const s = b.core.spark;
const box = { x: b.core.cell.x * TILE, y: b.core.cell.y * TILE, w: TILE, h: TILE };
s.x += s.dx * 140 * dt; s.y += s.dy * 140 * dt;   // 世界像素
if (s.x < box.x) { s.x = box.x; s.dx *= -1; }
if (s.x > box.x + box.w) { s.x = box.x + box.w; s.dx *= -1; }
// y 同理
s.trail.push({x: s.x, y: s.y});
if (s.trail.length > 14) s.trail.shift();
```

渲染：把 `trail` 画成一条逐段变暗的折线（`globalAlpha` 从 0.55 降到 0），再画一个 2px 的点。颜色：
- `z = 0`（一层）：`'127, 227, 212'`（浅青，就是现有声呐的色）
- `z = 1`（二层）：`'70, 150, 160'`（压暗一档）
- `b2`：`'255, 200, 90'`（金色，任何层都不变）

这团线**不会因为玩家走远而消失**，它就是"这家店里还有人"的信号。

### 9.2 打碎核心墙

在 `updateThrows(dt)` 的 6px 步进循环里，在"撞 tile 墙"判定**之前**加：

```js
const hit = coreHitAt(this.level, nx, ny);   // 落在某个块的 口 那一格上，返回该块；否则 null
if (hit) {
  if (hit.core.broken) { /* 已碎：投掷物照常飞过去 */ }
  else {
    breakCore(this, hit);        // 见下
    hitWall = true;              // 投掷物停在这里
    break;
  }
}
```

`coreHitAt(level, x, y)`：把世界像素转成 tile，对 9 个块判断它是不是**正好等于 `b.core.cell`**，并且 `b.decor[b.z] === 'spark'`。是就返回这个块；`decor` 是 `none` / `button` 的块，投掷物直接穿过去（没有可砸的东西）。

`breakCore(game, b)`：

1. `b.core.broken = true;`
2. 把 `b.core.cell` 这一格的 grid 写回 **0**（口 碎了，这一格从此可走），同时 `composeBlock` 之后要记得跳过它，不要被后来的重组又写回 1。
3. `game.audio.glassBreak()`（新建：短促的高频噪声 + 3 个下滑的玻璃泛音）。
4. `game.ui.feed('中心碎了。这一间不再动了。')`、`flash = 1`、`shake = max(shake, 4)`。
5. 该块声线熄灭（`spark` 停止推进，渲染成灰白余烬）。
6. 没有"例外块"：目标块的两层都没有 `spark`（一层 `none`、二层 `button`），所以永远砸不到它。

### 9.3 入口

正常流程到不了这张图，所以要在 `maze` 里接一个入口：在 `buildMazeMap` 的 `exits` 里加一条

```js
{ to: 'moving', x, y, require: null, color: '255, 90, 90', silent: false }
```

`x, y` 取一个离出生点 BFS 深度 ≥ 12 的口袋格。玩家走进去 → `enterMapExit` → `startMap('moving', seed)` → 落在 `spawn`（角落块中心房南侧那格）。如果你不想动 maze，至少保证 `?map=moving` 能进；`BUILT_MAPS` 必须包含 `'moving'`。

---

## 10. 正常通关（按钮）

- 目标块二层（`decor === 'button'`）的正中一格上挂按钮；一层是 `none`，什么都不给。所以"按钮只在那块翻到二层时存在"是由 variant 天然决定的，不需要运行时判断。
- 视觉：核心中央浮出一个 6px 的圆环 + 一条竖线（像电梯按钮），颜色 `'255, 240, 200'`，带 1.2s 的正弦呼吸。
- 交互：复用 `interactAt()` / `doInteract()`——新增一种目标 `{ kind: 'mcButton', block, x, y }`，判定半径 44px，`F` 触发。
- 按下后 `solveMoving(game)`：
  1. `mc.state = 'cleared'`，所有块停止翻转。
  2. `b2` 消失：把块 (1,1) 的 25×25 区域全部写成 **1**（实心），并从 `mc.blocks` 的逻辑里标记 `gone = true`；渲染时跳过它。
  3. 在 `a2/b1/b3/c2` **朝向 b2 的那两个门位**上放传送门：构造 `game.mapExits.push({ x, y, to: 'mech', require: null, color: '200, 160, 255', built: true, silent: false })`，字段照 `startMap` 里 `mapExits` 的现有写法。共 8 个门（4 块 × 2 门），只放贴着 b2 的那一侧。
  4. 播报 `announceFloor(-1)`？不要——这里播"迷宫停摆"的提示音：`ui.feed('整座迷宫停下来了。')` + 低频长音 `mc.stopped()`。
  5. `mech` 未实装 → 走现有 `enterMapExit` 的 deny 分支，提示"机械地牢尚未开启"。**不要**为了这个去实现机械地牢。

---

## 11. 彩蛋（打碎 b2 的金色中心）

`breakCore` 里检测 `b.i === 4`（b2）：

1. `b.core.broken = true`，金色的 口 整格炸开（四条边同时崩，一次大半径的 `spawnRays`，色 `'255, 200, 90'`，`count: 120`）。
2. `shake = 14`、`flash = 1`，持续 1.4s 的 `b2Quake()` 低频轰鸣。
3. **全体翻转一次**：所有块 `z ^= 1` 并重组（包括已碎的块——这是唯一一次"死了的块也会动"）。
4. 播报 **"已到达 -1 层"**（`announceFloor(-1)`，音频走下行三音）。
5. 1.4s 后进入 `mc.state = 'collapsed'`：
   - 除 b2 外的 8 个块区域全部写成 1（实心，视觉上是虚空）。
   - `render` 只画 b2 的 25×25 区域和玩家，其余全黑（背景本来全黑，所以"消失"= 什么都不画）。
   - b2 的 8 个门位变成传送门 `to: 'lab'`，`color: '255, 200, 90'`；进 `enterMapExit` 后 deny"实验室尚未开启"。
6. 玩家被限制在 b2 内：`moveCircle` 天然会被四周的实心挡住，不需要额外夹紧。

---

## 12. 渲染（`src/render.js` 的 `draw(game)`）

新增，全部在 `if (game.mapMode === 'moving')` 里：

1. **口**：在 `core.cell` 那一格的四条边上画 1px 线，色 `rgba(255,255,255,0.10)`。这一格在 grid 里是实心的，声呐会自己把四条边刷出来；这里补的是"没打声呐时也隐约看得见"的底光。`decor === 'none'` 的块不画。
2. **弹跳声线**：§9.1 的 trail 折线 + 端点。
3. **门**：门位画一个小缺口标记（两条 4px 的横线，色 `rgba(255,255,255,0.16)`），让玩家知道"这边能过去"。
4. **按钮**：§10 的呼吸圆环。
5. **传送门**：复用现有 `mapExits` 的圆环 + 目的地文字。
6. **层界红线（常驻）**：遍历相邻的块对（含角落块的外侧边），只要两块的 `z` 不同，就沿它们共享的那条边画一条红线：色 `rgba(255, 70, 70, 0.16 + 0.07 * Math.sin(now * 1.6))`、线宽 1.2px、门位处断开 1 格。**静止时也在**，翻转后立刻按新的 `z` 重算。这就是规则 12 里"交界处的红色声线"，它和下面第 7 条的翻转红环是两回事，别合并。
7. **翻转瞬间**：以翻的那个块为中心，一圈红色环（`'255, 70, 70'`，半径 0→380px，0.5s 内衰减），并让该块范围内的 contacts 全部染红。这是"你被电梯带走了"的唯一即时信号——很重要，别省。
8. **停摆后**：`state !== 'running'` 时不再画红环；层界红线保留（`gone` 的块跳过不画）。

---

## 13. 音频（`src/audio.js`，全部程序化合成）

| 方法 | 用途 | 合成要点 |
| --- | --- | --- |
| `floorChime(n)` | 播报"已到达 n 层" | 两个方波音，n=2 用 660→990Hz；n=1 用 520→780Hz；n=-1 用 300→200Hz。每个 90ms，间隔 60ms，`send` 0.25（带一点混响感） |
| `swapRumble()` | 翻转指令 | 120→40Hz 的正弦下滑 1.1s + 一记金属 clank（`noise` + 带通 1800Hz，30ms） |
| `glassBreak()` | 核心碎裂 | 40ms 白噪声 + 3 个 2400/3100/4200Hz 的短泛音，快速衰减 |
| `b2Quake()` | b2 彩蛋 | 30Hz 正弦 + 低通噪声，1.4s，`gain` 0.35 |
| `mcStopped()` | 通关停摆 | 220Hz 长音 1.6s + 渐弱 |

五个方法名都要加进 `src/selfcheck.js:17-21` 的 `AUDIO_VOICES`，否则自检会报缺方法。所有音都要过 `_route(node, pan, send)`，pan 用 `(x - player.x) / 400` 夹紧。

---

## 14. UI（`src/ui.js` + `style.css`）

1. **层指示**：`updateHUD({ ..., floor })` → HUD 左侧加一行 `第 1 层` / `第 2 层` / `-1 层`。`floor` 为 `undefined` 时隐藏（其他地图不受影响）。
2. **播报**：`announceFloor(n)` 在左下角弹一块大字（`#hud-announce`），文字"已到达 1 层"，2.2s 后淡出；同时 `ui.feed(...)` 留一条日志。
3. **首次进入**：`ui.guide('这些房间都在动。去对角那一间的二层。')`，只在 `seed` 首次进入时显示（用一个模块内 `let seenIntro = false` 即可，别写进存档）。
4. **停摆/塌陷**：`ui.feed('整座迷宫停下来了。')` / `ui.feed('脚下空了。')`。

样式：`.hud-announce` 用等宽字体、`letter-spacing: 0.18em`、色 `#dff7f2`，带一条 1px 的下划线；`#hud-floor` 放在 `hud-left` 里，字号 11px，色 `#7fe3d4`。

---

## 15. 文件级改动清单

| 文件 | 改动 |
| --- | --- |
| `src/worldgen.js` | 新增 `buildMovingMap(seed)`、`makeBlock()`、`composeBlock()`、`coreHitAt()`、`blockAt()`；导出给 game/render 用 |
| `src/game.js` | `BUILT_MAPS` 加 `'moving'`；`startMap` 加分支；`mc` 状态挂在 `this` 上；`update()` 里推进 `flipT`、spark；`updateThrows` 加核心判定；`solveMoving` / `collapseB2` / `announceFloor`；`interactAt` 加按钮目标 |
| `src/render.js` | `draw()` 里加 moving 分支（核心/声线/门/按钮/翻环/停摆）；`level.exit` 空值判断 |
| `src/audio.js` | 五个新方法 |
| `src/selfcheck.js` | `AUDIO_VOICES` 加五个名字；`VERSION` 改 `0.8.0` |
| `src/ui.js` | `updateHUD` 支持 `floor`；`announceFloor`；`#hud-announce` |
| `style.css` | `.hud-announce`、`#hud-floor` 等新样式 |
| `src/maps.js` | 若 `moving` 的 `sub` 文案要更新，改这一处；`kind` 已是 `'moving'` |
| `tools/build.mjs` | 若新增文件，加进 `MODULES`（**推荐不新增文件**，全部塞进 worldgen/game，省掉打包风险） |
| `package.json` | `version` 0.8.0；`test` 脚本加 `tests/moving.test.js` |
| `index.html` | `src/main.js?v=0.8.0` |
| `CHANGELOG.md` / `README.md` / `docs/DEVELOPMENT.md` | 见 §17 |

**推荐不新建模块**：把生成器放 `worldgen.js`、运行逻辑放 `game.js`，可以完全绕开 `MODULES` 顺序和单文件打包的坑。

---

## 16. 测试（`tests/moving.test.js`）

用 `node:test` + `assert/strict`，直接调 `buildMovingMap`，不要起浏览器：

1. **尺寸**：`w === 73 && h === 73`，`blocks.length === 9`。
2. **确定性**：同一个 seed 生成两次，`grid` 逐字节相等。
3. **形状不变**：对每块，`variants[0]` 与 `variants[1]` 的差异**只允许**出现在内部迷宫区（局部 3..21），**除了正中装饰格 (12,12)**。边框、外环、中心房 8 格必须逐格相同。
4. **门**：每块的 8 个门位（含角落块的外侧门位）都是 0，且门内侧一格也是 0。
5. **连通**：从 `spawnTile` BFS，能到达全部 9 个块的外环（任取每块 (1,1) 即可）。
6. **翻转不封路**：连发 40 次翻转指令（用 `mc.rng`，即 200 次块翻转），每次之后都重跑一次连通检查。
7. **中心房**：每块 3×3 里除正中一格外的 8 格全是 0；正中一格在 `spark`/`button` 时是 1、`none` 时是 0。
8. **停摆**：把某块 `core.broken = true` 后连翻 20 次，`grid` 不变。
9. **按钮**：`targetBlock === (2-r)*3 + (2-c)`，`targetLayer === 1`；目标块 `decor` 必须是 `['none','button']`，且一层没有任何 `spark` 格（砸不到）、二层按钮可交互。
10. **通关**：调 `solveMoving`，b2 区域全 1，`mapExits` 里有 8 个 `to === 'mech'` 的门。
11. **彩蛋**：调 `collapseB2`，`state === 'collapsed'`，除 b2 外全 1，传送门 `to === 'lab'`。
12. **指令节奏（v3）**：`mc.flipPeriod === 20`；一次 `issueFlipCommand()` 在 9 块都完好时**恰好翻 5 块**（记录翻前 `z` 数组，翻后比对差集长度）；把 3 块标记 `core.broken = true` 后再发一次，只翻 5 块、且这 3 块 `z` 不变；再标记 4 块（剩 2 块可翻）后发一次，只翻这 2 块。
13. **猎手（v3）**：`monsters.length === 18`；每块恰好 1 只；每只的 tile 都落在自己的块范围内；`type === 'lurker'`。

测试里不要依赖 `Date.now()` 或真实帧率；`flipT` 手动减。

---

## 17. 验收

```bash
npm test                      # 全绿（含新文件）
node tools/playtest.mjs       # errors: []
node tools/build.mjs          # 成功，dist/hush.html 变大是正常的
```

手动清单：

- [ ] `?map=moving&seed=42` 能进，落在角落块的中心房里；房间是开放的，直接能走出去。
- [ ] 正中那一格是一圈细线（口），里面有一条来回弹的浅色声线；二层那格是深一档的色。
- [ ] 对那一格投一发投掷物（背包里有就砸；不额外发放）：玻璃声、声线熄灭、这一间之后不再翻。
- [ ] 目标块一层看进去是空房间（正中一格可走、没有声线），翻到二层才出现按钮。
- [ ] 走环廊绕一圈，8 个门都能过，不掉进虚空。
- [ ] 层界红线：站在相邻两块之间，只要两块层级不同，那条共享边上就有一条常驻红线（有呼吸感），门洞处断开；两块同层时没有线。
- [ ] 等一次翻转（20 秒）：**恰好 5 个块**同时翻（数一下变了几个房间），画面红环、抖动、播报"已到达 2 层"、周围的路变了；没被抽中的块一动不动。
- [ ] 站在内部迷宫里被翻：人被推到空格，没被卡进墙里。
- [ ] 砸碎一个非目标块的中心：这一间之后不再翻。
- [ ] 走到对角块，等它翻到二层，按钮出现，按 F → 停摆 + b2 消失 + 四面的门变成紫色传送门。
- [ ] 进传送门提示"机械地牢尚未开启"，不崩。
- [ ] 每块里都有一只猎手（共 18 只）；被翻的那一块，猎手会被挪到该块的空格、不会卡在墙里，也不会穿到隔壁块。
- [ ] 重开（R）后同一 seed 地图完全一样。
- [ ] 砸 b2 的金色中心：剧震 + 全体翻一次 + "已到达 -1 层" + 其它块消失 + 走出去提示"实验室尚未开启"。
- [ ] `node tools/perf.mjs` 的 p95 帧耗时 ≤ 16.7ms（翻转那一帧也不许超）。
- [ ] 连续翻转 3 分钟无 console 错误。

文档（**同一次提交**）：

- `CHANGELOG.md` 顶部加 `## 0.8.0`：移动迷宫、翻转系统、核心房、两条结局。
- `README.md`：玩法段加一段"移动迷宫"，说明"层"和"砸核心会停摆"。
- `docs/DEVELOPMENT.md`：地图数 2 → 3；§276 的"移动迷宫"条目改成已完成并写清实现要点；把这次新踩的坑补进坑位表。

---

## 18. 已知坑（来自现有代码，别重蹈）

1. **`level.grid` 引用会被缓存**：射线、投掷物、猎手都用 `L.grid`。翻转必须原地写，不能重新赋值。
2. **无标签的射线只碰墙**：`spawnRays` 的 `tag` 为 null 时不会命中实体，这是故意的。
3. **`sort(() => rnd() - 0.5)` 不是洗牌**：要用 `util.shuffle`。
4. **`level.exit` 可能是 null**：`render.js` 里有 `level.exit.seenAt` 的直接读取，必须加判断。
5. **`TILE` 有三份**：`levelgen.js` / `rooms.js` / `worldgen.js` 各有一份同名常量，打包器只去重"同名同值单行 const"。别在 `worldgen.js` 里再声明一个不同值的 `TILE`。
6. **"无厚度"在引擎里怎么落地**：口 是**一格**（16×16），grid 里写 1（挡住人和射线），渲染只画这一格的 1px 四条边——玩家看到的就是"口"，声呐也会沿这四条边刷出 contacts。不要真的去做 0 厚度线段碰撞：玩家半径 9、格子 16，得同时改 `moveCircle` / `isSolid` / 射线步进三处，收益远小于风险。
7. **`dist/hush.html` 是构建产物**：改完源码必须重跑 `node tools/build.mjs`，否则 `file://` 打开的是旧版。
8. **猎手的 `_plan` 用 tile 坐标 + A\***：翻转后要清 `path`/`pending`，否则它会沿着旧路撞墙。

---

## 19. 待确认的实现假设（写进代码注释，别写成"TODO"）

| # | 假设 | 理由 | 想改的话改哪 |
| --- | --- | --- | --- |
| A1 | 每块 25×25 tile（pitch 24），全图 73×73 | 玩家只说 3×3×2，没给块大小；73×73 ≈ 现有 room 图 76×52 的量级 | `worldgen.js` 的 `PITCH`/`N`，其余全靠它推导 |
| A2 | 玩家从 maze 的传送门落在角落块中心房，`spawnTile` 取中心房南侧那格 | 原话"从迷宫这张前置地图传送过来的"；落点避开正中那一格（口） | `buildMovingMap` 里的 `spawnTile` |
| A3 | "层"是每块的 `z`，跨块不播报 | 满足"电梯井 + 到达另一层"，且只用一张网格 | `mc.blocks[i].z` 的语义 |
| A4 | 翻转周期 **20s**、每次固定抽 **5/9** 块（抽中必翻，无二次概率） | v3 由策划拍板：保留原来的 20 秒节拍，但把"全体交换"改成"每次抽五块"，既保留节拍感又不至于整图同时洗牌 | `mc.flipPeriod` 与 `issueFlipCommand()` 的 `slice(0, 5)` |
| A5 | 目标块 `decor = ['none','button']`，两层都没有 `spark` | 从结构上就不可能被砸锁死，不需要例外逻辑 | `decor` 数组 |
| A6 | 机械地牢 / 实验室不实装，走 deny | 原话"这两张地图还没做" | `enterMapExit` 保持不变 |
| A7 | **每块 1 只 `lurker`，共 18 只**（v3 由策划拍板，覆盖原来的"3 只只在外环"） | 每个房间都有脚步声，翻转后玩家落点附近始终有威胁；18 只全部是聋巡逻型，听到声音才追 | `monsters` 数组与 §7.4 |

---

## 20. 一句话给实现者

先把 §5 的数据模型和 §6 的几何写死，再写生成器，再写翻转，最后写核心房和两个结局。**每一层都要能单独跑测试**——不要一口气写完再 debug，这张图的状态太多，一口气写完一定调不动。

---

## 21. 修订记录

| 版本 | 变更 |
| --- | --- |
| v1 | 9 列 × 2 行长条 + 20 秒全体翻转（未实现，已废弃） |
| v2 | 3×3×2、9 秒随机局部翻转、核心房/破核/两条结局（口径未确认） |
| **v3** | 按策划拍板定稿：① 周期回到 **20 秒**；② 每次指令固定**抽 5/9 块**翻转（抽中必翻）；③ 保留 3×3×2；④ 层界恢复**常驻红色声线**；⑤ 保留中心核心房与 b2 彩蛋；⑥ 猎手改为**每块 1 只，共 18 只**。 |
