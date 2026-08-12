"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 620;
const FINAL_WAVE = 8;
const PAD_SIZE = 46;

type Point = { x: number; y: number };
type TowerKind = "pulse" | "frost" | "rail";
type EnemyKind = "drone" | "runner" | "tank";

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

const PATH: Point[] = [
  { x: -40, y: 150 },
  { x: 160, y: 150 },
  { x: 160, y: 310 },
  { x: 400, y: 310 },
  { x: 400, y: 150 },
  { x: 640, y: 150 },
  { x: 640, y: 470 },
  { x: 800, y: 470 },
  { x: 800, y: 310 },
  { x: 1000, y: 310 },
];

const BUILD_PADS: Array<{ id: string; point: Point }> = [
  { id: "A1", point: { x: 80, y: 70 } },
  { id: "A2", point: { x: 80, y: 230 } },
  { id: "B1", point: { x: 240, y: 230 } },
  { id: "B2", point: { x: 320, y: 230 } },
  { id: "B3", point: { x: 320, y: 390 } },
  { id: "C1", point: { x: 480, y: 70 } },
  { id: "C2", point: { x: 480, y: 230 } },
  { id: "C3", point: { x: 560, y: 230 } },
  { id: "D1", point: { x: 720, y: 230 } },
  { id: "D2", point: { x: 560, y: 390 } },
  { id: "D3", point: { x: 720, y: 390 } },
  { id: "D4", point: { x: 720, y: 550 } },
  { id: "E1", point: { x: 880, y: 230 } },
  { id: "E2", point: { x: 880, y: 390 } },
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
    color: "#54f1ff",
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
    color: "#a98bff",
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
    color: "#ffb648",
    slow: 0,
  },
};

const createGame = (): Game => ({
  enemies: [],
  towers: [],
  projectiles: [],
  particles: [],
  gold: 230,
  lives: 12,
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
  const gameRef = useRef<Game>(createGame());
  const selectedKindRef = useRef<TowerKind | null>("pulse");
  const selectedTowerRef = useRef<number | null>(null);
  const hoverRef = useRef<Point | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedKind, setSelectedKind] = useState<TowerKind | null>("pulse");
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [toast, setToast] = useState("先部署防御塔，再启动敌袭");
  const [ui, setUi] = useState<UiState>(() => toUi(gameRef.current));

  const syncUi = () =>
    setUi((previous) => toUi(gameRef.current, previous.version + 1));

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
    if (game.active || game.won || game.lost || game.wave >= FINAL_WAVE) return;
    game.wave += 1;
    game.active = true;
    game.paused = false;
    game.spawnTotal = 8 + game.wave * 2;
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
    gameRef.current = createGame();
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
  }, []);

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
      const serial = game.spawnSerial++;
      let kind: EnemyKind = "drone";
      if (game.wave >= 2 && serial % 5 === 3) kind = "runner";
      if (game.wave >= 3 && serial % 7 === 6) kind = "tank";
      const scale = 1.08 + (game.wave - 1) * 0.3;
      const profile =
        kind === "runner"
          ? { hp: 38, speed: 92, reward: 10, radius: 12 }
          : kind === "tank"
            ? { hp: 210, speed: 35, reward: 28, radius: 20 }
            : { hp: 72, speed: 53, reward: 13, radius: 15 };
      game.enemies.push({
        id: game.nextId++,
        kind,
        x: PATH[0].x,
        y: PATH[0].y,
        pathIndex: 1,
        hp: profile.hp * scale,
        maxHp: profile.hp * scale,
        speed: profile.speed * (1.04 + game.wave * 0.015),
        reward: profile.reward + Math.floor(game.wave / 3),
        radius: profile.radius,
        slowUntil: 0,
        slowFactor: 1,
        dead: false,
      });
    };

    const update = (dt: number) => {
      const game = gameRef.current;
      if (game.paused || game.won || game.lost) return;
      game.elapsed += dt;

      if (game.active && game.spawnRemaining > 0) {
        game.spawnTimer -= dt;
        if (game.spawnTimer <= 0) {
          spawnEnemy();
          game.spawnRemaining -= 1;
          game.spawnTimer = Math.max(0.34, 0.78 - game.wave * 0.035);
        }
      }

      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        let movement =
          enemy.speed * dt * (enemy.slowUntil > game.elapsed ? enemy.slowFactor : 1);
        while (movement > 0 && !enemy.dead) {
          const target = PATH[enemy.pathIndex];
          if (!target) {
            enemy.dead = true;
            game.lives -= enemy.kind === "tank" ? 2 : 1;
            burst(enemy.x, enemy.y, "#ff5470", 12);
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
        const bonus = 20 + game.wave * 5;
        game.gold += bonus;
        if (game.wave >= FINAL_WAVE) {
          game.won = true;
          game.score += game.lives * 400;
          showToast("全部敌袭已清除，黎明属于我们");
        } else {
          showToast(`第 ${game.wave} 波清除，补给 +${bonus}`);
        }
      }
    };

    const drawPath = (game: Game) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(PATH[0].x, PATH[0].y);
        PATH.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      };
      trace();
      ctx.strokeStyle = "rgba(57, 231, 255, .18)";
      ctx.lineWidth = 86;
      ctx.stroke();
      trace();
      ctx.strokeStyle = "#111b32";
      ctx.lineWidth = 74;
      ctx.stroke();
      trace();
      ctx.strokeStyle = "#223352";
      ctx.lineWidth = 62;
      ctx.stroke();
      trace();
      ctx.setLineDash([7, 15]);
      ctx.lineDashOffset = -game.elapsed * 26;
      ctx.strokeStyle = "rgba(148, 184, 221, .28)";
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
      ctx.fillStyle = "#0b1224";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = spec.color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.rotate(tower.angle);
      if (tower.kind === "rail") {
        roundedRect(ctx, -5, -7, 35, 14, 5);
        ctx.fillStyle = "#1d2941";
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
        enemy.kind === "runner" ? "#ff79c9" : enemy.kind === "tank" ? "#ff675e" : "#e9f0ff";
      const slowed = enemy.slowUntil > gameRef.current.elapsed;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.shadowColor = slowed ? "#a98bff" : color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = slowed ? "#bcaaff" : color;
      if (enemy.kind === "runner") {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-10, -10, 20, 20);
      } else if (enemy.kind === "tank") {
        roundedRect(ctx, -18, -15, 36, 30, 8);
        ctx.fill();
        ctx.fillStyle = "#421d2a";
        ctx.fillRect(-9, -4, 18, 8);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#26334d";
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const barWidth = enemy.kind === "tank" ? 38 : 30;
      const barY = enemy.y - enemy.radius - 11;
      roundedRect(ctx, enemy.x - barWidth / 2, barY, barWidth, 4, 2);
      ctx.fillStyle = "rgba(5, 8, 18, .9)";
      ctx.fill();
      const health = Math.max(0, enemy.hp / enemy.maxHp);
      roundedRect(ctx, enemy.x - barWidth / 2, barY, barWidth * health, 4, 2);
      ctx.fillStyle = health < 0.35 ? "#ff5470" : "#61f5a8";
      ctx.fill();
    };

    const draw = () => {
      const game = gameRef.current;
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, "#080d1e");
      gradient.addColorStop(0.55, "#0c1428");
      gradient.addColorStop(1, "#07101d");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.strokeStyle = "rgba(130, 170, 220, .055)";
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
      ctx.fillStyle = "#54f1ff";
      ctx.fillText("入口", 30, 108);
      ctx.fillStyle = "#ff5470";
      ctx.fillText("核心", 925, 268);
      ctx.beginPath();
      ctx.arc(925, 310, 23 + Math.sin(game.elapsed * 3) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 84, 112, .7)";
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
        ctx.fillStyle = valid ? `${spec.color}28` : "rgba(255, 84, 112, .2)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = valid ? spec.color : "#ff5470";
        ctx.stroke();
        ctx.globalAlpha = 0.68;
        ctx.beginPath();
        ctx.arc(hover.x, hover.y, spec.range, 0, Math.PI * 2);
        ctx.fillStyle = valid ? `${spec.color}0d` : "rgba(255, 84, 112, .08)";
        ctx.fill();
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = valid ? spec.color : "#ff5470";
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(hover.x, hover.y, 21, 0, Math.PI * 2);
        ctx.fillStyle = valid ? "#13273b" : "#321422";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = valid ? spec.color : "#ff5470";
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
        ctx.fillStyle = "rgba(4, 8, 18, .55)";
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
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const remaining = ui.enemies + ui.spawnRemaining;
  const selectedSpec = selectedTower ? TOWERS[selectedTower.kind] : null;
  const upgradeCost = selectedTower
    ? Math.round(selectedSpec!.cost * (0.45 + selectedTower.level * 0.34))
    : 0;

  return (
    <main className="gameShell">
      <header className="topbar">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="eyebrow">夜幕网格 / 第 07 区</p>
            <h1>霓虹防线</h1>
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
            <span><small>波次</small><strong>{ui.wave} / {FINAL_WAVE}</strong></span>
          </div>
          <div className="score">
            <small>战绩</small>
            <strong>{ui.score.toString().padStart(6, "0")}</strong>
          </div>
        </div>
      </header>

      <section className="commandBar" aria-label="游戏控制">
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
            <span>{ui.wave === 0 ? "启动敌袭" : ui.wave >= FINAL_WAVE ? "任务完成" : "下一波"}</span>
            <b>{ui.wave < FINAL_WAVE ? `第 ${ui.wave + 1} 波` : "已清除"}</b>
          </button>
        </div>
      </section>

      <div className="gameLayout">
        <section className="arenaPanel">
          <div className="arenaHeader">
            <div>
              <span>区域地图</span>
              <b>河岸数据港</b>
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
              {BUILD_PADS.map(({ id, point }) => {
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
                    ? `最终得分 ${ui.score.toLocaleString()} · 核心完整度 ${ui.lives}/12`
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
        <span>夜幕网格防御协议</span>
        <p>守住核心，撑过 {FINAL_WAVE} 波敌袭。</p>
        <button onClick={resetGame}>重置战局 ↻</button>
      </footer>
    </main>
  );
}
