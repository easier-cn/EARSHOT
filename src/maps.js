// The map graph. Only the entrances named in the design exist: every edge here
// was requested explicitly, nothing is invented.
//
// kind: room | maze | moving | mech | plain   (plain = not designed yet)

export const MAPS = {
  room: { id: 'room', name: '房间', sub: '初始地图', kind: 'room' },
  maze: { id: 'maze', name: '迷宫', kind: 'maze' },
  meadow: { id: 'meadow', name: '草原', kind: 'plain' },
  swamp: { id: 'swamp', name: '沼泽', kind: 'plain' },
  witch: { id: 'witch', name: '女巫塔', sub: '巫妖领地', kind: 'plain' },
  forestEdge: { id: 'forestEdge', name: '森林外围', kind: 'plain' },
  forestCore: { id: 'forestCore', name: '森林核心', sub: '生命树', kind: 'plain' },
  castle: { id: 'castle', name: '城堡', kind: 'plain' },
  mountain: { id: 'mountain', name: '荒山', kind: 'plain' },
  canyon: { id: 'canyon', name: '峡谷', sub: '山洞', kind: 'plain' },
  ruins: { id: 'ruins', name: '遗迹', sub: '失落之地', kind: 'plain' },
  volcano: { id: 'volcano', name: '火山', sub: '山洞', kind: 'plain' },
  vault: { id: 'vault', name: '金库', kind: 'plain' },
  vaultCellar: { id: 'vaultCellar', name: '金库地下室', kind: 'plain' },
  vaultSafe: { id: 'vaultSafe', name: '金库保险柜', kind: 'plain' },
  sewer: { id: 'sewer', name: '下水道', kind: 'plain' },
  gas: { id: 'gas', name: '沼气池', kind: 'plain' },
  rot: { id: 'rot', name: '腐臭之地', kind: 'plain' },
  moving: { id: 'moving', name: '移动迷宫', kind: 'moving' },
  lab: { id: 'lab', name: '实验室', kind: 'lab' },
  cage: { id: 'cage', name: '薛定谔的猫笼', sub: '实验室核心', kind: 'cage' },
  mech: { id: 'mech', name: '机械地牢', sub: '机械核心', kind: 'mech' },
};

// Ordered walkthrough: this is what the debug key (2) cycles through.
export const MAP_ORDER = [
  'room', 'maze', 'meadow', 'swamp', 'witch', 'forestEdge', 'forestCore',
  'castle', 'mountain', 'canyon', 'ruins', 'volcano', 'vault', 'vaultCellar',
  'vaultSafe', 'sewer', 'gas', 'rot', 'moving', 'lab', 'cage', 'mech',
];

export function mapNode(id) {
  return MAPS[id] || MAPS.room;
}
