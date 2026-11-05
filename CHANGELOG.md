# Changelog

All notable changes to HUSH. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the game follows [SemVer](https://semver.org/).

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
