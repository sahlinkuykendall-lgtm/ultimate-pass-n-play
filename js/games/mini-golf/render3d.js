// 3D course renderer (three.js). Physics stays on the ground plane: engine (x, y)
// maps to three (x, height, z = y). The caller owns the game loop and calls
// update() + render() every frame.
import * as THREE from '../../vendor/three.js';
import { heightAt, cupPos, spinnerEnds, pointIn, BALL_R } from './engine.js';

const RAIL_W = 2.2;
const RAIL_H = 2.2;
const CELL = 1.5;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const damp = (k, dt) => 1 - Math.exp(-k * dt);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Course3D {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x3b1f5f, 180, 620);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);

    scene.add(new THREE.HemisphereLight(0xd8ccff, 0x2a1d4a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 260;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.buildSky();

    this.hole = new THREE.Group();
    scene.add(this.hole);
    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);

    this.camPos = new THREE.Vector3(0, 80, 80);
    this.camTarget = new THREE.Vector3();
    this.wantPos = this.camPos.clone();
    this.wantTarget = this.camTarget.clone();
    this.heading = new THREE.Vector2(0, -1);
    this.mode = 'overview';
    this.fx = [];
    this.time = 0;
  }

  /* --------------------------------------------------------------- Scene */

  buildSky() {
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x0b0820) },
        mid: { value: new THREE.Color(0x2a1650) },
        horizon: { value: new THREE.Color(0x3b1f5f) },
        glow: { value: new THREE.Color(0xc0507e) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // Dusk: deep violet overhead, a soft pink glow just above a horizon that matches the fog
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.1, 0.7, h));
          c = mix(glow, c, smoothstep(0.02, 0.32, h)); c = mix(horizon, c, smoothstep(-0.05, 0.06, h)); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);

    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = 0.15 + Math.random() * 0.85;
      const rr = 1400;
      pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * rr;
      pos[i * 3 + 1] = v * rr;
      pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * rr;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    this.scene.add(this.stars);
  }

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(Math.min(dpr || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clearGroup(g) {
    g.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    });
    g.clear();
  }

  setHole(world, holeNumber, seats) {
    this.clearGroup(this.hole);
    this.clearGroup(this.dynamic);
    this.fx = [];
    this.world = world;
    this.seats = seats;
    const h = (x, y) => heightAt(world, x, y);
    this.h = h;

    this.buildTurf(world);
    for (const o of world.outlines) this.buildRail(o, true, true);
    for (const [a, b] of world.hole.walls ?? []) this.buildRail([a, b], false, false);
    for (const b of world.hole.blocks ?? []) this.buildBlock(b);
    this.buildWater(world);
    this.buildBumpers(world);
    this.buildSpinners(world);
    this.buildPortals(world);
    this.buildBoosts(world);
    this.buildCup(world, holeNumber);
    this.buildTee(world);
    this.buildBalls(seats);
    this.buildAim();

    // Ground far below the floating course
    const B = world.bounds;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x1c1033, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(B.x + B.w / 2, this.minH - 40, B.y + B.h / 2);
    this.hole.add(ground);

    this.overview(true);
  }

  buildTurf(w) {
    const B = w.bounds;
    const nx = Math.ceil(B.w / CELL) + 1;
    const nz = Math.ceil(B.h / CELL) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const inside = (x, y) => w.outlines.some((o) => pointIn({ poly: o }, x, y));
    const green = new THREE.Color(0x22b469);
    const green2 = new THREE.Color(0x1a9d5a);
    const sand = new THREE.Color(0xe9cf94);
    const ice = new THREE.Color(0xbfe9ff);
    const wet = new THREE.Color(0x0e3a5c);
    const c = new THREE.Color();
    let minH = Infinity;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = B.x + i * CELL;
        const y = B.y + j * CELL;
        let hh = heightAt(w, x, y);
        const stripe = Math.floor((x * 0.6 + y) / 10) % 2 === 0;
        c.copy(stripe ? green : green2);
        if (w.sand.some((s) => pointIn(s, x, y))) {
          c.copy(sand).offsetHSL(0, 0, (Math.random() - 0.5) * 0.04);
          hh -= 0.5;
        } else if (w.water.some((s) => pointIn(s, x, y))) {
          c.copy(wet);
          hh -= 1.6;
        } else if (w.ice.some((s) => pointIn(s, x, y))) c.copy(ice);
        const k = (j * nx + i) * 3;
        pos[k] = x;
        pos[k + 1] = hh;
        pos[k + 2] = y;
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
        minH = Math.min(minH, hh);
      }
    }
    this.minH = minH;
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const cx = B.x + (i + 0.5) * CELL;
        const cy = B.y + (j + 0.5) * CELL;
        if (!inside(cx, cy)) continue;
        const a = j * nx + i;
        idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    mesh.receiveShadow = true;
    this.hole.add(mesh);
  }

  // A rail that follows a polyline over the terrain. Closed outlines also get a rocky skirt below.
  buildRail(points, closed, skirt) {
    const n = points.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % n];
      area += x1 * y2 - x2 * y1;
    }
    const inward = area > 0 ? 1 : -1;
    const rail = [];
    const sk = [];
    const count = closed ? n + 1 : n;
    const at = (i) => points[((i % n) + n) % n];
    const verts = [];
    for (let i = 0; i < count; i++) {
      const p = at(i);
      const a = closed ? at(i - 1) : points[Math.max(0, i - 1)];
      const b = closed ? at(i + 1) : points[Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const len = Math.hypot(tx, ty) || 1;
      const nx = (-ty / len) * inward;
      const ny = (tx / len) * inward;
      const base = this.h(p[0], p[1]);
      verts.push({
        ix: p[0] + nx * (RAIL_W / 2),
        iy: p[1] + ny * (RAIL_W / 2),
        ox: p[0] - nx * (RAIL_W / 2),
        oy: p[1] - ny * (RAIL_W / 2),
        lo: base - 0.6,
        hi: base + RAIL_H - 0.6,
      });
    }
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...c, ...b, ...d);
    for (let i = 0; i < verts.length - 1; i++) {
      const p = verts[i];
      const q = verts[i + 1];
      // top
      quad(rail, [p.ox, p.hi, p.oy], [p.ix, p.hi, p.iy], [q.ox, q.hi, q.oy], [q.ix, q.hi, q.iy]);
      // inner face
      quad(rail, [p.ix, p.hi, p.iy], [p.ix, p.lo, p.iy], [q.ix, q.hi, q.iy], [q.ix, q.lo, q.iy]);
      // outer face
      quad(rail, [p.ox, p.lo, p.oy], [p.ox, p.hi, p.oy], [q.ox, q.lo, q.oy], [q.ox, q.hi, q.oy]);
      if (skirt) quad(sk, [p.ox, p.lo - 14, p.oy], [p.ox, p.lo, p.oy], [q.ox, q.lo - 14, q.oy], [q.ox, q.lo, q.oy]);
    }
    if (!closed) {
      for (const p of [verts[0], verts[verts.length - 1]]) quad(rail, [p.ox, p.hi, p.oy], [p.ix, p.hi, p.iy], [p.ox, p.lo, p.oy], [p.ix, p.lo, p.iy]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf1ecff, roughness: 0.35, metalness: 0.05, emissive: 0x6d4fd8, emissiveIntensity: 0.18, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.hole.add(mesh);
    if (skirt) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
      sg.computeVertexNormals();
      this.hole.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x2b2148, roughness: 0.95, side: THREE.DoubleSide })));
    }
  }

  buildBlock(b) {
    const [x, y, w, d] = b.rect;
    const base = this.h(x + w / 2, y + d / 2);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), new THREE.MeshStandardMaterial({ color: 0x3a3358, roughness: 0.6 }));
    mesh.position.set(x + w / 2, base + 1.4, y + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.hole.add(mesh);
  }

  buildWater(w) {
    this.waterTex = canvasTexture(256, 256, (g, W, H) => {
      g.fillStyle = '#1e74e0';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 3;
      for (let y = 0; y < H; y += 32) {
        g.beginPath();
        for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin((x / W) * Math.PI * 4) * 6);
        g.stroke();
      }
    });
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTexes = [];
    for (const s of w.water) {
      let geo;
      let cx;
      let cy;
      if (s.circle) {
        [cx, cy] = s.circle;
        geo = new THREE.CircleGeometry(s.circle[2], 40);
      } else if (s.rect) {
        cx = s.rect[0] + s.rect[2] / 2;
        cy = s.rect[1] + s.rect[3] / 2;
        geo = new THREE.PlaneGeometry(s.rect[2], s.rect[3]);
      } else continue;
      const tex = this.waterTex.clone();
      tex.repeat.set(0.06 * (geo.parameters.radius ?? geo.parameters.width ?? 20), 0.06 * (geo.parameters.radius ?? geo.parameters.height ?? 20));
      tex.needsUpdate = true;
      this.waterTexes.push(tex);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.92, roughness: 0.12, metalness: 0.2, emissive: 0x0b3d91, emissiveIntensity: 0.35 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, this.h(cx, cy) - 0.7, cy);
      mesh.receiveShadow = true;
      this.hole.add(mesh);
    }
  }

  buildBumpers(w) {
    this.bumperMeshes = w.bumpers.map((b) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r, b.r * 1.05, 3.2, 36),
        new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.28, metalness: 0.25, emissive: 0xbe185d, emissiveIntensity: 0.25 }),
      );
      body.position.y = 1.6;
      body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.82, 0.38, 10, 36), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.y = 3.25;
      g.add(body, cap);
      g.position.set(b.x, this.h(b.x, b.y) - 0.2, b.y);
      this.hole.add(g);
      return { group: g, body, data: b };
    });
  }

  buildSpinners(w) {
    this.spinnerMeshes = w.spinners.map((sp) => {
      const base = this.h(sp.x, sp.y);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 9, 20), new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4 }));
      post.position.set(sp.x, base + 4.5, sp.y);
      post.castShadow = true;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(sp.len, 2.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, emissive: 0x8b5cf6, emissiveIntensity: 0.12 }));
      blade.position.set(sp.x, base + 1.2, sp.y);
      blade.castShadow = true;
      // Decorative sails on top of the post
      const sails = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const sail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 2.4), new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.5 }));
        sail.position.y = 3.6;
        const arm = new THREE.Group();
        arm.rotation.x = (k * Math.PI) / 2;
        arm.add(sail);
        sails.add(arm);
      }
      sails.position.set(sp.x, base + 9.4, sp.y);
      this.hole.add(post, blade, sails);
      return { blade, sails, data: sp };
    });
  }

  buildPortals(w) {
    const swirl = canvasTexture(128, 128, (g, W) => {
      const grad = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, W);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(W / 2, W / 2, 18 + k * 14, k, k + 2.2);
        g.stroke();
      }
    });
    this.portalMeshes = [];
    for (const p of w.portals) {
      [[p.a, 0xfb923c], [p.b, 0x38bdf8]].forEach(([[x, y], color]) => {
        const base = this.h(x, y);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.55, 12, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, base + 0.4, y);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 32), new THREE.MeshBasicMaterial({ map: swirl, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(x, base + 0.15, y);
        this.hole.add(ring, disc);
        this.portalMeshes.push(disc);
      });
    }
  }

  buildBoosts(w) {
    this.boostTex = canvasTexture(64, 64, (g, W) => {
      g.fillStyle = 'rgba(250,204,21,0.18)';
      g.fillRect(0, 0, W, W);
      g.strokeStyle = '#fde047';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(14, 40);
      g.lineTo(32, 20);
      g.lineTo(50, 40);
      g.stroke();
    });
    this.boostTex.wrapS = this.boostTex.wrapT = THREE.RepeatWrapping;
    this.boostMeshes = [];
    for (const z of w.zones.filter((zz) => zz.kind === 'boost' && zz.shape.rect)) {
      const [x, y, sw, sd] = z.shape.rect;
      const tex = this.boostTex.clone();
      tex.repeat.set(sw / 7, sd / 7);
      tex.needsUpdate = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      // Point the chevrons along the boost direction
      mesh.rotation.z = Math.atan2(z.accel[0], z.accel[1]) + Math.PI;
      mesh.position.set(x + sw / 2, this.h(x + sw / 2, y + sd / 2) + 0.12, y + sd / 2);
      this.hole.add(mesh);
      this.boostMeshes.push(tex);
    }
  }

  buildCup(w, holeNumber) {
    const g = new THREE.Group();
    const c = cupPos(w);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(c.r, 40), new THREE.MeshBasicMaterial({ color: 0x050807 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.06;
    const rim = new THREE.Mesh(new THREE.RingGeometry(c.r, c.r + 0.55, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.07;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 17, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    pole.position.y = 8.5;
    pole.castShadow = true;
    const tex = canvasTexture(128, 96, (cg, W, H) => {
      cg.fillStyle = '#ec4899';
      cg.fillRect(0, 0, W, H);
      cg.fillStyle = '#fff';
      cg.font = '800 60px -apple-system, system-ui, sans-serif';
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillText(String(holeNumber), W / 2, H / 2 + 4);
    });
    const flagGeo = new THREE.PlaneGeometry(8, 5.5, 10, 1);
    flagGeo.translate(4, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.y = 14;
    flag.castShadow = true;
    g.add(hole, rim, pole, flag);
    g.position.set(c.x, this.h(c.x, c.y), c.y);
    this.hole.add(g);
    this.cup = { group: g, flag, base: flagGeo.attributes.position.array.slice() };
  }

  buildTee(w) {
    const [x, y] = w.tee;
    // Sit above the highest turf under the mat so slopes never poke through
    let top = -Infinity;
    for (const dx of [-6, 0, 6]) for (const dy of [-3.5, 0, 3.5]) top = Math.max(top, this.h(x + dx, y + dy));
    const mat = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 6.5), new THREE.MeshStandardMaterial({ color: 0x157a47, roughness: 1 }));
    mat.position.set(x, top + 0.12, y);
    mat.receiveShadow = true;
    this.hole.add(mat);
  }

  buildBalls(seats) {
    const geo = new THREE.SphereGeometry(BALL_R, 32, 18);
    this.ballMeshes = seats.map((p) => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.02 }));
      ball.castShadow = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 0.98, 0.32, 8, 32), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.4 }));
      ball.add(band);
      g.add(ball);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R * 1.6, BALL_R * 2.6, 40),
        new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      halo.rotation.x = -Math.PI / 2;
      this.dynamic.add(g, halo);
      return { group: g, ball, halo, sink: 0, last: null };
    });
  }

  buildAim() {
    const dotGeo = new THREE.SphereGeometry(0.55, 10, 8);
    this.aimDots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), 40);
    this.aimDots.count = 0;
    this.aimDots.frustumCulled = false;
    this.dynamic.add(this.aimDots);
    this.powerRing = new THREE.Mesh(new THREE.RingGeometry(BALL_R + 2, BALL_R + 3.1, 48, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, depthWrite: false }));
    this.powerRing.rotation.x = -Math.PI / 2;
    this.powerRing.visible = false;
    this.dynamic.add(this.powerRing);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.pullLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: 1, transparent: true, opacity: 0.7 }));
    this.pullLine.visible = false;
    this.dynamic.add(this.pullLine);
  }

  /* ------------------------------------------------------------- Camera */

  // Direction the hole wants you to play from (x, y): along the fairway, or at the cup when close.
  headingFrom(x, y) {
    const w = this.world;
    const c = cupPos(w);
    if (Math.hypot(c.x - x, c.y - y) < 70) return new THREE.Vector2(c.x - x, c.y - y).normalize();
    let best = { d: Infinity };
    for (const path of w.paths) {
      path.forEach((q, k) => {
        const d = (q.x - x) ** 2 + (q.y - y) ** 2;
        if (d < best.d) best = { d, path, k };
      });
    }
    if (!best.path) return new THREE.Vector2(c.x - x, c.y - y).normalize();
    const { path, k } = best;
    const s0 = path[k].s;
    let j = k;
    while (j < path.length - 1 && path[j].s - s0 < 45) j++;
    const v = new THREE.Vector2(path[j].x - x, path[j].y - y);
    return v.lengthSq() > 1 ? v.normalize() : new THREE.Vector2(c.x - x, c.y - y).normalize();
  }

  focusBall(ball) {
    this.heading = this.headingFrom(ball.x, ball.y);
    this.mode = 'aim';
    this.focus = ball;
  }

  follow(ball) {
    this.mode = 'follow';
    this.focus = ball;
  }

  overview(snap = false) {
    const w = this.world;
    const B = w.bounds;
    const cx = B.x + B.w / 2;
    const cy = B.y + B.h / 2;
    const size = Math.max(B.w, B.h);
    const d = new THREE.Vector2(w.cup.x - w.tee[0], w.cup.y - w.tee[1]).normalize();
    const fov = (this.camera.fov * Math.PI) / 180;
    const fit = (size * 0.62) / Math.tan(fov / 2) / Math.min(1, this.camera.aspect * 1.6);
    this.wantTarget.set(cx, this.h(cx, cy), cy);
    this.wantPos.set(cx - d.x * fit * 0.32, this.h(cx, cy) + fit * 0.95, cy - d.y * fit * 0.32);
    this.mode = 'overview';
    if (snap) {
      this.camPos.copy(this.wantPos);
      this.camTarget.copy(this.wantTarget);
    }
  }

  get isOverview() {
    return this.mode === 'overview';
  }

  // Screen drag (pixels, +y down) → shot direction on the ground, relative to the camera.
  dragToShot(dx, dy, mirror) {
    const f = new THREE.Vector3().subVectors(this.camTarget, this.camPos);
    const fx = f.x;
    const fz = f.z;
    const fl = Math.hypot(fx, fz) || 1;
    const fwd = [fx / fl, fz / fl];
    const right = [-fwd[1], fwd[0]];
    // dragging toward the bottom of the screen pulls back; the ball goes the other way
    let px = right[0] * dx - fwd[0] * dy;
    let py = right[1] * dx - fwd[1] * dy;
    const len = Math.hypot(px, py) || 1;
    px /= len;
    py /= len;
    return mirror ? [px, py] : [-px, -py];
  }

  /* ------------------------------------------------------------- Frame */

  setAim(aim, color) {
    if (!aim) {
      this.aimDots.count = 0;
      this.powerRing.visible = false;
      this.pullLine.visible = false;
      return;
    }
    const m = new THREE.Matrix4();
    const pts = aim.path.slice(1, 41);
    pts.forEach(([x, y], i) => {
      const s = 1 - (i / pts.length) * 0.6;
      m.makeScale(s, s, s).setPosition(x, this.h(x, y) + 0.9, y);
      this.aimDots.setMatrixAt(i, m);
    });
    this.aimDots.count = pts.length;
    this.aimDots.instanceMatrix.needsUpdate = true;

    const b = aim.ball;
    this.powerRing.geometry.dispose();
    this.powerRing.geometry = new THREE.RingGeometry(BALL_R + 2, BALL_R + 3.1, 48, 1, Math.PI / 2, Math.max(0.01, aim.power * Math.PI * 2));
    this.powerRing.material.color.setHSL((120 - aim.power * 120) / 360, 0.9, 0.55);
    this.powerRing.position.set(b.x, this.h(b.x, b.y) + 0.75, b.y);
    this.powerRing.visible = true;

    const back = 6 + aim.power * 18;
    const p = this.pullLine.geometry.attributes.position;
    const by = this.h(b.x, b.y) + 0.8;
    p.setXYZ(0, b.x, by, b.y);
    p.setXYZ(1, b.x - aim.dir[0] * back, by, b.y - aim.dir[1] * back);
    p.needsUpdate = true;
    this.pullLine.computeLineDistances();
    this.pullLine.material.color.set(color);
    this.pullLine.visible = true;
  }

  spawn(type, x, y, color = 0xffffff) {
    const base = this.h(x, y);
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.3, 32), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, base + 0.3, y);
    this.dynamic.add(mesh);
    this.fx.push({ mesh, t: 0, life: type === 'sink' ? 0.9 : 0.7, grow: type === 'sink' ? 6 : 8 });
  }

  update(dt, { balls, activeSeat, aiming }) {
    this.time += dt;
    const t = this.time;
    const w = this.world;

    // Balls: position on the terrain, roll, sink
    balls.forEach((b, i) => {
      const m = this.ballMeshes[i];
      const show = b.active && (!b.sunk || m.sink < 1);
      m.group.visible = show;
      m.halo.visible = show && i === activeSeat && aiming;
      if (!show) return;
      let y = this.h(b.x, b.y) + BALL_R;
      if (b.sunk) {
        m.sink = Math.min(1, m.sink + dt * 3);
        y -= m.sink * BALL_R * 2.4;
      } else m.sink = 0;
      if (m.last) {
        const dx = b.x - m.last[0];
        const dz = b.y - m.last[1];
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4 && dist < 10) {
          const axis = new THREE.Vector3(dz, 0, -dx).normalize();
          m.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R));
        }
      }
      m.last = [b.x, b.y];
      m.group.position.set(b.x, y, b.y);
      if (m.halo.visible) {
        const s = 1 + Math.sin(t * 5) * 0.12;
        m.halo.scale.set(s, s, s);
        m.halo.position.set(b.x, this.h(b.x, b.y) + 0.6, b.y);
      }
    });

    // Moving parts
    for (const s of this.spinnerMeshes) {
      const [x1, y1, x2, y2] = spinnerEnds(s.data, w.t);
      s.blade.rotation.y = -Math.atan2(y2 - y1, x2 - x1);
      s.sails.rotation.x = t * 1.6;
      s.sails.rotation.y = s.blade.rotation.y + Math.PI / 2;
    }
    for (const bm of this.bumperMeshes) {
      const hot = bm.data.hit >= 0 && w.t - bm.data.hit < 0.25;
      const k = hot ? 1.15 : 1;
      bm.group.scale.set(k, 1, k);
      bm.body.material.emissiveIntensity = hot ? 1.4 : 0.25;
    }
    this.portalMeshes.forEach((d, i) => (d.rotation.z = t * (i % 2 ? -2 : 2)));
    this.waterTexes.forEach((tex) => tex.offset.set(t * 0.02, t * 0.035));
    this.boostMeshes.forEach((tex) => (tex.offset.y = -t * 1.6));
    if (this.cup) {
      const c = cupPos(w);
      this.cup.group.position.set(c.x, this.h(c.x, c.y), c.y);
      const pos = this.cup.flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = this.cup.base[i * 3];
        pos.setZ(i, Math.sin(x * 0.7 - t * 5) * 0.5 * (x / 8));
      }
      pos.needsUpdate = true;
      const near = balls.some((b) => b.active && !b.sunk && Math.hypot(b.x - c.x, b.y - c.y) < 10);
      this.cup.flag.material.opacity = near ? 0.4 : 1;
      this.cup.flag.material.transparent = near;
    }

    // Effects
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      f.mesh.scale.setScalar(1 + k * f.grow);
      f.mesh.material.opacity = 1 - k;
      if (k >= 1) {
        this.dynamic.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        return false;
      }
      return true;
    });

    // Camera
    if (this.mode === 'aim' && this.focus) {
      const b = this.focus;
      const by = this.h(b.x, b.y);
      this.wantTarget.set(b.x + this.heading.x * 20, by + 1, b.y + this.heading.y * 20);
      this.wantPos.set(b.x - this.heading.x * 34, by + 27, b.y - this.heading.y * 34);
    } else if (this.mode === 'follow' && this.focus) {
      let b = this.focus;
      if (!b.vx && !b.vy) b = balls.find((o) => o.active && !o.sunk && (o.vx || o.vy)) ?? b;
      const by = this.h(b.x, b.y);
      const f = new THREE.Vector2(this.camTarget.x - this.camPos.x, this.camTarget.z - this.camPos.z).normalize();
      this.wantTarget.set(b.x, by + 1, b.y);
      this.wantPos.set(b.x - f.x * 34, by + 28, b.y - f.y * 34);
    }
    const k = damp(this.mode === 'follow' ? 4 : 2.6, dt);
    this.camPos.lerp(this.wantPos, k);
    this.camTarget.lerp(this.wantTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    // Fog scales with how far back the camera is, so overviews of long holes stay crisp
    const dist = this.camPos.distanceTo(this.camTarget);
    this.scene.fog.near = dist * 0.9 + 60;
    this.scene.fog.far = dist * 1.8 + 320;

    // Keep the shadow frustum centred on what we're looking at
    this.sun.position.set(this.camTarget.x - 60, this.camTarget.y + 140, this.camTarget.z + 40);
    this.sun.target.position.copy(this.camTarget);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.clearGroup(this.hole);
    this.clearGroup(this.dynamic);
    this.renderer.dispose();
  }
}
