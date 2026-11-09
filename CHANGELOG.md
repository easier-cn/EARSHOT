# Changelog

All notable changes to EARSHOT (formerly HUSH). The format follows [Keep a Changelog](https://keepachangelog.com/),
and the game follows [SemVer](https://semver.org/).

## [0.8.16] - 2026-11-09

### Added
- 无敌星与「反击时刻」触发时，游戏画面进入全屏反色仪式：先停格 0.5 秒，
  再用 0.45 秒逐渐转为负片；效果持续到无敌 / 反击窗口结束，随后再次停格
  0.5 秒，用 0.45 秒渐回原色。
- 两次停格是真正的冻结帧：世界、计时器与声呐波纹都停住，只有反色进度在推进。

### Changed
- 反色只作用于游戏画布，HUD、提示与菜单保持原色，血量、探测次数与播报仍然可读。

### Notes
- 实现集中在 `Game.beginInvert / stepInvert / clearInvert`，CSS `invert()` 滤镜写在
  `render()` 末尾；触发点是无敌星使用与 `hurt()` 中的反击分支（`counterT` 与护符
  窗口同为 3 秒）。死亡、重来、换图与胜利会立即清除反色，不把负片带进结算页。
- `tests/effects.test.js` 新增 3 条：星的道具仪式、反击触发同一仪式、清场；
  全套 95 pass / 0 fail。

## [0.8.15] - 2026-11-09

### Removed
- 标题页的中文题记与游戏简介；欢迎页只保留 **EARSHOT** 标题，其余图形、按钮与操作提示不变。

### Notes
- 纯展示层改动，没有改玩法、数值、存档或内部标识。

## [0.8.14] - 2026-11-09

### Added
- 标题页重新有了文字：游戏名 **EARSHOT**、一行题记，以及一段简短的游戏简介。
- README / DESIGN / DEVELOPMENT 补充 EARSHOT 的品牌与简介；标题页截图更新。

### Changed
- 显示名从 HUSH 改为 **EARSHOT**（听觉所及的范围），更贴合“发声即暴露”的核心。
- 第八密室的英文名从 `HUSH` 改为 `SILENCE`，避免和旧标题重名。
- 内部标识保持不变：存档键 `hush.*`、`dist/hush.html`、`HUSH_PORT`、`window.__hush`。

### Fixed
- 单文件构建补上 `src/settings.js`：此前 `dist/hush.html` 会在 `loadSettings` 处抛 `ReferenceError`，双击打开是黑屏。
- 自检在单文件版里不再报「版本 / 无版本号」：没有 `main.js` 外链时按内联构建的 `VERSION` 核对。
- 标题页在极矮屏幕（≤640px 高）隐藏装饰性声呐纹章并收紧间距，避免「摁下空格键以开始」压住密室选图。

### Notes
- 展示层、构建清单与文档改动，没有改玩法、数值或存档格式。

## [0.8.13] - 2026-11-09

### Changed
- 「重来」现在是真正的重新开局：在地图模式（房间 / 迷宫 / 移动迷宫 / 实验室）
  按 R 或点暂停页的重来，不再重开当前地图，而是清空背包、护符与进度，
  回到初始房间并生成新的布局。
- 重来不会走时间回溯：入口快照与已用护符不会被还原，和手动重开一样从零开始。

### Tests
- 新增 `tests/restart.test.js`：地图模式回到 room、楼层模式从第一层重开、
  密室模式保持同一间、标题页忽略重来、绝不调用 `restoreEntry`。

## [0.8.12] - 2026-11-09

### Added
- 隐藏地图「实验室」：从移动迷宫 b2 坍塌后的八道门进入。三个区域蛇形相接，
  每个区域由 5 或 7 间主路房间、中段向下延伸的 2/3 间岔路和一间 8×12 门禁卡房
  组成；主路终点门需要对应区域的门禁卡，第三道门后是实验室终点。
- 两种新实验体：ii 型（蓄力一秒后以 5.5 倍速度冲撞六秒、撞墙反弹）与
  iii 型（贴墙无声游荡，听到声音后移动到最近的墙、尖啸并扑向声源）。
- 培养皿：约十分之一的房间内墙嵌有三条墨绿声线；冲撞或投掷物可打碎，碎后
  释放一圈墨绿声呐，眩晕玩家两秒、让敌人加速两秒。
- 毒雾：约五分之一的地板；雾中所有声线变成更亮的墨绿，玩家减速、怪物加速。
- 消毒间：第二、三区域起点固定 5×5 内径（7×7 外框）的无内饰安全屋，进入后
  清除眩晕并短暂免疫毒雾；任何怪物都无法进入。
- 门禁卡：蓝/紫/冷白三色，未拾取时定期发出提示声线；卡房守卫在取卡前不离开
  房间，取卡后会在玩家不潜行时追来。取卡后提示声线停止，不再当路标。

### Changed
- 实验室不出现在标题地图选择里，只能通过移动迷宫发现（调试模式仍可选）。
- `Hunter` 支持 `alertSpeed`，用于实验体 i 型的 0.9/1.2 倍速度。
- 修复实验室 `level.size` 按格数返回、导致相机边界夹紧错误、主角跑出画面。
- 实验室遵守“除了道具和传送门都不可见”：不再绘制实验体轮廓、毒雾色块、
  门缝和消毒间边框；猎手与实验体的碰撞箱只在 `~` 调试模式下显示。
- 实验体 iii 型的寻路改为“墙根活动带”：把贴墙两格视为可走区域（身体有半径，
  严格一格带在 90° 拐角会断），在带内 BFS 到离声源最近的可达位置，再执行移动
  到墙、尖啸、扑击的流程。
- 培养皿里的三条墨绿声线改成真实的反弹粒子（同移动迷宫核心），不再画静态短线。
- 实验体 ii/iii 的高频短声线统一为 10 条、每条相隔 36°。
- 房间尺寸不再一刀切：5 间区的房间可长到 19×16，7 间区为 10–14 宽，大小差异更明显。
- 房间内增加不贴外墙的短墙/立柱（每个房间 1–2 处），插入前后做房间局部连通性检查，断开就回滚；门洞与卡/皿/终点周围留空。
- 实验体 iii 型到达墙根后先原地蓄力 2 秒，持续发 10×36° 高频短声线，再尖啸扑击。
- 实验体 ii 型游荡时每 0.55 秒发出脚步短声线；只有移动时才发。
- 毒雾中的声线进一步加粗、提亮（线宽 +0.9、透明度 ×1.85），雾本身仍不绘制。

### Tests
- `tests/worldgen.test.js` 增加实验室生成、门禁连通、确定性、消毒间尺寸/无雾/
  无培养皿检查；`npm test` 共 82 项。

## [0.8.11] - 2026-11-09

### Changed
- 传送门统一为粒子涡旋：地图节点不再绘制旧版绿色拱门；普通楼层的
  楼梯仍保留拱门标记，地图内的旧出口也不再参与声线碰撞。

### Removed
- 迷宫中返回房间的传送门。所有传送门都是单向向前的；迷宫现在只通过
  右下角台阶旁的移动迷宫门离开。

## [0.8.10] - 2026-11-09

### Changed
- 声线整体调暗：底色由近白改为暗青灰（`RAY_RGB = '150, 198, 192'`），
  线身与头部亮度约降一半，波纹圈透明度同步降低；命中敌人时的变色与
  延长保留，只是不再额外发亮。
- 取消声线撞墙 / 撞到敌人时留下的彩色圆点（原 `contacts` 渲染）：
  不再在反弹点画白点、金点，也不在猎手/模仿者身上画红点与红圈。

### Removed
- `game.contacts` 数据及其收集、清理、移动迷宫换色代码。

## [0.8.9] - 2026-11-09

### Added
- 首次游玩的分步引导：标题画面常驻「摁下空格键以开始」；进入后依次提示
  声呐、左下角充能点；第一次惊扰猎手时提示潜行与「猎手听得到声音」；
  第一次捡到护符 / 非投掷道具时分别提示用 Tab 装配、绑定快捷键；
  第一次把投掷物拖上快捷键并关闭背包后提示按快捷键选中，
  选中后提示左键掷出、再按一次取消。
- `ui.guide(text, { sticky })` 支持不自动消失的提示；新增 `hideGuide()`。

### Changed
- 标题画面现在只认空格 / 回车（以及点击开始按钮），避免随便按一个键就开局；
  开局的声呐提示会吞掉这次空格，不会立刻触发一次脉冲。
- 声呐充能提示改在第一次真正发声后出现，避免和猎手提示互相覆盖。

### Tests
- `tests/tutorial.test.js`：拾取只提示一次、猎手两声提示按序出现、
  投掷物绑定/关闭背包/选中/取消的提示链路。

## [0.8.8] - 2026-11-08

### Added
- 迷宫地图右下角（出生点对角）的台阶旁新增一道前往「移动迷宫」的传送门。
  传送门占用台阶旁一格；该格若被墙堵住会被打通，保证从迷宫出口能直接走进去。
  这扇门与地图选择、`?map=moving` 并存。

### Docs
- `tests/worldgen.test.js` 增加回归：12 个种子的迷宫都必须有这扇门，且门格
  与对角台阶曼哈顿距离为 1、门格可通行。

## [0.8.7] - 2026-11-08

### Changed
- 每一扇地图传送门（房间、迷宫、移动迷宫、机械地牢、实验室，含去草原/城堡的门）
  都换成同一套粒子涡旋：暗井、薄膜、旋臂、断口外圈与上百颗带拖尾的轨道微粒，
  颜色随门的颜色/上锁状态变化。**平时是两条旋臂的小传送门**（半径约 14 世界像素），
  走近后第三条旋臂淡入、涡旋整体放大；不再有“只有环”的远处版本。
- 涡旋转速提高约一倍（旋臂自转、微粒公转、外圈刻度与锥形光刃同步加快），并新增
  `spin` 转速倍率（可在调参页 0.2–3 之间拖拽）。
- 两条臂严格相隔 180°；靠近过渡时收拢到 120° 并淡入第三条臂。
- 靠近才变大，但**两臂阶段尺寸固定**：距离 `> d3` 时保持 11（两条臂，不再一路长大），
  从 `d3=110` 起第三条臂淡入、半径同时在 `fade=30` 内从 11 长到 23，第三条臂齐时
  半径也到最大；粒子数量随半径增加，线宽与标签字号不跟着变。
- 参数集中在 `src/portal-config.js`（`PORTAL = { far, near, d3, fade }`），并新增
  `tools/portal-tune.html` 拖拽试运行页；保存的参数写到 `tools/portal-tune.saved.json`，
  确认后抄回配置并重建。见 `src/render.js` 的 `mapExits` 循环与 `drawPortalFx()`。

## [0.8.6] - 2026-11-08

### Changed
- 核心声线速度降到普通声呐的 **1/3**（`RAY_SPEED / 3 ≈ 186.7px/s`），一格内的
  往返不再快到看不清。
- 核心拖尾从 10 个点加长到 32 个点（约 64px），并在整条拖尾上使用从透明到尾端
  高亮的线性渐变；路径改用二次曲线平滑，不再按三段批量描边，因此没有节点/接缝。
- 粒子头仍然永久存在，只有拖尾按长度淡出。

### Docs
- 交接文档 `docs/DEVELOPMENT.md` 补齐这次声线返工的坑：声线必须是粒子+拖尾而非
  静态描边、`coreTrails` 初始化顺序、一格内反弹与 32 点拖尾、连续渐变/二次曲线、
  b2 的 96 条 ghost 金圈与灰/紫粒子、门洞 8 条红粒子；README 同步 1/3 速度。

## [0.8.5] - 2026-11-08

### Changed
- 核心声线改成真正的**一格内反弹**：每个核心发射 3 颗粒子，初速和声呐一样是
  560px/s，在正中那一格的四条边之间反复碰撞；粒子永远存在，只有拖尾按长度淡出。
  不再从中心向外飞、也不再在 48px 处回卷。
- 拖尾长度与普通声呐一致（约 10 个轨迹点），并继续用 `lighter` 叠加。

### Fixed
- 修复上一版把核心画成放射状长线、看起来像“三根辐条特效”的问题。

## [0.8.4] - 2026-11-08

### Added
- 核心、门排和坍塌全部改成**真正的声线粒子**：粒子头部移动，尾部按声呐的同一套
  折线/透明度规则逐段淡出，不再画静止线条。
- 核心的三条 120° 辐条现在由三颗粒子在正中那一格内以声呐速度反复反弹形成，粒子不消失、只淡出拖尾；
  之前 `startMap` 把 `coreTrails` 覆盖成空数组，所以中心看起来完全不动。
- `b2` 坍塌金圈改为 96 条可穿墙的 ghost 声呐粒子；每面被扫碎的墙以自身为中心
  炸出 6 条极短淡灰粒子；被扫到的守卫死亡时发出可穿墙的紫色粒子圈。
- 门排改为每个门洞 8 条红粒子（每半格一条），相邻两条反向穿过门洞，仍只在
  翻转前 1 秒出现。

### Changed
- 坍塌过场把镜头拉到 `b2` 中心，1.45 秒冻结结束后再落回坍塌结果。
- 删除 `render.js` 里旧的静止辐条、亮斑、红门线和金色圆环绘制。

### Fixed
- `startMap` 的 `this.coreTrails = []` 覆盖了 `makeCoreTrails(level)`，核心声线
  因此不移动；现在在 `startMap` 中正确初始化。

## [0.8.3] - 2026-11-08

### Added
- 打碎 `b2` 金色核心后的**坍塌过场**：从核心中心扩散一圈金色声音线，1.15 秒内
  逐圈打碎 `b2` 中央房间内部的所有墙（保留最外圈边界）；每面墙碎掉时发出极短的
  淡灰声线。过场期间玩家、猎手和 skitter 全部停格，只有投掷物、射线与粒子继续
  飞行；声线扫到的 `b2` 猎手立即死亡并炸出一圈紫色声线。过场结束接原有的 1.4 秒
  坍塌与 `lab` 出口。
- 每个房间出口交界处新增红色**门排声线**：沿门洞横向排 4 条半格线，两个方向都
  有，垂直/水平分隔边各自旋转 90°；仍然只在翻转前 1 秒出现，不再常驻。

### Changed
- 核心的三条辐条会缓慢摆动，辐条上有向外飞行的亮色声线粒子；核心不再是一张
  静止的线稿。
- `b2` 打碎瞬间的金色声呐从 120 条降到 24 条，让扩散金圈成为主视觉。

### Fixed
- 坍塌声线破除墙壁时半径单位错用成 tile，导致墙不是按扩散顺序碎，而是瞬间整片
  消失；现在按像素距离逐圈破除。

## [0.8.2] - 2026-11-07

### Added
- **移动迷宫**（`moving`，第三张地图，`?map=moving` 可直接进入）。3×3 个
  25×25 tile 的方块，每块有两套**独立生成**的布局；整张图只有一张物理网格，
  翻转时把该块另一套布局原地写回，射线、投掷物和猎手缓存的网格引用保持有效。
- 每 20 秒一次翻转指令（首次延迟 4 秒），从 9 块里抽 **恰好 5 块**；核心被
  打碎的块不再参与抽签。
- **玩家所在的房间永不改写**。抽签会避开玩家当前房间；若玩家在最后 1 秒走进
  已抽中的房间，执行时把该块换成另一块未抽中的房间。玩家站在两块共享的边界
  tile 上时，两边都受保护。房间没有换，但玩家随之上升/下降：HUD 与播报都显示另一层。
- 房间出口按格位决定：角块 4 个、边块 6 个、中心块 8 个；外侧没有门洞，地图
  最外圈是实墙。门开在局部 5/17，和邻块对齐。
- 迷宫主体是**一格宽**通道：10×10 的单格迷宫、1 格宽外环、3×3 中心房；只有
  中心房是唯一的大块开放空间。
- 每块中心是 3×3 开放房间，正中一格是被四面薄墙围住的“口”。核心画成三条
  相隔 120° 的长辐条，其中一条与正上方成 38°，一层浅青、二层深青，`b2`
  金色。投掷物可以打碎“口”，之后该块停止翻转，碎口变成可走的空格并只留
  一点冷灰余烬。
- 翻转前 1 秒，被抽中的房间沿四条分隔边发出红色声音线，线垂直于分隔边；
  这是唯一的预告，不再常驻显示“哪一间会动”。
- 房间翻转时，除投掷物外所有角色停格 0.7 秒；停格结束后屏幕抖动 0.7 秒。
- 正常通关：对角块在二层的“口”变成按钮，按 F 停摆整座迷宫；`b2` 封死，
  四邻朝向它的 8 个门位变成通往机械地牢的紫色传送门。
- 彩蛋：打碎 `b2` 的金色“口” → 屏震、金色爆散、除玩家所在房间外的所有块
  （包括已碎的）再翻转一次，播报“到达 -1 层”；1.4 秒后只留下 `b2`，
  8 个门位通往实验室。
- 每块的两层各生成一只 `lurker`（共 18 只），但场上始终只有 9 只活守卫
  （`reserve` 副本休眠）。房间翻转时守卫不换人、不消失；若新布局在它脚下
  是墙，就移到同块最近空格。玩家房间不翻，房内守卫和墙都不动。
- 未索敌的守卫移动速度为玩家的 0.7 倍，听见声音后为 2 倍；警戒时脚步声
  （声线）更密、每次发出的射线更少。
- 新音色 `floorChime` / `swapRumble` / `glassBreak` / `b2Quake` / `mcStopped`；
  HUD 增加“第 N 层 / -1 层”和 2.2 秒的楼层播报。
- `tests/moving.test.js` 覆盖块几何、两层是不同迷宫但门位一致、角/边/中心
  4/6/8 出口、一格宽通道、200 次翻转后的连通性、5/9 抽签与避让玩家房间、
  原地写回、18 只分层猎手、6 个外环道具点、按钮、碎核与 `b2` 坍塌出口。

### Changed
- `BUILT_MAPS` 现在包含 `mech` / `lab`，未实装地图会按普通房间生成，
  不再在传送门前直接被拒。
- 移动迷宫从地图选择窗与 `?map=moving` 进入；迷宫图本身暂未加传送门。

### Fixed
- 房间/旧模式没有 `flipRings` 字段时，更新循环读取 `.length` 会崩溃。
- 空出口地图（移动迷宫）不再在渲染与实体命中处解引用 `level.exit`。
- 碎裂的核心不再被后续布局写回重新封死；正常通关后 `b2` 中心也不会重新开放。
- 正常通关 / `b2` 坍塌后，已消失的方块不再画声音线或核心。
- 玩家站在共享边界上时，邻块翻转不再改写脚下 tile。

## [0.7.24] - 2026-11-07

### Added
- The maze now holds 8-10 loot spots; before it had none (`loot: []`), so the
  whole area after the first door was empty. Spots are placed by walking depth
  from spawn — one per band of the route — and a corridor tile is preferred,
  so finding something in the middle of a one-tile path is the normal case,
  not a pocket special. At least three spots always sit in a corridor, spots
  keep a 5-tile gap (3 during the fill pass), never crowd the spawn or the
  exit, and never share a tile with a lurker. What a spot is stays unknown
  until the player comes close, as in every other area.

### Tests
- `tests/worldgen.test.js` pins the count, the corridor share, the depth
  spread, the spacing and the wall/safety exclusions over 60 seeds, plus
  determinism for one seed.

### Fixed
- Same seed now always grows the same maze. The generator shuffled carve
  directions with `sort(() => rnd() - 0.5)` — a comparator that ignores the
  values it compares. Node happened to sort consistently, but Edge could
  return a different maze and loot for the same seed between calls (and the
  comparator call count itself drifted after JIT warm-up). Both places now use
  the Fisher–Yates `shuffle()` from util.js, which also covers the room map's
  monster order.

## [0.7.23] - 2026-11-07

### Fixed
- The self-check's consumable row reused one pack for all eight items; six
  slots filled up, so the seventh (`bugspray`) failed with "未能入包" and the
  boot screen showed a false error. Each item now gets a fresh pack.

## [0.7.22] - 2026-11-07

### Changed
- Every ground interaction now goes through `F`: loot, the map key, map
  portals and the floor stair. Walking onto a key or a portal no longer does
  anything on its own, so passing by cannot drag you into another map.
- A portal now names its destination in the world (`迷宫`, `房间`…), dimmed
  while far and bright up close, with `·需钥匙` or `·未开通` when it will not
  open. The floating prompt repeats the destination and what F will do.
- The interaction prompt is positioned with the same clamped `viewCenter()`
  the camera and aiming use, so near a level edge it no longer drifts.
- The floor stair asks for `F` as well and shows the remaining shard count
  inside its prompt instead of denying on contact.

### Fixed
- Portal destination labels divide their font size by the zoom, so they stay
  the same size on screen at every camera scale.

## [0.7.21] - 2026-11-07

### Changed
- Loot no longer picks its identity when the level is generated: a spot stays
  unknown until the player comes within 190px, then rolls charm/item (and the
  id). 绝地求生 only appears once both 应激反应 and 反击时刻 are owned, so a
  dead roll can no longer be handed out before it is earned. Unknown spots
  render as a faint neutral ring.
- 无敌星 now kills on contact for its full three seconds. `hurt()` checked
  invulnerability first, so the star's own protection blocked its kills; the
  check order is now star → invulnerability → other shields.
- 同类的尸骸 lies where it lands and emits a flesh-coloured sonar ring every
  0.9s (three times a player ping's reach) for five seconds. A hunter it
  touches is locked onto it, and that lock outranks later player pings until
  the hunter arrives or the body expires.
- 老旧的驱虫器 flies at 200px/s and hisses a dark-green line every 0.22s until
  it hits a wall (or its 4.2s life runs out). Hunters the line touches flee
  from its origin for one second; a newer line overrides the previous one.
- 扫描仪 now draws the shortest walkable route to the key and every exit,
  following the same pathfinder the hunters use, and refreshes it while held.
- Every hunter death, whatever caused it, answers with exactly one purple ring
  (the old castle-key death had its own purple line plus an amber one).

### Added
- The startup self-check now runs as a real loading bar (percentage, stage
  label, rows revealed in order) and checks consumables: each of the eight
  items must go into the pack, consume exactly one unit, and have a tooltip
  line. Audio now verifies all 20 synth voices exist.

### Fixed
- `Hunter._plan` passed pixel coordinates to `nearestOpen()` (tiles), so a
  sound inside a wall made the pathfinder return null and crashed on `open.x`.
- Bug-spray flight no longer stops on contact: it passes through hunters and
  only the wall ends it.

## [0.7.20] - 2026-11-07

### Fixed
- Throws near a map edge now leave along **player → cursor**. The aim point was
  built from the raw camera, but the renderer clamps the camera to the level
  bounds, so with the player pinned against a wall the throw followed
  "screen centre → cursor" instead (the corner repro was ~158° off). Both sides
  now share `viewCenter()`, and `tests/aim.test.js` pins the edge and
  small-level cases.

## [0.3.7] - 2026-11-05

### Added
- The title now states what the nest is before you enter it (one continuous
  cave, 16 shards, a door waiting for an answer), and after a clear it becomes
  a record line: best time and sonar count.

## [0.3.6] - 2026-11-05

### Fixed
- Shard echo panning used a fixed 420px divisor, so anything more than ~420px
  to the side collapsed to hard-left/hard-right and gave no bearing at all.
  Pan is now `dx / (0.9·d + 60)`: a real direction cue at every distance.

### Added
- The death panel remembers how deep into the nest you got, and names the
  sector you stopped in.

## [0.3.5] - 2026-11-05

### Added
- Each sector of the nest sits on a different note of the same drone chord;
  crossing into it detunes the ambience over ~2 seconds instead of cutting.
  Verified in the playtest by reading the live oscillator frequencies.

## [0.3.4] - 2026-11-05

### Added
- **Shards answer the pulse.** Every ping makes up to four nearby shards (within
  1150px) ring back with a thin high bell. The delay is the distance (1500px/s)
  and the pan is the bearing, so the cave becomes a map you hear rather than
  read. No HUD, no pointer.

### Fixed
- Mimics only heard pings when a hunter happened to be in the level (the loop
  was nested inside the hunter loop), so chamber I's mimic was deaf.

## [0.3.3] - 2026-11-05

### Changed
- **The continuous cave is now the main game.** "进入黑暗" drops you into the
  37-room nest instead of chamber I; the eight old chambers remain below the
  title as a legacy grid.
- Crossing one of the eight sectors renames the HUD in place (no pause, no
  load): the cave tells you where you are one word at a time.
- Finishing the nest has its own ending panel with best time and sonar count,
  saved separately as `worldBest` / `worldCleared`.

### Added
- Playtest runs the whole nest end to end: sector crossing, all 16 shards,
  echo door refusing to open, opening after an answer, victory panel, save.

## [0.3.2] - 2026-11-05

### Added
- **A single continuous map (experimental).** `generateWorld()` builds one
  60×76-tile cave (37 rooms, 16 shards, 10 hunters, 4 mimics) instead of eight
  sealed chambers. Walk it with `?world=1`; tests assert every shard, hunter,
  mimic and the exit are reachable from spawn. The chamber mode is still the
  default while the world grows its own progression and gates.

## [0.3.1] - 2026-11-05

### Added
- **The mimic (拟声者) and the echo door.** The creature that used to only
  click now repeats any sound it hears, about a second later, from wherever it
  is standing — hunters turn toward the answer instead of you, and the room
  shows a ring where it spoke. Chambers VI and VII end at a door that will not
  open for a single sound: it wants the same sound answered from another
  direction. No prompt, no key. Ping, hear it answer, watch the door open.
- Echo audio: a detuned, wetter copy of the sound it repeats, panned to where
  the mimic stands. Sealed doors hum every ~3.6s once you hold every shard, so
  there is something for the mimic to answer.

### Fixed
- `audio.skitterTick` was referenced but never implemented.

## [0.3.0] - 2026-11-05

### Changed
- **Sonar is no longer a wall outline.** Each pulse now throws 96 sparks that
  travel outward, reflect off walls (up to three bounces) and leave short comet
  tails; every impact leaves a contact glow that lingers for ~1.7s. The room
  you are standing in is drawn by where the sound *hit*, not by a shader that
  knows the map. Faint contact memory is the only thing you keep between pulses.

## [0.2.4] - 2026-11-05

### Fixed
- **Walls did not block movement and hunters never moved.** `generateLevel`
  never returned its tile size, so every position was divided by `undefined`;
  coordinates became NaN, the collision sweep ran over an empty range, and A*
  was handed NaN tiles. Unit tests missed it because they passed `TILE`
  explicitly. Levels now carry `tile`, plus regression tests that exercise
  `level.tile` itself and a playtest that pushes the player into a wall and
  checks that hunters actually move.

## [0.2.3] - 2026-11-05

### Added
- An "it heard that" stinger: when a hunter first wakes to a noise, a low sour
  cue pans toward it. Rate-limited to 0.75s and silent while it is already
  tracking, so it reads as a reaction rather than a metronome.
- `tools/probe.mjs`: evaluate one expression inside the running game.

## [0.2.2] - 2026-11-05

### Added
- `tools/pressure.mjs`: simulates a ghost walking the shortest route with real
  hunter hearing and contact, across three play styles, to measure how hard the
  hunters actually push. Findings written into DESIGN.md.
- `tools/perf.mjs`: rAF frame-time probe for the heaviest chamber (5 hunters,
  214 wall segments, pings every 120ms). p95 = 16.7ms, 60fps steady.

## [0.2.1] - 2026-11-05

### Added
- `npm run build` produces `dist/hush.html`: one self-contained file with CSS
  and all modules inlined, so the game can be opened by double-click with no
  server and no Python. Inline module scripts are allowed under `file://`.
- Pause screen lists the controls, so nobody has to remember them mid-run.

## [0.2.0] - 2026-11-05

### Added
- Four room-shape presets (`halls`, `cavern`, `warren`, `gallery`) assigned per
  chamber, so the eight rooms differ in topology, not just shard count. The
  generator falls back to `halls` if a tight preset starves.

### Changed
- Listening now requires standing still: holding Space while walking only muffles
  your steps, the directional sense fades in after ~0.26s of stillness. This
  removes the "silent walk with perfect awareness" dominant strategy.

### Fixed
- Directional chevrons never rendered in normal play (`game.listen` was never set).

### Added
- `npm run balance` — reports the shortest walking route through every chamber
  (lower bound on level length, used for pacing).

### Changed
- Starting a chamber is now idempotent: pressing Space on the title screen can no
  longer start the level twice through the focused button.
- Losing window focus pauses the run instead of letting hunters keep moving.

## [0.1.1] — 2026-11-05

### Added
- First-ping hint toast ("声呐也暴露了你").
- `play.cmd` — one double-click boots a local server (only if the port is free) and
  opens the game.
- Playtest now drives a full clear (collect every shard, reach the exit) and
  captures the clear panel.

### Fixed
- Intro line and toast no longer sit on top of the death / clear panels.
- The HUD is always hidden behind an end screen.
- Death screen could be skipped when the simulation was frozen.

## [0.1.0] — 2026-11-05

First playable build.

### Added
- Eight seeded chambers (I–VIII) generated from rooms, MST corridors and loops.
- Analytic sonar rendering: wavefronts light wall segments, brightness decays into
  an afterglow, walls keep a faint memory of what you have seen.
- Blind hunters that wander, investigate sound and search; ping, footsteps and
  shard pickups all make noise.
- Procedural WebAudio (drone, ping, heartbeat, footsteps, gate, death), no assets.
- Pause, death, clear and victory screens, saved progress in `localStorage`.
- Node test suite (level connectivity, determinism, A*, line of sight, collision)
  and a headless CDP playtest.

## 0.4.0 — 无字界面与造图

- 界面里不再有一个字：标题只剩声呐徽记、播放键、16 道刻度与 8 个用竖线计数的密室格；HUD 用点、条和弧线表示区域、碎片与充能；暂停/死亡/通关面板全是图形。提示语、按键说明、"还差 N 块"之类的句子全部删除。
- 声音变成真正的声音线：每次脚步或脉冲都发出一条以 560px/s 扩散的环，只有环的前缘真正碰到猎手/拟声者时才会被听见并触发寻路，靠近不再等于暴露。猎手只追"上一次听到的声音位置"。
- Shift 改为切换潜行：完全无声，也完全看不见（画面里连火花都不再渲染）。空格键发声呐。
- 射线碰到东西会变色并反弹：碎片是金色、门是绿色、猎手与拟声者是红色。没有撞到的实体完全不显示，所以"看见"永远等于"你刚刚发出了声音"。
- 新增创造模式：标题上的铅笔进入 44×30 的网格编辑器，画墙、擦墙、放碎片/门/猎手/拟声者/出生点，右键擦除，播放键直接试玩，地图存在 localStorage。空地图会自动补一块碎片。
- 回归：20/20 单测；playtest 覆盖潜行失明、空格脉冲、声音线唤醒、回声门、大地图通关、编辑器画图→试玩→拾取，errors 为空。
