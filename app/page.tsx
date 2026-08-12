"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 620;
const PAD_SIZE = 46;
const GUEST_SAVE_KEY = "neon-grid-defense:guest-save:v1";

type Point = { x: number; y: number };
type TowerKind = "pulse" | "frost" | "rail";
type EnemyKind = "drone" | "runner" | "tank";
type Screen = "home" | "campaign" | "modes" | "game";

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
  dead: boolean;
};

type Tower = Point & {
  id: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
  angle: number;
  spent: number;
};

type Projectile = Point & {
  targetId: number;
  speed: number;
  damage: number;
  color: string;
  slow: number;
  size: number;
};

type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
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
  speed: 1 | 2;
  won: boolean;
  lost: boolean;
  spawnRemaining: number;
  spawnTotal: number;
  spawnTimer: number;
  spawnSerial: number;
  elapsed: number;
  nextId: number;
};

type UiState = Pick<
  Game,
  | "gold"
  | "lives"
  | "score"
  | "wave"
  | "active"
  | "paused"
  | "speed"
  | "won"
  | "lost"
  | "spawnRemaining"
  | "spawnTotal"
> & { enemies: number; version: number };

const pointList = (items: Array<[number, number]>): Point[] =>
  items.map(([x, y]) => ({ x, y }));

const padList = (items: Array<[string, number, number]>) =>
  items.map(([id, x, y]) => ({ id, point: { x, y } }));

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
    name: "河岸数据港",
    sector: "第 07 区",
    description: "标准折线路线，适合熟悉三类防御塔。",
    difficulty: "普通",
    accent: "#8fdde3",
    path: pointList([[-40, 150], [160, 150], [160, 310], [400, 310], [400, 150], [640, 150], [640, 470], [800, 470], [800, 310], [1000, 310]]),
    pads: padList([["A1", 80, 70], ["A2", 80, 230], ["B1", 240, 230], ["B2", 320, 230], ["B3", 320, 390], ["C1", 480, 70], ["C2", 480, 230], ["C3", 560, 230], ["D1", 720, 230], ["D2", 560, 390], ["D3", 720, 390], ["D4", 720, 550], ["E1", 880, 230], ["E2", 880, 390]]),
    rules: makeRules({ finalWave: 6, initialGold: 250, enemyHealth: 0.92, enemySpeed: 0.96, waveBonus: 1.12 }),
  },
  {
    id: 2,
    name: "双湾转运站",
    sector: "第 12 区",
    description: "两次深入折返，弯道火力覆盖尤其重要。",
    difficulty: "普通+",
    accent: "#91c9e6",
    path: pointList([[-40, 150], [240, 150], [240, 470], [480, 470], [480, 230], [720, 230], [720, 470], [1000, 470]]),
    pads: padList([["A1", 80, 70], ["A2", 160, 230], ["B1", 320, 230], ["B2", 160, 390], ["B3", 320, 390], ["C1", 400, 550], ["C2", 560, 390], ["C3", 560, 150], ["D1", 640, 310], ["D2", 800, 310], ["D3", 800, 390], ["E1", 880, 550]]),
    rules: makeRules({ finalWave: 7, initialGold: 240, enemyHealth: 0.98, enemyCount: 1.04, waveBonus: 1.05 }),
  },
  {
    id: 3,
    name: "中央回路",
    sector: "第 18 区",
    description: "敌人反复穿越中央区域，部署位竞争激烈。",
    difficulty: "进阶",
    accent: "#b4a4dd",
    path: pointList([[-40, 310], [160, 310], [160, 150], [400, 150], [400, 470], [640, 470], [640, 230], [800, 230], [800, 390], [1000, 390]]),
    pads: padList([["A1", 80, 230], ["A2", 240, 230], ["B1", 320, 70], ["B2", 320, 310], ["B3", 480, 230], ["B4", 480, 390], ["C1", 560, 550], ["C2", 720, 550], ["C3", 560, 310], ["D1", 720, 150], ["D2", 880, 310], ["D3", 880, 470]]),
    rules: makeRules({ finalWave: 8, initialGold: 230, enemyHealth: 1.05, enemySpeed: 1.03, enemyCount: 1.08 }),
  },
  {
    id: 4,
    name: "北岸折返",
    sector: "第 23 区",
    description: "长距离纵向推进，重装单位将更频繁出现。",
    difficulty: "困难",
    accent: "#e4bd84",
    path: pointList([[-40, 470], [160, 470], [160, 230], [400, 230], [400, 70], [640, 70], [640, 310], [880, 310], [880, 150], [1000, 150]]),
    pads: padList([["A1", 80, 390], ["A2", 240, 390], ["B1", 80, 230], ["B2", 240, 150], ["B3", 320, 310], ["C1", 480, 150], ["C2", 560, 150], ["C3", 720, 150], ["D1", 560, 310], ["D2", 720, 390], ["D3", 800, 230], ["E1", 960, 230]]),
    rules: makeRules({ finalWave: 9, initialGold: 215, lives: 10, enemyHealth: 1.12, enemySpeed: 1.06, enemyCount: 1.12, tankWave: 2, waveBonus: 0.94 }),
  },
  {
    id: 5,
    name: "矩阵峡谷",
    sector: "第 31 区",
    description: "长直线与急弯交替，疾行单位会成群来袭。",
    difficulty: "专家",
    accent: "#dda0c2",
    path: pointList([[-40, 150], [240, 150], [240, 310], [480, 310], [480, 470], [720, 470], [720, 150], [1000, 150]]),
    pads: padList([["A1", 80, 70], ["A2", 160, 230], ["B1", 320, 230], ["B2", 400, 390], ["C1", 560, 390], ["C2", 640, 550], ["C3", 800, 550], ["D1", 640, 310], ["D2", 800, 310], ["E1", 800, 70], ["E2", 880, 230]]),
    rules: makeRules({ finalWave: 10, initialGold: 205, lives: 9, enemyHealth: 1.2, enemySpeed: 1.1, enemyCount: 1.16, spawnRate: 0.9, runnerWave: 1, tankWave: 2, waveBonus: 0.88 }),
  },
  {
    id: 6,
    name: "核心迷城",
    sector: "第 42 区",
    description: "最终防区。资源紧缺，混合敌群持续施压。",
    difficulty: "噩梦",
    accent: "#df918e",
    path: pointList([[-40, 310], [160, 310], [160, 70], [400, 70], [400, 230], [640, 230], [640, 470], [880, 470], [880, 310], [1000, 310]]),
    pads: padList([["A1", 80, 230], ["A2", 240, 150], ["B1", 320, 150], ["B2", 480, 150], ["C1", 560, 310], ["C2", 720, 310], ["C3", 560, 390], ["D1", 720, 550], ["D2", 800, 390], ["E1", 960, 390]]),
    rules: makeRules({ finalWave: 12, initialGold: 195, lives: 8, enemyHealth: 1.3, enemySpeed: 1.14, enemyCount: 1.22, spawnRate: 0.84, runnerWave: 1, tankWave: 2, waveBonus: 0.8 }),
  },
];

const MODES: ModeConfig[] = [
  {
    id: "survival",
    name: "无尽生存",
    badge: "无尽",
    description: "没有最终波次，敌人会持续变强。挑战你的最高分。",
    levelId: 3,
    accent: "#8bcaae",
    rules: makeRules({ finalWave: null, initialGold: 245, enemyCount: 1.08, spawnRate: 0.9, waveBonus: 0.95 }),
  },
  {
    id: "blitz",
    name: "闪电战",
    badge: "极速",
    description: "六波高密度快攻。资源充足，但思考时间很少。",
    levelId: 2,
    accent: "#8fdde3",
    rules: makeRules({ finalWave: 6, initialGold: 310, lives: 8, enemyHealth: 0.96, enemySpeed: 1.3, enemyCount: 1.2, spawnRate: 0.58, waveBonus: 0.9, runnerWave: 1, tankWave: 2 }),
  },
  {
    id: "hardcore",
    name: "硬核协议",
    badge: "3 核心",
    description: "只有三点核心耐久，敌人更强，补给更少。",
    levelId: 6,
    accent: "#dd8b9e",
    rules: makeRules({ finalWave: 10, initialGold: 190, lives: 3, enemyHealth: 1.38, enemySpeed: 1.14, enemyCount: 1.25, spawnRate: 0.82, waveBonus: 0.68, runnerWave: 1, tankWave: 2 }),
  },
];

const TOWERS: Record<
  TowerKind,
  {
    name: string;
    glyph: string;
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
    name: "脉冲塔",
    glyph: "◎",
    tagline: "均衡 · 高频",
    cost: 70,
    range: 142,
    damage: 20,
    rate: 0.62,
    projectileSpeed: 520,
    color: "#8fdde3",
    slow: 0,
  },
  frost: {
    name: "冷凝塔",
    glyph: "✦",
    tagline: "减速 · 控场",
    cost: 95,
    range: 124,
    damage: 10,
    rate: 0.88,
    projectileSpeed: 410,
    color: "#b4a4dd",
    slow: 0.58,
  },
  rail: {
    name: "轨道炮",
    glyph: "⌁",
    tagline: "远程 · 重击",
    cost: 145,
    range: 225,
    damage: 78,
    rate: 1.92,
    projectileSpeed: 760,
    color: "#e4bd84",
    slow: 0,
  },
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
  speed: 1,
  won: false,
  lost: false,
  spawnRemaining: 0,
  spawnTotal: 0,
  spawnTimer: 0,
  spawnSerial: 0,
  elapsed: 0,
  nextId: 1,
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
  speed: game.speed,
  won: game.won,
  lost: game.lost,
  spawnRemaining: game.spawnRemaining,
  spawnTotal: game.spawnTotal,
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
  const [screen, setScreen] = useState<Screen>("home");
  const [activeMission, setActiveMission] = useState<ActiveMission>({
    category: "战役模式",
    title: LEVELS[0].name,
    level: LEVELS[0],
    rules: LEVELS[0].rules,
  });
  const [selectedKind, setSelectedKind] = useState<TowerKind | null>("pulse");
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [toast, setToast] = useState("先部署防御塔，再启动敌袭");
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
              projectiles: [],
              particles: [],
            },
            savedAt: now,
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
    setToast("先部署防御塔，再启动敌袭");
    setScreen("game");
  };

  const returnToLobby = () => {
    gameRef.current.paused = true;
    saveCurrentSession();
    setScreen("home");
  };

  const resumeGuestSession = () => {
    const session = guestSaveRef.current.session;
    if (!session) return;
    const level = LEVELS.find((item) => item.id === session.levelId);
    if (!level) {
      writeGuestSave({ ...guestSaveRef.current, session: null, updatedAt: Date.now() });
      return;
    }
    const restoredGame: Game = {
      ...session.game,
      enemies: session.game.enemies.map((enemy) => ({ ...enemy })),
      towers: session.game.towers.map((tower) => ({ ...tower })),
      paused: session.game.active ? true : session.game.paused,
      projectiles: [],
      particles: [],
    };
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
      category: session.category,
      title: session.title,
      level,
      rules: session.rules,
    });
    setUi(toUi(restoredGame));
    setToast(restoredGame.active ? "本机存档已恢复，按空格键继续" : "本机存档已恢复");
    setScreen("game");
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
      showToast("此格不可部署，请选择发光空格");
      return;
    }
    if (gameRef.current.gold < spec.cost) {
      showToast("能量币不足，击破敌人可获得补给");
      return;
    }
    gameRef.current.gold -= spec.cost;
    gameRef.current.towers.push({
      id: gameRef.current.nextId++,
      kind,
      x: point.x,
      y: point.y,
      level: 1,
      cooldown: Math.random() * 0.25,
      angle: -Math.PI / 2,
      spent: spec.cost,
    });
    syncUi();
    showToast(`${spec.name}已上线`);
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
    game.wave += 1;
    game.active = true;
    game.paused = false;
    game.spawnTotal = Math.round((8 + game.wave * 2) * rules.enemyCount);
    game.spawnRemaining = game.spawnTotal;
    game.spawnSerial = 0;
    game.spawnTimer = 0.15;
    syncUi();
    showToast(`第 ${game.wave} 波敌袭已侦测`);
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
    showToast("防线已重置，重新部署吧");
  };

  const selectedTower = gameRef.current.towers.find(
    (tower) => tower.id === selectedTowerId,
  );

  const upgradeSelected = () => {
    const tower = gameRef.current.towers.find((item) => item.id === selectedTowerRef.current);
    if (!tower || tower.level >= 3) return;
    const cost = Math.round(TOWERS[tower.kind].cost * (0.45 + tower.level * 0.34));
    if (gameRef.current.gold < cost) {
      showToast("能量币不足，暂时无法强化");
      return;
    }
    gameRef.current.gold -= cost;
    tower.level += 1;
    tower.spent += cost;
    syncUi();
    showToast(`${TOWERS[tower.kind].name}强化至 ${tower.level} 级`);
  };

  const sellSelected = () => {
    const index = gameRef.current.towers.findIndex(
      (tower) => tower.id === selectedTowerRef.current,
    );
    if (index < 0) return;
    const [tower] = gameRef.current.towers.splice(index, 1);
    const refund = Math.round(tower.spent * 0.65);
    gameRef.current.gold += refund;
    chooseTower(tower.kind);
    syncUi();
    showToast(`已回收，返还能量币 ${refund}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== "game") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "1") chooseTower("pulse");
      if (event.key === "2") chooseTower("frost");
      if (event.key === "3") chooseTower("rail");
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
      let kind: EnemyKind = "drone";
      if (game.wave >= rules.runnerWave && serial % 5 === 3) kind = "runner";
      if (game.wave >= rules.tankWave && serial % 7 === 6) kind = "tank";
      const scale = (1.08 + (game.wave - 1) * 0.3) * rules.enemyHealth;
      const profile =
        kind === "runner"
          ? { hp: 38, speed: 92, reward: 10, radius: 12 }
          : kind === "tank"
            ? { hp: 210, speed: 35, reward: 28, radius: 20 }
            : { hp: 72, speed: 53, reward: 13, radius: 15 };
      game.enemies.push({
        id: game.nextId++,
        kind,
        x: path[0].x,
        y: path[0].y,
        pathIndex: 1,
        hp: profile.hp * scale,
        maxHp: profile.hp * scale,
        speed: profile.speed * (1.04 + game.wave * 0.015) * rules.enemySpeed,
        reward: profile.reward + Math.floor(game.wave / 3),
        radius: profile.radius,
        slowUntil: 0,
        slowFactor: 1,
        dead: false,
      });
    };

    const update = (dt: number) => {
      const game = gameRef.current;
      const rules = activeRulesRef.current;
      const path = activeLevelRef.current.path;
      if (game.paused || game.won || game.lost) return;
      game.elapsed += dt;

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
        let movement =
          enemy.speed * dt * (enemy.slowUntil > game.elapsed ? enemy.slowFactor : 1);
        while (movement > 0 && !enemy.dead) {
          const target = path[enemy.pathIndex];
          if (!target) {
            enemy.dead = true;
            game.lives -= enemy.kind === "tank" ? 2 : 1;
            burst(enemy.x, enemy.y, "#dd8b9e", 12);
            if (game.lives <= 0) {
              game.lives = 0;
              game.lost = true;
              game.active = false;
              showToast("核心失守——调整布防后再试一次");
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

      for (const tower of game.towers) {
        tower.cooldown -= dt;
        const spec = TOWERS[tower.kind];
        const range = spec.range * (1 + (tower.level - 1) * 0.08);
        const target = game.enemies
          .filter((enemy) => !enemy.dead && distance(tower, enemy) <= range)
          .sort((a, b) => b.pathIndex - a.pathIndex || a.hp - b.hp)[0];
        if (target) {
          tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
          if (tower.cooldown <= 0) {
            game.projectiles.push({
              x: tower.x + Math.cos(tower.angle) * 22,
              y: tower.y + Math.sin(tower.angle) * 22,
              targetId: target.id,
              speed: spec.projectileSpeed,
              damage: spec.damage * (1 + (tower.level - 1) * 0.46),
              color: spec.color,
              slow: spec.slow,
              size: tower.kind === "rail" ? 5 : 4,
            });
            tower.cooldown = spec.rate / (1 + (tower.level - 1) * 0.18);
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
        if (length <= step + target.radius) {
          target.hp -= projectile.damage;
          if (projectile.slow) {
            target.slowFactor = projectile.slow;
            target.slowUntil = game.elapsed + 1.55;
          }
          burst(target.x, target.y, projectile.color, 5);
          if (target.hp <= 0 && !target.dead) {
            target.dead = true;
            game.gold += target.reward;
            game.score += Math.round(target.maxHp * 2);
            burst(target.x, target.y, projectile.color, 16);
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
        const bonus = Math.round((20 + game.wave * 5) * rules.waveBonus);
        game.gold += bonus;
        if (rules.finalWave !== null && game.wave >= rules.finalWave) {
          game.won = true;
          game.score += game.lives * 400;
          showToast("全部敌袭已清除，黎明属于我们");
        } else {
          showToast(`第 ${game.wave} 波清除，补给 +${bonus}`);
        }
      }
    };

    const drawPath = (game: Game) => {
      const path = activeLevelRef.current.path;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      };
      trace();
      ctx.strokeStyle = "rgba(143, 221, 227, .15)";
      ctx.lineWidth = 86;
      ctx.stroke();
      trace();
      ctx.strokeStyle = "#202c45";
      ctx.lineWidth = 74;
      ctx.stroke();
      trace();
      ctx.strokeStyle = "#34445f";
      ctx.lineWidth = 62;
      ctx.stroke();
      trace();
      ctx.setLineDash([7, 15]);
      ctx.lineDashOffset = -game.elapsed * 26;
      ctx.strokeStyle = "rgba(184, 201, 225, .32)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    const drawTower = (tower: Tower, selected: boolean) => {
      const spec = TOWERS[tower.kind];
      const pulse = 0.7 + Math.sin(gameRef.current.elapsed * 3 + tower.id) * 0.2;
      ctx.save();
      ctx.translate(tower.x, tower.y);
      if (selected) {
        const range = spec.range * (1 + (tower.level - 1) * 0.08);
        ctx.beginPath();
        ctx.arc(0, 0, range, 0, Math.PI * 2);
        ctx.fillStyle = `${spec.color}12`;
        ctx.fill();
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = `${spec.color}75`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = selected ? 20 : 8;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#172239";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = spec.color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.rotate(tower.angle);
      if (tower.kind === "rail") {
        roundedRect(ctx, -5, -7, 35, 14, 5);
        ctx.fillStyle = "#2b3954";
        ctx.fill();
        ctx.fillStyle = spec.color;
        ctx.fillRect(12, -3, 22, 6);
      } else if (tower.kind === "frost") {
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(28, -7);
        ctx.lineTo(28, 7);
        ctx.closePath();
        ctx.fillStyle = spec.color;
        ctx.globalAlpha = pulse;
        ctx.fill();
      } else {
        roundedRect(ctx, 1, -6, 29, 12, 5);
        ctx.fillStyle = spec.color;
        ctx.globalAlpha = pulse;
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let index = 0; index < tower.level; index += 1) {
        ctx.beginPath();
        ctx.arc(tower.x + (index - (tower.level - 1) / 2) * 10, tower.y + 31, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = spec.color;
        ctx.fill();
      }
      ctx.restore();
    };

    const drawEnemy = (enemy: Enemy) => {
      const color =
        enemy.kind === "runner" ? "#dda0c2" : enemy.kind === "tank" ? "#df918e" : "#e5ebf5";
      const slowed = enemy.slowUntil > gameRef.current.elapsed;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.shadowColor = slowed ? "#b4a4dd" : color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = slowed ? "#c3b7e4" : color;
      if (enemy.kind === "runner") {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-10, -10, 20, 20);
      } else if (enemy.kind === "tank") {
        roundedRect(ctx, -18, -15, 36, 30, 8);
        ctx.fill();
        ctx.fillStyle = "#604050";
        ctx.fillRect(-9, -4, 18, 8);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#46536b";
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const barWidth = enemy.kind === "tank" ? 38 : 30;
      const barY = enemy.y - enemy.radius - 11;
      roundedRect(ctx, enemy.x - barWidth / 2, barY, barWidth, 4, 2);
      ctx.fillStyle = "rgba(17, 24, 42, .88)";
      ctx.fill();
      const health = Math.max(0, enemy.hp / enemy.maxHp);
      roundedRect(ctx, enemy.x - barWidth / 2, barY, barWidth * health, 4, 2);
      ctx.fillStyle = health < 0.35 ? "#dd8b9e" : "#8bcaae";
      ctx.fill();
    };

    const draw = () => {
      const game = gameRef.current;
      const path = activeLevelRef.current.path;
      const entranceY = path[0].y;
      const coreY = path[path.length - 1].y;
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, "#141d32");
      gradient.addColorStop(0.55, "#1a263e");
      gradient.addColorStop(1, "#132137");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.strokeStyle = "rgba(174, 194, 224, .075)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 70; y < HEIGHT; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
      ctx.restore();

      drawPath(game);

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '800 18px "Microsoft YaHei UI", "PingFang SC", sans-serif';
      ctx.fillStyle = "#8fdde3";
      ctx.fillText("入口", 30, entranceY - 42);
      ctx.fillStyle = "#dd8b9e";
      ctx.fillText("核心", 925, coreY - 42);
      ctx.beginPath();
      ctx.arc(925, coreY, 23 + Math.sin(game.elapsed * 3) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(221, 139, 158, .74)";
      ctx.lineWidth = 3;
      ctx.stroke();
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

      for (const projectile of game.projectiles) {
        ctx.save();
        ctx.shadowColor = projectile.color;
        ctx.shadowBlur = 13;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.size, 0, Math.PI * 2);
        ctx.fillStyle = projectile.color;
        ctx.fill();
        ctx.restore();
      }

      game.enemies.forEach(drawEnemy);

      for (const particle of game.particles) {
        ctx.save();
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
        ctx.restore();
      }

      if (game.paused) {
        ctx.fillStyle = "rgba(13, 19, 35, .58)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f6f8ff";
        ctx.font = "800 30px ui-sans-serif, system-ui";
        ctx.fillText("战术暂停", WIDTH / 2, HEIGHT / 2 - 8);
        ctx.fillStyle = "#92a3bd";
        ctx.font = "500 14px ui-sans-serif, system-ui";
        ctx.fillText("按空格键继续", WIDTH / 2, HEIGHT / 2 + 22);
      }
    };

    const loop = (now: number) => {
      const rawDelta = Math.min(0.035, (now - previous) / 1000);
      previous = now;
      const game = gameRef.current;
      update(rawDelta * game.speed);
      draw();
      uiClock += rawDelta;
      if (uiClock > 0.13) {
        syncUi();
        uiClock = 0;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  useEffect(() => {
    try {
      const loaded = parseGuestSave(window.localStorage.getItem(GUEST_SAVE_KEY));
      guestSaveRef.current = loaded;
      saveReadyRef.current = true;
      setGuestSave(loaded);
      setSaveStatus("ready");
    } catch {
      saveReadyRef.current = true;
      setSaveStatus("unavailable");
    }
  }, []);

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
    const previous = guestSaveRef.current.records[key] ?? {
      bestScore: 0,
      bestWave: 0,
      wins: 0,
      plays: 0,
    };
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
          wins: previous.wins + (ui.won ? 1 : 0),
          plays: previous.plays + 1,
        },
      },
    });
  }, [screen, ui.won, ui.lost, ui.score, ui.wave, activeMission]);

  const remaining = ui.enemies + ui.spawnRemaining;
  const selectedSpec = selectedTower ? TOWERS[selectedTower.kind] : null;
  const upgradeCost = selectedTower
    ? Math.round(selectedSpec!.cost * (0.45 + selectedTower.level * 0.34))
    : 0;

  const finalWave = activeRulesRef.current.finalWave;
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
          <button className="menuLogo" onClick={() => setScreen("home")} aria-label="返回游戏大厅">
            <span className="brandMark" aria-hidden="true"><span /></span>
            <span><small>NEON GRID</small><b>霓虹防线</b></span>
          </button>
          <nav aria-label="主菜单">
            <button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")}>大厅</button>
            <button className={screen === "campaign" ? "active" : ""} onClick={() => setScreen("campaign")}>战役</button>
            <button className={screen === "modes" ? "active" : ""} onClick={() => setScreen("modes")}>特殊模式</button>
          </nav>
          <span className={`onlineStatus guestModeStatus ${saveStatus}`}>
            <i />
            {saveStatus === "unavailable" ? "本机存档不可用" : "游客模式 · 本机存档"}
          </span>
        </header>

        {screen === "home" && (
          <>
            <section className="menuHero">
              <div className="heroCopy">
                <p className="heroKicker"><span>新任务已解锁</span> / 指挥官终端</p>
                <h1>选择你的防线，<br /><em>守住最后的核心。</em></h1>
                <p className="heroLead">六个战区、三种特殊协议。观察敌军路线，在有限部署点建立你的霓虹防线。</p>
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
                  <button className="primaryMenuButton" onClick={() => setScreen("campaign")}>
                    <span>开始战役</span><b>选择战区 →</b>
                  </button>
                  <button className="secondaryMenuButton" onClick={() => setScreen("modes")}>
                    特殊模式
                  </button>
                </div>
                <p className="localSaveNote">
                  <i /> 游客进度自动保存在当前设备；换设备或清理浏览器数据后无法恢复。
                </p>
              </div>
              <div className="heroRadar" aria-hidden="true">
                <div className="radarRing ringOne" />
                <div className="radarRing ringTwo" />
                <div className="radarCore"><span>07</span><small>防区</small></div>
                <i className="radarPing pingOne" /><i className="radarPing pingTwo" /><i className="radarPing pingThree" />
              </div>
            </section>
            <section className="menuSummary" aria-label="游戏内容概览">
              <article><strong>06</strong><span><b>战役关卡</b><small>从数据港到核心迷城</small></span></article>
              <article><strong>03</strong><span><b>特殊模式</b><small>生存、闪电与硬核挑战</small></span></article>
              <article>
                <strong>{localRecordCount.toString().padStart(2, "0")}</strong>
                <span>
                  <b>本机记录</b>
                  <small>{localBestScore > 0 ? `最高 ${localBestScore.toLocaleString()} 分` : "完成战局后自动记录"}</small>
                </span>
              </article>
            </section>
          </>
        )}

        {screen === "campaign" && (
          <section className="selectionPage">
            <div className="selectionHeader">
              <div><p>CAMPAIGN / 战役模式</p><h1>选择战区</h1></div>
              <span>关卡越靠后，资源更少、敌人更强。</span>
            </div>
            <div className="levelGrid">
              {LEVELS.map((level) => (
                <button
                  key={level.id}
                  className="levelCard"
                  style={{ "--card-accent": level.accent } as React.CSSProperties}
                  onClick={() => startMission(level, level.rules, "战役模式", level.name)}
                >
                  <span className="levelTop"><i>{level.id.toString().padStart(2, "0")}</i><b>{level.difficulty}</b></span>
                  <span className="levelRoute" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  <span className="levelCopy"><small>{level.sector}</small><strong>{level.name}</strong><em>{level.description}</em></span>
                  <span className="levelMeta"><i>{level.pads.length} 个部署点</i><b>{level.rules.finalWave} 波 →</b></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === "modes" && (
          <section className="selectionPage modeSelection">
            <div className="selectionHeader">
              <div><p>SPECIAL PROTOCOLS / 特殊模式</p><h1>选择协议</h1></div>
              <span>打破标准战役规则，用不同策略刷新战绩。</span>
            </div>
            <div className="modeGrid">
              {MODES.map((mode, index) => {
                const level = LEVELS.find((item) => item.id === mode.levelId)!;
                return (
                  <button
                    key={mode.id}
                    className="modeCard"
                    style={{ "--card-accent": mode.accent } as React.CSSProperties}
                    onClick={() => startMission(level, mode.rules, "特殊模式", mode.name)}
                  >
                    <span className="modeNumber">0{index + 1}</span>
                    <span className="modeBadge">{mode.badge}</span>
                    <strong>{mode.name}</strong>
                    <p>{mode.description}</p>
                    <span className="modeDetails">
                      <i>地图：{level.name}</i>
                      <i>{mode.rules.finalWave === null ? "无限波次" : `${mode.rules.finalWave} 波挑战`}</i>
                    </span>
                    <b className="modeLaunch">启动协议 →</b>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <footer className="menuFooter"><span>NEON GRID DEFENSE // BUILD 02.7</span><span>游客档案仅保存在当前设备</span></footer>
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
            <span><small>核心</small><strong>{ui.lives}</strong></span>
          </div>
          <div className="stat">
            <span className="statIcon coin">◈</span>
            <span><small>能量币</small><strong>{ui.gold}</strong></span>
          </div>
          <div className="stat waveStat">
            <span><small>波次</small><strong>{ui.wave} / {finalWave ?? "∞"}</strong></span>
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
          <div>
            <small>{ui.active ? "检测到威胁" : "区域状态"}</small>
            <strong>
              {ui.won
                ? "区域安全"
                : ui.lost
                  ? "核心离线"
                  : ui.active
                    ? `剩余目标 ${remaining}`
                    : ui.wave === 0
                      ? "等待首次部署"
                      : "波次间歇"}
            </strong>
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
            className="waveButton"
            onClick={startWave}
            disabled={ui.active || ui.won || ui.lost}
          >
            <span>{ui.wave === 0 ? "启动敌袭" : finalWave !== null && ui.wave >= finalWave ? "任务完成" : "下一波"}</span>
            <b>{finalWave === null || ui.wave < finalWave ? `第 ${ui.wave + 1} 波` : "已清除"}</b>
          </button>
        </div>
      </section>

      <div className="gameLayout">
        <section className="arenaPanel">
          <div className="arenaHeader">
            <div>
              <span>区域地图</span>
              <b>{activeMission.level.name}</b>
            </div>
            <p>选择塔后点击道路两侧的部署点 · 点击塔查看详情</p>
          </div>
          <div className="canvasWrap">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              aria-hidden="true"
            />
            <div
              className="placementPads"
              data-testid="placement-pads"
              role="group"
              aria-label="道路两侧的炮塔部署点"
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
                        ? `部署点 ${id}，已部署${TOWERS[tower.kind].name}`
                        : `部署点 ${id}，可部署`
                    }
                  >
                    <span aria-hidden="true">{tower ? tower.level : "+"}</span>
                  </button>
                );
              })}
            </div>
            {toast && <div className="toast" role="status">{toast}</div>}
            {ui.wave === 0 && gameRef.current.towers.length === 0 && (
              <div className="firstHint" aria-hidden="true">
                <span>01</span>
                <p><b>选择防御塔</b>点击道路两侧的方形部署点</p>
              </div>
            )}
            {(ui.won || ui.lost) && (
              <div className="resultOverlay">
                <p>{ui.won ? "区域已保卫" : "核心已失守"}</p>
                <h2>{ui.won ? "黎明已至" : "防线失守"}</h2>
                <span>
                  {ui.won
                    ? `最终得分 ${ui.score.toLocaleString()} · 核心完整度 ${ui.lives}/${activeMission.rules.lives}`
                    : `坚持到第 ${ui.wave} 波 · 最终得分 ${ui.score.toLocaleString()}`}
                </span>
                <button onClick={resetGame}>重新部署</button>
              </div>
            )}
          </div>
          <div className="arenaFooter">
            <span><i className="legendDot standard" />巡航体</span>
            <span><i className="legendDot runner" />疾行体</span>
            <span><i className="legendDot tank" />重装体</span>
            <em>空格键：开始 / 暂停</em>
          </div>
        </section>

        <aside className="sidebar">
          <div className="sidebarTitle">
            <div>
              <span>防御阵列</span>
              <h2>防御单元</h2>
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
                  <span className="towerGlyph" style={{ "--tower-color": tower.color } as React.CSSProperties}>
                    {tower.glyph}
                  </span>
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
                  <span className="towerGlyph mini" style={{ "--tower-color": selectedSpec.color } as React.CSSProperties}>
                    {selectedSpec.glyph}
                  </span>
                  <div>
                    <small>已选单元</small>
                    <h3>{selectedSpec.name} <em>{selectedTower.level} 级</em></h3>
                  </div>
                </div>
                <div className="metrics">
                  <span><small>伤害</small><b>{Math.round(selectedSpec.damage * (1 + (selectedTower.level - 1) * 0.46))}</b></span>
                  <span><small>范围</small><b>{Math.round(selectedSpec.range * (1 + (selectedTower.level - 1) * 0.08))}</b></span>
                  <span><small>射速</small><b>{(1 / (selectedSpec.rate / (1 + (selectedTower.level - 1) * 0.18))).toFixed(1)}</b></span>
                </div>
                <div className="inspectorActions">
                  <button
                    className="upgradeButton"
                    onClick={upgradeSelected}
                    disabled={selectedTower.level >= 3}
                  >
                    <span>{selectedTower.level >= 3 ? "已达满级" : "强化单元"}</span>
                    {selectedTower.level < 3 && <b>◈ {upgradeCost}</b>}
                  </button>
                  <button className="sellButton" onClick={sellSelected}>
                    回收 +{Math.round(selectedTower.spent * 0.65)}
                  </button>
                </div>
              </>
            ) : (
              <div className="emptyInspector">
                <span>＋</span>
                <p>点击已部署的防御塔<br />查看升级与回收选项</p>
              </div>
            )}
          </div>

          <div className="missionNote">
            <span>指挥官提示</span>
            <p>弯道是火力覆盖的黄金位置。冷凝塔与轨道炮组合能有效处理重装目标。</p>
          </div>
        </aside>
      </div>

      <footer className="siteFooter">
        <span>{saveStatus === "unavailable" ? "游客模式 · 存档不可用" : "游客模式 · 本机自动存档"}</span>
        <p>{finalWave === null ? "守住核心，挑战尽可能多的敌袭。" : `守住核心，撑过 ${finalWave} 波敌袭。`}</p>
        <button onClick={resetGame}>重置战局 ↻</button>
      </footer>
    </main>
  );
}
