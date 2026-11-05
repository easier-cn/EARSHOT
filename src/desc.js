// Words for things. Riddles, in the voice of someone who has been down here
// longer than you: classical cadence, second person 汝, never a manual.

export const CHARM_TEXT = {
  sleep: {
    name: '眠龙勿扰',
    lines: [
      '龙眠于渊，勿以石击其鳞。汝鸣之时，或有三分不入其耳。',
      '渊更深矣。龙已半醒，汝之六成声响，皆化作风过空穴。',
      '龙卧如死，而耳犹在。十声之中，七声半途而灭，惟余寂然。',
    ],
  },
  stress: {
    name: '应激反应',
    lines: [
      '创巨而神醒。受创之际，汝身化金声，疾走八息；声不惊物，惟照前路。',
    ],
  },
  survive: {
    name: '绝地求生',
    lines: [
      '死地而后生。汝之命数，增一。',
      '再入死地，命数又增其二。',
      '三入绝境，命数增三。向死而行者，反得其生。',
    ],
  },
  stone: {
    name: '投石问路',
    lines: [
      '投石于暗，听其所答。每入一关，得石三枚；石落之处，众皆往焉。',
      '石五枚。声愈远，诱愈深。',
      '石七枚，且砺其锋。石过之处，遇者皆折；折而不止，直至触墙。',
    ],
  },
  counter: {
    name: '反击时刻',
    lines: [
      '凡触汝者，先死一次。此命之中，惟行一遭；既行，则三息之内，触者皆亡。',
    ],
  },
  sneakSonar: {
    name: '潜行声呐',
    lines: [
      '潜行而鸣，声不出户。四方微光，照汝足下。',
      '八方微光，环汝而立。',
      '十二方微光，如星落于井。声细而入微，物不能觉。',
    ],
  },
  swift: {
    name: '迅捷潜行',
    lines: [
      '潜行不滞，得行走之六七。',
      '得行走之三四分。',
      '得行走之八五，几与常步无异，而足下无声。',
    ],
  },
  home: {
    name: '归家期盼',
    lines: [
      '近关隘与钥匙五百步，见二角于身侧：蓝者钥，金者门。',
      '所感愈远，七百步内皆可见。',
      '千里之内，二角常随。归意既生，暗亦让路。',
    ],
  },
  rewind: {
    name: '时间逆流',
    lines: [
      '死前一瞬，十中有一，水复回流；汝归关始，百物如初。此局首死，必得回还。',
      '二十中有一。',
      '十中近三。',
    ],
  },
  hunt: {
    name: '亡命猎屠',
    lines: [
      '猎者死，得二钻十金；汝得其二倍。',
      '得其四倍。',
      '得其八倍。血愈重，赏愈厚。',
    ],
  },
};

export const ITEM_TEXT = {
  pebbles: { name: '一小堆石子', line: '三石入手。掷之则鸣，鸣则物至，而汝可去。' },
  sharpStone: { name: '一块锋利的石头', line: '石有锋。中者立折，折后犹飞，至墙而止。' },
  vitamin: { name: '维他命', line: '一息之药。五息之内，行速倍之。' },
  totem: { name: '不死图腾', line: '此物代人受死一次。局中多得一次应激之机。' },
  star: { name: '无敌星', line: '三星之辉。三息无敌，触者皆亡。' },
  corpse: { name: '同类的尸骸', line: '掷之，其臭与声五息不绝，众皆聚焉。' },
  bugspray: { name: '老旧的驱虫器', line: '缓飞而鸣，墨绿之声逐物；声所及者，皆退避一息。' },
  scanner: { name: '扫描仪', line: '一按，则钥与门之最短路，现于目前。' },
};

/** Level N shows its own lines plus every earlier line: longer, never repeated. */
export function charmText(id, lvl) {
  const c = CHARM_TEXT[id];
  if (!c) return '';
  return c.lines.slice(0, Math.max(1, lvl)).join('');
}

/** Charm glyphs: intricate, unique, one per charm. Items stay simple. */
export const CHARM_GLYPH = {
  sleep: '<circle cx="12" cy="12" r="9"/><path d="M7 10c2 3 6 4 10 1M7 14c3 2 7 2 10-1"/>',
  stress: '<path d="M12 3l2 5 5 1-4 4 1 6-4-3-4 3 1-6-4-4 5-1z"/><circle cx="12" cy="12" r="2"/>',
  survive: '<path d="M12 3v18M5 8l7 4 7-4M5 16l7-4 7 4"/>',
  stone: '<path d="M4 15l4-7 5 3 4-6 3 9-6 3z"/><circle cx="13" cy="17" r="1.4"/>',
  counter: '<path d="M4 12h7l2-6 3 12 2-6h2"/><circle cx="20" cy="12" r="1"/>',
  sneakSonar: '<path d="M12 12l0-8M12 12l7-4M12 12l7 5M12 12l-7 5M12 12l-7-4"/><circle cx="12" cy="12" r="2"/>',
  swift: '<path d="M4 8h9M3 12h7M5 16h8M15 6l5 6-5 6"/>',
  home: '<path d="M5 12l7-7 7 7M7 11v7h10v-7"/><circle cx="12" cy="15" r="1"/>',
  rewind: '<path d="M6 12a6 6 0 1 1 2 4"/><path d="M6 7v5h5"/><circle cx="12" cy="12" r="1"/>',
  hunt: '<path d="M4 18l5-5 3 3 7-9"/><path d="M15 7h4v4"/><circle cx="8" cy="6" r="1.2"/>',
};

export const ITEM_GLYPH = {
  pebbles: '<circle cx="9" cy="14" r="3"/><circle cx="15" cy="11" r="2.4"/>',
  sharpStone: '<path d="M5 17l7-12 6 9z"/>',
  vitamin: '<rect x="8" y="6" width="8" height="12" rx="3"/><path d="M12 9v6"/>',
  totem: '<path d="M8 4h8v9l-4 7-4-7z"/>',
  star: '<path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6-5-2.9-5 2.9 1.2-5.6L4 9.6 9.6 9z"/>',
  corpse: '<path d="M6 16c0-4 2.7-7 6-7s6 3 6 7z"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>',
  bugspray: '<rect x="8" y="9" width="6" height="9" rx="2"/><path d="M11 9V6h3M16 6l3-2"/>',
  scanner: '<rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 12h6M16 12h1"/>',
};
