// Real 3D chessboard (three.js): turned-wood pieces on a lacquered board with
// soft shadows and reflections. The board lies with white at +z; a square's
// centre is x = col − 3.5, z = row − 3.5 (row 0 is rank 8, far from white).
// Renders only when something changes, so it costs nothing while you think.
import * as THREE from '../../vendor/three.js';

const SQ = 1;
const FRAME = 9.6; // outer size of the frame
const HOLE = 8.06;
const HEIGHT = 0.42; // board thickness
const PIECE_SCALE = 1.22;
const at = (sq) => new THREE.Vector3((sq % 8) - 3.5, 0, Math.floor(sq / 8) - 3.5);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- Textures */

const canvas = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
};
// Seeded noise so the wood looks the same every time
const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function grain(g, x, y, w, h, base, dark, seed, vertical = true, rings = 26) {
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const len = vertical ? w : h;
  for (let i = 0; i < rings; i++) {
    const p = r() * len;
    const wob = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    g.strokeStyle = dark.replace('A', (0.05 + r() * 0.12).toFixed(3));
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let k = 0; k <= 40; k++) {
      const t = (k / 40) * (vertical ? h : w);
      const o = p + Math.sin(t * freq + i) * wob + Math.sin(t * freq * 3.1 + i * 2) * wob * 0.3;
      if (vertical) k ? g.lineTo(x + o, y + t) : g.moveTo(x + o, y + t);
      else k ? g.lineTo(x + t, y + o) : g.moveTo(x + t, y + o);
    }
    g.stroke();
  }
  // Pores
  g.fillStyle = dark.replace('A', '0.08');
  for (let i = 0; i < (w * h) / 90; i++) g.fillRect(x + r() * w, y + r() * h, vertical ? 0.7 : 2.4, vertical ? 2.4 : 0.7);
  g.restore();
}

function marble(g, x, y, w, h, base, vein, seed) {
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = vein.replace('A', (0.08 + r() * 0.2).toFixed(3));
    g.lineWidth = 0.5 + r() * 2;
    g.beginPath();
    let px = x + r() * w;
    let py = y;
    g.moveTo(px, py);
    while (py < y + h) {
      px += (r() - 0.5) * 18;
      py += 6 + r() * 10;
      g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

const THEMES = {
  wood: {
    sq: (g, x, y, s, light, seed) =>
      light ? grain(g, x, y, s, s, '#e4c393', 'rgba(140,90,40,A)', seed, seed % 2 === 0) : grain(g, x, y, s, s, '#8c5631', 'rgba(50,22,8,A)', seed, seed % 2 === 1),
    frame: (g, w, h) => grain(g, 0, 0, w, h, '#5a2f15', 'rgba(20,8,2,A)', 7, false, 70),
    label: 'rgba(240, 214, 170, 0.85)',
    table: ['#2a1a12', 'rgba(0,0,0,A)'],
  },
  marble: {
    sq: (g, x, y, s, light, seed) => (light ? marble(g, x, y, s, s, '#efece4', 'rgba(90,90,100,A)', seed) : marble(g, x, y, s, s, '#5f6f6a', 'rgba(230,240,235,A)', seed)),
    frame: (g, w, h) => marble(g, 0, 0, w, h, '#2b2f38', 'rgba(200,210,230,A)', 11),
    label: 'rgba(220, 228, 240, 0.8)',
    table: ['#14161c', 'rgba(255,255,255,A)'],
  },
  midnight: {
    sq: (g, x, y, s, light, seed) =>
      light ? grain(g, x, y, s, s, '#c9bff0', 'rgba(80,60,160,A)', seed, true, 12) : grain(g, x, y, s, s, '#5a4aa6', 'rgba(20,10,60,A)', seed, true, 12),
    frame: (g, w, h) => grain(g, 0, 0, w, h, '#1c1638', 'rgba(140,120,255,A)', 5, false, 40),
    label: 'rgba(200, 190, 255, 0.8)',
    table: ['#120f22', 'rgba(0,0,0,A)'],
  },
};

/* ------------------------------------------------------------- Pieces */

// Quadratic curve samples between two profile points
const curve = (a, c, b, n = 8) => Array.from({ length: n }, (_, i) => {
  const t = (i + 1) / n;
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
});
const arc = (cx, cy, r, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// Shared foot: a wide base with two beads
const foot = (r) => [[0, 0], [r, 0], [r + 0.015, 0.025], [r, 0.06], [r - 0.03, 0.075], [r - 0.02, 0.1], [r - 0.06, 0.12]];

const PROFILES = {
  p: () => [...foot(0.33), ...curve([0.27, 0.12], [0.15, 0.2], [0.12, 0.4]), [0.2, 0.42], [0.21, 0.45], [0.14, 0.475], [0.1, 0.49], ...arc(0, 0.61, 0.135, -Math.PI / 2 + 0.75, Math.PI / 2, 14)],
  r: () => [...foot(0.36), ...curve([0.3, 0.12], [0.24, 0.3], [0.23, 0.62]), [0.27, 0.66], [0.3, 0.7], [0.3, 0.84], [0.22, 0.84], [0.21, 0.8], [0, 0.8]],
  n: () => [...foot(0.36), ...curve([0.3, 0.12], [0.24, 0.17], [0.24, 0.22]), [0.28, 0.24], [0.27, 0.27], [0.2, 0.28], [0, 0.28]],
  b: () => [...foot(0.35), ...curve([0.29, 0.12], [0.16, 0.28], [0.12, 0.5]), [0.2, 0.52], [0.21, 0.55], [0.13, 0.575], [0.12, 0.6], ...curve([0.12, 0.6], [0.2, 0.72], [0.16, 0.86]), ...curve([0.16, 0.86], [0.1, 0.96], [0.03, 0.99]), ...arc(0, 1.03, 0.05, -Math.PI / 2, Math.PI / 2, 8)],
  q: () => [...foot(0.37), ...curve([0.31, 0.12], [0.16, 0.34], [0.12, 0.66]), [0.21, 0.69], [0.22, 0.72], [0.14, 0.75], ...curve([0.14, 0.75], [0.16, 0.9], [0.25, 1.06]), [0.22, 1.08], ...curve([0.22, 1.08], [0.14, 1.1], [0.08, 1.12]), ...arc(0, 1.17, 0.065, -Math.PI / 2, Math.PI / 2, 8)],
  k: () => [...foot(0.38), ...curve([0.32, 0.12], [0.17, 0.36], [0.13, 0.7]), [0.22, 0.73], [0.23, 0.76], [0.15, 0.79], ...curve([0.15, 0.79], [0.17, 0.95], [0.24, 1.07]), [0.2, 1.1], ...curve([0.2, 1.1], [0.14, 1.16], [0, 1.18])],
};

function horseShape() {
  const s = new THREE.Shape();
  const pts = [[-0.17, 0], [0.19, 0], [0.16, 0.12], [0.11, 0.22], [0.2, 0.3], [0.31, 0.36], [0.34, 0.42], [0.29, 0.475], [0.18, 0.47], [0.1, 0.51], [0.11, 0.6], [0.05, 0.67], [0.03, 0.76], [-0.03, 0.68], [-0.11, 0.65], [-0.19, 0.55], [-0.23, 0.4], [-0.22, 0.2]];
  s.moveTo(...pts[0]);
  s.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  s.lineTo(...pts[0]);
  return s;
}

function buildPieceGeometries() {
  const lathe = (pts) => {
    const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), 48);
    g.computeVertexNormals();
    return g;
  };
  const geo = {};
  for (const t of 'prnbqk') geo[t] = [lathe(PROFILES[t]())];
  // Rook: merlons around the top
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.BoxGeometry(0.1, 0.1, 0.09);
    m.rotateY(-a);
    m.translate(Math.cos(a) * 0.255, 0.885, Math.sin(a) * 0.255);
    geo.r.push(m);
  }
  // Knight: bevelled horse head on its foot, facing +x
  const head = new THREE.ExtrudeGeometry(horseShape(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 5, curveSegments: 12 });
  head.translate(0, 0, -0.1);
  head.scale(1.05, 1.05, 1);
  head.translate(0, 0.27, 0);
  geo.n.push(head);
  // Queen: coronet beads
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.SphereGeometry(0.034, 12, 8);
    b.translate(Math.cos(a) * 0.24, 1.085, Math.sin(a) * 0.24);
    geo.q.push(b);
  }
  // King: cross
  const v = new THREE.BoxGeometry(0.055, 0.2, 0.055);
  v.translate(0, 1.27, 0);
  const h = new THREE.BoxGeometry(0.17, 0.055, 0.055);
  h.translate(0, 1.29, 0);
  geo.k.push(v, h);
  return geo;
}

/* -------------------------------------------------------------- Board */

export class Board3D {
  constructor(container, { theme = 'wood', table = false } = {}) {
    this.container = container;
    this.table = table;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'ch-canvas';
    container.prepend(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
    this.target = new THREE.Vector3(0, 0.1, 0.55);
    this.orbit = { theta: 0, phi: table ? 1.56 : 0.7, dist: 22 };
    this.tweens = [];
    this.meshes = new Map(); // piece id -> { group, sq, t, c }
    this.raycaster = new THREE.Raycaster();
    this.anisotropy = r.capabilities.getMaxAnisotropy?.() ?? 4;

    this.buildLights();
    this.geo = buildPieceGeometries();
    this.mats = this.buildPieceMaterials();
    this.markGroup = new THREE.Group();
    this.scene.add(this.markGroup);
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
    this.setTheme(theme);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  buildLights() {
    const s = this.scene;
    // Image-based lighting from a little studio: soft boxes for glossy reflections
    const pm = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x1a1622, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, k, tint = 0xffffff) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      room.add(m);
    };
    panel(14, 6, 0, 13, 3, 3.2);
    panel(6, 10, -13, 6, 0, 1.4, 0xffe2c4);
    panel(6, 10, 13, 6, -2, 1.1, 0xc9d8ff);
    panel(10, 4, 0, 5, -14, 0.9);
    this.envRT = pm.fromScene(room, 0.035);
    s.environment = this.envRT.texture;
    s.environmentIntensity = 0.55;
    pm.dispose();

    const key = new THREE.DirectionalLight(0xfff1dc, 2.7);
    key.position.set(-6, 10, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xbfd2ff, 0.7);
    rim.position.set(6, 5, -7);
    s.add(rim);
    s.add(new THREE.HemisphereLight(0xfff4e6, 0x20160f, 0.22));
  }

  texture(c, repeat = 1) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    if (repeat !== 1) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  }

  buildPieceMaterials() {
    // Turned-wood streaks running along each piece
    const streaks = (base, dark, seed) => this.texture(canvas(256, 256, (g, w, h) => grain(g, 0, 0, w, h, base, dark, seed, true, 30)));
    return {
      w: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: streaks('#f4e2bf', 'rgba(150,100,45,A)', 3), roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, sheen: 0.3, sheenColor: new THREE.Color(0xfff2d8) }),
      b: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: streaks('#2b201d', 'rgba(0,0,0,A)', 9), roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
      felt: new THREE.MeshStandardMaterial({ color: 0x1d4d2e, roughness: 1 }),
    };
  }

  setTheme(name) {
    const th = THEMES[name] ?? THEMES.wood;
    this.themeName = name;
    if (this.boardGroup) {
      this.scene.remove(this.boardGroup);
      this.boardGroup.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat().filter(Boolean)) {
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    const g = new THREE.Group();
    this.boardGroup = g;

    // Playing surface
    const sqTex = this.texture(canvas(1024, 1024, (ctx) => {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) th.sq(ctx, c * 128, r * 128, 128, (r + c) % 2 === 0, r * 8 + c + 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 128, 0);
        ctx.lineTo(i * 128, 1024);
        ctx.moveTo(0, i * 128);
        ctx.lineTo(1024, i * 128);
        ctx.stroke();
      }
    }));
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshPhysicalMaterial({ map: sqTex, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28 }));
    surface.rotation.x = -Math.PI / 2;
    surface.receiveShadow = true;
    surface.name = 'surface';
    g.add(surface);
    this.surface = surface;

    // Frame: a bevelled ring with the coordinates inlaid
    const half = FRAME / 2;
    const shape = new THREE.Shape();
    const R = 0.35;
    shape.moveTo(-half + R, -half);
    shape.lineTo(half - R, -half);
    shape.quadraticCurveTo(half, -half, half, -half + R);
    shape.lineTo(half, half - R);
    shape.quadraticCurveTo(half, half, half - R, half);
    shape.lineTo(-half + R, half);
    shape.quadraticCurveTo(-half, half, -half, half - R);
    shape.lineTo(-half, -half + R);
    shape.quadraticCurveTo(-half, -half, -half + R, -half);
    const hole = new THREE.Path();
    const hh = HOLE / 2;
    hole.moveTo(-hh, -hh);
    hole.lineTo(-hh, hh);
    hole.lineTo(hh, hh);
    hole.lineTo(hh, -hh);
    hole.lineTo(-hh, -hh);
    shape.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: HEIGHT, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8 });
    frameGeo.rotateX(-Math.PI / 2);
    frameGeo.translate(0, -HEIGHT + 0.03, 0);
    const frameTex = this.texture(canvas(1024, 1024, (ctx, w) => {
      th.frame(ctx, w, w);
      // Coordinates: the canvas covers [-half, half]; top of canvas = far side (black)
      const px = (v) => ((v + half) / FRAME) * w;
      ctx.fillStyle = th.label;
      ctx.font = `700 ${Math.round(w * 0.028)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const edge = px(-(half + hh) / 2);
      const far = px((half + hh) / 2);
      for (let i = 0; i < 8; i++) {
        const p = px(i - 3.5);
        const file = 'abcdefgh'[i];
        const rank = String(8 - i);
        ctx.fillText(file, p, far); // near white (canvas bottom)
        ctx.fillText(rank, edge, p);
        ctx.save();
        ctx.translate(p, edge);
        ctx.rotate(Math.PI);
        ctx.fillText(file, 0, 0); // facing black
        ctx.restore();
        ctx.save();
        ctx.translate(far, p);
        ctx.rotate(Math.PI);
        ctx.fillText(rank, 0, 0);
        ctx.restore();
      }
    }));
    frameTex.wrapS = frameTex.wrapT = THREE.RepeatWrapping;
    frameTex.repeat.set(1 / FRAME, 1 / FRAME);
    frameTex.offset.set(0.5, 0.5);
    // Top gets the inlaid coordinates; the sides get plain grain
    const sideTex = this.texture(canvas(512, 128, (ctx, w, h) => th.frame(ctx, w, h)), 1);
    sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
    sideTex.repeat.set(0.2, 2);
    const frame = new THREE.Mesh(frameGeo, [
      new THREE.MeshPhysicalMaterial({ map: frameTex, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      new THREE.MeshPhysicalMaterial({ map: sideTex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    ]);
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);
    // Body under the playing surface
    const body = new THREE.Mesh(new THREE.BoxGeometry(HOLE, HEIGHT - 0.02, HOLE), new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 0.9 }));
    body.position.y = -HEIGHT / 2 - 0.005;
    g.add(body);

    // Table
    const [tc, tdark] = th.table;
    const tableTex = this.texture(canvas(1024, 1024, (ctx, w, h) => {
      grain(ctx, 0, 0, w, h, tc, tdark, 21, false, 60);
      const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.36);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(0.5, 'rgba(0,0,0,0.7)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }));
    const table = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.75, transparent: true, depthWrite: false }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -HEIGHT - 0.03;
    table.receiveShadow = true;
    g.add(table);

    this.scene.add(g);
    this.dirty = true;
    this.kick();
  }

  /* ----------------------------------------------------------- Camera */

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the frame's width (plus a little air) in view
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const needW = FRAME * 0.5 + 0.35;
    const needH = FRAME * 0.5 * (this.table ? 1 : 0.62) + 0.8;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    this.orbit.dist = Math.max(needW / Math.tan(hfov / 2), needH / Math.tan(vfov / 2)) + (this.table ? 0 : 2.4);
    this.camera.updateProjectionMatrix();
    this.placeCamera();
    this.dirty = true;
    this.kick();
  }

  placeCamera(shake = 0) {
    const { theta, phi, dist } = this.orbit;
    const c = this.camera;
    c.position.set(Math.sin(theta) * Math.cos(phi) * dist, Math.sin(phi) * dist, Math.cos(theta) * Math.cos(phi) * dist);
    const t = this.target.clone();
    t.z = this.target.z * Math.cos(theta);
    t.x = this.target.z * Math.sin(theta);
    c.position.add(t);
    if (shake) c.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    c.up.set(-Math.sin(theta) * 0.0001, 1, -Math.cos(theta) * 0.0001);
    c.lookAt(t);
  }

  // Orbit round to the given side: white at +z, black at −z.
  setViewer(color, animate = true) {
    const goal = color === 'b' ? Math.PI : 0;
    if (Math.abs(this.orbit.theta - goal) < 1e-3 && !this.orbitTween) return;
    if (!animate) {
      this.orbit.theta = goal;
      this.placeCamera();
      this.dirty = true;
      this.kick();
      return;
    }
    const from = this.orbit.theta;
    this.tween(1100, (k) => {
      this.orbit.theta = from + (goal - from) * ease(k);
      this.placeCamera();
    });
  }

  /* ----------------------------------------------------------- Pieces */

  makePiece(t, c, sq = 0) {
    const group = new THREE.Group();
    for (const g of this.geo[t]) {
      const m = new THREE.Mesh(g, this.mats[c]);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    group.scale.setScalar(PIECE_SCALE);
    // Knights show their profile, looking in toward the middle and a little toward the enemy
    if (t === 'n') group.rotation.y = (sq % 8 < 4 ? 0 : Math.PI) + (c === 'w' ? 1 : -1) * (sq % 8 < 4 ? 0.35 : -0.35); // knights face the enemy, turned to show their profile
    if (t === 'b') group.rotation.y = c === 'w' ? 0.6 : 0.6 + Math.PI;
    return group;
  }

  // Bring the piece meshes in line with a board. Moved pieces glide (knights hop),
  // captured ones sink away, new ones appear.
  sync(board, { animate = true, hidden = null } = {}) {
    const seen = new Set();
    board.forEach((p, sq) => {
      if (!p) return;
      seen.add(p.id);
      let e = this.meshes.get(p.id);
      if (e && (e.t !== p.t || e.c !== p.c)) {
        // Promotion: swap the model once it lands
        const old = e.group;
        const fresh = this.makePiece(p.t, p.c, sq);
        fresh.position.copy(old.position);
        this.pieceGroup.add(fresh);
        this.pieceGroup.remove(old);
        e.group = fresh;
        e.t = p.t;
        e.c = p.c;
      }
      if (!e) {
        e = { group: this.makePiece(p.t, p.c, sq), sq, t: p.t, c: p.c };
        e.group.position.copy(at(sq));
        this.pieceGroup.add(e.group);
        this.meshes.set(p.id, e);
        if (animate) {
          e.group.scale.setScalar(0.01);
          this.tween(300, (k) => e.group.scale.setScalar(Math.max(0.01, easeOut(k) * PIECE_SCALE)));
        }
      } else if (e.sq !== sq) {
        const from = e.group.position.clone();
        const to = at(sq);
        e.sq = sq;
        if (animate) {
          const d = from.distanceTo(to);
          const hop = p.t === 'n' ? 0.9 : 0.12 + d * 0.03;
          const g = e.group;
          this.tween(300 + d * 40, (k) => {
            const q = ease(k);
            g.position.lerpVectors(from, to, q);
            g.position.y = Math.sin(Math.PI * q) * hop;
          });
        } else e.group.position.copy(to);
      }
      e.group.userData.sq = sq;
      e.group.visible = !hidden?.has(sq);
    });
    for (const [id, e] of this.meshes) {
      if (seen.has(id)) continue;
      this.meshes.delete(id);
      const g = e.group;
      if (!animate) {
        this.pieceGroup.remove(g);
        continue;
      }
      g.userData.sq = -1;
      const y0 = g.position.y;
      this.tween(380, (k) => {
        g.scale.setScalar(Math.max(0.001, (1 - easeOut(k)) * PIECE_SCALE));
        g.position.y = y0 - k * 0.3;
        if (k >= 1) this.pieceGroup.remove(g);
      });
    }
    this.dirty = true;
    this.kick();
  }

  lift(sq, amount) {
    for (const e of this.meshes.values()) {
      if (e.dragging) continue;
      const want = e.sq === sq ? amount : 0;
      if (Math.abs(e.group.position.y - want) > 1e-3 && !this.tweens.some((t) => t.obj === e.group)) {
        const g = e.group;
        const y0 = g.position.y;
        this.tween(160, (k) => (g.position.y = y0 + (want - y0) * easeOut(k)), g);
      }
    }
  }

  /* ------------------------------------------------------------ Marks */

  markTex(kind) {
    this.markTextures ??= {};
    if (this.markTextures[kind]) return this.markTextures[kind];
    const c = canvas(128, 128, (g, w) => {
      if (kind === 'check') {
        const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        r.addColorStop(0, 'rgba(255,40,70,0.95)');
        r.addColorStop(0.5, 'rgba(255,40,70,0.5)');
        r.addColorStop(1, 'rgba(255,40,70,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, w, w);
      } else if (kind === 'hill') {
        g.strokeStyle = 'rgba(255,205,60,0.95)';
        g.shadowColor = 'rgba(255,205,60,1)';
        g.shadowBlur = 18;
        g.lineWidth = 8;
        g.strokeRect(10, 10, 108, 108);
      } else if (kind === 'fog') {
        const r = rand(5);
        g.fillStyle = 'rgba(14,12,22,0.94)';
        g.fillRect(0, 0, w, w);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(255,255,255,${0.015 + r() * 0.03})`;
          g.beginPath();
          g.arc(r() * w, r() * w, 10 + r() * 30, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
    const t = this.texture(c);
    this.markTextures[kind] = t;
    return t;
  }

  setMarks({ last = null, selected = -1, targets = [], check = -1, hill = [], fog = null, hover = -1 } = {}) {
    const grp = this.markGroup;
    for (const m of [...grp.children]) {
      grp.remove(m);
      m.material.dispose();
    }
    this.markGeo ??= {
      sq: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      dot: new THREE.CircleGeometry(0.15, 28).rotateX(-Math.PI / 2),
      ring: new THREE.RingGeometry(0.4, 0.47, 40).rotateX(-Math.PI / 2),
    };
    const add = (geo, sq, mat, y = 0.004) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(at(sq));
      m.position.y = y;
      m.renderOrder = 2;
      grp.add(m);
    };
    const flat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });
    if (fog) for (let sq = 0; sq < 64; sq++) if (!fog.has(sq)) add(this.markGeo.sq, sq, flat(0xffffff, 1, { map: this.markTex('fog') }), 0.006);
    for (const sq of hill) add(this.markGeo.sq, sq, flat(0xffffff, 1, { map: this.markTex('hill') }));
    if (last) {
      add(this.markGeo.sq, last.from, flat(0xffc94d, 0.32));
      add(this.markGeo.sq, last.to, flat(0xffc94d, 0.42));
    }
    if (check >= 0) add(this.markGeo.sq, check, flat(0xffffff, 1, { map: this.markTex('check') }), 0.005);
    if (selected >= 0) add(this.markGeo.sq, selected, flat(0xffd24d, 0.55));
    if (hover >= 0) add(this.markGeo.sq, hover, flat(0xffffff, 0.22));
    for (const t of targets) add(t.capture ? this.markGeo.ring : this.markGeo.dot, t.sq, flat(0x140c06, t.capture ? 0.5 : 0.38), 0.008);
    this.lift(selected, selected >= 0 ? 0.12 : 0);
    this.dirty = true;
    this.kick();
  }

  /* ---------------------------------------------------------- Picking */

  ray(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  squareAtHeight(x, y, h = 0) {
    const hit = new THREE.Vector3();
    if (!this.ray(x, y).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), hit)) return { sq: -1, point: null };
    const c = Math.floor(hit.x + 4);
    const r = Math.floor(hit.z + 4);
    return { sq: c >= 0 && c < 8 && r >= 0 && r < 8 ? r * 8 + c : -1, point: hit };
  }

  // A piece under the finger wins (unless squaresOnly), otherwise the square.
  pick(x, y, squaresOnly = false) {
    if (!squaresOnly) {
      const hits = this.ray(x, y).intersectObjects(this.pieceGroup.children, true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.parent !== this.pieceGroup) o = o.parent;
        if (o?.visible && o.userData.sq >= 0) return o.userData.sq;
      }
    }
    return this.squareAtHeight(x, y, 0).sq;
  }

  // Drag: the piece floats over the board point under the finger. Returns that square.
  drag(sq, x, y) {
    const e = [...this.meshes.values()].find((m) => m.sq === sq);
    if (!e) return -1;
    // Aim by the board point under the finger; the piece floats just above it
    const { sq: over, point } = this.squareAtHeight(x, y, 0);
    if (!point) return -1;
    e.dragging = true;
    this.tweens = this.tweens.filter((t) => t.obj !== e.group);
    e.group.position.set(THREE.MathUtils.clamp(point.x, -4.6, 4.6), 0.55, THREE.MathUtils.clamp(point.z, -4.6, 4.6));
    this.dirty = true;
    this.kick();
    return over;
  }

  // Put a dragged piece back on its square (the move itself comes through sync()).
  endDrag(sq, animate = true) {
    for (const e of this.meshes.values()) {
      if (!e.dragging) continue;
      e.dragging = false;
      if (e.sq !== sq) continue;
      const from = e.group.position.clone();
      const to = at(sq);
      if (!animate) e.group.position.copy(to);
      else this.tween(220, (k) => e.group.position.lerpVectors(from, to, easeOut(k)), e.group);
    }
  }

  // A dragged piece that made a legal move: drop it from where it hovers.
  dropFromHover(sq) {
    for (const e of this.meshes.values()) {
      if (!e.dragging) continue;
      e.dragging = false;
      const from = e.group.position.clone();
      const to = at(sq);
      e.sq = sq;
      e.group.userData.sq = sq;
      this.tween(200, (k) => e.group.position.lerpVectors(from, to, easeOut(k)), e.group);
    }
  }

  /* ---------------------------------------------------------- Effects */

  burst(sq) {
    const tex = this.burstTex ?? (this.burstTex = this.texture(canvas(128, 128, (g, w) => {
      const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(255,220,120,0.95)');
      r.addColorStop(0.55, 'rgba(255,110,30,0.6)');
      r.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    })));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(at(sq));
    m.position.y = 0.6;
    this.scene.add(m);
    this.tween(700, (k) => {
      m.quaternion.copy(this.camera.quaternion);
      m.scale.setScalar(0.4 + easeOut(k) * 4);
      m.material.opacity = 1 - k;
      this.placeCamera(k < 0.5 ? (0.5 - k) * 0.5 : 0);
      if (k >= 1) {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this.placeCamera();
      }
    });
  }

  /* ------------------------------------------------------------- Loop */

  tween(ms, fn, obj = null) {
    this.tweens.push({ t0: performance.now(), ms, fn, obj });
    this.kick();
  }

  kick() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    const now = performance.now();
    const live = [];
    for (const t of this.tweens) {
      const k = Math.min(1, (now - t.t0) / t.ms);
      t.fn(k);
      if (k < 1) live.push(t);
    }
    this.tweens = live;
    if (this.dirty || live.length || this.tweensRan) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    this.tweensRan = live.length > 0;
    if (live.length) this.kick();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat().filter(Boolean)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    this.envRT?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
