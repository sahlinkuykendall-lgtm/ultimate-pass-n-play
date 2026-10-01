// Canvas renderer for the mini golf course. Draws in field units (100 × 160);
// the caller supplies a transform that maps the field onto the canvas.
import { FIELD, BALL_R, cupPos, spinnerEnds, pointIn } from './engine.js';

const WALL = '#efeaff';
const WALL_GLOW = 'rgba(167, 139, 250, 0.55)';

function pathShape(g, shape) {
  g.beginPath();
  if (shape.rect) {
    const [x, y, w, h] = shape.rect;
    roundRect(g, x, y, w, h, Math.min(3, w / 2, h / 2));
  } else if (shape.circle) {
    const [x, y, r] = shape.circle;
    g.arc(x, y, r, 0, Math.PI * 2);
  } else {
    shape.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function outlinePath(g, hole) {
  g.beginPath();
  hole.outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

// Seeded speckles so sand looks the same every frame.
function speckle(g, shape, color, density, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const [x0, y0, w, h] = shape.rect ?? (shape.circle ? [shape.circle[0] - shape.circle[2], shape.circle[1] - shape.circle[2], shape.circle[2] * 2, shape.circle[2] * 2] : [0, 0, FIELD.w, FIELD.h]);
  g.fillStyle = color;
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w;
    const y = y0 + rnd() * h;
    if (pointIn(shape, x, y)) g.fillRect(x, y, 0.45, 0.45);
  }
}

// Static parts: turf, sand, ice, walls, blocks, tee. Cached per hole and size.
export function drawStatic(g, world) {
  const hole = world.hole;

  // Turf with mowing stripes
  outlinePath(g, hole);
  const turf = g.createLinearGradient(0, 0, FIELD.w, FIELD.h);
  turf.addColorStop(0, '#1fae68');
  turf.addColorStop(1, '#0c7a45');
  g.fillStyle = turf;
  g.fill();
  g.save();
  outlinePath(g, hole);
  g.clip();
  g.fillStyle = 'rgba(255, 255, 255, 0.045)';
  for (let i = -FIELD.h; i < FIELD.w + FIELD.h; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 8, 0);
    g.lineTo(i + 8 - FIELD.h * 0.6, FIELD.h);
    g.lineTo(i - FIELD.h * 0.6, FIELD.h);
    g.closePath();
    g.fill();
  }
  // Inner shade along the walls
  g.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  g.lineWidth = 7;
  outlinePath(g, hole);
  g.stroke();
  g.restore();

  // Sand
  world.sand.forEach((s, i) => {
    pathShape(g, s);
    const c = s.circle ?? [s.rect[0] + s.rect[2] / 2, s.rect[1] + s.rect[3] / 2, Math.max(s.rect[2], s.rect[3]) / 2];
    const grad = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], c[2] * 1.2);
    grad.addColorStop(0, '#f3dca4');
    grad.addColorStop(1, '#d9b46b');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(120, 80, 20, 0.35)';
    g.lineWidth = 0.8;
    g.stroke();
    speckle(g, s, 'rgba(120, 82, 30, 0.35)', 0.5, 1000 + i * 97);
  });

  // Ice
  world.ice.forEach((s) => {
    pathShape(g, s);
    g.fillStyle = 'rgba(190, 236, 255, 0.55)';
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    g.lineWidth = 0.6;
    g.stroke();
  });

  // Tee pad
  const [tx, ty] = hole.tee;
  g.beginPath();
  roundRect(g, tx - 6, ty - 3.2, 12, 6.4, 3.2);
  g.fillStyle = 'rgba(255, 255, 255, 0.14)';
  g.fill();

  // Blocks
  for (const b of hole.blocks ?? []) {
    pathShape(g, b);
    const grad = g.createLinearGradient(0, b.rect?.[1] ?? 0, 0, (b.rect?.[1] ?? 0) + (b.rect?.[3] ?? 20));
    grad.addColorStop(0, '#3a3358');
    grad.addColorStop(1, '#221e36');
    g.fillStyle = grad;
    g.fill();
  }

  // Walls
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = WALL_GLOW;
  g.shadowBlur = 6;
  g.strokeStyle = WALL;
  g.lineWidth = 2.6;
  outlinePath(g, hole);
  g.stroke();
  for (const [a, b] of hole.walls ?? []) {
    g.beginPath();
    g.moveTo(...a);
    g.lineTo(...b);
    g.stroke();
  }
  for (const b of hole.blocks ?? []) {
    pathShape(g, b);
    g.stroke();
  }
  g.restore();
}

// Everything that moves or animates.
export function drawDynamic(g, world, t, { balls, seats, activeSeat, aiming, aim, trails, fx, holeNumber }) {
  const hole = world.hole;

  // Water with ripples
  world.water.forEach((s) => {
    g.save();
    pathShape(g, s);
    const grad = g.createLinearGradient(0, 0, 0, FIELD.h);
    grad.addColorStop(0, '#2a86f0');
    grad.addColorStop(1, '#0d4fb3');
    g.fillStyle = grad;
    g.fill();
    g.clip();
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.lineWidth = 0.6;
    for (let y = 0; y < FIELD.h; y += 5) {
      g.beginPath();
      for (let x = 0; x <= FIELD.w; x += 2) {
        const yy = y + Math.sin(x * 0.25 + t * 2 + y) * 0.8;
        x ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
    }
    g.restore();
    pathShape(g, s);
    g.strokeStyle = 'rgba(160, 210, 255, 0.7)';
    g.lineWidth = 0.8;
    g.stroke();
  });

  // Slopes and boosts: chevrons flowing downhill
  for (const z of world.zones) {
    g.save();
    pathShape(g, z.shape);
    const boost = z.kind === 'boost';
    g.fillStyle = boost ? 'rgba(250, 204, 21, 0.14)' : 'rgba(255, 255, 255, 0.05)';
    g.fill();
    g.clip();
    const [ax, ay] = z.accel;
    const ang = Math.atan2(ay, ax);
    const [x0, y0, w, h] = z.shape.rect ?? [0, 0, FIELD.w, FIELD.h];
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    g.translate(cx, cy);
    g.rotate(ang);
    const span = Math.hypot(w, h);
    const gap = boost ? 7 : 10;
    const off = ((t * (boost ? 40 : 12)) % gap) - span / 2;
    g.strokeStyle = boost ? 'rgba(253, 224, 71, 0.85)' : 'rgba(255, 255, 255, 0.16)';
    g.lineWidth = boost ? 1.4 : 1.2;
    g.lineCap = 'round';
    for (let x = off; x < span / 2; x += gap) {
      for (let y = -span / 2; y < span / 2; y += 9) {
        g.beginPath();
        g.moveTo(x - 2, y - 2.6);
        g.lineTo(x, y);
        g.lineTo(x - 2, y + 2.6);
        g.stroke();
      }
    }
    g.restore();
  }

  // Portals
  for (const p of world.portals) {
    [[p.a, '#fb923c'], [p.b, '#38bdf8']].forEach(([[x, y], color], i) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, p.r * 1.4);
      grad.addColorStop(0, color);
      grad.addColorStop(0.55, `${color}55`);
      grad.addColorStop(1, `${color}00`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, p.r * 1.4, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(t * (i ? -2 : 2));
      g.strokeStyle = '#fff';
      g.lineWidth = 0.9;
      g.setLineDash([2.2, 1.6]);
      g.beginPath();
      g.arc(0, 0, p.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    });
  }

  // Cup and flag
  const cup = cupPos(world);
  g.beginPath();
  g.arc(cup.x, cup.y, cup.r + 0.7, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.fill();
  const hole3 = g.createRadialGradient(cup.x, cup.y - cup.r * 0.3, 0, cup.x, cup.y, cup.r);
  hole3.addColorStop(0, '#000');
  hole3.addColorStop(1, '#13201a');
  g.fillStyle = hole3;
  g.beginPath();
  g.arc(cup.x, cup.y, cup.r, 0, Math.PI * 2);
  g.fill();

  for (const f of fx) if (f.type === 'sink') ring(g, cup.x, cup.y, cup.r, t - f.t, '#fde68a');

  // Balls (with trails)
  balls.forEach((b, i) => {
    const color = seats[b.seat].color;
    const trail = trails[i];
    if (trail.length > 1) {
      g.lineCap = 'round';
      for (let k = 1; k < trail.length; k++) {
        g.strokeStyle = color;
        g.globalAlpha = (k / trail.length) * 0.35;
        g.lineWidth = BALL_R * 1.4 * (k / trail.length);
        g.beginPath();
        g.moveTo(...trail[k - 1]);
        g.lineTo(...trail[k]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (!b.active || b.sunk) return;
    drawBall(g, b.x, b.y, color, b.seat === activeSeat && aiming, t);
  });

  // Bumpers
  for (const bp of world.bumpers) {
    const hot = bp.hit >= 0 && world.t - bp.hit < 0.25;
    const r = bp.r * (hot ? 1.14 : 1);
    if (hot) {
      g.fillStyle = 'rgba(244, 114, 182, 0.35)';
      g.beginPath();
      g.arc(bp.x, bp.y, r * 1.7, 0, Math.PI * 2);
      g.fill();
    }
    const grad = g.createRadialGradient(bp.x - r * 0.35, bp.y - r * 0.35, 0, bp.x, bp.y, r);
    grad.addColorStop(0, hot ? '#fff' : '#f9a8d4');
    grad.addColorStop(1, '#be185d');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(bp.x, bp.y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 0.9;
    g.stroke();
  }

  // Windmill blades
  for (const sp of world.spinners) {
    const [x1, y1, x2, y2] = spinnerEnds(sp, world.t);
    g.save();
    g.lineCap = 'round';
    g.shadowColor = 'rgba(0, 0, 0, 0.45)';
    g.shadowBlur = 4;
    g.shadowOffsetY = 1.5;
    g.strokeStyle = '#f8fafc';
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.restore();
    g.fillStyle = '#a78bfa';
    g.beginPath();
    g.arc(sp.x, sp.y, 2.6, 0, Math.PI * 2);
    g.fill();
  }

  // Flag (drawn over the ball layer so it reads at a glance)
  const near = balls.some((b) => b.active && !b.sunk && Math.hypot(b.x - cup.x, b.y - cup.y) < 12);
  g.globalAlpha = near ? 0.45 : 1;
  g.strokeStyle = '#fff';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(cup.x, cup.y);
  g.lineTo(cup.x, cup.y - 15);
  g.stroke();
  const wave = Math.sin(t * 4) * 0.8;
  g.fillStyle = '#ec4899';
  g.beginPath();
  g.moveTo(cup.x, cup.y - 15);
  g.quadraticCurveTo(cup.x + 5, cup.y - 13.5 + wave, cup.x + 10, cup.y - 12.5);
  g.quadraticCurveTo(cup.x + 5, cup.y - 10.5 - wave, cup.x, cup.y - 9.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#fff';
  g.font = '700 4px -apple-system, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(holeNumber), cup.x + 4, cup.y - 12.4);
  g.globalAlpha = 1;

  // Effects
  for (const f of fx) {
    const age = t - f.t;
    if (f.type === 'splash') {
      ring(g, f.x, f.y, 2, age, '#bfdbfe');
      ring(g, f.x, f.y, 2, age - 0.15, '#bfdbfe');
    } else if (f.type === 'portal') ring(g, f.x, f.y, 3, age, '#fff');
  }

  if (aim) drawAim(g, aim, seats[activeSeat].color);
}

function ring(g, x, y, r0, age, color) {
  if (age < 0 || age > 0.7) return;
  const k = age / 0.7;
  g.strokeStyle = color;
  g.globalAlpha = 1 - k;
  g.lineWidth = 1.2 * (1 - k) + 0.2;
  g.beginPath();
  g.arc(x, y, r0 + k * 10, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

export function drawBall(g, x, y, color, glow, t) {
  if (glow) {
    const pulse = 1 + Math.sin(t * 5) * 0.12;
    const halo = g.createRadialGradient(x, y, BALL_R, x, y, BALL_R * 3.2 * pulse);
    halo.addColorStop(0, `${color}aa`);
    halo.addColorStop(1, `${color}00`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, BALL_R * 3.2 * pulse, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  g.beginPath();
  g.ellipse(x + 0.7, y + 1.1, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(x - 0.8, y - 0.9, 0.2, x, y, BALL_R);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#d9d6e6');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, BALL_R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 0.9;
  g.stroke();
}

function drawAim(g, aim, color) {
  const { ball, path, power, pull } = aim;
  // Rubber band from the ball toward the finger
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = `${color}99`;
  g.lineWidth = 1.4;
  g.setLineDash([1.2, 1.4]);
  g.beginPath();
  g.moveTo(ball.x, ball.y);
  g.lineTo(ball.x + pull[0], ball.y + pull[1]);
  g.stroke();
  g.restore();

  // Predicted path as fading dots
  path.forEach(([x, y], i) => {
    if (i === 0) return;
    const k = i / path.length;
    g.fillStyle = `rgba(255, 255, 255, ${0.95 - k * 0.75})`;
    g.beginPath();
    g.arc(x, y, 0.75 + (1 - k) * 0.35, 0, Math.PI * 2);
    g.fill();
  });

  // Power ring around the ball
  const hue = 120 - power * 120;
  g.strokeStyle = `hsl(${hue}, 90%, 60%)`;
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(ball.x, ball.y, BALL_R + 2.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
  g.stroke();
}
