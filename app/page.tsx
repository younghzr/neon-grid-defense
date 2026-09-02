"use client";

import { useEffect, useRef, useState } from "react";

const SOURCE_WIDTH = 960;
const SOURCE_HEIGHT = 620;
const WIDTH = 720;
const HEIGHT = 900;
const PAD_SIZE = 54;
const GUEST_SAVE_KEY = "neon-grid-defense:guest-save:v1";
const AUTO_WAVE_DELAY = 3;
const EMP_COOLDOWN = 36;

type Point = { x: number; y: number };
type TowerKind = "pulse" | "frost" | "rail";
type EnemyKind = "drone" | "runner" | "tank" | "shield" | "support" | "boss";
type TargetPriority = "first" | "strong" | "fast";
type TowerSpecialization =
  | "pulse_chain"
  | "pulse_overdrive"
  | "frost_zero"
  | "frost_brittle"
  | "rail_pierce"
  | "rail_mark";
type Screen = "home" | "campaign" | "modes" | "arsenal" | "codex" | "game";

const SCREEN_HASH: Record<Screen, string> = {
  home: "#/home",
  campaign: "#/campaign",
  modes: "#/modes",
  arsenal: "#/arsenal",
  codex: "#/enemies",
  game: "#/battle",
};

const SCREEN_TITLES: Record<Screen, string> = {
  home: "果园守卫队｜果园小屋",
  campaign: "果园地图｜果园守卫队",
  modes: "趣味挑战｜果园守卫队",
  arsenal: "植物伙伴｜果园守卫队",
  codex: "小虫图鉴｜果园守卫队",
  game: "果篮保卫战｜果园守卫队",
};

const getScreenFromHash = (hash: string): Screen => {
  const route = hash.replace(/^#\/?/, "").split(/[?&]/)[0];
  if (route === "campaign") return "campaign";
  if (route === "modes") return "modes";
  if (route === "arsenal") return "arsenal";
  if (route === "enemies") return "codex";
  if (route === "battle") return "game";
  return "home";
};

type RuleSet = {
  finalWave: number | null;
  initialGold: number;
  lives: number;
  enemyHealth: number;
  enemySpeed: number;
  enemyCount: number;
  spawnRate: number;
  waveBonus: number;
  runnerWave: number;
  tankWave: number;
};

type LevelConfig = {
  id: number;
  name: string;
  sector: string;
  description: string;
  difficulty: string;
  accent: string;
  path: Point[];
  pads: Array<{ id: string; point: Point }>;
  rules: RuleSet;
};

type ModeConfig = {
  id: "survival" | "blitz" | "hardcore";
  name: string;
  badge: string;
  description: string;
  levelId: number;
  accent: string;
  rules: RuleSet;
};

type ActiveMission = {
  category: string;
  title: string;
  level: LevelConfig;
  rules: RuleSet;
};

type GuestRecord = {
  bestScore: number;
  bestWave: number;
  bestStars: number;
  wins: number;
  plays: number;
};

type GuestSession = {
  category: string;
  title: string;
  levelId: number;
  rules: RuleSet;
  game: Game;
  savedAt: number;
  layout?: "portrait";
};

type GuestSave = {
  version: 1;
  updatedAt: number;
  records: Record<string, GuestRecord>;
  session: GuestSession | null;
};

type Enemy = Point & {
  id: number;
  kind: EnemyKind;
  pathIndex: number;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  radius: number;
  slowUntil: number;
  slowFactor: number;
  shield: number;
  maxShield: number;
  armor: number;
  leakDamage: number;
  slowResistance: number;
  abilityTimer: number;
  stunnedUntil: number;
  brittleUntil: number;
  markedUntil: number;
  dead: boolean;
};

type Tower = Point & {
  id: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
  angle: number;
  spent: number;
  priority: TargetPriority;
  specialization: TowerSpecialization | null;
};

type Projectile = Point & {
  kind: TowerKind;
  targetId: number;
  speed: number;
  damage: number;
  color: string;
  slow: number;
  size: number;
  sourceTowerId: number;
  specialization: TowerSpecialization | null;
};

type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type BattleStats = {
  kills: number;
  damageDealt: number;
  goldEarned: number;
  goldSpent: number;
  leaks: number;
  towersBuilt: number;
  towersSold: number;
  skillsUsed: number;
  bossesKilled: number;
  wavesCleared: number;
};

type Game = {
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  particles: Particle[];
  gold: number;
  lives: number;
  score: number;
  wave: number;
  active: boolean;
  paused: boolean;
  autoWave: boolean;
  autoWaveTimer: number;
  empCooldown: number;
  empPulseUntil: number;
  speed: 1 | 2;
  won: boolean;
  lost: boolean;
  spawnRemaining: number;
  spawnTotal: number;
  spawnTimer: number;
  spawnSerial: number;
  elapsed: number;
  nextId: number;
  stats: BattleStats;
};

type UiState = Pick<
  Game,
  | "gold"
  | "lives"
  | "score"
  | "wave"
  | "active"
  | "paused"
  | "autoWave"
  | "autoWaveTimer"
  | "empCooldown"
  | "speed"
  | "won"
  | "lost"
  | "spawnRemaining"
  | "spawnTotal"
  | "stats"
> & { enemies: number; version: number };

type EnemyCounts = Record<EnemyKind, number>;

type WavePlan = {
  wave: number;
  sequence: EnemyKind[];
  counts: EnemyCounts;
  clearBonus: number;
  hasBoss: boolean;
};

const rotateForPortrait = (x: number, y: number): Point => ({
  x: (y / SOURCE_HEIGHT) * WIDTH,
  y: (x / SOURCE_WIDTH) * HEIGHT,
});

const pointList = (items: Array<[number, number]>): Point[] =>
  items.map(([x, y]) => rotateForPortrait(x, y));

const padList = (items: Array<[string, number, number]>) =>
  items.map(([id, x, y]) => ({ id, point: rotateForPortrait(x, y) }));

const makeRules = (overrides: Partial<RuleSet> = {}): RuleSet => ({
  finalWave: 8,
  initialGold: 230,
  lives: 12,
  enemyHealth: 1,
  enemySpeed: 1,
  enemyCount: 1,
  spawnRate: 1,
  waveBonus: 1,
  runnerWave: 2,
  tankWave: 3,
  ...overrides,
});

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "晨露菜畦",
    sector: "第一块小田",
    description: "清晨的小路很平缓，适合认识三位植物伙伴。",
    difficulty: "普通",
    accent: "#8ebf77",
    path: pointList([[-40, 150], [160, 150], [160, 310], [400, 310], [400, 150], [640, 150], [640, 470], [800, 470], [800, 310], [1000, 310]]),
    pads: padList([["A1", 80, 70], ["A2", 80, 230], ["B1", 240, 230], ["B2", 320, 230], ["B3", 320, 390], ["C1", 480, 70], ["C2", 480, 230], ["C3", 560, 230], ["D1", 720, 230], ["D2", 560, 390], ["D3", 720, 390], ["D4", 720, 550], ["E1", 880, 230], ["E2", 880, 390]]),
    rules: makeRules({ finalWave: 6, initialGold: 250, enemyHealth: 0.92, enemySpeed: 0.96, waveBonus: 1.12 }),
  },
  {
    id: 2,
    name: "河边果摊",
    sector: "第二块小田",
    description: "小路绕着果摊折返，在弯道旁摆放伙伴更有效。",
    difficulty: "普通+",
    accent: "#78aeb0",
    path: pointList([[-40, 150], [240, 150], [240, 470], [480, 470], [480, 230], [720, 230], [720, 470], [1000, 470]]),
    pads: padList([["A1", 80, 70], ["A2", 160, 230], ["B1", 320, 230], ["B2", 160, 390], ["B3", 320, 390], ["C1", 400, 550], ["C2", 560, 390], ["C3", 560, 150], ["D1", 640, 310], ["D2", 800, 310], ["D3", 800, 390], ["E1", 880, 550]]),
    rules: makeRules({ finalWave: 7, initialGold: 240, enemyHealth: 0.98, enemyCount: 1.04, waveBonus: 1.05 }),
  },
  {
    id: 3,
    name: "苹果树下",
    sector: "第三块小田",
    description: "小虫会绕着苹果树来回走，中央位置很抢手。",
    difficulty: "进阶",
    accent: "#c49779",
    path: pointList([[-40, 310], [160, 310], [160, 150], [400, 150], [400, 470], [640, 470], [640, 230], [800, 230], [800, 390], [1000, 390]]),
    pads: padList([["A1", 80, 230], ["A2", 240, 230], ["B1", 320, 70], ["B2", 320, 310], ["B3", 480, 230], ["B4", 480, 390], ["C1", 560, 550], ["C2", 720, 550], ["C3", 560, 310], ["D1", 720, 150], ["D2", 880, 310], ["D3", 880, 470]]),
    rules: makeRules({ finalWave: 8, initialGold: 230, enemyHealth: 1.05, enemySpeed: 1.03, enemyCount: 1.08 }),
  },
  {
    id: 4,
    name: "南瓜田埂",
    sector: "第四块小田",
    description: "长长的田埂通向果篮，厚壳甲虫会越来越多。",
    difficulty: "困难",
    accent: "#e2a45f",
    path: pointList([[-40, 470], [160, 470], [160, 230], [400, 230], [400, 70], [640, 70], [640, 310], [880, 310], [880, 150], [1000, 150]]),
    pads: padList([["A1", 80, 390], ["A2", 240, 390], ["B1", 80, 230], ["B2", 240, 150], ["B3", 320, 310], ["C1", 480, 150], ["C2", 560, 150], ["C3", 720, 150], ["D1", 560, 310], ["D2", 720, 390], ["D3", 800, 230], ["E1", 920, 70]]),
    rules: makeRules({ finalWave: 9, initialGold: 215, lives: 10, enemyHealth: 1.12, enemySpeed: 1.06, enemyCount: 1.12, tankWave: 2, waveBonus: 0.94 }),
  },
  {
    id: 5,
    name: "山坡果园",
    sector: "第五块小田",
    description: "山路忽直忽弯，跳跳蚤会结伴跑来。",
    difficulty: "专家",
    accent: "#d98770",
    path: pointList([[-40, 150], [240, 150], [240, 310], [480, 310], [480, 470], [720, 470], [720, 150], [1000, 150]]),
    pads: padList([["A1", 80, 70], ["A2", 160, 230], ["B1", 320, 230], ["B2", 400, 390], ["C1", 560, 390], ["C2", 640, 550], ["C3", 800, 550], ["D1", 640, 310], ["D2", 800, 310], ["E1", 800, 70], ["E2", 880, 230]]),
    rules: makeRules({ finalWave: 10, initialGold: 205, lives: 9, enemyHealth: 1.2, enemySpeed: 1.1, enemyCount: 1.16, spawnRate: 0.9, runnerWave: 1, tankWave: 2, waveBonus: 0.88 }),
  },
  {
    id: 6,
    name: "老屋后院",
    sector: "第六块小田",
    description: "最后一篮水果就在屋后，各种小虫都会来凑热闹。",
    difficulty: "噩梦",
    accent: "#b36f58",
    path: pointList([[-40, 310], [160, 310], [160, 70], [400, 70], [400, 230], [640, 230], [640, 470], [880, 470], [880, 310], [1000, 310]]),
    pads: padList([["A1", 80, 230], ["A2", 240, 150], ["B1", 320, 150], ["B2", 480, 150], ["C1", 560, 310], ["C2", 720, 310], ["C3", 560, 390], ["D1", 720, 550], ["D2", 800, 390], ["E1", 920, 230]]),
    rules: makeRules({ finalWave: 12, initialGold: 195, lives: 8, enemyHealth: 1.3, enemySpeed: 1.14, enemyCount: 1.22, spawnRate: 0.84, runnerWave: 1, tankWave: 2, waveBonus: 0.8 }),
  },
];

const MODES: ModeConfig[] = [
  {
    id: "survival",
    name: "无尽巡园",
    badge: "慢慢守",
    description: "没有最后一群，小虫会越来越多。看看你能守多久。",
    levelId: 3,
    accent: "#91c987",
    rules: makeRules({ finalWave: null, initialGold: 245, enemyCount: 1.08, spawnRate: 0.9, waveBonus: 0.95 }),
  },
  {
    id: "blitz",
    name: "阵雨抢收",
    badge: "赶时间",
    description: "阵雨前连续守住六群小虫。露珠充足，但准备时间很短。",
    levelId: 2,
    accent: "#78aeb0",
    rules: makeRules({ finalWave: 6, initialGold: 310, lives: 8, enemyHealth: 0.96, enemySpeed: 1.3, enemyCount: 1.2, spawnRate: 0.58, waveBonus: 0.9, runnerWave: 1, tankWave: 2 }),
  },
  {
    id: "hardcore",
    name: "三果挑战",
    badge: "3 个水果",
    description: "果篮里只剩三个水果，小虫更强，收集到的露珠也更少。",
    levelId: 6,
    accent: "#dc826d",
    rules: makeRules({ finalWave: 10, initialGold: 190, lives: 3, enemyHealth: 1.38, enemySpeed: 1.14, enemyCount: 1.25, spawnRate: 0.82, waveBonus: 0.68, runnerWave: 1, tankWave: 2 }),
  },
];

const LEGACY_TITLES_BY_NEW: Record<string, string> = {
  晨露菜畦: "河岸数据港",
  河边果摊: "双湾转运站",
  苹果树下: "中央回路",
  南瓜田埂: "北岸折返",
  山坡果园: "矩阵峡谷",
  老屋后院: "核心迷城",
  无尽巡园: "无尽生存",
  阵雨抢收: "闪电战",
  三果挑战: "硬核协议",
};

const CURRENT_TITLES_BY_LEGACY = Object.fromEntries(
  Object.entries(LEGACY_TITLES_BY_NEW).map(([current, legacy]) => [legacy, current]),
) as Record<string, string>;

const getGuestRecord = (
  records: Record<string, GuestRecord>,
  category: string,
  title: string,
) => {
  const legacyCategory = category === "果园故事"
    ? "战役模式"
    : category === "趣味挑战"
      ? "特殊模式"
      : category;
  const legacyTitle = LEGACY_TITLES_BY_NEW[title] ?? title;
  return records[`${category}:${title}`]
    ?? records[`${legacyCategory}:${legacyTitle}`]
    ?? records[`${legacyCategory}:${title}`];
};

const TOWERS: Record<
  TowerKind,
  {
    name: string;
    tagline: string;
    cost: number;
    range: number;
    damage: number;
    rate: number;
    projectileSpeed: number;
    color: string;
    slow: number;
  }
> = {
  pulse: {
    name: "蓝莓投手",
    tagline: "灵活 · 连发",
    cost: 70,
    range: 142,
    damage: 20,
    rate: 0.62,
    projectileSpeed: 520,
    color: "#9271bd",
    slow: 0,
  },
  frost: {
    name: "薄荷喷壶",
    tagline: "清凉 · 减速",
    cost: 95,
    range: 124,
    damage: 10,
    rate: 0.88,
    projectileSpeed: 410,
    color: "#6fb69a",
    slow: 0.58,
  },
  rail: {
    name: "栗子大炮",
    tagline: "远投 · 重击",
    cost: 145,
    range: 225,
    damage: 78,
    rate: 1.92,
    projectileSpeed: 760,
    color: "#d59a56",
    slow: 0,
  },
};

const ENEMY_ORDER: EnemyKind[] = ["drone", "runner", "tank", "shield", "support", "boss"];

const ENEMY_PROFILES: Record<
  EnemyKind,
  {
    name: string;
    shortName: string;
    hp: number;
    speed: number;
    reward: number;
    radius: number;
    leakDamage: number;
    armor: number;
    shieldRatio: number;
    slowResistance: number;
    color: string;
    description: string;
  }
> = {
  drone: {
    name: "小叶虫",
    shortName: "叶",
    hp: 72,
    speed: 53,
    reward: 13,
    radius: 15,
    leakDamage: 1,
    armor: 0,
    shieldRatio: 0,
    slowResistance: 0,
    color: "#91ad62",
    description: "最常见的小虫，走得不快也不慢。",
  },
  runner: {
    name: "跳跳蚤",
    shortName: "跳",
    hp: 38,
    speed: 92,
    reward: 10,
    radius: 12,
    leakDamage: 1,
    armor: 0,
    shieldRatio: 0,
    slowResistance: 0,
    color: "#df8a72",
    description: "个头很小却跑得飞快，最好先让它慢下来。",
  },
  tank: {
    name: "厚壳甲虫",
    shortName: "壳",
    hp: 210,
    speed: 35,
    reward: 28,
    radius: 20,
    leakDamage: 2,
    armor: 0.2,
    shieldRatio: 0,
    slowResistance: 0.12,
    color: "#a56f52",
    description: "硬壳能挡住部分伤害；栗子大炮可以敲开它。",
  },
  shield: {
    name: "圆壳蜗牛",
    shortName: "蜗",
    hp: 92,
    speed: 46,
    reward: 21,
    radius: 16,
    leakDamage: 1,
    armor: 0,
    shieldRatio: 0.72,
    slowResistance: 0.08,
    color: "#78aaa0",
    description: "圆圆的壳会先挡下伤害；蓝莓籽更容易敲碎它。",
  },
  support: {
    name: "花粉虫",
    shortName: "粉",
    hp: 84,
    speed: 43,
    reward: 24,
    radius: 16,
    leakDamage: 1,
    armor: 0,
    shieldRatio: 0,
    slowResistance: 0,
    color: "#d6ae62",
    description: "会给附近的小虫送花粉点心，应该优先赶走。",
  },
  boss: {
    name: "贪吃毛毛虫",
    shortName: "王",
    hp: 0,
    speed: 28,
    reward: 0,
    radius: 28,
    leakDamage: 4,
    armor: 0.12,
    shieldRatio: 0.35,
    slowResistance: 0.55,
    color: "#d18455",
    description: "果园里最贪吃的大家伙，饿急了会跑得更快。",
  },
};

const DEFAULT_PRIORITY: Record<TowerKind, TargetPriority> = {
  pulse: "first",
  frost: "fast",
  rail: "strong",
};

const PRIORITY_LABELS: Record<TargetPriority, string> = {
  first: "前线",
  strong: "最强",
  fast: "最快",
};

const SPECIALIZATIONS: Record<
  TowerKind,
  Array<{ id: TowerSpecialization; name: string; description: string }>
> = {
  pulse: [
    { id: "pulse_chain", name: "弹跳果籽", description: "命中后再弹向 1 只小虫，造成 55% 伤害" },
    { id: "pulse_overdrive", name: "熟透蓝莓", description: "投掷速度提高 25%，距离缩短 10%" },
  ],
  frost: [
    { id: "frost_zero", name: "冰凉薄荷", description: "清凉效果更强，持续时间延长至 2.1 秒" },
    { id: "frost_brittle", name: "清晨露水", description: "被淋湿的小虫会受到伙伴额外伤害" },
  ],
  rail: [
    { id: "rail_pierce", name: "双响栗子", description: "继续砸中附近第 2 只小虫，造成 60% 伤害" },
    { id: "rail_mark", name: "裂壳果仁", description: "留下 3 秒裂壳记号，使后续伤害提高" },
  ],
};

const TOWER_TACTICS: Record<TowerKind, { role: string; placement: string }> = {
  pulse: {
    role: "稳定赶走普通小虫，并快速敲开蜗牛圆壳。",
    placement: "适合摆在连续弯道内侧，让蓝莓籽能多打几次。",
  },
  frost: {
    role: "用清凉薄荷水放慢虫群，给其他伙伴留出时间。",
    placement: "优先照顾小路入口或长直道，目标建议选择“最快”。",
  },
  rail: {
    role: "从远处抛出大栗子，专门对付厚壳甲虫和大毛毛虫。",
    placement: "摆在视野开阔的后排空地，别让它的远投距离浪费。",
  },
};

const ENEMY_COUNTERS: Record<EnemyKind, string> = {
  drone: "用蓝莓投手在弯道旁组成交叉投掷。",
  runner: "薄荷喷壶设为“最快”，优先淋湿跳跳蚤。",
  tank: "栗子大炮能敲开硬壳，适合设置为“最强”。",
  shield: "蓝莓籽敲圆壳更有效，先碎壳再一起赶走。",
  support: "花粉虫会喂饱伙伴，应该在队伍中段前优先赶走。",
  boss: "留好驱虫铃，让三位植物伙伴持续集中攻击。",
};

const createEnemyCounts = (): EnemyCounts => ({
  drone: 0,
  runner: 0,
  tank: 0,
  shield: 0,
  support: 0,
  boss: 0,
});

const createBattleStats = (): BattleStats => ({
  kills: 0,
  damageDealt: 0,
  goldEarned: 0,
  goldSpent: 0,
  leaks: 0,
  towersBuilt: 0,
  towersSold: 0,
  skillsUsed: 0,
  bossesKilled: 0,
  wavesCleared: 0,
});

const isBossWave = (wave: number, rules: RuleSet) =>
  rules.finalWave === null ? wave > 0 && wave % 5 === 0 : wave === rules.finalWave;

const getWavePlan = (wave: number, rules: RuleSet): WavePlan => {
  const safeWave = Math.max(1, wave);
  const total = Math.max(1, Math.round((8 + safeWave * 2) * rules.enemyCount));
  const sequence: EnemyKind[] = [];

  for (let serial = 0; serial < total; serial += 1) {
    let kind: EnemyKind = "drone";
    if (safeWave >= rules.runnerWave && serial % 5 === 3) kind = "runner";
    if (safeWave >= rules.tankWave && serial % 7 === 6) kind = "tank";
    if (safeWave >= 3 && serial % 9 === 5) kind = "shield";
    if (safeWave >= 4 && serial % 11 === 8) kind = "support";
    sequence.push(kind);
  }

  const hasBoss = isBossWave(safeWave, rules);
  if (hasBoss) sequence[sequence.length - 1] = "boss";
  const counts = createEnemyCounts();
  sequence.forEach((kind) => { counts[kind] += 1; });

  return {
    wave: safeWave,
    sequence,
    counts,
    clearBonus: Math.round((20 + safeWave * 5) * rules.waveBonus),
    hasBoss,
  };
};

const getWaveTip = (counts: EnemyCounts) => {
  if (counts.boss > 0) return "大毛毛虫来了：留好驱虫铃，并用栗子大炮集中招呼它。";
  if (counts.support > 0) return "花粉虫会喂饱同伴，尽早在小路前段把它赶走。";
  if (counts.shield > 0) return "圆壳蜗牛出现：蓝莓投手能更快敲开它的壳。";
  if (counts.runner >= Math.max(2, counts.tank * 2)) return "跳跳蚤很多：让薄荷喷壶优先照顾“最快”的小虫。";
  if (counts.tank > 0) return "厚壳甲虫来了：栗子大炮可以造成完整伤害。";
  return "普通虫群：让不同植物伙伴一起照顾同一个弯道。";
};

const getTowerRange = (tower: Tower) =>
  TOWERS[tower.kind].range *
  (1 + (tower.level - 1) * 0.08) *
  (tower.specialization === "pulse_overdrive" ? 0.9 : 1);

const getTowerRate = (tower: Tower) =>
  (TOWERS[tower.kind].rate / (1 + (tower.level - 1) * 0.18)) *
  (tower.specialization === "pulse_overdrive" ? 0.8 : 1);

const getTowerDamage = (tower: Tower) =>
  TOWERS[tower.kind].damage * (1 + (tower.level - 1) * 0.46);

const isValidSpecialization = (
  kind: TowerKind,
  specialization: TowerSpecialization | null | undefined,
): specialization is TowerSpecialization =>
  Boolean(specialization && SPECIALIZATIONS[kind].some((item) => item.id === specialization));

const getRemainingPathDistance = (enemy: Enemy, path: Point[]) => {
  const next = path[enemy.pathIndex];
  if (!next) return 0;
  let remaining = distance(enemy, next);
  for (let index = enemy.pathIndex; index < path.length - 1; index += 1) {
    remaining += distance(path[index], path[index + 1]);
  }
  return remaining;
};

const selectTarget = (tower: Tower, enemies: Enemy[], path: Point[]) => {
  if (enemies.length === 0) return undefined;
  return [...enemies].sort((a, b) => {
    if (tower.priority === "strong") {
      return b.hp + b.shield - (a.hp + a.shield) || getRemainingPathDistance(a, path) - getRemainingPathDistance(b, path);
    }
    if (tower.priority === "fast") {
      return b.speed - a.speed || getRemainingPathDistance(a, path) - getRemainingPathDistance(b, path);
    }
    return getRemainingPathDistance(a, path) - getRemainingPathDistance(b, path);
  })[0];
};

const createGame = (rules: RuleSet): Game => ({
  enemies: [],
  towers: [],
  projectiles: [],
  particles: [],
  gold: rules.initialGold,
  lives: rules.lives,
  score: 0,
  wave: 0,
  active: false,
  paused: false,
  autoWave: false,
  autoWaveTimer: 0,
  empCooldown: 0,
  empPulseUntil: 0,
  speed: 1,
  won: false,
  lost: false,
  spawnRemaining: 0,
  spawnTotal: 0,
  spawnTimer: 0,
  spawnSerial: 0,
  elapsed: 0,
  nextId: 1,
  stats: createBattleStats(),
});

const createEmptyGuestSave = (): GuestSave => ({
  version: 1,
  updatedAt: 0,
  records: {},
  session: null,
});

const parseGuestSave = (raw: string | null): GuestSave => {
  if (!raw) return createEmptyGuestSave();
  try {
    const candidate = JSON.parse(raw) as Partial<GuestSave>;
    if (candidate.version !== 1 || !candidate.records || typeof candidate.records !== "object") {
      return createEmptyGuestSave();
    }
    const session = candidate.session;
    const validSession =
      session &&
      typeof session.levelId === "number" &&
      typeof session.title === "string" &&
      typeof session.category === "string" &&
      session.rules &&
      session.game &&
      Array.isArray(session.game.enemies) &&
      Array.isArray(session.game.towers);
    return {
      version: 1,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
      records: candidate.records,
      session: validSession ? session : null,
    };
  } catch {
    return createEmptyGuestSave();
  }
};

const toUi = (game: Game, version = 0): UiState => ({
  gold: game.gold,
  lives: game.lives,
  score: game.score,
  wave: game.wave,
  active: game.active,
  paused: game.paused,
  autoWave: game.autoWave,
  autoWaveTimer: game.autoWaveTimer,
  empCooldown: game.empCooldown,
  speed: game.speed,
  won: game.won,
  lost: game.lost,
  spawnRemaining: game.spawnRemaining,
  spawnTotal: game.spawnTotal,
  stats: { ...game.stats },
  enemies: game.enemies.length,
  version,
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function polygonPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
}

function TowerIcon({ kind, mini = false }: { kind: TowerKind; mini?: boolean }) {
  const tower = TOWERS[kind];
  return (
    <span
      className={`towerGlyph towerGlyph-${kind}${mini ? " mini" : ""}`}
      style={{ "--tower-color": tower.color } as React.CSSProperties}
      aria-hidden="true"
    >
      <i className="towerGlyphBase" />
      <i className="towerGlyphBody" />
      <i className="towerGlyphBarrel" />
      <i className="towerGlyphCore" />
    </span>
  );
}

function EnemyIcon({ kind }: { kind: EnemyKind }) {
  const enemy = ENEMY_PROFILES[kind];
  return (
    <span
      className={`enemyGlyph enemyGlyph-${kind}`}
      style={{ "--enemy-color": enemy.color } as React.CSSProperties}
      aria-hidden="true"
    >
      <i className="enemyGlyphHalo" />
      <i className="enemyGlyphBody" />
      <i className="enemyGlyphCore" />
      <b>{enemy.shortName}</b>
    </span>
  );
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeLevelRef = useRef<LevelConfig>(LEVELS[0]);
  const activeRulesRef = useRef<RuleSet>(LEVELS[0].rules);
  const gameRef = useRef<Game>(createGame(LEVELS[0].rules));
  const selectedKindRef = useRef<TowerKind | null>("pulse");
  const selectedTowerRef = useRef<number | null>(null);
  const hoverRef = useRef<Point | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestSaveRef = useRef<GuestSave>(createEmptyGuestSave());
  const saveReadyRef = useRef(false);
  const resultRecordedRef = useRef(false);
  const screenRef = useRef<Screen>("home");
  const battleReadyRef = useRef(false);
  const battleOriginRef = useRef<Screen>("home");
  const battleCanGoBackRef = useRef(false);
  const announcedScreenRef = useRef<Screen | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [activeMission, setActiveMission] = useState<ActiveMission>({
    category: "果园故事",
    title: LEVELS[0].name,
    level: LEVELS[0],
    rules: LEVELS[0].rules,
  });
  const [selectedKind, setSelectedKind] = useState<TowerKind | null>("pulse");
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [toast, setToast] = useState("先请植物伙伴入场，再迎接小虫");
  const [ui, setUi] = useState<UiState>(() => toUi(gameRef.current));
  const [guestSave, setGuestSave] = useState<GuestSave>(() => createEmptyGuestSave());
  const [saveStatus, setSaveStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const syncUi = () =>
    setUi((previous) => toUi(gameRef.current, previous.version + 1));

  const writeGuestSave = (next: GuestSave, refreshUi = true) => {
    if (!saveReadyRef.current) return;
    guestSaveRef.current = next;
    if (refreshUi) setGuestSave(next);
    try {
      window.localStorage.setItem(GUEST_SAVE_KEY, JSON.stringify(next));
      setSaveStatus("ready");
    } catch {
      setSaveStatus("unavailable");
    }
  };

  const saveCurrentSession = (refreshUi = true) => {
    const game = gameRef.current;
    const now = Date.now();
    const session: GuestSession | null =
      game.won || game.lost
        ? null
        : {
            category: activeMission.category,
            title: activeMission.title,
            levelId: activeMission.level.id,
            rules: activeRulesRef.current,
            game: {
              ...game,
              enemies: game.enemies.map((enemy) => ({ ...enemy })),
              towers: game.towers.map((tower) => ({ ...tower })),
              paused: game.active ? true : game.paused,
              stats: { ...game.stats },
              projectiles: [],
              particles: [],
            },
            savedAt: now,
            layout: "portrait",
          };
    writeGuestSave(
      {
        ...guestSaveRef.current,
        updatedAt: now,
        session,
      },
      refreshUi,
    );
  };

  const navigateScreen = (
    next: Screen,
    options: { replace?: boolean; saveBattle?: boolean } = {},
  ) => {
    const previous = screenRef.current;
    if (previous === "game" && next !== "game" && options.saveBattle !== false) {
      gameRef.current.paused = true;
      saveCurrentSession();
    }
    screenRef.current = next;
    setScreen(next);
    if (typeof window === "undefined") return;
    const targetHash = SCREEN_HASH[next];
    if (window.location.hash === targetHash) return;
    const targetUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
    if (options.replace) {
      window.history.replaceState({ screen: next, from: previous }, "", targetUrl);
    } else {
      window.history.pushState({ screen: next, from: previous }, "", targetUrl);
    }
  };

  const startMission = (
    level: LevelConfig,
    rules: RuleSet,
    category: string,
    title: string,
  ) => {
    activeLevelRef.current = level;
    activeRulesRef.current = rules;
    gameRef.current = createGame(rules);
    resultRecordedRef.current = false;
    hoverRef.current = null;
    selectedKindRef.current = "pulse";
    selectedTowerRef.current = null;
    setSelectedKind("pulse");
    setSelectedTowerId(null);
    setActiveMission({ category, title, level, rules });
    setUi(toUi(gameRef.current));
    setToast("先请植物伙伴入场，再迎接小虫");
    battleOriginRef.current = screenRef.current;
    battleCanGoBackRef.current = false;
    battleReadyRef.current = true;
    navigateScreen("game");
  };

  const returnToLobby = () => {
    if (
      battleOriginRef.current === "home" &&
      battleCanGoBackRef.current &&
      typeof window !== "undefined"
    ) {
      gameRef.current.paused = true;
      saveCurrentSession();
      window.history.back();
      return;
    }
    navigateScreen("home", { replace: true });
  };

  const resumeGuestSession = () => {
    const session = guestSaveRef.current.session;
    if (!session) return;
    const level = LEVELS.find((item) => item.id === session.levelId);
    if (!level) {
      writeGuestSave({ ...guestSaveRef.current, session: null, updatedAt: Date.now() });
      return;
    }
    const migratePoint = (point: Point) =>
      session.layout === "portrait" ? point : { ...point, ...rotateForPortrait(point.x, point.y) };
    const restoredEnemies = session.game.enemies.map((enemy) => {
      const profile = ENEMY_PROFILES[enemy.kind] ?? ENEMY_PROFILES.drone;
      return {
        ...enemy,
        ...migratePoint(enemy),
        shield: Number.isFinite(enemy.shield) ? Math.max(0, enemy.shield) : 0,
        maxShield: Number.isFinite(enemy.maxShield) ? Math.max(0, enemy.maxShield) : 0,
        armor: Number.isFinite(enemy.armor) ? Math.max(0, enemy.armor) : profile.armor,
        leakDamage: Number.isFinite(enemy.leakDamage) ? Math.max(1, enemy.leakDamage) : profile.leakDamage,
        slowResistance: Number.isFinite(enemy.slowResistance)
          ? Math.max(0, Math.min(0.9, enemy.slowResistance))
          : profile.slowResistance,
        abilityTimer: Number.isFinite(enemy.abilityTimer) ? enemy.abilityTimer : 1.4,
        stunnedUntil: Number.isFinite(enemy.stunnedUntil) ? enemy.stunnedUntil : 0,
        brittleUntil: Number.isFinite(enemy.brittleUntil) ? enemy.brittleUntil : 0,
        markedUntil: Number.isFinite(enemy.markedUntil) ? enemy.markedUntil : 0,
      };
    });
    const restoredTowers = session.game.towers.map((tower) => ({
      ...tower,
      ...migratePoint(tower),
      angle: session.layout === "portrait" ? tower.angle : Math.PI / 2,
      priority:
        tower.priority === "first" || tower.priority === "strong" || tower.priority === "fast"
          ? tower.priority
          : DEFAULT_PRIORITY[tower.kind],
      specialization: isValidSpecialization(tower.kind, tower.specialization)
        ? tower.specialization
        : tower.level >= 3
          ? SPECIALIZATIONS[tower.kind][0].id
          : null,
    }));
    const restoredGame: Game = {
      ...session.game,
      enemies: restoredEnemies,
      towers: restoredTowers,
      paused: session.game.active ? true : false,
      autoWave: Boolean(session.game.autoWave),
      autoWaveTimer:
        Number.isFinite(session.game.autoWaveTimer)
          ? Math.max(0, session.game.autoWaveTimer)
          : 0,
      empCooldown: Number.isFinite(session.game.empCooldown)
        ? Math.max(0, session.game.empCooldown)
        : 0,
      empPulseUntil: 0,
      stats: { ...createBattleStats(), ...(session.game.stats ?? {}) },
      projectiles: [],
      particles: [],
    };
    const restoredCategory = session.category === "战役模式"
      ? "果园故事"
      : session.category === "特殊模式"
        ? "趣味挑战"
        : session.category;
    const restoredTitle = CURRENT_TITLES_BY_LEGACY[session.title] ?? session.title;
    activeLevelRef.current = level;
    activeRulesRef.current = session.rules;
    gameRef.current = restoredGame;
    resultRecordedRef.current = false;
    hoverRef.current = null;
    selectedKindRef.current = "pulse";
    selectedTowerRef.current = null;
    setSelectedKind("pulse");
    setSelectedTowerId(null);
    setActiveMission({
      category: restoredCategory,
      title: restoredTitle,
      level,
      rules: session.rules,
    });
    setUi(toUi(restoredGame));
    setToast(restoredGame.active ? "本机存档已恢复，按空格键继续" : "本机存档已恢复");
    const currentHash = typeof window !== "undefined" ? window.location.hash : "";
    const historyOrigin =
      typeof window !== "undefined" &&
      typeof window.history.state?.from === "string" &&
      window.history.state.from in SCREEN_HASH
        ? (window.history.state.from as Screen)
        : currentHash === SCREEN_HASH.game
          ? "game"
          : screenRef.current;
    battleOriginRef.current = currentHash === SCREEN_HASH.game ? historyOrigin : screenRef.current;
    battleCanGoBackRef.current =
      currentHash === SCREEN_HASH.home ||
      (currentHash === SCREEN_HASH.game && historyOrigin === "home");
    battleReadyRef.current = true;
    navigateScreen("game");
  };

  const returnToSavedBattle = () => {
    if (
      battleReadyRef.current &&
      typeof window !== "undefined" &&
      window.history.state?.from === "game"
    ) {
      window.history.back();
      return;
    }
    resumeGuestSession();
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  };

  const chooseTower = (kind: TowerKind) => {
    selectedKindRef.current = kind;
    selectedTowerRef.current = null;
    setSelectedKind(kind);
    setSelectedTowerId(null);
  };

  const chooseBuiltTower = (id: number | null) => {
    selectedTowerRef.current = id;
    selectedKindRef.current = null;
    setSelectedTowerId(id);
    setSelectedKind(null);
  };

  const canPlace = (point: Point) => {
    return !gameRef.current.towers.some((tower) => distance(point, tower) < 1);
  };

  const handleBuildPad = (point: Point) => {
    const existing = gameRef.current.towers.find(
      (tower) => distance(point, tower) < 1,
    );
    if (existing) {
      chooseBuiltTower(existing.id);
      return;
    }

    const kind = selectedKindRef.current;
    if (!kind || gameRef.current.won || gameRef.current.lost) {
      chooseBuiltTower(null);
      return;
    }
    const spec = TOWERS[kind];
    if (!canPlace(point)) {
      showToast("这里已经有伙伴啦，请换一块空地");
      return;
    }
    if (gameRef.current.gold < spec.cost) {
      showToast("露珠不够，赶走小虫可以收集更多");
      return;
    }
    gameRef.current.gold -= spec.cost;
    gameRef.current.stats.goldSpent += spec.cost;
    gameRef.current.stats.towersBuilt += 1;
    gameRef.current.towers.push({
      id: gameRef.current.nextId++,
      kind,
      x: point.x,
      y: point.y,
      level: 1,
      cooldown: Math.random() * 0.25,
      angle: -Math.PI / 2,
      spent: spec.cost,
      priority: DEFAULT_PRIORITY[kind],
      specialization: null,
    });
    syncUi();
    showToast(`${spec.name}来帮忙啦`);
  };

  const startWave = () => {
    const game = gameRef.current;
    const rules = activeRulesRef.current;
    if (
      game.active ||
      game.won ||
      game.lost ||
      (rules.finalWave !== null && game.wave >= rules.finalWave)
    ) return;
    game.autoWaveTimer = 0;
    game.wave += 1;
    game.active = true;
    game.paused = false;
    const plan = getWavePlan(game.wave, rules);
    game.spawnTotal = plan.sequence.length;
    game.spawnRemaining = game.spawnTotal;
    game.spawnSerial = 0;
    game.spawnTimer = 0.15;
    syncUi();
    showToast(
      plan.hasBoss
        ? `第 ${game.wave} 群 · “贪吃毛毛虫”正在靠近`
        : `第 ${game.wave} 群小虫正沿着小路过来`,
    );
  };

  const toggleAutoWave = () => {
    const game = gameRef.current;
    const rules = activeRulesRef.current;
    if (game.won || game.lost) return;
    game.autoWave = !game.autoWave;

    if (!game.autoWave) {
      game.autoWaveTimer = 0;
      showToast("已关闭自动迎接下一群");
    } else if (game.active) {
      game.autoWaveTimer = 0;
      showToast("已开启自动迎接，这群赶走后继续");
    } else if (
      game.wave > 0 &&
      (rules.finalWave === null || game.wave < rules.finalWave)
    ) {
      game.autoWaveTimer = AUTO_WAVE_DELAY;
      showToast(`${AUTO_WAVE_DELAY} 秒后迎接第 ${game.wave + 1} 群小虫`);
    } else {
      game.autoWaveTimer = 0;
      showToast("自动迎接已开启，先手动迎接第一群吧");
    }
    syncUi();
  };

  const togglePause = () => {
    const game = gameRef.current;
    if (!game.active || game.won || game.lost) return;
    game.paused = !game.paused;
    syncUi();
  };

  const toggleSpeed = () => {
    gameRef.current.speed = gameRef.current.speed === 1 ? 2 : 1;
    syncUi();
  };

  const resetGame = () => {
    gameRef.current = createGame(activeRulesRef.current);
    resultRecordedRef.current = false;
    hoverRef.current = null;
    chooseTower("pulse");
    syncUi();
    showToast("果园已经收拾好，重新摆放伙伴吧");
  };

  const selectedTower = gameRef.current.towers.find(
    (tower) => tower.id === selectedTowerId,
  );

  const upgradeSelected = () => {
    const tower = gameRef.current.towers.find((item) => item.id === selectedTowerRef.current);
    if (!tower || tower.level >= 2) return;
    const cost = Math.round(TOWERS[tower.kind].cost * (0.45 + tower.level * 0.34));
    if (gameRef.current.gold < cost) {
      showToast("露珠不够，暂时无法成长");
      return;
    }
    gameRef.current.gold -= cost;
    gameRef.current.stats.goldSpent += cost;
    tower.level += 1;
    tower.spent += cost;
    syncUi();
    showToast(`${TOWERS[tower.kind].name}成长到 ${tower.level} 级啦`);
  };

  const specializeSelected = (specialization: TowerSpecialization) => {
    const tower = gameRef.current.towers.find((item) => item.id === selectedTowerRef.current);
    if (
      !tower ||
      tower.level !== 2 ||
      tower.specialization ||
      !isValidSpecialization(tower.kind, specialization)
    ) return;
    const cost = Math.round(TOWERS[tower.kind].cost * (0.45 + tower.level * 0.34));
    if (gameRef.current.gold < cost) {
      showToast("露珠不够，暂时无法长出新能力");
      return;
    }
    const branch = SPECIALIZATIONS[tower.kind].find((item) => item.id === specialization)!;
    gameRef.current.gold -= cost;
    gameRef.current.stats.goldSpent += cost;
    tower.level = 3;
    tower.specialization = specialization;
    tower.spent += cost;
    syncUi();
    showToast(`${TOWERS[tower.kind].name}已解锁“${branch.name}”`);
  };

  const setTargetPriority = (priority: TargetPriority) => {
    const tower = gameRef.current.towers.find((item) => item.id === selectedTowerRef.current);
    if (!tower) return;
    tower.priority = priority;
    syncUi();
    showToast(`${TOWERS[tower.kind].name}已切换为“${PRIORITY_LABELS[priority]}”优先`);
  };

  const activateEmp = () => {
    const game = gameRef.current;
    if (!game.active || game.paused || game.won || game.lost || game.empCooldown > 0) return;
    const targets = game.enemies.filter((enemy) => !enemy.dead);
    if (targets.length === 0) {
      showToast("当前没有可干扰的敌人");
      return;
    }
    targets.forEach((enemy) => {
      enemy.stunnedUntil = Math.max(
        enemy.stunnedUntil,
        game.elapsed + (enemy.kind === "boss" ? 1.25 : 2.4),
      );
    });
    game.empCooldown = EMP_COOLDOWN;
    game.empPulseUntil = game.elapsed + 0.65;
    game.stats.skillsUsed += 1;
    syncUi();
    showToast(`驱虫铃响啦，定住了 ${targets.length} 只小虫`);
  };

  const sellSelected = () => {
    const index = gameRef.current.towers.findIndex(
      (tower) => tower.id === selectedTowerRef.current,
    );
    if (index < 0) return;
    const [tower] = gameRef.current.towers.splice(index, 1);
    const refund = Math.round(tower.spent * 0.65);
    gameRef.current.gold += refund;
    gameRef.current.stats.towersSold += 1;
    chooseTower(tower.kind);
    syncUi();
    showToast(`伙伴回花圃休息了，收回露珠 ${refund}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== "game") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "1") chooseTower("pulse");
      if (event.key === "2") chooseTower("frost");
      if (event.key === "3") chooseTower("rail");
      if (event.key.toLowerCase() === "a" && !event.repeat) toggleAutoWave();
      if (event.key.toLowerCase() === "q" && !event.repeat) activateEmp();
      if (event.code === "Space") {
        event.preventDefault();
        if (gameRef.current.active) togglePause();
        else startWave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const configureCanvas = () => {
      const displayWidth = canvas.clientWidth || WIDTH;
      const renderScale = Math.min(
        2,
        Math.max(1, (window.devicePixelRatio || 1) * (displayWidth / WIDTH)),
      );
      const pixelWidth = Math.round(WIDTH * renderScale);
      const pixelHeight = Math.round(HEIGHT * renderScale);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    };
    configureCanvas();
    const resizeObserver = new ResizeObserver(configureCanvas);
    resizeObserver.observe(canvas);
    let frame = 0;
    let previous = performance.now();
    let uiClock = 0;

    const burst = (x: number, y: number, color: string, count: number) => {
      const game = gameRef.current;
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * 95;
        const life = 0.24 + Math.random() * 0.42;
        game.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 1.5 + Math.random() * 3,
          color,
        });
      }
    };

    const spawnEnemy = () => {
      const game = gameRef.current;
      const rules = activeRulesRef.current;
      const path = activeLevelRef.current.path;
      const serial = game.spawnSerial++;
      const plan = getWavePlan(game.wave, rules);
      const kind = plan.sequence[serial] ?? "drone";
      const profile = ENEMY_PROFILES[kind];
      const scale = (1.08 + (game.wave - 1) * 0.3) * rules.enemyHealth;
      const maxHp =
        kind === "boss"
          ? (620 + game.wave * 145) * rules.enemyHealth
          : profile.hp * scale;
      const maxShield = maxHp * profile.shieldRatio;
      game.enemies.push({
        id: game.nextId++,
        kind,
        x: path[0].x,
        y: path[0].y,
        pathIndex: 1,
        hp: maxHp,
        maxHp,
        speed: profile.speed * (1.04 + game.wave * 0.015) * rules.enemySpeed,
        reward: kind === "boss" ? 100 + game.wave * 8 : profile.reward + Math.floor(game.wave / 3),
        radius: profile.radius,
        slowUntil: 0,
        slowFactor: 1,
        shield: maxShield,
        maxShield,
        armor: profile.armor,
        leakDamage: profile.leakDamage,
        slowResistance: profile.slowResistance,
        abilityTimer: 1.4 + (serial % 3) * 0.35,
        stunnedUntil: 0,
        brittleUntil: 0,
        markedUntil: 0,
        dead: false,
      });
    };

    const update = (dt: number, realDt: number) => {
      const game = gameRef.current;
      const rules = activeRulesRef.current;
      const path = activeLevelRef.current.path;
      if (game.paused || game.won || game.lost) return;
      game.elapsed += dt;
      game.empCooldown = Math.max(0, game.empCooldown - dt);

      if (
        game.autoWave &&
        !game.active &&
        game.wave > 0 &&
        game.autoWaveTimer > 0 &&
        (rules.finalWave === null || game.wave < rules.finalWave)
      ) {
        game.autoWaveTimer = Math.max(0, game.autoWaveTimer - realDt);
        if (game.autoWaveTimer === 0) startWave();
      }

      if (game.active && game.spawnRemaining > 0) {
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0) {
          spawnEnemy();
          game.spawnRemaining -= 1;
          game.spawnTimer = Math.max(0.2, (0.78 - game.wave * 0.035) * rules.spawnRate);
        }
      }

      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        if (enemy.kind === "support" && enemy.stunnedUntil <= game.elapsed) {
          enemy.abilityTimer -= dt;
          if (enemy.abilityTimer <= 0) {
            const ally = game.enemies
              .filter(
                (candidate) =>
                  !candidate.dead &&
                  candidate.id !== enemy.id &&
                  candidate.kind !== "support" &&
                  candidate.hp < candidate.maxHp &&
                  distance(candidate, enemy) <= 96,
              )
              .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
            if (ally) {
              const heal = Math.min(48, ally.maxHp * 0.08);
              ally.hp = Math.min(ally.maxHp, ally.hp + heal);
              burst(ally.x, ally.y, ENEMY_PROFILES.support.color, 7);
            }
            enemy.abilityTimer = 2.6;
          }
        }
        const stunnedFactor =
          enemy.stunnedUntil > game.elapsed ? (enemy.kind === "boss" ? 0.45 : 0.08) : 1;
        const slowedFactor = enemy.slowUntil > game.elapsed ? enemy.slowFactor : 1;
        const rageFactor = enemy.kind === "boss" && enemy.hp / enemy.maxHp < 0.35 ? 1.25 : 1;
        let movement = enemy.speed * dt * Math.min(stunnedFactor, slowedFactor) * rageFactor;
        while (movement > 0 && !enemy.dead) {
          const target = path[enemy.pathIndex];
          if (!target) {
            enemy.dead = true;
            game.lives -= enemy.leakDamage;
            game.stats.leaks += 1;
            burst(enemy.x, enemy.y, "#dd8b9e", 12);
            if (game.lives <= 0) {
              game.lives = 0;
              game.lost = true;
              game.active = false;
              game.autoWaveTimer = 0;
              showToast("果篮被搬空啦——重新摆好伙伴再试一次");
            }
            break;
          }
          const dx = target.x - enemy.x;
          const dy = target.y - enemy.y;
          const segment = Math.hypot(dx, dy);
          if (segment <= movement) {
            enemy.x = target.x;
            enemy.y = target.y;
            enemy.pathIndex += 1;
            movement -= segment;
          } else {
            enemy.x += (dx / segment) * movement;
            enemy.y += (dy / segment) * movement;
            movement = 0;
          }
        }
      }

      const dealDamage = (
        enemy: Enemy,
        amount: number,
        sourceKind: TowerKind,
        color: string,
      ) => {
        if (enemy.dead) return 0;
        let amplified = amount;
        if (enemy.brittleUntil > game.elapsed && sourceKind !== "frost") {
          amplified *= enemy.kind === "boss" ? 1.09 : 1.18;
        }
        if (enemy.markedUntil > game.elapsed) {
          amplified *= enemy.kind === "boss" ? 1.12 : 1.22;
        }

        let actualDamage = 0;
        if (enemy.shield > 0) {
          const shieldMultiplier = sourceKind === "pulse" ? 1.3 : 1;
          const shieldDamage = amplified * shieldMultiplier;
          const absorbed = Math.min(enemy.shield, shieldDamage);
          enemy.shield -= absorbed;
          actualDamage += absorbed;
          amplified = Math.max(0, amplified - absorbed / shieldMultiplier);
          if (enemy.shield === 0 && absorbed > 0) burst(enemy.x, enemy.y, "#91c9e6", 12);
        }

        if (amplified > 0) {
          const armor = sourceKind === "rail" ? 0 : enemy.armor;
          const hpDamage = amplified * (1 - armor);
          const dealt = Math.min(enemy.hp, hpDamage);
          enemy.hp -= hpDamage;
          actualDamage += dealt;
        }
        game.stats.damageDealt += actualDamage;

        if (enemy.hp <= 0 && !enemy.dead) {
          enemy.dead = true;
          game.gold += enemy.reward;
          game.stats.goldEarned += enemy.reward;
          game.stats.kills += 1;
          if (enemy.kind === "boss") game.stats.bossesKilled += 1;
          game.score += Math.round((enemy.maxHp + enemy.maxShield) * 2);
          burst(enemy.x, enemy.y, color, enemy.kind === "boss" ? 34 : 16);
        }
        return actualDamage;
      };

      for (const tower of game.towers) {
        tower.cooldown -= dt;
        const spec = TOWERS[tower.kind];
        const range = getTowerRange(tower);
        const target = selectTarget(
          tower,
          game.enemies.filter((enemy) => !enemy.dead && distance(tower, enemy) <= range),
          path,
        );
        if (target) {
          tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
          if (tower.cooldown <= 0) {
            const muzzleOffset = tower.kind === "rail" ? 49 : tower.kind === "pulse" ? 40 : 38;
            game.projectiles.push({
              kind: tower.kind,
              x: tower.x + Math.cos(tower.angle) * muzzleOffset,
              y: tower.y + Math.sin(tower.angle) * muzzleOffset,
              targetId: target.id,
              speed: spec.projectileSpeed,
              damage: getTowerDamage(tower),
              color: spec.color,
              slow: spec.slow,
              size: tower.kind === "rail" ? 5 : 4,
              sourceTowerId: tower.id,
              specialization: tower.specialization,
            });
            tower.cooldown = getTowerRate(tower);
          }
        }
      }

      const survivingProjectiles: Projectile[] = [];
      for (const projectile of game.projectiles) {
        const target = game.enemies.find(
          (enemy) => enemy.id === projectile.targetId && !enemy.dead,
        );
        if (!target) continue;
        const dx = target.x - projectile.x;
        const dy = target.y - projectile.y;
        const length = Math.hypot(dx, dy);
        const step = projectile.speed * dt;
        const targetVisualRadius = target.radius * (target.kind === "boss" ? 1.08 : 1.16);
        if (length <= step + targetVisualRadius) {
          dealDamage(target, projectile.damage, projectile.kind, projectile.color);
          if (projectile.slow && !target.dead) {
            const rawSlow = projectile.specialization === "frost_zero" ? 0.42 : projectile.slow;
            const resistedSlow = 1 - (1 - rawSlow) * (1 - target.slowResistance);
            target.slowFactor =
              target.slowUntil > game.elapsed
                ? Math.min(target.slowFactor, resistedSlow)
                : resistedSlow;
            target.slowUntil = Math.max(
              target.slowUntil,
              game.elapsed + (projectile.specialization === "frost_zero" ? 2.1 : 1.55),
            );
            if (projectile.specialization === "frost_brittle") {
              target.brittleUntil = Math.max(target.brittleUntil, game.elapsed + 1.9);
            }
          }
          if (projectile.specialization === "rail_mark" && !target.dead) {
            target.markedUntil = Math.max(target.markedUntil, game.elapsed + 3);
          }
          burst(target.x, target.y, projectile.color, 5);

          if (projectile.specialization === "pulse_chain") {
            const chainTarget = game.enemies
              .filter(
                (enemy) =>
                  !enemy.dead &&
                  enemy.id !== target.id &&
                  distance(enemy, target) <= 92,
              )
              .sort((a, b) => distance(a, target) - distance(b, target))[0];
            if (chainTarget) {
              dealDamage(chainTarget, projectile.damage * 0.55, "pulse", projectile.color);
              burst(chainTarget.x, chainTarget.y, projectile.color, 5);
            }
          }

          if (projectile.specialization === "rail_pierce") {
            const pierceTarget = game.enemies
              .filter(
                (enemy) =>
                  !enemy.dead &&
                  enemy.id !== target.id &&
                  distance(enemy, target) <= 118,
              )
              .sort(
                (a, b) =>
                  getRemainingPathDistance(a, path) - getRemainingPathDistance(b, path),
              )[0];
            if (pierceTarget) {
              dealDamage(pierceTarget, projectile.damage * 0.6, "rail", projectile.color);
              burst(pierceTarget.x, pierceTarget.y, projectile.color, 7);
            }
          }
        } else {
          projectile.x += (dx / length) * step;
          projectile.y += (dy / length) * step;
          survivingProjectiles.push(projectile);
        }
      }
      game.projectiles = survivingProjectiles;
      game.enemies = game.enemies.filter((enemy) => !enemy.dead);

      for (const particle of game.particles) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.97;
        particle.vy *= 0.97;
      }
      game.particles = game.particles.filter((particle) => particle.life > 0);

      if (
        game.active &&
        game.spawnRemaining === 0 &&
        game.enemies.length === 0 &&
        !game.lost
      ) {
        game.active = false;
        const bonus = getWavePlan(game.wave, rules).clearBonus;
        game.gold += bonus;
        game.stats.goldEarned += bonus;
        game.stats.wavesCleared += 1;
        if (rules.finalWave !== null && game.wave >= rules.finalWave) {
          game.won = true;
          game.autoWaveTimer = 0;
          game.score += game.lives * 400;
          showToast("所有小虫都回家啦，今天的果篮守住了");
        } else if (game.autoWave) {
          game.autoWaveTimer = AUTO_WAVE_DELAY;
          showToast(
            `第 ${game.wave} 群赶走，露珠 +${bonus} · ${AUTO_WAVE_DELAY} 秒后迎接第 ${game.wave + 1} 群`,
          );
        } else {
          showToast(`第 ${game.wave} 群赶走，收集露珠 +${bonus}`);
        }
      }
    };

    const traceActivePath = () => {
      const path = activeLevelRef.current.path;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      path.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    };

    const drawBackdrop = (game: Game) => {
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, "#b9d990");
      gradient.addColorStop(0.52, "#91c17b");
      gradient.addColorStop(1, "#74aa72");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      for (let row = 0; row < 6; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const x = 15 + column * 180;
          const y = 13 + row * 150;
          roundedRect(ctx, x, y, 150, 124, 28);
          ctx.fillStyle = (row + column) % 2 === 0 ? "rgba(255, 247, 203, .09)" : "rgba(64, 112, 62, .08)";
          ctx.fill();
          ctx.strokeStyle = "rgba(250, 244, 204, .08)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "rgba(73, 116, 61, .15)";
          [[16, 16], [134, 16], [16, 108], [134, 108]].forEach(([dx, dy]) => {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
      ctx.strokeStyle = "rgba(70, 112, 59, .055)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += 180) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < HEIGHT; y += 150) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      const blossoms: Array<[number, number, string]> = [
        [52, 92, "#f6e4a0"], [650, 122, "#f0b7a2"], [84, 286, "#f4c96d"],
        [626, 352, "#ead8a0"], [53, 508, "#e6a493"], [665, 572, "#f5dfa0"],
        [94, 730, "#f0c779"], [620, 806, "#e7a1a0"], [360, 848, "#f3db91"],
      ];
      blossoms.forEach(([x, y, color]) => {
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = (petal / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#8c7142";
        ctx.fill();
      });

      const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 170, WIDTH / 2, HEIGHT / 2, 600);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(35, 75, 41, .22)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.12 + Math.sin(game.elapsed * 0.7) * 0.025;
      const glow = ctx.createRadialGradient(WIDTH * 0.52, HEIGHT * 0.45, 0, WIDTH * 0.52, HEIGHT * 0.45, 330);
      glow.addColorStop(0, "rgba(255, 225, 131, .45)");
      glow.addColorStop(1, "rgba(255, 225, 131, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    };

    const drawPath = (game: Game) => {
      const path = activeLevelRef.current.path;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const layers: Array<{ width: number; color: string; blur?: number }> = [
        { width: 94, color: "rgba(62, 68, 39, .28)", blur: 16 },
        { width: 86, color: "#725b42" },
        { width: 78, color: "#dbc397" },
        { width: 70, color: "#b99669" },
        { width: 62, color: "#cba978" },
      ];
      layers.forEach((layer) => {
        traceActivePath();
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.width;
        ctx.shadowColor = layer.blur ? "rgba(65, 64, 38, .42)" : "transparent";
        ctx.shadowBlur = layer.blur ?? 0;
        ctx.shadowOffsetY = layer.blur ? 7 : 0;
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      traceActivePath();
      ctx.strokeStyle = "rgba(255, 242, 202, .4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 9]);
      ctx.stroke();

      traceActivePath();
      ctx.setLineDash([14, 22]);
      ctx.lineDashOffset = -game.elapsed * 20;
      ctx.strokeStyle = "rgba(245, 224, 169, .62)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      path.slice(1, -1).forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 38, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(112, 78, 49, .2)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(point.x, point.y, 32, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 235, 191, .18)";
        ctx.stroke();
      });
      ctx.restore();
    };

    const drawPadFoundations = () => {
      ctx.save();
      for (const { point } of activeLevelRef.current.pads) {
        const occupied = gameRef.current.towers.some((tower) => distance(point, tower) < 1);
        ctx.translate(point.x, point.y);
        ctx.beginPath();
        ctx.ellipse(0, 12, 29, 14, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(65, 73, 40, .3)";
        ctx.fill();
        roundedRect(ctx, -27, -21, 54, 42, 14);
        ctx.fillStyle = occupied ? "#80704f" : "rgba(221, 207, 164, .9)";
        ctx.fill();
        ctx.strokeStyle = occupied ? "rgba(75, 108, 55, .48)" : "rgba(95, 120, 65, .46)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(96, 116, 65, .35)";
        ctx.stroke();
        [[-19, -10], [19, -10], [-19, 10], [19, 10]].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(100, 125, 67, .48)";
          ctx.fill();
        });
        ctx.translate(-point.x, -point.y);
      }
      ctx.restore();
    };

    const drawTowerRange = (tower: Tower) => {
      const spec = TOWERS[tower.kind];
      const range = getTowerRange(tower);
      ctx.beginPath();
      ctx.arc(0, 0, range, 0, Math.PI * 2);
      ctx.fillStyle = `${spec.color}0d`;
      ctx.fill();
      ctx.setLineDash([7, 8]);
      ctx.strokeStyle = `${spec.color}6c`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawTowerBase = (tower: Tower, selected: boolean) => {
      const spec = TOWERS[tower.kind];
      ctx.beginPath();
      ctx.ellipse(0, 14, 28, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(61, 65, 35, .35)";
      ctx.fill();
      roundedRect(ctx, -25, -22, 50, 44, 14);
      ctx.fillStyle = "#82684a";
      ctx.fill();
      ctx.lineWidth = selected ? 2.2 : 1.5;
      ctx.strokeStyle = selected ? spec.color : "#5f784e";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
      ctx.fillStyle = "#4f6b42";
      ctx.fill();
      ctx.strokeStyle = `${spec.color}75`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      for (let index = 0; index < tower.level; index += 1) {
        const angle = Math.PI * 0.75 + index * Math.PI * 0.75;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 18, Math.sin(angle) * 18, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = spec.color;
        ctx.fill();
      }
      if (tower.level >= 2) {
        ctx.strokeStyle = `${spec.color}5c`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 19, -Math.PI * 0.72, Math.PI * 0.1);
        ctx.stroke();
      }
    };

    const drawTower = (tower: Tower, selected: boolean) => {
      const spec = TOWERS[tower.kind];
      const pulse = 0.78 + Math.sin(gameRef.current.elapsed * 3.2 + tower.id) * 0.16;
      ctx.save();
      ctx.translate(tower.x, tower.y);
      if (selected) drawTowerRange(tower);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(56, 65, 35, .38)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      drawTowerBase(tower, selected);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const compactBoost = canvas.clientWidth > 0 && canvas.clientWidth < 600 ? 1.08 : 1;
      ctx.scale(1.18 * compactBoost, 1.18 * compactBoost);
      ctx.rotate(tower.angle);

      if (tower.kind === "pulse") {
        ctx.beginPath();
        ctx.arc(-1, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = "#725796";
        ctx.fill();
        ctx.strokeStyle = `${spec.color}8c`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        [-5, 5].forEach((y) => {
          roundedRect(ctx, 6, y - 3, 30, 6, 3);
          ctx.fillStyle = "#496b3e";
          ctx.fill();
        });
        ctx.save();
        ctx.rotate(-0.55);
        ctx.beginPath();
        ctx.ellipse(-8, -12, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#7eaa57";
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(-1, 0, 6.8, 0, Math.PI * 2);
        ctx.fillStyle = spec.color;
        ctx.globalAlpha = pulse;
        ctx.fill();
      } else if (tower.kind === "frost") {
        ctx.beginPath();
        ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
        ctx.fillStyle = "#4f8667";
        ctx.fill();
        ctx.strokeStyle = `${spec.color}aa`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        roundedRect(ctx, 5, -7, 31, 14, 7);
        ctx.fillStyle = "#d6dfac";
        ctx.fill();
        roundedRect(ctx, 12, -3, 24, 6, 3);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = spec.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#eff4ce";
        ctx.fill();
      } else {
        roundedRect(ctx, -14, -11, 28, 22, 9);
        ctx.fillStyle = "#8a5d3d";
        ctx.fill();
        ctx.strokeStyle = `${spec.color}86`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        roundedRect(ctx, 2, -6, 43, 12, 6);
        ctx.fillStyle = "#68472f";
        ctx.fill();
        roundedRect(ctx, 8, -2, 37, 4, 2);
        ctx.fillStyle = spec.color;
        ctx.globalAlpha = pulse;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(-4, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#f4d89b";
        ctx.fill();
      }
      if (tower.level === 3) {
        ctx.rotate(-tower.angle);
        ctx.beginPath();
        ctx.arc(0, 0, 24 + Math.sin(gameRef.current.elapsed * 3 + tower.id), 0, Math.PI * 2);
        ctx.strokeStyle = `${spec.color}64`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawEnemy = (enemy: Enemy) => {
      const color = ENEMY_PROFILES[enemy.kind].color;
      const slowed = enemy.slowUntil > gameRef.current.elapsed;
      const stunned = enemy.stunnedUntil > gameRef.current.elapsed;
      const brittle = enemy.brittleUntil > gameRef.current.elapsed;
      const marked = enemy.markedUntil > gameRef.current.elapsed;
      const target = activeLevelRef.current.path[enemy.pathIndex];
      const angle = target ? Math.atan2(target.y - enemy.y, target.x - enemy.x) : 0;
      const bob = enemy.kind === "runner" ? Math.sin(gameRef.current.elapsed * 12 + enemy.id) * 1.4 : 0;
      const compactBoost = canvas.clientWidth > 0 && canvas.clientWidth < 600 ? 1.08 : 1;
      const visualScale = (enemy.kind === "boss" ? 1.08 : 1.16) * compactBoost;
      ctx.save();
      ctx.translate(enemy.x, enemy.y + bob);
      ctx.rotate(angle);
      ctx.scale(visualScale, visualScale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = `${color}38`;
      ctx.shadowBlur = enemy.kind === "boss" ? 12 : 8;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.ellipse(-2, 8, enemy.radius * 0.95, enemy.radius * 0.46, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(55, 64, 34, .28)";
      ctx.fill();

      if (enemy.kind === "boss") {
        ctx.save();
        ctx.rotate(-gameRef.current.elapsed * 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.strokeStyle = enemy.hp / enemy.maxHp < 0.35 ? "#db755d" : `${color}98`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        roundedRect(ctx, -27, -21, 54, 42, 18);
        ctx.fillStyle = "#718b48";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(5, 0, 11, 0, Math.PI * 2);
        ctx.fillStyle = enemy.hp / enemy.maxHp < 0.35 ? "#db755d" : color;
        ctx.globalAlpha = 0.82 + Math.sin(gameRef.current.elapsed * 5) * 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        roundedRect(ctx, -20, -3, 13, 6, 3);
        ctx.fillStyle = "rgba(94, 59, 35, .72)";
        ctx.fill();
      } else if (enemy.kind === "shield") {
        ctx.beginPath();
        ctx.arc(-2, 0, 16, 0, Math.PI * 2);
        ctx.fillStyle = "#c59b66";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        roundedRect(ctx, 6, -11, 13, 22, 7);
        ctx.fillStyle = "#7f9d58";
        ctx.fill();
        if (enemy.shield > 0) {
          ctx.beginPath();
          ctx.arc(-1, 0, 23 + Math.sin(gameRef.current.elapsed * 5 + enemy.id), -1.2, 1.2);
          ctx.strokeStyle = "rgba(236, 219, 164, .9)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      } else if (enemy.kind === "support") {
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fillStyle = "#d2a64f";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        roundedRect(ctx, -3, -10, 6, 20, 3);
        ctx.fillStyle = color;
        ctx.fill();
        roundedRect(ctx, -10, -3, 20, 6, 3);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 22 + Math.sin(gameRef.current.elapsed * 3 + enemy.id), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(245, 219, 126, .38)";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (enemy.kind === "runner") {
        ctx.strokeStyle = "rgba(138, 88, 57, .3)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.lineTo(-15, 0);
        ctx.stroke();
        roundedRect(ctx, -16, -10, 34, 20, 10);
        ctx.fillStyle = "#9f5e49";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(7, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else if (enemy.kind === "tank") {
        roundedRect(ctx, -21, -15, 42, 30, 11);
        ctx.fillStyle = "#76513c";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        roundedRect(ctx, -7, -8, 19, 16, 7);
        ctx.fillStyle = "#51382c";
        ctx.fill();
        roundedRect(ctx, 6, -3, 17, 6, 3);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = "#69894d";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        roundedRect(ctx, 7, -7, 13, 14, 7);
        ctx.fillStyle = "#89a65f";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(3, 0, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = "#f2d780";
        ctx.fill();
      }

      if (slowed) {
        ctx.globalAlpha = 0.86;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 6 + Math.sin(gameRef.current.elapsed * 5) * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = "#8ac4a0";
        ctx.lineWidth = 2;
        ctx.stroke();
        [0, 2.1, 4.2].forEach((a) => {
          const x = Math.cos(a) * (enemy.radius + 5);
          const y = Math.sin(a) * (enemy.radius + 5);
          polygonPath(ctx, [{ x, y: y - 3 }, { x: x + 2, y }, { x, y: y + 3 }, { x: x - 2, y }]);
          ctx.fillStyle = "#d8efd2";
          ctx.fill();
        });
      }
      if (stunned) {
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 10, -Math.PI * 0.75, Math.PI * 0.68);
        ctx.strokeStyle = "#efc56b";
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = "#fff0b7";
        [-9, 0, 9].forEach((x, index) => {
          ctx.fillRect(x - 1.5, -enemy.radius - 13 - (index % 2) * 3, 3, 6);
        });
      }
      if (brittle || marked) {
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8, 0, Math.PI * 2);
        ctx.setLineDash(brittle ? [2, 5] : [8, 5]);
        ctx.strokeStyle = brittle ? "rgba(111, 182, 154, .86)" : "rgba(213, 154, 86, .9)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      const baseBarWidth = enemy.kind === "boss" ? 62 : enemy.kind === "tank" ? 42 : 32;
      const barWidth = baseBarWidth * Math.min(visualScale, 1.18);
      const statusLift = stunned ? 15 : 0;
      const barY = enemy.y - enemy.radius * visualScale - 13 - statusLift;
      roundedRect(ctx, enemy.x - barWidth / 2 - 1, barY - 1, barWidth + 2, 7, 3);
      ctx.fillStyle = "rgba(61, 62, 35, .76)";
      ctx.fill();
      const health = Math.max(0, enemy.hp / enemy.maxHp);
      roundedRect(ctx, enemy.x - barWidth / 2, barY, barWidth * health, 5, 2.5);
      ctx.fillStyle = health < 0.35 ? "#e37a62" : "#7fb166";
      ctx.fill();
      const highlightWidth = Math.max(0, barWidth * health - 4);
      if (highlightWidth > 0) {
        ctx.fillStyle = "rgba(255,255,255,.22)";
        ctx.fillRect(enemy.x - barWidth / 2 + 2, barY + 1, highlightWidth, 1);
      }
      if (enemy.maxShield > 0 && enemy.shield > 0) {
        const shieldWidth = barWidth * Math.max(0, enemy.shield / enemy.maxShield);
        roundedRect(ctx, enemy.x - barWidth / 2, barY - 5, shieldWidth, 3, 1.5);
        ctx.fillStyle = "#ead9a5";
        ctx.fill();
      }
      if (enemy.kind === "boss") {
        ctx.fillStyle = "#f3e0a8";
        ctx.font = '800 10px "Microsoft YaHei UI", "PingFang SC", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("贪吃王", enemy.x, barY - 8);
      }
    };

    const draw = () => {
      const game = gameRef.current;
      const path = activeLevelRef.current.path;
      const entranceX = path[0].x;
      const coreX = path[path.length - 1].x;
      const coreNodeY = HEIGHT - 24;
      drawBackdrop(game);
      drawPath(game);
      drawPadFoundations();

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '800 15px "Microsoft YaHei UI", "PingFang SC", sans-serif';
      roundedRect(ctx, entranceX - 41, 8, 82, 28, 10);
      ctx.fillStyle = "rgba(75, 104, 55, .86)";
      ctx.fill();
      ctx.strokeStyle = "rgba(238, 228, 181, .55)";
      ctx.stroke();
      ctx.fillStyle = "#f7f0cf";
      ctx.fillText("小虫入口", entranceX, 22);

      roundedRect(ctx, coreX - 33, HEIGHT - 94, 66, 28, 10);
      ctx.fillStyle = "rgba(119, 83, 49, .88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 218, 147, .62)";
      ctx.stroke();
      ctx.fillStyle = "#fff0bf";
      ctx.fillText("果篮", coreX, HEIGHT - 80);

      ctx.strokeStyle = "#765033";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(coreX, coreNodeY - 7, 18, Math.PI, 0);
      ctx.stroke();
      roundedRect(ctx, coreX - 25, coreNodeY - 5, 50, 26, 8);
      ctx.fillStyle = "#a97646";
      ctx.fill();
      ctx.strokeStyle = "#765033";
      ctx.lineWidth = 2;
      ctx.stroke();
      [[-13, -5, "#dc7258"], [0, -8, "#efc552"], [13, -4, "#8fb85d"]].forEach(([dx, dy, color]) => {
        ctx.beginPath();
        ctx.arc(coreX + Number(dx), coreNodeY + Number(dy), 8, 0, Math.PI * 2);
        ctx.fillStyle = String(color);
        ctx.fill();
      });
      ctx.restore();

      const hover = hoverRef.current;
      const kind = selectedKindRef.current;
      if (hover && kind && !game.won && !game.lost) {
        const spec = TOWERS[kind];
        const valid = canPlace(hover) && game.gold >= spec.cost;
        ctx.save();
        roundedRect(
          ctx,
          hover.x - PAD_SIZE / 2,
          hover.y - PAD_SIZE / 2,
          PAD_SIZE,
          PAD_SIZE,
          10,
        );
        ctx.fillStyle = valid ? `${spec.color}28` : "rgba(221, 139, 158, .2)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = valid ? spec.color : "#dd8b9e";
        ctx.stroke();
        ctx.globalAlpha = 0.68;
        ctx.beginPath();
        ctx.arc(hover.x, hover.y, spec.range, 0, Math.PI * 2);
        ctx.fillStyle = valid ? `${spec.color}0d` : "rgba(221, 139, 158, .08)";
        ctx.fill();
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = valid ? spec.color : "#dd8b9e";
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(hover.x, hover.y, 21, 0, Math.PI * 2);
        ctx.fillStyle = valid ? "#26374f" : "#49303f";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = valid ? spec.color : "#dd8b9e";
        ctx.stroke();
        ctx.restore();
      }

      game.towers.forEach((tower) => drawTower(tower, tower.id === selectedTowerRef.current));
      game.enemies.forEach(drawEnemy);

      for (const projectile of game.projectiles) {
        const target = game.enemies.find((enemy) => enemy.id === projectile.targetId);
        const angle = target ? Math.atan2(target.y - projectile.y, target.x - projectile.x) : 0;
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(angle);
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = projectile.color;
        ctx.shadowBlur = projectile.kind === "rail" ? 15 : 10;
        if (projectile.kind === "rail") {
          const beam = ctx.createLinearGradient(-38, 0, 8, 0);
          beam.addColorStop(0, "rgba(228, 189, 132, 0)");
          beam.addColorStop(0.72, "rgba(228, 189, 132, .54)");
          beam.addColorStop(1, "#fff3ce");
          ctx.fillStyle = beam;
          ctx.fillRect(-38, -2.5, 44, 5);
          ctx.fillStyle = "#fff7dc";
          ctx.fillRect(-10, -1, 18, 2);
        } else if (projectile.kind === "frost") {
          ctx.rotate(game.elapsed * 5 + projectile.x * 0.02);
          polygonPath(ctx, [
            { x: 0, y: -7 }, { x: 4.5, y: 0 }, { x: 0, y: 7 }, { x: -4.5, y: 0 },
          ]);
          ctx.fillStyle = "#dcd5f5";
          ctx.fill();
          ctx.strokeStyle = projectile.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          const tail = ctx.createLinearGradient(-22, 0, 5, 0);
          tail.addColorStop(0, "rgba(143, 221, 227, 0)");
          tail.addColorStop(1, projectile.color);
          ctx.fillStyle = tail;
          roundedRect(ctx, -22, -2, 28, 4, 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(4, 0, projectile.size, 0, Math.PI * 2);
          ctx.fillStyle = "#e8ffff";
          ctx.fill();
        }
        ctx.restore();
      }

      for (const particle of game.particles) {
        ctx.save();
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(Math.atan2(particle.vy, particle.vx));
        ctx.fillStyle = particle.color;
        roundedRect(ctx, -particle.size * 1.8, -particle.size * 0.45, particle.size * 3.6, particle.size * 0.9, particle.size * 0.4);
        ctx.fill();
        ctx.restore();
      }

      if (game.empPulseUntil > game.elapsed) {
        const progress = 1 - (game.empPulseUntil - game.elapsed) / 0.65;
        const radius = 80 + progress * 860;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.max(0, 0.34 * (1 - progress));
        ctx.beginPath();
        ctx.arc(WIDTH / 2, HEIGHT / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#efc56b";
        ctx.lineWidth = 22 * (1 - progress) + 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(239, 197, 107, .08)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }

      if (game.paused) {
        ctx.fillStyle = "rgba(42, 64, 41, .62)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f6f8ff";
        ctx.font = "800 30px ui-sans-serif, system-ui";
        ctx.fillText("战术暂停", WIDTH / 2, HEIGHT / 2 - 8);
        ctx.fillStyle = "#d2d4b4";
        ctx.font = "500 14px ui-sans-serif, system-ui";
        ctx.fillText("按空格键继续", WIDTH / 2, HEIGHT / 2 + 22);
      }
    };

    const loop = (now: number) => {
      const rawDelta = Math.min(0.035, (now - previous) / 1000);
      previous = now;
      const game = gameRef.current;
      update(rawDelta * game.speed, rawDelta);
      draw();
      uiClock += rawDelta;
      if (uiClock > 0.13) {
        syncUi();
        uiClock = 0;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [screen]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let loaded = createEmptyGuestSave();
    try {
      loaded = parseGuestSave(window.localStorage.getItem(GUEST_SAVE_KEY));
      guestSaveRef.current = loaded;
      saveReadyRef.current = true;
      setGuestSave(loaded);
      setSaveStatus("ready");
    } catch {
      saveReadyRef.current = true;
      setSaveStatus("unavailable");
    }

    const currentHash = window.location.hash;
    let requested = getScreenFromHash(currentHash);
    const knownHash = Object.values(SCREEN_HASH).includes(currentHash);
    const canRestoreBattle = Boolean(
      loaded.session && LEVELS.some((level) => level.id === loaded.session?.levelId),
    );
    if (requested === "game" && canRestoreBattle) {
      resumeGuestSession();
      return;
    }
    if (requested === "game") requested = "home";
    screenRef.current = requested;
    setScreen(requested);
    if (!knownHash || currentHash === SCREEN_HASH.game) {
      const targetUrl = `${window.location.pathname}${window.location.search}${SCREEN_HASH[requested]}`;
      window.history.replaceState({ screen: requested, from: null }, "", targetUrl);
    }
  }, []);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      const currentHash = window.location.hash;
      let next = getScreenFromHash(currentHash);
      const knownHash = Object.values(SCREEN_HASH).includes(currentHash);
      if (next === "game" && !battleReadyRef.current) next = "home";
      if (!knownHash || (currentHash === SCREEN_HASH.game && next === "home")) {
        const targetUrl = `${window.location.pathname}${window.location.search}${SCREEN_HASH[next]}`;
        window.history.replaceState({ screen: next, from: null }, "", targetUrl);
      }
      if (next === screenRef.current) return;
      if (screenRef.current === "game" && next !== "game") {
        gameRef.current.paused = true;
        saveCurrentSession();
      }
      screenRef.current = next;
      setScreen(next);
    };
    window.addEventListener("popstate", handleHistoryNavigation);
    window.addEventListener("hashchange", handleHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", handleHistoryNavigation);
      window.removeEventListener("hashchange", handleHistoryNavigation);
    };
  }, [activeMission]);

  useEffect(() => {
    document.title = SCREEN_TITLES[screen];
    const shouldMoveFocus = announcedScreenRef.current !== null && announcedScreenRef.current !== screen;
    announcedScreenRef.current = screen;
    if (!shouldMoveFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(".viewPage h1, .gameShell h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  useEffect(() => {
    if (screen !== "game") return;
    saveCurrentSession();
    const interval = window.setInterval(() => saveCurrentSession(false), 1600);
    const handlePageHide = () => saveCurrentSession(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrentSession(false);
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (screen === "game") {
        gameRef.current.paused = true;
        saveCurrentSession(false);
      }
      window.clearInterval(interval);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [screen, activeMission]);

  useEffect(() => {
    if (
      screen !== "game" ||
      (!ui.won && !ui.lost) ||
      resultRecordedRef.current
    ) return;
    resultRecordedRef.current = true;
    const key = `${activeMission.category}:${activeMission.title}`;
    const previous = getGuestRecord(
      guestSaveRef.current.records,
      activeMission.category,
      activeMission.title,
    ) ?? {
      bestScore: 0,
      bestWave: 0,
      bestStars: 0,
      wins: 0,
      plays: 0,
    };
    const earnedStars = ui.won
      ? ui.stats.leaks === 0
        ? 3
        : ui.lives >= Math.ceil(activeMission.rules.lives * 0.5)
          ? 2
          : 1
      : 0;
    const now = Date.now();
    writeGuestSave({
      ...guestSaveRef.current,
      updatedAt: now,
      session: null,
      records: {
        ...guestSaveRef.current.records,
        [key]: {
          bestScore: Math.max(previous.bestScore, ui.score),
          bestWave: Math.max(previous.bestWave, ui.wave),
          bestStars: Math.max(previous.bestStars ?? 0, earnedStars),
          wins: previous.wins + (ui.won ? 1 : 0),
          plays: previous.plays + 1,
        },
      },
    });
  }, [screen, ui.won, ui.lost, ui.score, ui.wave, activeMission]);

  const remaining = ui.enemies + ui.spawnRemaining;
  const selectedSpec = selectedTower ? TOWERS[selectedTower.kind] : null;
  const selectedSpecialization =
    selectedTower && selectedTower.specialization
      ? SPECIALIZATIONS[selectedTower.kind].find(
          (item) => item.id === selectedTower.specialization,
        ) ?? null
      : null;
  const upgradeCost = selectedTower
    ? Math.round(selectedSpec!.cost * (0.45 + selectedTower.level * 0.34))
    : 0;

  const finalWave = activeRulesRef.current.finalWave;
  const inspectedWave = ui.active || ui.won || ui.lost ? Math.max(1, ui.wave) : ui.wave + 1;
  const inspectedPlan = getWavePlan(inspectedWave, activeRulesRef.current);
  const intelCounts = createEnemyCounts();
  if (ui.active) {
    gameRef.current.enemies.forEach((enemy) => {
      if (!enemy.dead) intelCounts[enemy.kind] += 1;
    });
    inspectedPlan.sequence.slice(gameRef.current.spawnSerial).forEach((kind) => {
      intelCounts[kind] += 1;
    });
  } else if (!ui.won && !ui.lost) {
    ENEMY_ORDER.forEach((kind) => { intelCounts[kind] = inspectedPlan.counts[kind]; });
  }
  const waveProgress = ui.spawnTotal > 0
    ? Math.max(0, Math.min(1, (ui.spawnTotal - remaining) / ui.spawnTotal))
    : 0;
  const earnedStars = ui.won
    ? ui.stats.leaks === 0
      ? 3
      : ui.lives >= Math.ceil(activeMission.rules.lives * 0.5)
        ? 2
        : 1
    : 0;
  const localRecordCount = Object.keys(guestSave.records).length;
  const localBestScore = Object.values(guestSave.records).reduce(
    (best, record) => Math.max(best, record.bestScore),
    0,
  );
  const savedSession = guestSave.session;

  if (screen !== "game") {
    return (
      <main className="menuShell">
        <header className="menuTopbar">
          <button className="menuLogo" onClick={() => navigateScreen("home")} aria-label="返回果园小屋">
            <span className="brandMark" aria-hidden="true"><span /></span>
            <span><small>ORCHARD GUARD</small><b>果园守卫队</b></span>
          </button>
          <nav aria-label="主菜单">
            <button className={screen === "home" ? "active" : ""} aria-current={screen === "home" ? "page" : undefined} onClick={() => navigateScreen("home")}>小屋</button>
            <button className={screen === "campaign" ? "active" : ""} aria-current={screen === "campaign" ? "page" : undefined} onClick={() => navigateScreen("campaign")}>果园</button>
            <button className={screen === "modes" ? "active" : ""} aria-current={screen === "modes" ? "page" : undefined} onClick={() => navigateScreen("modes")}>挑战</button>
            <button className={screen === "arsenal" ? "active" : ""} aria-current={screen === "arsenal" ? "page" : undefined} onClick={() => navigateScreen("arsenal")}>伙伴</button>
            <button className={screen === "codex" ? "active" : ""} aria-current={screen === "codex" ? "page" : undefined} onClick={() => navigateScreen("codex")}>小虫</button>
          </nav>
          <span className={`onlineStatus guestModeStatus ${saveStatus}`}>
            <i />
            {saveStatus === "unavailable" ? "本机存档不可用" : "游客模式 · 本机存档"}
          </span>
        </header>

        {screen === "home" && (
          <div className="viewPage homePage">
            <section className="menuHero">
              <div className="heroCopy">
                <p className="heroKicker"><span>今天也要好好看园子</span> / 果园小屋</p>
                <h1>叫上植物伙伴，<br /><em>守住香甜果篮。</em></h1>
                <p className="heroLead">观察下一群贪吃小虫，摆好蓝莓、薄荷和栗子伙伴，别让刚摘下的水果被它们搬走。</p>
                {savedSession && (
                  <button className="continueMenuButton" onClick={resumeGuestSession}>
                    <span>
                      <small>本机战局</small>
                      <strong>继续 {savedSession.title}</strong>
                    </span>
                    <b>第 {savedSession.game.wave} 波 · {savedSession.game.score.toLocaleString()} 分 →</b>
                  </button>
                )}
                <div className="menuActions">
                  <button className="primaryMenuButton" onClick={() => navigateScreen("campaign")}>
                    <span>开始巡园</span><b>选择小路 →</b>
                  </button>
                  <button className="secondaryMenuButton" onClick={() => navigateScreen("modes")}>
                    趣味挑战
                  </button>
                </div>
                <p className="localSaveNote">
                  <i /> 游客进度自动保存在当前设备
                  {localRecordCount > 0
                    ? ` · 已记录 ${localRecordCount} 项战绩，最高 ${localBestScore.toLocaleString()} 分。`
                    : "；换设备或清理浏览器数据后无法恢复。"}
                </p>
              </div>
              <div className="heroGarden" aria-hidden="true">
                <span className="gardenSun" />
                <div className="fruitBasketArt">
                  <i className="fruit apple" /><i className="fruit orange" /><i className="fruit pear" />
                  <span />
                </div>
                <p><b>今日果篮</b><small>新鲜采摘 · 等你守护</small></p>
              </div>
            </section>
            <section className="portalGrid" aria-label="果园小屋入口">
              <button style={{ "--portal-accent": "#8ebf77" } as React.CSSProperties} onClick={() => navigateScreen("campaign")}>
                <span className="portalNumber">01</span><i>园</i><strong>果园地图</strong><small>六条小路与慢慢增加的难度</small><b>选择小路 →</b>
              </button>
              <button style={{ "--portal-accent": "#d98770" } as React.CSSProperties} onClick={() => navigateScreen("modes")}>
                <span className="portalNumber">02</span><i>趣</i><strong>趣味挑战</strong><small>无尽巡园、阵雨抢收与三果挑战</small><b>挑一个玩法 →</b>
              </button>
              <button style={{ "--portal-accent": "#d59a56" } as React.CSSProperties} onClick={() => navigateScreen("arsenal")}>
                <span className="portalNumber">03</span><i>苗</i><strong>植物伙伴</strong><small>认识伙伴的能力与成长路线</small><b>翻开伙伴册 →</b>
              </button>
              <button style={{ "--portal-accent": "#78aaa0" } as React.CSSProperties} onClick={() => navigateScreen("codex")}>
                <span className="portalNumber">04</span><i>虫</i><strong>小虫图鉴</strong><small>六种小虫和照顾它们的办法</small><b>打开图鉴 →</b>
              </button>
            </section>
          </div>
        )}

        {screen === "campaign" && (
          <section className="selectionPage viewPage">
            <div className="selectionHeader">
              <div><p>ORCHARD MAP / 果园地图</p><h1>选择一条小路</h1></div>
              <span>越往果园深处，露珠越少，小虫也会更难赶走。</span>
            </div>
            <div className="levelGrid">
              {LEVELS.map((level) => {
                const record = getGuestRecord(guestSave.records, "果园故事", level.name);
                const stars = record?.bestStars ?? 0;
                return (
                  <button
                    key={level.id}
                    className="levelCard"
                    style={{ "--card-accent": level.accent } as React.CSSProperties}
                    onClick={() => startMission(level, level.rules, "果园故事", level.name)}
                  >
                    <span className="levelTop">
                      <i>{level.id.toString().padStart(2, "0")}</i>
                      <span className="levelStars" aria-label={`最好成绩 ${stars} 星`}>
                        {[1, 2, 3].map((star) => <em key={star} className={star <= stars ? "earned" : ""}>◆</em>)}
                      </span>
                      <b>{level.difficulty}</b>
                    </span>
                    <span className="levelRoute" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                    <span className="levelCopy"><small>{level.sector}</small><strong>{level.name}</strong><em>{level.description}</em></span>
                    <span className="levelMeta">
                      <i>{record ? `最高 ${record.bestScore.toLocaleString()} 分` : `${level.pads.length} 块空地`}</i>
                      <b>{level.rules.finalWave} 波 →</b>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {screen === "modes" && (
          <section className="selectionPage modeSelection viewPage">
            <div className="selectionHeader">
              <div><p>GARDEN CHALLENGES / 趣味挑战</p><h1>换一种玩法</h1></div>
              <span>小雨、抢收和有限水果，每次巡园都不太一样。</span>
            </div>
            <div className="modeGrid">
              {MODES.map((mode, index) => {
                const level = LEVELS.find((item) => item.id === mode.levelId)!;
                return (
                  <button
                    key={mode.id}
                    className="modeCard"
                    style={{ "--card-accent": mode.accent } as React.CSSProperties}
                    onClick={() => startMission(level, mode.rules, "趣味挑战", mode.name)}
                  >
                    <span className="modeNumber">0{index + 1}</span>
                    <span className="modeBadge">{mode.badge}</span>
                    <strong>{mode.name}</strong>
                    <p>{mode.description}</p>
                    <span className="modeDetails">
                      <i>地图：{level.name}</i>
                      <i>{mode.rules.finalWave === null ? "小虫不断" : `${mode.rules.finalWave} 群挑战`}</i>
                    </span>
                    <b className="modeLaunch">开始挑战 →</b>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {screen === "arsenal" && (
          <section className="selectionPage archivePage viewPage">
            <div className="selectionHeader archiveHeader">
              <div><p>PLANT FRIENDS / 植物伙伴</p><h1>果园伙伴册</h1></div>
              <div className="selectionHeaderAside">
                <span>先认识每位伙伴的本领和成长方向，再回到果园摆放。</span>
                {savedSession && <button className="archiveResumeButton" onClick={returnToSavedBattle}>← 返回果园</button>}
              </div>
            </div>
            <div className="towerArchiveGrid">
              {(Object.keys(TOWERS) as TowerKind[]).map((kind) => {
                const tower = TOWERS[kind];
                return (
                  <article key={kind} className="towerArchiveCard" style={{ "--card-accent": tower.color } as React.CSSProperties}>
                    <div className="archiveTowerTop">
                      <span className="archiveTowerVisual"><TowerIcon kind={kind} /></span>
                      <div><small>{tower.tagline}</small><h2>{tower.name}</h2><b>需要露珠 ◈ {tower.cost}</b></div>
                    </div>
                    <p>{TOWER_TACTICS[kind].role}</p>
                    <div className="archiveMetrics">
                      <span><small>基础伤害</small><b>{tower.damage}</b></span>
                      <span><small>攻击范围</small><b>{tower.range}</b></span>
                      <span><small>每秒攻击</small><b>{(1 / tower.rate).toFixed(1)}</b></span>
                    </div>
                    <div className="archivePlacement"><span>摆放建议</span><p>{TOWER_TACTICS[kind].placement}</p></div>
                    <div className="archiveBranches">
                      {SPECIALIZATIONS[kind].map((branch, index) => (
                        <div key={branch.id}><span>路线 {index + 1}</span><b>{branch.name}</b><small>{branch.description}</small></div>
                      ))}
                    </div>
                    <button className="archiveLaunchButton" onClick={() => navigateScreen("campaign")}>去果园摆放 →</button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {screen === "codex" && (
          <section className="selectionPage archivePage viewPage">
            <div className="selectionHeader archiveHeader">
              <div><p>BUG BOOK / 小虫图鉴</p><h1>果园访客册</h1></div>
              <div className="selectionHeaderAside">
                <span>认清每种小虫的样子和习惯，下一群到来前更好安排伙伴。</span>
                {savedSession && <button className="archiveResumeButton" onClick={returnToSavedBattle}>← 返回果园</button>}
              </div>
            </div>
            <div className="enemyArchiveGrid">
              {ENEMY_ORDER.map((kind) => {
                const enemy = ENEMY_PROFILES[kind];
                return (
                  <article key={kind} className={`enemyArchiveCard ${kind}`} style={{ "--card-accent": enemy.color } as React.CSSProperties}>
                    <div className="enemyArchiveTop">
                      <EnemyIcon kind={kind} />
                      <div><small>{kind === "boss" ? "贪吃大家伙" : "常见小虫"}</small><h2>{enemy.name}</h2><span>果园里的“{enemy.shortName}”朋友</span></div>
                    </div>
                    <p>{enemy.description}</p>
                    <div className="enemyMetrics">
                      <span><small>基础生命</small><b>{enemy.hp || "成长"}</b></span>
                      <span><small>移动速度</small><b>{enemy.speed}</b></span>
                      <span><small>突破伤害</small><b>{enemy.leakDamage}</b></span>
                    </div>
                    <div className="counterTip"><span>推荐对策</span><p>{ENEMY_COUNTERS[kind]}</p></div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="menuFooter"><span>ORCHARD GUARD // BUILD 07.0</span><span>游客档案仅保存在当前设备</span></footer>
      </main>
    );
  }

  return (
    <main className="gameShell">
      <header className="topbar">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="eyebrow">{activeMission.category} / {activeMission.level.sector}</p>
            <h1>{activeMission.title}</h1>
          </div>
        </div>

        <div className="stats" aria-label="当前战况">
          <div className="stat">
            <span className="statIcon heart">♥</span>
            <span><small>果篮</small><strong>{ui.lives}</strong></span>
          </div>
          <div className="stat">
            <span className="statIcon coin">◈</span>
            <span><small>露珠</small><strong>{ui.gold}</strong></span>
          </div>
          <div className="stat waveStat">
            <span><small>虫群</small><strong>{ui.wave} / {finalWave ?? "∞"}</strong></span>
          </div>
          <div className="score">
            <small>战绩</small>
            <strong>{ui.score.toString().padStart(6, "0")}</strong>
          </div>
        </div>
      </header>

      <section className="commandBar" aria-label="游戏控制">
        <button className="backLobbyButton" onClick={returnToLobby}>← 返回大厅</button>
        <div className="threatLine">
          <span className={`signal ${ui.active && !ui.paused ? "live" : ""}`} />
          <div className="threatCopy">
            <small>
              {ui.active
                ? `第 ${ui.wave} 群${inspectedPlan.hasBoss ? " · 大毛毛虫" : ""}`
                : `下一群预告 · 第 ${inspectedWave} 群`}
            </small>
            <strong>
              {ui.won
                ? "果篮安全"
                : ui.lost
                  ? "果篮空啦"
                  : ui.active
                    ? `剩余小虫 ${remaining}`
                    : ui.autoWaveTimer > 0
                      ? `自动迎接 · ${Math.ceil(ui.autoWaveTimer)} 秒`
                      : ui.wave === 0
                        ? "等待伙伴入场"
                        : "虫群间歇"}
            </strong>
            <span className="threatProgress" aria-hidden="true">
              <i style={{ width: `${(ui.active ? waveProgress : 0) * 100}%` }} />
            </span>
          </div>
        </div>
        <div className="controls">
          <button
            className="iconButton"
            onClick={togglePause}
            disabled={!ui.active || ui.won || ui.lost}
            aria-label={ui.paused ? "继续游戏" : "暂停游戏"}
          >
            {ui.paused ? "▶" : "Ⅱ"}
          </button>
          <button className="speedButton" onClick={toggleSpeed} aria-label="切换游戏速度">
            ×{ui.speed}
          </button>
          <button
            className={`autoWaveButton ${ui.autoWave ? "active" : ""}`}
            onClick={toggleAutoWave}
            disabled={ui.won || ui.lost}
            aria-label={ui.autoWave ? "关闭自动迎接下一群" : "开启自动迎接下一群"}
            aria-pressed={ui.autoWave}
            title="自动迎接下一群（快捷键 A）"
          >
            <span>自动</span>
            <b>
              {ui.autoWaveTimer > 0
                ? `${Math.ceil(ui.autoWaveTimer)}s`
                : ui.autoWave
                  ? "开"
                  : "关"}
            </b>
          </button>
          <button
            className={`empButton ${ui.empCooldown <= 0 ? "ready" : ""}`}
            onClick={activateEmp}
            disabled={
              !ui.active ||
              ui.paused ||
              ui.enemies === 0 ||
              ui.empCooldown > 0 ||
              ui.won ||
              ui.lost
            }
            aria-label={ui.empCooldown > 0 ? `驱虫铃还要等 ${Math.ceil(ui.empCooldown)} 秒` : "摇响驱虫铃"}
            title="驱虫铃（快捷键 Q）"
          >
            <span><kbd>Q</kbd> 驱虫铃</span>
            <b>{ui.empCooldown > 0 ? `${Math.ceil(ui.empCooldown)}s` : "就绪"}</b>
          </button>
          <button
            className="waveButton"
            onClick={startWave}
            disabled={ui.active || ui.won || ui.lost}
          >
            <span>{ui.wave === 0 ? "迎接小虫" : finalWave !== null && ui.wave >= finalWave ? "巡园完成" : "下一群"}</span>
            <b>{finalWave === null || ui.wave < finalWave ? `第 ${ui.wave + 1} 群` : "都赶走啦"}</b>
          </button>
        </div>
      </section>

      <div className="gameLayout">
        <section className="arenaPanel">
          <div className="arenaHeader">
            <div>
              <span>果园小路</span>
              <b>{activeMission.level.name}</b>
            </div>
            <p>选择植物伙伴后点击小路两侧的空地 · 点击伙伴立即成长</p>
          </div>
          <div className="canvasWrap">
            <canvas
              ref={canvasRef}
              aria-hidden="true"
            />
            <div
              className="placementPads"
              data-testid="placement-pads"
              role="group"
              aria-label="小路两侧的植物摆放位置"
              onPointerLeave={() => {
                hoverRef.current = null;
              }}
            >
              {activeMission.level.pads.map(({ id, point }) => {
                const tower = gameRef.current.towers.find(
                  (item) => distance(point, item) < 1,
                );
                const affordable = selectedKind ? ui.gold >= TOWERS[selectedKind].cost : true;
                return (
                  <button
                    type="button"
                    key={id}
                    data-pad={id}
                    className={`buildPad ${tower ? "occupied" : ""} ${!affordable ? "unaffordable" : ""}`}
                    style={{
                      left: `${(point.x / WIDTH) * 100}%`,
                      top: `${(point.y / HEIGHT) * 100}%`,
                    }}
                    disabled={ui.won || ui.lost}
                    onPointerEnter={() => {
                      hoverRef.current = point;
                    }}
                    onFocus={() => {
                      hoverRef.current = point;
                    }}
                    onBlur={() => {
                      hoverRef.current = null;
                    }}
                    onClick={() => handleBuildPad(point)}
                    aria-label={
                      tower
                        ? `空地 ${id}，已有${TOWERS[tower.kind].name}`
                        : `空地 ${id}，可以摆放植物伙伴`
                    }
                  >
                    <span aria-hidden="true">{tower ? tower.level : "+"}</span>
                  </button>
                );
              })}
            </div>
            {selectedTower && selectedSpec && !ui.won && !ui.lost && (
              <div
                className={`towerQuickPanel ${selectedTower.x > WIDTH * 0.56 ? "alignRight" : ""} ${selectedTower.y < 175 ? "alignTop" : ""} ${selectedTower.y > HEIGHT - 175 ? "alignBottom" : ""}`}
                style={{
                  left: `${(selectedTower.x / WIDTH) * 100}%`,
                  top: `${(selectedTower.y / HEIGHT) * 100}%`,
                  "--quick-accent": selectedSpec.color,
                } as React.CSSProperties}
                role="dialog"
                aria-label={`${selectedSpec.name}成长面板`}
              >
                <button
                  className="quickClose"
                  onClick={() => chooseBuiltTower(null)}
                  aria-label="关闭植物伙伴成长面板"
                >
                  ×
                </button>
                <div className="quickTowerTitle">
                  <TowerIcon kind={selectedTower.kind} mini />
                  <div><small>已选伙伴</small><b>{selectedSpec.name} · {selectedTower.level} 级</b></div>
                </div>
                {selectedTower.level === 1 && (
                  <button
                    className="quickUpgradeButton"
                    onClick={upgradeSelected}
                    disabled={ui.gold < upgradeCost}
                  >
                    <span>成长至 2 级</span><b>◈ {upgradeCost}</b>
                  </button>
                )}
                {selectedTower.level === 2 && !selectedTower.specialization && (
                  <div className="quickBranches">
                    <span>选择三级本领 · 每项 ◈ {upgradeCost}</span>
                    {SPECIALIZATIONS[selectedTower.kind].map((branch) => (
                      <button
                        key={branch.id}
                        onClick={() => specializeSelected(branch.id)}
                        disabled={ui.gold < upgradeCost}
                      >
                        <b>{branch.name}</b><small>{branch.description}</small>
                      </button>
                    ))}
                  </div>
                )}
                {selectedTower.level === 3 && selectedSpecialization && (
                  <div className="quickComplete">
                    <span>成长完成</span><b>{selectedSpecialization.name}</b>
                  </div>
                )}
                <button className="quickSellButton" onClick={sellSelected}>
                  回花圃 +{Math.round(selectedTower.spent * 0.65)}
                </button>
              </div>
            )}
            {toast && <div className="toast" role="status">{toast}</div>}
            {ui.wave === 0 && gameRef.current.towers.length === 0 && (
              <div className="firstHint" aria-hidden="true">
                <span>01</span>
                <p><b>选择植物伙伴</b>点击小路两侧的圆角空地</p>
              </div>
            )}
            {(ui.won || ui.lost) && (
              <div className="resultOverlay">
                <p>{ui.won ? "果园守住啦" : "水果被搬走啦"}</p>
                <h2>{ui.won ? "今天大丰收" : "明天再来一次"}</h2>
                {ui.won && (
                  <div className="resultStars" aria-label={`本局获得 ${earnedStars} 星`}>
                    {[1, 2, 3].map((star) => <i key={star} className={star <= earnedStars ? "earned" : ""}>◆</i>)}
                  </div>
                )}
                <span>
                  {ui.won
                    ? `最终得分 ${ui.score.toLocaleString()} · 剩余水果 ${ui.lives}/${activeMission.rules.lives}`
                    : `坚持到第 ${ui.wave} 群 · 最终得分 ${ui.score.toLocaleString()}`}
                </span>
                <div className="battleReport" aria-label="本局战报">
                  <span><small>赶走</small><b>{ui.stats.kills}</b></span>
                  <span><small>总伤害</small><b>{Math.round(ui.stats.damageDealt).toLocaleString()}</b></span>
                  <span><small>漏过</small><b>{ui.stats.leaks}</b></span>
                  <span><small>摇铃</small><b>{ui.stats.skillsUsed}</b></span>
                </div>
                <button onClick={resetGame}>重新摆放</button>
              </div>
            )}
          </div>
          <div className="arenaFooter">
            <div className="arenaEnemySummary" aria-label="小虫组成">
              {ENEMY_ORDER.filter((kind) => intelCounts[kind] > 0).map((kind) => (
                <span key={kind} className={`enemyTag ${kind}`}>
                  <i />{ENEMY_PROFILES[kind].shortName} ×{intelCounts[kind]}
                </span>
              ))}
            </div>
            <em>空格：开始 / 暂停 · A：自动 · Q：驱虫铃</em>
          </div>
        </section>

        <aside className="sidebar">
          <div className="sidebarTitle">
            <div>
              <span>植物花圃</span>
              <h2>植物伙伴</h2>
            </div>
            <b>{gameRef.current.towers.length.toString().padStart(2, "0")}</b>
          </div>

          <div className="towerList">
            {(Object.keys(TOWERS) as TowerKind[]).map((kind, index) => {
              const tower = TOWERS[kind];
              const affordable = ui.gold >= tower.cost;
              return (
                <button
                  key={kind}
                  className={`towerCard ${selectedKind === kind ? "selected" : ""} ${!affordable ? "dim" : ""}`}
                  onClick={() => chooseTower(kind)}
                  aria-pressed={selectedKind === kind}
                >
                  <span className="hotkey">{index + 1}</span>
                  <TowerIcon kind={kind} />
                  <span className="towerCopy">
                    <b>{tower.name}</b>
                    <small>{tower.tagline}</small>
                  </span>
                  <span className="price"><i>◈</i>{tower.cost}</span>
                </button>
              );
            })}
          </div>

          <div className={`towerInspector ${selectedTower ? "visible" : ""}`}>
            {selectedTower && selectedSpec ? (
              <>
                <div className="inspectorTop">
                  <TowerIcon kind={selectedTower.kind} mini />
                  <div>
                    <small>已选伙伴</small>
                    <h3>{selectedSpec.name} <em>{selectedTower.level} 级</em></h3>
                  </div>
                </div>
                <div className="metrics">
                  <span><small>伤害</small><b>{Math.round(getTowerDamage(selectedTower))}</b></span>
                  <span><small>范围</small><b>{Math.round(getTowerRange(selectedTower))}</b></span>
                  <span><small>射速</small><b>{(1 / getTowerRate(selectedTower)).toFixed(1)}</b></span>
                </div>
                <div className="priorityControl">
                  <span>目标策略</span>
                  <div>
                    {(Object.keys(PRIORITY_LABELS) as TargetPriority[]).map((priority) => (
                      <button
                        key={priority}
                        className={selectedTower.priority === priority ? "active" : ""}
                        onClick={() => setTargetPriority(priority)}
                        aria-pressed={selectedTower.priority === priority}
                      >
                        {PRIORITY_LABELS[priority]}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedTower.level === 2 && !selectedTower.specialization ? (
                  <>
                    <div className="specializationPicker">
                      <div className="specializationLabel"><span>三级本领 · 二选一</span><b>◈ {upgradeCost}</b></div>
                      <div>
                        {SPECIALIZATIONS[selectedTower.kind].map((branch) => (
                          <button key={branch.id} onClick={() => specializeSelected(branch.id)}>
                            <b>{branch.name}</b><small>{branch.description}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="sellButton wide" onClick={sellSelected}>
                      回花圃 +{Math.round(selectedTower.spent * 0.65)}
                    </button>
                  </>
                ) : (
                  <>
                    {selectedSpecialization && (
                      <div className="specializationSummary">
                        <span>已学会本领</span><b>{selectedSpecialization.name}</b><small>{selectedSpecialization.description}</small>
                      </div>
                    )}
                    <div className="inspectorActions">
                      <button
                        className="upgradeButton"
                        onClick={upgradeSelected}
                        disabled={selectedTower.level >= 2}
                      >
                        <span>{selectedTower.level >= 3 ? "成长已完成" : "成长至 2 级"}</span>
                        {selectedTower.level < 2 && <b>◈ {upgradeCost}</b>}
                      </button>
                      <button className="sellButton" onClick={sellSelected}>
                        回花圃 +{Math.round(selectedTower.spent * 0.65)}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="emptyInspector">
                <span>＋</span>
                <p>点击已经摆好的植物伙伴<br />查看成长与回花圃选项</p>
              </div>
            )}
          </div>

          <div className="waveIntel">
            <div className="waveIntelTitle">
              <span>{ui.active ? "本群剩余" : "下一群预告"}</span>
              <b>第 {inspectedWave} 群{inspectedPlan.hasBoss ? " · 大毛毛虫" : ""}</b>
            </div>
            <div className="waveIntelCounts">
              {ENEMY_ORDER.filter((kind) => intelCounts[kind] > 0).map((kind) => (
                <span key={kind} className={`enemyTag ${kind}`}>
                  <i />{ENEMY_PROFILES[kind].shortName} ×{intelCounts[kind]}
                </span>
              ))}
            </div>
            <div className="waveIntelReward">
              <span>赶走奖励</span><b>◈ {inspectedPlan.clearBonus}</b>
            </div>
            <p>{getWaveTip(intelCounts)}</p>
            <button className="archiveLinkButton" onClick={() => navigateScreen("codex")}>
              <span>打开完整小虫图鉴</span><b>新页面 →</b>
            </button>
          </div>
        </aside>
      </div>

        <footer className="siteFooter">
        <span>{saveStatus === "unavailable" ? "游客模式 · 存档不可用" : "游客模式 · 本机自动存档"}</span>
        <p>{finalWave === null ? "守住果篮，看看能赶走多少群小虫。" : `守住果篮，迎接 ${finalWave} 群小虫。`}</p>
        <button onClick={resetGame}>重新摆放 ↻</button>
      </footer>
    </main>
  );
}
