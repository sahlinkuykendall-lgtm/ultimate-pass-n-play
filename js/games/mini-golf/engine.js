// Mini golf physics. Pure JS, no DOM. The course lives in a 100 × 160 field
// (portrait). Everything advances in fixed steps of DT seconds so results are
// deterministic and testable.
//
// Shapes:   { rect: [x, y, w, h] } | { circle: [x, y, r] } | { poly: [[x, y], ...] }
// Hole:     { name, par, tee, cup, outline, walls?, blocks?, bumpers?, spinners?,
//             sand?, water?, ice?, slopes?, boosts?, portals? }

export const FIELD = { w: 100, h: 160 };
export const BALL_R = 2.2;
export const CUP_R = 3.6;
export const MAX_SPEED = 170;
export const DT = 1 / 240;

const SURFACE = {
  green: { decel: 22, drag: 0.35 },
  sand: { decel: 115, drag: 2.6 },
  ice: { decel: 6, drag: 0.1 },
};

export const MODE_PHYSICS = {
  classic: {},
  ice: { greenDecel: 6, greenDrag: 0.1, sandDecel: 45 },
  pinball: { wallE: 0.98, bumperE: 1.75, greenDecel: 18, kick: 60 },
  bumper: { collide: true },
  wild: {},
  pin: {},
};

// Twists for Wild Card mode: one random rule change per hole.
export const TWISTS = [
  { id: 'wind', name: 'Wind', desc: 'A steady wind pushes your ball.' },
  { id: 'tiny', name: 'Tiny cup', desc: 'The cup is half size.' },
  { id: 'giant', name: 'Giant cup', desc: 'The cup is huge. Don’t miss.' },
  { id: 'moving', name: 'Moving cup', desc: 'The cup slides side to side.' },
  { id: 'ice', name: 'Ice rink', desc: 'Everything is frictionless-ish.' },
  { id: 'bouncy', name: 'Rubber walls', desc: 'Walls bounce back harder.' },
  { id: 'mirror', name: 'Mirror aim', desc: 'Push to shoot. Aim is reversed.' },
];

/* ---------------------------------------------------------------- Geometry */

export function pointIn(shape, x, y) {
  if (shape.rect) {
    const [rx, ry, w, h] = shape.rect;
    return x >= rx && x <= rx + w && y >= ry && y <= ry + h;
  }
  if (shape.circle) {
    const [cx, cy, r] = shape.circle;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }
  const pts = shape.poly;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const rectSegs = ([x, y, w, h]) => [
  [x, y, x + w, y],
  [x + w, y, x + w, y + h],
  [x + w, y + h, x, y + h],
  [x, y + h, x, y],
];
const polySegs = (pts) => pts.map((p, i) => [...p, ...pts[(i + 1) % pts.length]]);

function closestOnSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return [x1 + dx * t, y1 + dy * t];
}

/* ------------------------------------------------------------------ World */

export function buildWorld(hole, { mode = 'classic', twist = null, seed = 1 } = {}) {
  const phys = { ...MODE_PHYSICS[mode] };
  const segments = [...polySegs(hole.outline), ...(hole.walls ?? []).map(([a, b]) => [...a, ...b])];
  for (const b of hole.blocks ?? []) segments.push(...(b.rect ? rectSegs(b.rect) : polySegs(b.poly)));

  let cupR = CUP_R;
  let cupAmp = 0;
  let wind = [0, 0];
  if (twist === 'tiny') cupR *= 0.55;
  if (twist === 'giant') cupR *= 2.1;
  if (twist === 'moving') cupAmp = 12;
  if (twist === 'ice') Object.assign(phys, MODE_PHYSICS.ice);
  if (twist === 'bouncy') Object.assign(phys, { wallE: 1.02, bumperE: 1.6 });
  if (twist === 'wind') {
    const a = ((seed * 9301 + 49297) % 233280) / 233280 * Math.PI * 2;
    wind = [Math.cos(a) * 16, Math.sin(a) * 16];
  }

  return {
    hole,
    segments,
    bumpers: (hole.bumpers ?? []).map((b) => ({ ...b, hit: -1 })),
    spinners: hole.spinners ?? [],
    portals: hole.portals ?? [],
    sand: hole.sand ?? [],
    water: hole.water ?? [],
    ice: hole.ice ?? [],
    zones: [
      ...(hole.slopes ?? []).map((z) => ({ ...z, kind: 'slope' })),
      ...(hole.boosts ?? []).map((z) => ({ ...z, kind: 'boost' })),
    ],
    cup: { x: hole.cup[0], y: hole.cup[1], r: cupR, amp: cupAmp },
    tee: hole.tee,
    wind,
    mirror: twist === 'mirror',
    collide: !!phys.collide,
    wallE: phys.wallE ?? 0.72,
    bumperE: phys.bumperE ?? 1.25,
    kick: phys.kick ?? 32,
    green: { decel: phys.greenDecel ?? SURFACE.green.decel, drag: phys.greenDrag ?? SURFACE.green.drag },
    sandF: { decel: phys.sandDecel ?? SURFACE.sand.decel, drag: SURFACE.sand.drag },
    t: 0,
  };
}

export function cupPos(w) {
  return { x: w.cup.x + w.cup.amp * Math.sin(w.t * 1.3), y: w.cup.y, r: w.cup.r };
}

export function spinnerEnds(sp, t) {
  const a = (sp.angle ?? 0) + sp.speed * t;
  const hx = (Math.cos(a) * sp.len) / 2;
  const hy = (Math.sin(a) * sp.len) / 2;
  return [sp.x - hx, sp.y - hy, sp.x + hx, sp.y + hy];
}

export function newBall(seat) {
  return { seat, x: 0, y: 0, vx: 0, vy: 0, active: false, sunk: false, lastX: 0, lastY: 0, lock: null };
}

export function placeAtTee(w, ball) {
  Object.assign(ball, { x: w.tee[0], y: w.tee[1], vx: 0, vy: 0, active: true, sunk: false, lock: null });
}

// dx, dy: unit aim direction; power: 0..1
export function shoot(ball, dx, dy, power) {
  ball.lastX = ball.x;
  ball.lastY = ball.y;
  const s = Math.max(0, Math.min(1, power)) * MAX_SPEED;
  ball.vx = dx * s;
  ball.vy = dy * s;
}

const speedOf = (b) => Math.hypot(b.vx, b.vy);
export const isMoving = (b) => b.active && !b.sunk && (b.vx !== 0 || b.vy !== 0);
export const allResting = (balls) => !balls.some(isMoving);

function frictionAt(w, x, y) {
  if (w.sand.some((s) => pointIn(s, x, y))) return w.sandF;
  if (w.ice.some((s) => pointIn(s, x, y))) return SURFACE.ice;
  return w.green;
}

function zoneAccel(w, x, y) {
  let ax = 0;
  let ay = 0;
  for (const z of w.zones) {
    if (pointIn(z.shape, x, y)) {
      ax += z.accel[0];
      ay += z.accel[1];
    }
  }
  return [ax, ay];
}

/* -------------------------------------------------------------------- Step */

// Advances the world by one DT. Mutates balls; returns an array of events.
export function step(w, balls) {
  const events = [];
  for (const b of balls) {
    if (!b.active || b.sunk) continue;
    stepBall(w, b, events);
  }
  if (w.collide) collideBalls(balls, events);
  w.t += DT;
  return events;
}

function stepBall(w, b, events) {
  const moving = b.vx !== 0 || b.vy !== 0;
  const [zx, zy] = zoneAccel(w, b.x, b.y);
  if (!moving && zx === 0 && zy === 0) {
    restingContacts(w, b, events);
    return;
  }

  // Forces: slopes/boosts always, wind only while rolling.
  const ax = zx + (moving ? w.wind[0] : 0);
  const ay = zy + (moving ? w.wind[1] : 0);
  b.vx += ax * DT;
  b.vy += ay * DT;

  const f = frictionAt(w, b.x, b.y);
  const sp = speedOf(b);
  if (sp > 0) {
    const drop = (f.decel + f.drag * sp) * DT;
    if (drop >= sp && Math.hypot(zx, zy) <= f.decel) {
      b.vx = 0;
      b.vy = 0;
      return;
    }
    const k = Math.max(0, sp - drop) / sp;
    b.vx *= k;
    b.vy *= k;
  }
  const cap = MAX_SPEED * 1.35;
  const s2 = speedOf(b);
  if (s2 > cap) {
    b.vx *= cap / s2;
    b.vy *= cap / s2;
  }

  b.x += b.vx * DT;
  b.y += b.vy * DT;

  // Static walls
  for (const [x1, y1, x2, y2] of w.segments) bounce(b, x1, y1, x2, y2, 0, 0, w.wallE, events, 'wall');

  // Rotating bars: include the bar's own velocity at the contact point.
  for (const sp of w.spinners) {
    const [x1, y1, x2, y2] = spinnerEnds(sp, w.t);
    const [cx, cy] = closestOnSeg(b.x, b.y, x1, y1, x2, y2);
    bounce(b, x1, y1, x2, y2, -sp.speed * (cy - sp.y), sp.speed * (cx - sp.x), 0.8, events, 'spinner');
  }

  // Bumpers kick the ball away
  for (const bp of w.bumpers) {
    const dx = b.x - bp.x;
    const dy = b.y - bp.y;
    const d = Math.hypot(dx, dy);
    const min = bp.r + BALL_R;
    if (d >= min || d === 0) continue;
    const nx = dx / d;
    const ny = dy / d;
    b.x = bp.x + nx * min;
    b.y = bp.y + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + w.bumperE) * vn * nx;
      b.vy -= (1 + w.bumperE) * vn * ny;
    }
    const out = b.vx * nx + b.vy * ny;
    if (out < w.kick) {
      b.vx += (w.kick - out) * nx;
      b.vy += (w.kick - out) * ny;
    }
    bp.hit = w.t;
    events.push({ type: 'bumper', ball: b, speed: speedOf(b) });
  }

  // Water: back to where the shot started, one stroke penalty
  if (w.water.some((s) => pointIn(s, b.x, b.y))) {
    events.push({ type: 'water', ball: b, x: b.x, y: b.y });
    b.x = b.lastX;
    b.y = b.lastY;
    b.vx = 0;
    b.vy = 0;
    return;
  }

  // Portals (both directions)
  if (b.lock) {
    const [lx, ly] = b.lock;
    const p = w.portals.find((q) => q.a === b.lock || q.b === b.lock);
    if (Math.hypot(b.x - lx, b.y - ly) > (p?.r ?? 5) + BALL_R + 0.5) b.lock = null;
  }
  if (!b.lock) {
    for (const p of w.portals) {
      for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) {
        if (Math.hypot(b.x - from[0], b.y - from[1]) < p.r) {
          b.x = to[0];
          b.y = to[1];
          b.lock = to;
          events.push({ type: 'portal', ball: b, from, to });
          break;
        }
      }
      if (b.lock) break;
    }
  }

  // Cup
  const cup = cupPos(w);
  const dx = cup.x - b.x;
  const dy = cup.y - b.y;
  const d = Math.hypot(dx, dy);
  const s = speedOf(b);
  const sinkSpeed = 62 * Math.sqrt(cup.r / CUP_R);
  if (d < cup.r) {
    if (s < sinkSpeed) {
      b.sunk = true;
      b.vx = 0;
      b.vy = 0;
      b.x = cup.x;
      b.y = cup.y;
      events.push({ type: 'sink', ball: b, speed: s });
      return;
    }
    if (!b.lipped) {
      // Too hot: rattle off the lip
      const side = dx * b.vy - dy * b.vx > 0 ? 1 : -1;
      const a = 0.55 * side;
      const vx = b.vx * Math.cos(a) - b.vy * Math.sin(a);
      const vy = b.vx * Math.sin(a) + b.vy * Math.cos(a);
      b.vx = vx * 0.62;
      b.vy = vy * 0.62;
      b.lipped = true;
      events.push({ type: 'lip', ball: b });
    }
  } else {
    b.lipped = false;
    if (d < cup.r * 2.1 && s > 0 && s < 42) {
      b.vx += (dx / d) * 60 * DT;
      b.vy += (dy / d) * 60 * DT;
    }
  }
}

// A ball at rest can still be swept by a windmill blade or have the moving cup slide under it.
function restingContacts(w, b, events) {
  for (const sp of w.spinners) {
    if (Math.hypot(b.x - sp.x, b.y - sp.y) > sp.len / 2 + BALL_R + 1) continue;
    const [x1, y1, x2, y2] = spinnerEnds(sp, w.t);
    const [cx, cy] = closestOnSeg(b.x, b.y, x1, y1, x2, y2);
    bounce(b, x1, y1, x2, y2, -sp.speed * (cy - sp.y), sp.speed * (cx - sp.x), 0.8, events, 'spinner');
  }
  if (w.cup.amp) {
    const cup = cupPos(w);
    if (Math.hypot(cup.x - b.x, cup.y - b.y) < cup.r - BALL_R * 0.5) {
      Object.assign(b, { sunk: true, vx: 0, vy: 0, x: cup.x, y: cup.y });
      events.push({ type: 'sink', ball: b, speed: 0 });
    }
  }
}

function bounce(b, x1, y1, x2, y2, svx, svy, e, events, type) {
  const [cx, cy] = closestOnSeg(b.x, b.y, x1, y1, x2, y2);
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= BALL_R || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  b.x = cx + nx * BALL_R;
  b.y = cy + ny * BALL_R;
  const rvx = b.vx - svx;
  const rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx = rvx - (1 + e) * vn * nx + svx;
    b.vy = rvy - (1 + e) * vn * ny + svy;
    if (-vn > 6) events.push({ type, ball: b, speed: -vn });
  }
}

function collideBalls(balls, events) {
  const live = balls.filter((b) => b.active && !b.sunk);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const c = live[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R * 2 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (BALL_R * 2 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      c.x += nx * push;
      c.y += ny * push;
      const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
      if (rel <= 0) continue;
      const jImp = (rel * (1 + 0.92)) / 2;
      a.vx -= jImp * nx;
      a.vy -= jImp * ny;
      c.vx += jImp * nx;
      c.vy += jImp * ny;
      events.push({ type: 'ball', ball: a, other: c, speed: rel });
    }
  }
}

// Runs until every ball rests (or a time limit). Used by tests and the aim preview.
export function simulate(w, balls, maxSeconds = 12, onEvents) {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    const ev = step(w, balls);
    if (onEvents && ev.length) onEvents(ev);
    if (allResting(balls)) return i + 1;
  }
  return steps;
}

// Path the ball would take for the first stretch of a shot, ignoring other balls.
export function previewPath(w, ball, dx, dy, power, maxLen = 40) {
  const probe = { ...newBall(-1), x: ball.x, y: ball.y, active: true, lastX: ball.x, lastY: ball.y };
  shoot(probe, dx, dy, power);
  const ghost = { ...w, t: w.t, bumpers: w.bumpers.map((b) => ({ ...b })), collide: false };
  const pts = [[probe.x, probe.y]];
  let len = 0;
  for (let i = 0; i < 1200 && len < maxLen; i++) {
    const px = probe.x;
    const py = probe.y;
    const ev = step(ghost, [probe]);
    if (ev.some((e) => e.type === 'water' || e.type === 'sink' || e.type === 'portal')) break;
    len += Math.hypot(probe.x - px, probe.y - py);
    if (i % 6 === 0) pts.push([probe.x, probe.y]);
    if (!isMoving(probe)) break;
  }
  pts.push([probe.x, probe.y]);
  return pts;
}

export function distToCup(w, b) {
  if (b.sunk) return 0;
  const c = cupPos(w);
  return Math.hypot(c.x - b.x, c.y - b.y);
}

export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? (d < 0 ? 'Incredible!' : `+${d}`);
}
