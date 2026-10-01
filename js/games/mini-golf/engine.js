// Mini golf physics. Pure JS, no DOM. Physics runs on the ground plane (x, y);
// terrain height only adds slope forces. Everything advances in fixed steps of
// DT seconds so results are deterministic and testable.
//
// Shapes:   { rect: [x, y, w, h] } | { circle: [x, y, r] } | { poly: [[x, y], ...] }
// Hole:     { name, par, fairways: [{ path: [[x, y, height?, width?], ...], width }]
//             (or outline / outlines), tee?, cup?, hills?: [{ x, y, r, h }],
//             walls?, blocks?, bumpers?, spinners?, sand?, water?, ice?, slopes?, boosts?, portals? }

export const FIELD = { w: 100, h: 160 }; // legacy default bounds
export const GRAVITY = 260; // slope force per unit of terrain gradient
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
  pinball: { wallE: 0.98, bumperE: 2.1, greenDecel: 18, kick: 140 },
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
const openSegs = (pts, closed) => (closed ? polySegs(pts) : pts.slice(1).map((p, i) => [...pts[i], ...p]));

// Where fairways overlap (forks, junctions) their rails would block each other, so
// any edge of one outline that lies inside another is dropped. Returns the walls
// that remain as runs: { points, closed }.
function railRuns(outlines) {
  const runs = [];
  outlines.forEach((o, k) => {
    // Which side is inside (renderers need it for open runs)
    let area = 0;
    o.forEach((p, i) => {
      const q = o[(i + 1) % o.length];
      area += p[0] * q[1] - q[0] * p[1];
    });
    const inward = area > 0 ? 1 : -1;
    const others = outlines.filter((_, j) => j !== k);
    const keep = o.map((p, i) => {
      const q = o[(i + 1) % o.length];
      return !others.some((poly) => pointIn({ poly }, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2));
    });
    const first = keep.indexOf(false);
    if (first < 0) {
      runs.push({ points: o, closed: true, inward });
      return;
    }
    let run = null;
    for (let n = 1; n <= o.length; n++) {
      const i = (first + n) % o.length;
      if (keep[i]) {
        run ??= [o[i]];
        run.push(o[(i + 1) % o.length]);
      } else if (run) {
        runs.push({ points: run, closed: false, inward });
        run = null;
      }
    }
    if (run) runs.push({ points: run, closed: false, inward });
  });
  return runs;
}

function closestOnSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return [x1 + dx * t, y1 + dy * t];
}

/* --------------------------------------------------------------- Fairways */

// Centripetal-ish Catmull-Rom through control points, resampled every `step` units.
// Control points: [x, y, height = 0, width = undefined]
export function smoothPath(ctrl, step = 3) {
  const P = ctrl.map(([x, y, h = 0, w]) => ({ x, y, h, w }));
  const pts = [P[0], ...P, P[P.length - 1]];
  const raw = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(2, Math.ceil(seg / 1.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const lerp = (a, b) => (a == null && b == null ? undefined : (a ?? b) + ((b ?? a) - (a ?? b)) * (t * t * (3 - 2 * t)));
      raw.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), h: lerp(p1.h, p2.h), w: lerp(p1.w, p2.w) });
    }
  }
  raw.push({ ...P[P.length - 1] });
  // Resample at even spacing and record arc length
  const out = [{ ...raw[0], s: 0 }];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    const d = Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    acc += d;
    if (acc >= step || i === raw.length - 1) {
      out.push({ ...raw[i], s: out[out.length - 1].s + acc });
      acc = 0;
    }
  }
  return out;
}

// Point along a path at fraction t (0..1) of its length, pushed sideways by `side` units.
export function along(path, t, side = 0) {
  const pts = Array.isArray(path[0]) ? smoothPath(path) : path;
  const total = pts[pts.length - 1].s;
  const target = Math.max(0, Math.min(1, t)) * total;
  let i = 1;
  while (i < pts.length - 1 && pts[i].s < target) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const k = (target - a.s) / (b.s - a.s || 1);
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  return [a.x + tx * k - (ty / len) * side, a.y + ty * k + (tx / len) * side];
}

export function fairwayOutline(f) {
  const pts = smoothPath(f.path, 2.5);
  const half = (p) => (p.w ?? f.width) / 2;
  const left = [];
  const right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    left.push([p.x + nx * half(p), p.y + ny * half(p)]);
    right.push([p.x - nx * half(p), p.y - ny * half(p)]);
  });
  const cap = (c, from, sweep) => {
    const out = [];
    const r = Math.hypot(from[0] - c.x, from[1] - c.y);
    const a0 = Math.atan2(from[1] - c.y, from[0] - c.x);
    for (let k = 1; k < 10; k++) {
      const a = a0 + (sweep * k) / 10;
      out.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
    }
    return out;
  };
  const end = pts[pts.length - 1];
  const start = pts[0];
  return [...left, ...cap(end, left[left.length - 1], -Math.PI), ...right.reverse(), ...cap(start, right[right.length - 1] ?? right[0], -Math.PI)];
}

// Height of the centerline point nearest to (x, y). Searches rings of buckets
// outward; one extra ring past the first hit catches closer points across a border.
const BUCKET = 8;
function nearestHeight(buckets, fi, fj, x, y) {
  const bi = Math.floor(fi);
  const bj = Math.floor(fj);
  let best = Infinity;
  let h = 0;
  let stop = 200;
  for (let ring = 0; ring <= stop; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      const step = Math.abs(dj) === ring ? 1 : ring * 2 || 1;
      for (let di = -ring; di <= ring; di += step) {
        for (const q of buckets.get((bj + dj) * 4096 + bi + di) ?? []) {
          const d = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (d < best) {
            best = d;
            h = q.h;
          }
        }
      }
    }
    if (best < Infinity && stop === 200) stop = ring + 1;
  }
  return h;
}

// Memoized per hole: outlines, dense centerlines and the terrain height grid.
const PREP = new WeakMap();
function prepare(hole) {
  if (PREP.has(hole)) return PREP.get(hole);
  const paths = (hole.fairways ?? []).map((f) => smoothPath(f.path, 2));
  const outlines = hole.outlines ?? (hole.fairways ? hole.fairways.map(fairwayOutline) : [hole.outline]);
  const xs = outlines.flat().map((p) => p[0]);
  const ys = outlines.flat().map((p) => p[1]);
  const bounds = { x: Math.min(...xs) - 6, y: Math.min(...ys) - 6 };
  bounds.w = Math.max(...xs) + 6 - bounds.x;
  bounds.h = Math.max(...ys) + 6 - bounds.y;

  const first = paths[0];
  const last = paths[paths.length - 1];
  const tee = hole.tee ?? (first ? along(first, Math.min(0.5, 10 / first[first.length - 1].s)) : [50, 140]);
  const cup = hole.cup ?? (last ? along(last, 1 - Math.min(0.5, 14 / last[last.length - 1].s)) : [50, 30]);

  // Height grid, 1 unit per cell
  const gx = Math.ceil(bounds.w) + 1;
  const gy = Math.ceil(bounds.h) + 1;
  const grid = new Float32Array(gx * gy);
  const hills = hole.hills ?? [];
  const hasPathHeight = paths.some((p) => p.some((q) => q.h));
  const buckets = new Map();
  for (const path of paths) {
    for (const q of path) {
      const key = Math.floor((q.y - bounds.y) / BUCKET) * 4096 + Math.floor((q.x - bounds.x) / BUCKET);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(q);
    }
  }
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const x = bounds.x + i;
      const y = bounds.y + j;
      let h = 0;
      if (hasPathHeight) {
        h = nearestHeight(buckets, (x - bounds.x) / BUCKET, (y - bounds.y) / BUCKET, x, y);
      }
      for (const hl of hills) {
        const s = hl.r / 2.4;
        h += hl.h * Math.exp(-((x - hl.x) ** 2 + (y - hl.y) ** 2) / (2 * s * s));
      }
      grid[j * gx + i] = h;
    }
  }
  const prep = { paths, outlines, rails: railRuns(outlines), bounds, tee, cup, terrain: { grid, gx, gy, x0: bounds.x, y0: bounds.y } };
  PREP.set(hole, prep);
  return prep;
}

export function heightAt(w, x, y) {
  const t = w.terrain;
  const fx = Math.max(0, Math.min(t.gx - 1.001, x - t.x0));
  const fy = Math.max(0, Math.min(t.gy - 1.001, y - t.y0));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const g = t.grid;
  const a = g[j * t.gx + i];
  const b = g[j * t.gx + i + 1];
  const c = g[(j + 1) * t.gx + i];
  const d = g[(j + 1) * t.gx + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function slopeAt(w, x, y) {
  const e = 0.75;
  return [(heightAt(w, x + e, y) - heightAt(w, x - e, y)) / (2 * e), (heightAt(w, x, y + e) - heightAt(w, x, y - e)) / (2 * e)];
}

/* ------------------------------------------------------------------ World */

export function buildWorld(hole, { mode = 'classic', twist = null, seed = 1 } = {}) {
  const phys = { ...MODE_PHYSICS[mode] };
  const prep = prepare(hole);
  const segments = [...prep.rails.flatMap((r) => openSegs(r.points, r.closed)), ...(hole.walls ?? []).map(([a, b]) => [...a, ...b])];
  for (const b of hole.blocks ?? []) segments.push(...(b.rect ? rectSegs(b.rect) : polySegs(b.poly)));
  const segGrid = buildSegGrid(segments, prep.bounds);
  const hilly = (hole.hills?.length ?? 0) > 0 || prep.paths.some((p) => p.some((q) => q.h));

  let cupR = CUP_R;
  let cupAmp = 0;
  let wind = [0, 0];
  if (twist === 'tiny') cupR *= 0.55;
  if (twist === 'giant') cupR *= 2.1;
  if (twist === 'moving') cupAmp = 12;
  if (twist === 'ice') Object.assign(phys, MODE_PHYSICS.ice);
  if (twist === 'bouncy') Object.assign(phys, { wallE: 1.02, bumperE: 1.9, kick: 115 });
  if (twist === 'wind') {
    const a = ((seed * 9301 + 49297) % 233280) / 233280 * Math.PI * 2;
    wind = [Math.cos(a) * 16, Math.sin(a) * 16];
  }

  return {
    hole,
    segments,
    segGrid,
    outlines: prep.outlines,
    rails: prep.rails,
    paths: prep.paths,
    bounds: prep.bounds,
    terrain: prep.terrain,
    hilly,
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
    cup: { x: prep.cup[0], y: prep.cup[1], r: cupR, amp: cupAmp },
    tee: prep.tee,
    wind,
    mirror: twist === 'mirror',
    collide: !!phys.collide,
    wallE: phys.wallE ?? 0.72,
    bumperE: phys.bumperE ?? 1.7,
    kick: phys.kick ?? 95,
    green: { decel: phys.greenDecel ?? SURFACE.green.decel, drag: phys.greenDrag ?? SURFACE.green.drag },
    sandF: { decel: phys.sandDecel ?? SURFACE.sand.decel, drag: SURFACE.sand.drag },
    t: 0,
  };
}

const CELL = 10;
function buildSegGrid(segments, b) {
  const cols = Math.ceil(b.w / CELL) + 1;
  const rows = Math.ceil(b.h / CELL) + 1;
  const cells = Array.from({ length: cols * rows }, () => []);
  const pad = BALL_R + 1;
  segments.forEach((s, idx) => {
    const c0 = Math.max(0, Math.floor((Math.min(s[0], s[2]) - pad - b.x) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(s[0], s[2]) + pad - b.x) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(s[1], s[3]) - pad - b.y) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(s[1], s[3]) + pad - b.y) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(idx);
  });
  return { cells, cols, rows, x0: b.x, y0: b.y };
}

function nearbySegments(w, x, y) {
  const g = w.segGrid;
  const c = Math.floor((x - g.x0) / CELL);
  const r = Math.floor((y - g.y0) / CELL);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return w.segments.map((_, i) => i);
  return g.cells[r * g.cols + c];
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
  Object.assign(ball, { x: w.tee[0], y: w.tee[1], vx: 0, vy: 0, active: true, sunk: false, lock: null, settled: false, slowT: 0 });
}

// dx, dy: unit aim direction; power: 0..1
export function shoot(ball, dx, dy, power) {
  ball.lastX = ball.x;
  ball.lastY = ball.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len === 0 || !Number.isFinite(power)) return false;
  dx /= len;
  dy /= len;
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
  if (w.hilly) {
    const [sx, sy] = slopeAt(w, x, y);
    ax -= sx * GRAVITY;
    ay -= sy * GRAVITY;
  }
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
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    // Never let a corrupt position wedge the game: put the ball back where the shot began
    Object.assign(b, { x: b.lastX, y: b.lastY, vx: 0, vy: 0 });
  }
  const moving = b.vx !== 0 || b.vy !== 0;
  if (moving) b.settled = false;
  const [zx, zy] = zoneAccel(w, b.x, b.y);
  if (!moving && (b.settled || (zx === 0 && zy === 0))) {
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
  if (!Number.isFinite(b.vx) || !Number.isFinite(b.vy)) {
    b.vx = 0;
    b.vy = 0;
  }
  // A ball creeping against a wall or wobbling in a dip comes to rest instead of jittering forever.
  if (speedOf(b) < 4) b.slowT = (b.slowT ?? 0) + DT;
  else b.slowT = 0;
  if (b.slowT > 0.6) {
    Object.assign(b, { vx: 0, vy: 0, slowT: 0, settled: true });
    return;
  }
  const cap = MAX_SPEED * 1.35;
  const s2 = speedOf(b);
  if (s2 > cap) {
    b.vx *= cap / s2;
    b.vy *= cap / s2;
  }

  b.x += b.vx * DT;
  b.y += b.vy * DT;

  // Static walls (only the ones near the ball)
  for (const i of nearbySegments(w, b.x, b.y)) {
    const [x1, y1, x2, y2] = w.segments[i];
    bounce(b, x1, y1, x2, y2, 0, 0, w.wallE, events, 'wall');
  }

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
