// Mini golf bot. It "putts in its head": for a fan of aims and strengths it runs
// the real physics on a scratch copy of the hole, scores where each ball ends up by
// walking distance to the cup (around walls, through portals), then refines around
// the best few. Skill is how much its hands shake when it actually putts.
import { BALL_R, pointIn, cupPos, shoot, step, allResting, DT } from './engine.js';

const FIELDS = new WeakMap();

// Walking distance to the cup for every unit cell of the hole (Infinity off the course).
function distanceField(w) {
  if (FIELDS.has(w)) return FIELDS.get(w);
  const B = w.bounds;
  const W = Math.ceil(B.w);
  const H = Math.ceil(B.h);
  const g = new Float32Array(W * H).fill(Infinity);
  const blocked = new Uint8Array(W * H);
  const course = new Uint8Array(W * H);
  const idx = (x, y) => Math.floor(y - B.y) * W + Math.floor(x - B.x);
  // Course cells by scanline: each outline's edge crossings give the runs inside it
  for (const o of w.outlines) {
    for (let j = 0; j < H; j++) {
      const y = B.y + j + 0.5;
      const xs = [];
      for (let a = 0, b = o.length - 1; a < o.length; b = a++) {
        const [xa, ya] = o[a];
        const [xb, yb] = o[b];
        if (ya > y !== yb > y) xs.push(((xb - xa) * (y - ya)) / (yb - ya) + xa);
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] - B.x - 0.5));
        const i1 = Math.min(W - 1, Math.floor(xs[k + 1] - B.x - 0.5));
        for (let i = i0; i <= i1; i++) course[j * W + i] = 1;
      }
    }
  }
  for (let k = 0; k < W * H; k++) blocked[k] = course[k] ? 0 : 1;
  for (const s of w.water) {
    const [x0, y0, x1, y1] = s.circle ? [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]] : s.rect ? [s.rect[0], s.rect[1], s.rect[0] + s.rect[2], s.rect[1] + s.rect[3]] : [B.x, B.y, B.x + W, B.y + H];
    for (let y = Math.floor(y0); y <= y1; y++)
      for (let x = Math.floor(x0); x <= x1; x++) {
        const i = idx(x + 0.5, y + 0.5);
        if (i >= 0 && i < W * H && pointIn(s, x + 0.5, y + 0.5)) blocked[i] = 1;
      }
  }
  // Cells hugging a wall are off limits so paths keep a ball's width away from rails
  for (const [x1, y1, x2, y2] of w.segments) {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    for (let k = 0; k <= n; k++) {
      const x = x1 + ((x2 - x1) * k) / n;
      const y = y1 + ((y2 - y1) * k) / n;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const i = idx(x + ox, y + oy);
          if (i >= 0 && i < W * H && Math.hypot(ox, oy) <= BALL_R) blocked[i] = 1;
        }
    }
  }
  const portals = [];
  for (const p of w.portals) for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) portals.push({ from, to, r: p.r });
  const c = cupPos(w);
  const queue = new Int32Array(W * H * 4);
  let head = 0;
  let tail = 0;
  const start = idx(c.x, c.y);
  g[start] = 0;
  queue[tail++] = start;
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
  while (head < tail && tail < queue.length - 8) {
    const i = queue[head++];
    const x = i % W;
    const y = (i / W) | 0;
    // A ball that reaches a portal mouth comes out the other end: same distance
    const px = B.x + x + 0.5;
    const py = B.y + y + 0.5;
    for (const p of portals) {
      if (Math.hypot(px - p.to[0], py - p.to[1]) < 1.5) {
        const j = idx(...p.from);
        if (j >= 0 && j < W * H && g[j] > g[i]) {
          g[j] = g[i];
          queue[tail++] = j;
        }
      }
    }
    for (const [dx, dy, cost] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (blocked[j] || g[j] <= g[i] + cost) continue;
      g[j] = g[i] + cost;
      queue[tail++] = j;
    }
  }
  const at = (x, y) => {
    const i = idx(x, y);
    const v = i >= 0 && i < W * H ? g[i] : Infinity;
    if (v < Infinity) return v;
    // Resting right against a wall: use the best nearby cell plus a little
    let best = Infinity;
    for (let oy = -3; oy <= 3; oy++)
      for (let ox = -3; ox <= 3; ox++) {
        const k = idx(x + ox, y + oy);
        if (k >= 0 && k < W * H) best = Math.min(best, g[k] + Math.hypot(ox, oy));
      }
    return best + 4;
  };
  FIELDS.set(w, at);
  return at;
}

// Play one shot on a scratch copy of the world. Returns a score (lower is better):
// roughly the walking distance left, with holing out best and water costing a stroke.
function trial(w, balls, seat, angle, power, t, dist) {
  const sw = { ...w, t, bumpers: w.bumpers.map((b) => ({ ...b })) };
  const copies = balls.map((b) => ({ ...b }));
  const me = copies[seat];
  const moving = w.collide ? copies : [me];
  const from = dist(me.x, me.y);
  me.lastX = me.x;
  me.lastY = me.y;
  shoot(me, Math.cos(angle), Math.sin(angle), power);
  const limit = Math.round(14 / DT);
  for (let i = 0; i < limit; i++) {
    const ev = step(sw, moving);
    for (const e of ev) {
      if (e.ball !== me) continue;
      if (e.type === 'sink') return -80 + power * 10; // softer holes-out are safer
      if (e.type === 'water') return from + 120;
    }
    if (allResting(moving)) break;
  }
  return dist(me.x, me.y);
}

const SKILL = [
  { angles: 28, powers: [0.15, 0.3, 0.5, 0.75, 1], aim: 0.07, force: 0.12, refine: 1, robust: 0 },
  { angles: 40, powers: [0.1, 0.2, 0.32, 0.46, 0.62, 0.8, 1], aim: 0.028, force: 0.05, refine: 3, robust: 4 },
  { angles: 48, powers: [0.08, 0.15, 0.23, 0.33, 0.45, 0.58, 0.73, 0.88, 1], aim: 0.01, force: 0.018, refine: 4, robust: 6 },
];

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;

// Picks a shot for balls[seat], simulating the world at time `t` (when it will be hit).
// Async: yields to the browser between batches. `job.cancelled` stops it early.
export async function planShot(w, balls, seat, level, { t = w.t, job = {} } = {}) {
  const skill = SKILL[level] ?? SKILL[1];
  const dist = distanceField(w);
  let slice = performance.now();
  const breathe = async () => {
    if (performance.now() - slice > 12) {
      await new Promise((r) => setTimeout(r, 0));
      slice = performance.now();
    }
  };
  const score = async (list) => {
    const out = [];
    for (const [angle, power] of list) {
      if (job.cancelled) return out;
      out.push({ angle, power, v: trial(w, balls, seat, angle, power, t, dist) });
      await breathe();
    }
    return out;
  };

  // 1. A fan of aims and strengths
  const fan = [];
  for (let a = 0; a < skill.angles; a++) for (const p of skill.powers) fan.push([(a / skill.angles) * Math.PI * 2, p]);
  let results = await score(fan);

  // 2. Refine around the best few
  results.sort((a, b) => a.v - b.v);
  const step = (Math.PI * 2) / skill.angles;
  const near = [];
  for (const r of results.slice(0, skill.refine)) {
    for (const da of [-0.5, -0.25, 0, 0.25, 0.5]) for (const dp of [-0.06, -0.03, 0, 0.03, 0.06]) {
      if (da || dp) near.push([r.angle + da * step, Math.max(0.05, Math.min(1, r.power + dp))]);
    }
  }
  results = results.concat(await score(near));
  if (job.cancelled) return null;
  results.sort((a, b) => a.v - b.v);

  // 3. Prefer shots that still work when the putt is a little off (no knife edges)
  let best = results[0];
  if (skill.robust) {
    const da = Math.max(skill.aim, 0.02);
    const dp = Math.max(skill.force, 0.04);
    let bestMean = Infinity;
    const seen = [];
    for (const r of results) {
      if (seen.length >= skill.robust) break;
      if (seen.some((x) => Math.abs(x.angle - r.angle) < step * 0.3 && Math.abs(x.power - r.power) < 0.02)) continue;
      seen.push(r);
      const shakes = await score([
        [r.angle + da, r.power],
        [r.angle - da, r.power],
        [r.angle, Math.min(1, r.power * (1 + dp))],
        [r.angle, r.power * (1 - dp)],
      ]);
      if (job.cancelled) return null;
      const mean = (r.v * 2 + shakes.reduce((s, x) => s + x.v, 0)) / (2 + shakes.length);
      if (mean < bestMean) {
        bestMean = mean;
        best = r;
      }
    }
  }

  // Hands aren't perfect
  const angle = best.angle + gauss() * skill.aim;
  const power = Math.max(0.05, Math.min(1, best.power * (1 + gauss() * skill.force)));
  return { v: best.v, dir: [Math.cos(angle), Math.sin(angle)], power, aimDir: [Math.cos(best.angle), Math.sin(best.angle)], aimPower: best.power };
}

// Does timing matter on this hole (windmills or a moving cup)?
export const timed = (w) => w.spinners.length > 0 || w.cup.amp > 0;

// Build the hole's distance map ahead of time (during the hole intro).
export const prepareHole = (w) => void distanceField(w);
