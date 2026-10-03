import * as E from './engine.js';
import { HOLES, ROUTES } from './course.js';
import { drawStatic, drawDynamic } from './render.js';
import { Course3D, webglAvailable } from './render3d.js';
import { icon } from '../../icons.js';
import { playersSection, toggleSeat, shuffle, segRow, modeGrid, loadStyles, initial, escapeHtml, isBot, thinking } from '../kit.js';
import { botLevel } from '../../bots.js';
import { planShot, timed, prepareHole } from './ai.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#8b5cf6' },
  { id: 'guest-2', name: 'Player 2', color: '#ec4899' },
];
const MAX_SEATS = 4;
const MAX_PULL = 34; // field units of drag for a full-power shot
const FEET = 0.25; // field units → feet, for "closest to the pin"

const MODES = [
  { id: 'classic', name: 'Classic', desc: 'Real putting. Fewest strokes wins.', icon: '<path d="M6 21V4"/><path d="M6 4l11 4-11 4"/>' },
  { id: 'ice', name: 'Ice Rink', desc: 'The whole course is frozen. Touch is everything.', icon: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7"/>' },
  { id: 'pinball', name: 'Pinball', desc: 'Walls barely slow you and bumpers launch you.', icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
  { id: 'bumper', name: 'Bumper Balls', desc: 'Balls collide. Knock rivals off line.', icon: '<circle cx="8" cy="12" r="5"/><circle cx="17" cy="12" r="4"/>' },
  { id: 'wild', name: 'Wild Card', desc: 'A random twist on every hole.', icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>' },
  { id: 'pin', name: 'Closest to Pin', desc: 'One shot each per hole. Nearest the cup scores.', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' },
];
const DEFAULTS = { mode: 'classic', holes: 9, limit: 8, seats: null };

const toPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`);
const feet = (d) => (d === Infinity ? 'In the water' : d === 0 ? 'In the cup!' : `${(d * FEET).toFixed(1)} ft`);

class MiniGolf {
  constructor(stage, ctx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'golf';
    stage.append(this.root);

    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    this.cfg = { ...DEFAULTS, ...(ctx.storage.get() ?? {}) };
    if (!ROUTES[this.cfg.holes]) this.cfg.holes = 9;
    const seated = (this.cfg.seats ?? []).map((id) => this.roster.find((p) => p.id === id)).filter(Boolean);
    this.seats = seated.length >= 2 ? [...new Set(seated)].slice(0, MAX_SEATS) : this.roster.slice(0, 2);

    this.timers = [];
    this.lastSound = 0;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get isPin() {
    return this.cfg.mode === 'pin';
  }

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  /* ------------------------------------------------------------- Setup */

  showSetup() {
    const rerender = this.view === 'setup';
    this.stopLoop();
    this.view = 'setup';
    const scroll = this.root.querySelector('.kit-setup-scroll')?.scrollTop ?? 0;
    const c = this.cfg;
    const route = ROUTES[c.holes];
    const par = route.reduce((sum, i) => sum + HOLES[i].par, 0);

    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          ${playersSection({ roster: this.roster, seats: this.seats, max: MAX_SEATS })}
          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            ${modeGrid(MODES, c.mode)}
          </section>
          <section class="kit-sec">
            <h3 class="kit-h">Course <span class="kit-count">${route.length} holes · par ${par}</span></h3>
            <div class="golf-thumbs">
              ${route.map((i, n) => `<div class="golf-thumb"><canvas data-hole="${i}"></canvas><span><b>${n + 1}</b> ${HOLES[i].name}</span></div>`).join('')}
            </div>
            ${segRow('Holes', 'holes', [[3, '3'], [6, '6'], [9, '9']], c.holes)}
            ${this.isPin ? '' : segRow('Stroke limit', 'limit', [[6, '6'], [8, '8'], [10, '10']], c.limit)}
          </section>
        </div>
        <div class="kit-start">
          <button class="btn btn-primary" data-act="start">${icon('play')}Tee off</button>
        </div>
      </div>`;
    this.root.querySelector('.kit-setup').classList.toggle('no-anim', rerender);
    this.root.querySelector('.kit-setup-scroll').scrollTop = scroll;
    requestAnimationFrame(() => this.drawThumbs());
  }

  drawThumbs() {
    this.root.querySelectorAll('.golf-thumb canvas').forEach((cv, n) => {
      const hole = HOLES[+cv.dataset.hole];
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = w * dpr;
      cv.height = h * dpr;
      const g = cv.getContext('2d');
      const world = E.buildWorld(hole);
      const B = world.bounds;
      const s = Math.min(w / B.w, h / B.h);
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((w - B.w * s) / 2 - B.x * s), dpr * ((h - B.h * s) / 2 - B.y * s));
      drawStatic(g, world);
      drawDynamic(g, world, 0, { balls: [], seats: [], activeSeat: -1, aiming: false, aim: null, trails: [], fx: [], holeNumber: n + 1 });
    });
  }

  /* -------------------------------------------------------------- Match */

  init3d() {
    if (this.use3d !== undefined) return;
    this.use3d = false;
    if (!webglAvailable()) return;
    try {
      this.canvas3d = document.createElement('canvas');
      this.canvas3d.className = 'golf-canvas';
      this.r3 = new Course3D(this.canvas3d);
      this.use3d = true;
    } catch (err) {
      console.warn('3D unavailable, using 2D', err);
      this.r3 = null;
    }
  }

  startMatch() {
    this.init3d();
    this.cfg.seats = this.seats.map((p) => p.id);
    this.ctx.storage.set(this.cfg);
    this.match = {
      route: ROUTES[this.cfg.holes],
      index: 0,
      cards: this.seats.map(() => []), // strokes per hole, or { dist, pts } in pin mode
      points: this.seats.map(() => 0),
      lastTwist: null,
    };
    this.startHole();
  }

  get hole() {
    return HOLES[this.match.route[this.match.index]];
  }

  startHole() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const m = this.match;
    let twist = null;
    if (this.cfg.mode === 'wild') {
      const options = E.TWISTS.filter((t) => t.id !== m.lastTwist);
      twist = options[Math.floor(Math.random() * options.length)];
      m.lastTwist = twist.id;
    }
    this.twist = twist;
    this.world = E.buildWorld(this.hole, { mode: this.cfg.mode, twist: twist?.id, seed: Math.floor(Math.random() * 10000) });
    this.balls = this.seats.map((_, i) => E.newBall(i));
    this.trails = this.seats.map(() => []);
    this.strokes = this.seats.map(() => 0);
    this.done = this.seats.map(() => false);
    this.pickedUp = this.seats.map(() => false);
    this.pinDist = this.seats.map(() => Infinity);
    this.wet = this.seats.map(() => false);
    this.fx = [];
    this.aim = null;
    this.shotInFlight = false;
    this.turn = m.index % this.seats.length;
    this.phase = 'intro';
    this.renderGame();
    this.showIntro();
    if (this.seats.some(isBot)) this.later(() => prepareHole(this.world), 600);
  }

  renderGame() {
    this.view = 'game';
    const m = this.match;
    this.root.innerHTML = `
      <div class="golf-game">
        <div class="golf-hud ${this.seats.length === 2 ? 'is-duo' : ''}" style="--n:${this.seats.length}">
          ${this.seats.map((p, i) => `
            <div class="golf-player" data-seat="${i}" style="--pc:${p.color}">
              <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
              <span class="golf-player-info"><span class="golf-player-name">${escapeHtml(p.name)}</span><small class="golf-player-hole"></small></span>
              <b class="golf-total"></b>
            </div>`).join('')}
        </div>
        <div class="golf-holebar">
          <span class="golf-hole-num">Hole ${m.index + 1}<small>/${m.route.length}</small></span>
          <span class="golf-hole-name">${escapeHtml(this.hole.name)}</span>
          <span class="golf-par">Par ${this.hole.par}</span>
        </div>
        ${this.twist ? `<div class="golf-twist">${icon('sparkle')}<b>${this.twist.name}</b><span>${this.twist.desc}</span></div>` : ''}
        <div class="golf-stage ${this.use3d ? 'is-3d' : ''}">
          ${this.use3d ? '' : '<canvas class="golf-canvas"></canvas>'}
          <div class="golf-banner"></div>
          <div class="golf-callouts"></div>
          <div class="golf-power"><i></i></div>
        </div>
        <div class="kit-controls">
          ${this.use3d ? `<button class="kit-ctrl" data-act="overview">${icon('map')}<span>Overview</span></button>` : ''}
          <button class="kit-ctrl" data-act="scorecard">${icon('trophy')}<span>Scorecard</span></button>
          <button class="kit-ctrl" data-act="setup">${icon('settings')}<span>Setup</span></button>
        </div>
      </div>`;
    this.gameEl = this.root.querySelector('.golf-game');
    this.stageEl = this.root.querySelector('.golf-stage');
    if (this.use3d) {
      this.stageEl.prepend(this.canvas3d);
      this.canvas = this.canvas3d;
      this.r3.setHole(this.world, m.index + 1, this.seats);
    } else {
      this.canvas = this.root.querySelector('.golf-canvas');
      this.g = this.canvas.getContext('2d');
    }
    this.wireCanvas();
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(this.stageEl);
    this.layout();
    this.updateHud();
    this.startLoop();
  }

  layout() {
    const r = this.stageEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.stageH = r.height;
    if (this.use3d) {
      this.r3.resize(r.width, r.height, dpr);
      return;
    }
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    // Keep room above the course for the turn banner and below it for the power meter.
    const top = 46;
    const bottom = 24;
    const avail = Math.max(10, r.height - top - bottom);
    const B = this.world.bounds;
    this.scale = Math.min(r.width / B.w, avail / B.h);
    this.ox = (r.width - B.w * this.scale) / 2 - B.x * this.scale;
    this.oy = top + (avail - B.h * this.scale) / 2 - B.y * this.scale;
    // Cache the static course
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = this.canvas.width;
    this.staticCanvas.height = this.canvas.height;
    const sg = this.staticCanvas.getContext('2d');
    sg.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy);
    drawStatic(sg, this.world);
  }

  /* ------------------------------------------------------------- Loop */

  startLoop() {
    this.stopLoop();
    this.last = performance.now();
    this.acc = 0;
    this.clock = 0;
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.clock += dt;
      this.acc += dt;
      let n = 0;
      while (this.acc >= E.DT && n < 30) {
        const ev = E.step(this.world, this.balls);
        if (ev.length) this.onEvents(ev);
        this.acc -= E.DT;
        n++;
      }
      if (n === 30) this.acc = 0;
      this.balls.forEach((b, i) => {
        const tr = this.trails[i];
        if (E.isMoving(b)) {
          tr.push([b.x, b.y]);
          if (tr.length > 14) tr.shift();
        } else if (tr.length) tr.shift();
      });
      if (this.phase === 'aim' && this.balls.some(E.isMoving)) {
        this.aim = null;
        this.phase = 'roll'; // swept by a windmill blade
      }
      if (this.phase === 'roll' && E.allResting(this.balls)) this.afterRest();
      this.fx = this.fx.filter((f) => this.clock - f.t < 1);
      if (this.use3d) {
        this.r3.update(dt, { balls: this.balls, activeSeat: this.turn, aiming: this.phase === 'aim' });
        this.r3.render();
      } else this.draw();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    this.botJob?.cancel();
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
  }

  draw() {
    const g = this.g;
    const { dpr } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.staticCanvas) g.drawImage(this.staticCanvas, 0, 0);
    g.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy);
    drawDynamic(g, this.world, this.clock, {
      balls: this.balls,
      seats: this.seats,
      activeSeat: this.turn,
      aiming: this.phase === 'aim',
      aim: this.aim,
      trails: this.trails,
      fx: this.fx,
      holeNumber: this.match.index + 1,
    });
  }

  /* ------------------------------------------------------------ Turns */

  showIntro() {
    const intro = document.createElement('div');
    intro.className = 'golf-intro';
    intro.innerHTML = `
      <div class="golf-intro-card">
        <span class="golf-intro-eyebrow">Hole ${this.match.index + 1} of ${this.match.route.length}</span>
        <h2>${escapeHtml(this.hole.name)}</h2>
        <span class="golf-intro-par">${this.isPin ? 'Closest to the pin' : `Par ${this.hole.par}`}</span>
        ${this.twist ? `<span class="golf-intro-twist">${icon('sparkle')}${this.twist.name}: ${this.twist.desc}</span>` : ''}
        <small>Tap to start</small>
      </div>`;
    this.stageEl.append(intro);
    this.ctx.sfx.select();
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      intro.classList.add('is-leaving');
      setTimeout(() => intro.remove(), 350);
      this.beginTurn();
    };
    intro.addEventListener('click', go);
    this.later(go, 2400);
  }

  beginTurn() {
    const b = this.balls[this.turn];
    if (!b.active) this.teeUp(b);
    this.phase = 'aim';
    const p = this.seats[this.turn];
    const banner = this.root.querySelector('.golf-banner');
    banner.innerHTML = `<span class="golf-dot" style="--pc:${p.color}"></span><b>${escapeHtml(p.name)}</b><span>${this.isPin ? 'One shot' : `Stroke ${this.strokes[this.turn] + 1}`}</span>`;
    banner.style.setProperty('--pc', p.color);
    banner.classList.remove('is-new');
    void banner.offsetWidth;
    banner.classList.add('is-new');
    this.r3?.focusBall(b);
    this.setOverviewLabel();
    this.updateHud();
    this.ctx.haptic(8);
    if (isBot(p)) this.botShot(p);
  }

  get botTurn() {
    return isBot(this.seats[this.turn]);
  }

  // The bot lines up (planning on a copy of the hole), draws the putter back, and hits.
  async botShot(player) {
    const job = { cancelled: false };
    this.botJob?.cancel();
    this.botJob = { cancel: () => (job.cancelled = true) };
    const seat = this.turn;
    const banner = this.root.querySelector('.golf-banner');
    banner.innerHTML = `<span class="golf-dot" style="--pc:${player.color}"></span>${thinking(player)}`;
    // Plan for the moment the ball will actually be struck (windmills keep turning)
    const lead = timed(this.world) ? 2.6 : 0;
    const strikeAt = this.world.t + lead;
    await new Promise((r) => setTimeout(r, 350));
    if (job.cancelled) return;
    const plan = await planShot(this.world, this.balls, seat, botLevel(player), { t: strikeAt, job });
    if (!plan || job.cancelled || this.phase !== 'aim' || this.turn !== seat) return;
    banner.innerHTML = `<span class="golf-dot" style="--pc:${player.color}"></span><b>${escapeHtml(player.name)}</b><span>${this.isPin ? 'One shot' : `Stroke ${this.strokes[seat] + 1}`}</span>`;

    // Draw back: the aim line grows to the planned strength
    const ball = this.balls[seat];
    const meter = this.root.querySelector('.golf-power');
    const pullDir = this.world.mirror ? 1 : -1;
    const start = performance.now();
    const DRAW = 750;
    await new Promise((resolve) => {
      const frame = () => {
        if (job.cancelled || this.phase !== 'aim') return resolve();
        const k = Math.min(1, (performance.now() - start) / DRAW);
        const e = 1 - (1 - k) ** 3;
        const power = Math.max(0.04, plan.aimPower * e);
        const len = power * MAX_PULL;
        this.aim = {
          ball,
          dir: plan.aimDir,
          power,
          pull: [plan.aimDir[0] * pullDir * len * 0.8, plan.aimDir[1] * pullDir * len * 0.8],
          path: E.previewPath(this.world, ball, plan.aimDir[0], plan.aimDir[1], power, 14 + power * 30),
        };
        this.r3?.setAim(this.aim, player.color);
        meter?.classList.add('on');
        meter?.style.setProperty('--p', power);
        meter?.style.setProperty('--h', 120 - power * 120);
        // Hold at full draw until the planned moment
        if (k >= 1 && this.world.t >= strikeAt - 0.02) return resolve();
        if (k >= 1 && this.world.t > strikeAt + 1) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    meter?.classList.remove('on');
    this.aim = null;
    this.r3?.setAim(null);
    if (job.cancelled || this.phase !== 'aim' || this.turn !== seat) return;
    this.takeShot(plan.dir, plan.power);
  }

  setOverviewLabel() {
    const btn = this.root.querySelector('[data-act="overview"] span');
    if (btn) btn.textContent = this.r3?.isOverview && this.phase === 'aim' ? 'My ball' : 'Overview';
  }

  // Put a ball on the tee, nudged sideways if another ball is sitting there.
  teeUp(b) {
    E.placeAtTee(this.world, b);
    if (!this.world.collide) return;
    for (const dx of [0, 6, -6, 12, -12]) {
      const x = this.world.tee[0] + dx;
      const clear = this.balls.every((o) => o === b || !o.active || o.sunk || Math.hypot(o.x - x, o.y - b.y) > E.BALL_R * 2.5);
      if (clear && this.world.outlines.some((o) => E.pointIn({ poly: o }, x, b.y))) {
        b.x = x;
        return;
      }
    }
  }

  wireCanvas() {
    const cv = this.canvas;
    let start = null;
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left - this.ox) / this.scale, (e.clientY - r.top - this.oy) / this.scale];
    };
    const meter = () => this.root.querySelector('.golf-power');
    const screen = (e) => [e.clientX, e.clientY];
    cv.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'aim' || this.botTurn) return;
      cv.setPointerCapture(e.pointerId);
      start = this.use3d ? screen(e) : toWorld(e);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!start || this.phase !== 'aim' || this.botTurn) return;
      let dir;
      let power;
      let pull = [0, 0];
      let len;
      if (this.use3d) {
        const [x, y] = screen(e);
        const dx = x - start[0];
        const dy = y - start[1];
        len = Math.hypot(dx, dy);
        power = Math.min(len / Math.min(220, (this.stageH || 600) * 0.34), 1);
        dir = this.r3.dragToShot(dx, dy, this.world.mirror);
      } else {
        const [x, y] = toWorld(e);
        pull = [x - start[0], y - start[1]];
        len = Math.hypot(...pull);
        power = Math.min(len / MAX_PULL, 1);
        const sign = this.world.mirror ? 1 : -1;
        dir = [(sign * pull[0]) / len, (sign * pull[1]) / len];
      }
      if (power < 0.04) {
        this.aim = null;
        this.r3?.setAim(null);
        meter().classList.remove('on');
        return;
      }
      const ball = this.balls[this.turn];
      const shown = len ? (Math.min(len, MAX_PULL) / len) * 0.8 : 0;
      this.aim = {
        ball,
        dir,
        power,
        pull: [pull[0] * shown, pull[1] * shown],
        path: E.previewPath(this.world, ball, dir[0], dir[1], power, 14 + power * 30),
      };
      this.r3?.setAim(this.aim, this.seats[this.turn].color);
      const m = meter();
      m.classList.add('on');
      m.style.setProperty('--p', power);
      m.style.setProperty('--h', 120 - power * 120);
    });
    const release = () => {
      if (!start) return;
      start = null;
      meter().classList.remove('on');
      const aim = this.aim;
      this.aim = null;
      this.r3?.setAim(null);
      if (aim && this.phase === 'aim') this.takeShot(aim.dir, aim.power);
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', () => {
      start = null;
      this.aim = null;
      this.r3?.setAim(null);
      meter().classList.remove('on');
    });
  }

  takeShot(dir, power) {
    const b = this.balls[this.turn];
    for (const o of this.balls) {
      if (o.active && !o.sunk) {
        o.lastX = o.x;
        o.lastY = o.y;
      }
    }
    E.shoot(b, dir[0], dir[1], power);
    this.r3?.follow(b);
    this.setOverviewLabel();
    this.strokes[this.turn]++;
    this.shotInFlight = true;
    this.phase = 'roll';
    this.ctx.sfx.tone({ freq: 220, to: 140, dur: 0.07, type: 'triangle', gain: 0.03 + power * 0.04 });
    this.ctx.sfx.tone({ freq: 1200, dur: 0.02, type: 'square', gain: 0.012 });
    this.ctx.haptic(10 + Math.round(power * 15));
    this.updateHud();
  }

  onEvents(events) {
    const sfx = this.ctx.sfx;
    for (const e of events) {
      const seat = e.ball.seat;
      switch (e.type) {
        case 'wall':
        case 'spinner': {
          const now = performance.now();
          if (now - this.lastSound > 45) {
            this.lastSound = now;
            sfx.tone({ freq: 650 + Math.random() * 200, dur: 0.03, type: 'square', gain: Math.min(0.03, e.speed / 4000) });
          }
          break;
        }
        case 'bumper':
          sfx.tone({ freq: 330, to: 700, dur: 0.14, gain: 0.05 });
          this.ctx.haptic(12);
          break;
        case 'ball':
          sfx.tone({ freq: 1800, dur: 0.03, type: 'triangle', gain: 0.045 });
          this.ctx.haptic(10);
          break;
        case 'lip':
          sfx.tone({ freq: 1500, dur: 0.03, type: 'square', gain: 0.02 });
          sfx.tone({ freq: 1150, dur: 0.04, type: 'square', gain: 0.02, delay: 0.06 });
          this.callout('Lip out!', 'meh');
          break;
        case 'portal':
          sfx.tone({ freq: 300, to: 1300, dur: 0.25, gain: 0.04 });
          this.fx.push({ type: 'portal', x: e.to[0], y: e.to[1], t: this.clock });
          this.r3?.spawn('portal', e.to[0], e.to[1], 0xffffff);
          break;
        case 'water': {
          sfx.tone({ freq: 700, to: 120, dur: 0.35, gain: 0.045 });
          sfx.tone({ freq: 220, to: 70, dur: 0.3, type: 'triangle', gain: 0.03, delay: 0.05 });
          this.fx.push({ type: 'splash', x: e.x, y: e.y, t: this.clock });
          this.r3?.spawn('splash', e.x, e.y, 0xbfdbfe);
          const own = seat === this.turn && this.shotInFlight;
          if (this.isPin) {
            if (own) this.wet[seat] = true;
            this.callout('Splash!', 'bad');
          } else if (own) {
            this.strokes[seat]++;
            this.callout('Splash! +1', 'bad');
          } else this.callout('Splash!', 'bad');
          this.ctx.haptic(25);
          break;
        }
        case 'sink':
          this.onSink(seat);
          break;
      }
    }
  }

  onSink(seat) {
    this.fx.push({ type: 'sink', t: this.clock });
    this.r3?.spawn('sink', this.world.cup.x, this.world.cup.y, 0xfde68a);
    this.trails[seat] = [];
    const sfx = this.ctx.sfx;
    [1046.5, 784, 523.25].forEach((f, i) => sfx.tone({ freq: f, dur: 0.07, type: 'triangle', gain: 0.04, delay: i * 0.05 }));
    this.ctx.haptic(30);
    if (this.isPin) {
      this.pinDist[seat] = 0;
      this.callout('Ace!', 'ace');
      sfx.win();
      this.ctx.confetti({ colors: [this.seats[seat].color, '#fde68a', '#ffffff'] });
      return;
    }
    this.done[seat] = true;
    const strokes = this.strokes[seat];
    const name = E.scoreName(strokes, this.hole.par);
    const diff = strokes - this.hole.par;
    const tone = strokes === 1 || diff <= -2 ? 'ace' : diff < 0 ? 'good' : diff === 0 ? 'par' : 'meh';
    const who = seat === this.turn ? '' : `${this.seats[seat].name}: `;
    this.callout(`${who}${name}`, tone);
    if (tone === 'ace') {
      sfx.win();
      this.ctx.confetti({ colors: [this.seats[seat].color, '#fde68a', '#ffffff'] });
    } else this.later(() => sfx.select(), 200);
    this.updateHud();
  }

  afterRest() {
    if (!this.shotInFlight) {
      // Knocked by a windmill before the shot: back to aiming (a bot lines up again)
      this.phase = 'aim';
      if (this.botTurn) this.botShot(this.seats[this.turn]);
      return;
    }
    this.shotInFlight = false;
    this.phase = 'wait';
    const seat = this.turn;
    const b = this.balls[seat];

    if (this.isPin) {
      this.done[seat] = true;
      if (!b.sunk) this.pinDist[seat] = this.wet[seat] ? Infinity : E.distToCup(this.world, b);
      this.callout(feet(this.pinDist[seat]), this.pinDist[seat] === 0 ? 'ace' : 'info');
    } else {
      // Anyone knocked in by someone else is done too (bumper mode)
      this.balls.forEach((o, i) => o.sunk && (this.done[i] = true));
      if (!b.sunk && this.strokes[seat] >= this.cfg.limit) {
        this.done[seat] = true;
        this.pickedUp[seat] = true;
        b.active = false;
        this.callout('Stroke limit. Picked up.', 'meh');
      }
    }
    this.updateHud();
    if (this.done.every(Boolean)) {
      this.later(() => this.holeComplete(), 900);
      return;
    }
    this.later(() => this.nextTurn(), 450);
  }

  nextTurn() {
    const n = this.seats.length;
    for (let i = 1; i <= n; i++) {
      const c = (this.turn + i) % n;
      if (!this.done[c]) {
        this.turn = c;
        break;
      }
    }
    this.beginTurn();
  }

  callout(text, tone = 'info') {
    const box = this.root.querySelector('.golf-callouts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `golf-callout is-${tone}`;
    el.textContent = text;
    box.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  updateHud() {
    const m = this.match;
    const parSoFar = this.parThrough();
    this.root.querySelectorAll('.golf-player').forEach((el) => {
      const seat = +el.dataset.seat;
      el.classList.toggle('is-active', seat === this.turn && ['aim', 'roll'].includes(this.phase));
      el.classList.toggle('is-done', this.done[seat]);
      const total = el.querySelector('.golf-total');
      const sub = el.querySelector('.golf-player-hole');
      if (this.isPin) {
        total.textContent = m.points[seat];
        sub.textContent = this.done[seat] ? feet(this.pinDist[seat]) : 'points';
      } else {
        const sum = m.cards[seat].reduce((s, v) => s + v, 0);
        total.textContent = toPar(sum - parSoFar);
        const k = this.strokes[seat];
        sub.textContent = this.balls[seat].sunk ? `In · ${k}` : this.pickedUp[seat] ? 'Picked up' : `${k} stroke${k === 1 ? '' : 's'}`;
      }
    });
  }

  /* ----------------------------------------------------------- Results */

  holeComplete() {
    const m = this.match;
    this.phase = 'between';
    const n = this.seats.length;
    if (this.isPin) {
      const better = (a, b) => a < b;
      this.seats.forEach((_, i) => {
        const rank = this.pinDist.filter((d) => better(d, this.pinDist[i])).length;
        const pts = this.pinDist[i] === Infinity ? 0 : n - rank + (this.pinDist[i] === 0 ? 2 : 0);
        m.points[i] += pts;
        m.cards[i].push({ dist: this.pinDist[i], pts });
      });
    } else {
      this.seats.forEach((_, i) => m.cards[i].push(this.strokes[i]));
    }
    this.updateHud();
    if (m.index === m.route.length - 1) this.showFinal();
    else this.showHoleResult();
  }

  showHoleResult() {
    const m = this.match;
    const par = this.hole.par;
    const order = this.seats.map((_, i) => i);
    let title;
    let rows;
    if (this.isPin) {
      order.sort((a, b) => this.pinDist[a] - this.pinDist[b]);
      const best = order[0];
      title = this.pinDist[best] === Infinity ? 'Everyone got wet' : `${escapeHtml(this.seats[best].name)} was closest`;
      rows = order.map((i) => this.row(i, feet(this.pinDist[i]), `+${m.cards[i].at(-1).pts}`, m.cards[i].at(-1).pts > 0 && i === best));
    } else {
      order.sort((a, b) => this.strokes[a] - this.strokes[b]);
      const best = this.strokes[order[0]];
      const leaders = order.filter((i) => this.strokes[i] === best);
      const verb = { 'Hole in one!': 'aced it!', 'Albatross!': 'made albatross!', 'Eagle!': 'eagled it!', 'Birdie!': 'birdied it!', Par: 'made par' }[E.scoreName(best, par)];
      title = leaders.length === 1 && verb ? `${escapeHtml(this.seats[leaders[0]].name)} ${verb}` : leaders.length > 1 ? 'Tied hole' : `${escapeHtml(this.seats[leaders[0]].name)} took the hole`;
      rows = order.map((i) => {
        const label = this.pickedUp[i] ? `Picked up · ${this.strokes[i]}` : `${E.scoreName(this.strokes[i], par)} · ${this.strokes[i]}`;
        return this.row(i, label, toPar(this.totalStrokes(i) - this.parThrough()), leaders.includes(i));
      });
    }
    this.overlay(`
      <div class="kit-result-card golf-card">
        <p class="kit-result-eyebrow">Hole ${m.index + 1} of ${m.route.length} · ${escapeHtml(this.hole.name)}</p>
        <h2>${title}</h2>
        <ol class="golf-standings">${rows.join('')}</ol>
        <div class="kit-result-actions golf-actions">
          <button class="btn btn-primary" data-act="next-hole">${icon('play')}Next hole</button>
          <button class="btn btn-glass" data-act="scorecard">${icon('trophy')}Card</button>
        </div>
      </div>`);
  }

  row(seat, label, right, top) {
    const p = this.seats[seat];
    return `
      <li class="${top ? 'is-top' : ''}" style="--pc:${p.color}">
        <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
        <span class="golf-st-name">${escapeHtml(p.name)}<small>${label}</small></span>
        <b>${right}</b>
      </li>`;
  }

  totalStrokes(seat) {
    return this.match.cards[seat].reduce((s, v) => s + v, 0);
  }

  parThrough() {
    const m = this.match;
    return m.route.slice(0, m.cards[0].length).reduce((s, i) => s + HOLES[i].par, 0);
  }

  showFinal() {
    const order = this.seats.map((_, i) => i);
    const score = (i) => (this.isPin ? -this.match.points[i] : this.totalStrokes(i));
    order.sort((a, b) => score(a) - score(b));
    const best = score(order[0]);
    const winners = order.filter((i) => score(i) === best);
    const single = winners.length === 1;
    const w = this.seats[winners[0]];
    const rows = order.map((i) =>
      this.isPin
        ? this.row(i, `${this.match.cards[i].filter((c) => c.dist === 0).length} aces`, `${this.match.points[i]} pts`, winners.includes(i))
        : this.row(i, `${this.totalStrokes(i)} strokes`, toPar(this.totalStrokes(i) - this.parThrough()), winners.includes(i)),
    );
    this.overlay(`
      <div class="kit-result-card golf-card" style="--pc:${single ? w.color : '#a1a1aa'}">
        <div class="kit-result-hero ${single ? '' : 'golf-tie'}">
          ${single ? `<span class="kit-trophy">${icon('trophy')}</span><span class="avatar" style="--pc:${w.color}">${initial(w)}</span>` : winners.map((i) => `<span class="avatar" style="--pc:${this.seats[i].color}">${initial(this.seats[i])}</span>`).join('')}
        </div>
        <p class="kit-result-eyebrow">Final round · ${this.match.route.length} holes</p>
        <h2>${single ? `${escapeHtml(w.name)} wins!` : 'It’s a tie!'}</h2>
        <ol class="golf-standings">${rows.join('')}</ol>
        ${this.scorecardTable()}
        <div class="kit-result-actions golf-actions">
          <button class="btn btn-primary" data-act="rematch">${icon('replay')}Play again</button>
          <button class="btn btn-glass" data-act="setup-now">${icon('settings')}Setup</button>
        </div>
      </div>`);
    this.ctx.sfx.win();
    if (single) {
      this.ctx.confetti({ colors: [w.color, '#ffffff', '#fde68a', w.color] });
      this.later(() => this.ctx.confetti({ colors: [w.color, '#ffffff', '#fde68a'] }), 700);
    }
  }

  scorecardTable() {
    const m = this.match;
    const holes = m.route.map((i) => HOLES[i]);
    const head = holes.map((_, n) => `<th>${n + 1}</th>`).join('');
    const parRow = holes.map((h) => `<td>${h.par}</td>`).join('');
    const rows = this.seats
      .map((p, i) => {
        const cells = holes
          .map((h, n) => {
            const c = m.cards[i][n];
            if (c === undefined) return '<td></td>';
            if (this.isPin) return `<td class="${c.dist === 0 ? 'is-ace' : ''}">${c.pts}</td>`;
            const d = c - h.par;
            const cls = c === 1 ? 'is-ace' : d <= -1 ? 'is-under' : d >= 1 ? 'is-over' : '';
            return `<td class="${cls}">${c}</td>`;
          })
          .join('');
        const total = this.isPin ? m.points[i] : this.totalStrokes(i);
        return `<tr style="--pc:${p.color}"><th>${initial(p)}</th>${cells}<td class="golf-tot">${total}</td></tr>`;
      })
      .join('');
    return `
      <div class="golf-card-scroll">
        <table class="golf-table">
          <thead><tr><th></th>${head}<th>${this.isPin ? 'Pts' : 'Tot'}</th></tr></thead>
          <tbody>${this.isPin ? '' : `<tr class="golf-par-row"><th>Par</th>${parRow}<td>${holes.reduce((s, h) => s + h.par, 0)}</td></tr>`}${rows}</tbody>
        </table>
      </div>`;
  }

  showScorecard() {
    this.overlay(
      `
      <div class="kit-result-card golf-card">
        <p class="kit-result-eyebrow">Scorecard</p>
        <h2>${this.match.cards[0].length ? `Through ${this.match.cards[0].length}` : 'No holes yet'}</h2>
        ${this.scorecardTable()}
        <div class="kit-result-actions"><button class="btn btn-glass" data-act="close-overlay">Close</button></div>
      </div>`,
      'is-sheet',
    );
  }

  overlay(html, cls = '') {
    this.root.querySelectorAll('.kit-result').forEach((o) => o.remove());
    const el = document.createElement('div');
    el.className = `kit-result ${cls}`;
    el.innerHTML = html;
    this.gameEl.append(el);
  }

  /* ------------------------------------------------------------ Input */

  async confirmThen(opts, fn) {
    if (await this.ctx.confirm(opts)) fn();
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const { act, v } = t.dataset;
    const c = this.cfg;
    const setup = (fn) => {
      fn();
      this.ctx.sfx.tap();
      this.ctx.haptic();
      this.showSetup();
    };
    switch (act) {
      case 'toggle':
        if (toggleSeat(this.ctx, { roster: this.roster, seats: this.seats, id: v, max: MAX_SEATS })) setup(() => {});
        return;
      case 'shuffle':
        return setup(() => shuffle(this.seats));
      case 'mode':
        return setup(() => (c.mode = v));
      case 'holes':
        return setup(() => (c.holes = +v));
      case 'limit':
        return setup(() => (c.limit = +v));
      case 'start':
        return this.startMatch();
      case 'next-hole':
        this.match.index++;
        return this.startHole();
      case 'rematch':
        return this.startMatch();
      case 'overview':
        if (!this.r3) return;
        this.ctx.sfx.tap();
        if (this.r3.isOverview && this.phase === 'aim') this.r3.focusBall(this.balls[this.turn]);
        else this.r3.overview();
        return this.setOverviewLabel();
      case 'scorecard':
        this.ctx.sfx.tap();
        if (this.phase === 'between') {
          this.prevOverlay = this.root.querySelector('.kit-result')?.innerHTML;
        }
        return this.showScorecard();
      case 'close-overlay':
        this.root.querySelector('.kit-result')?.remove();
        if (this.phase === 'between' && this.prevOverlay) this.overlay(this.prevOverlay);
        this.prevOverlay = null;
        return;
      case 'setup':
        return this.confirmThen(
          { title: 'Leave this round?', message: 'Scores for this round will be lost.', confirmLabel: 'Leave round', danger: true },
          () => this.showSetup(),
        );
      case 'setup-now':
        return this.showSetup();
    }
  }

  destroy() {
    this.stopLoop();
    this.r3?.dispose();
    this.timers.forEach(clearTimeout);
  }
}

export default {
  async mount(stage, ctx) {
    const link = await loadStyles(new URL('./style.css', import.meta.url).href);
    const game = new MiniGolf(stage, ctx);
    if (new URLSearchParams(location.search).has('debug')) window.__golf = game; // test hook
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};
