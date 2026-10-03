import { newRound, play, isLegal, legalMoves, landingRow, floorRow, cell, FLIP_EVERY } from './engine.js';
import { icon } from '../../icons.js';
import { playersSection, toggleSeat, shuffle, loadStyles, segRow, modeGrid, initial, escapeHtml, svgIcon, isBot, thinking, botTurn, cancelBot } from '../kit.js';
import { botLevel } from '../../bots.js';
import { chooseMove } from './ai.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#f43f5e' },
  { id: 'guest-2', name: 'Player 2', color: '#f59e0b' },
];
const MAX_SEATS = 4;

const MODES = [
  {
    id: 'classic',
    name: 'Classic',
    desc: 'Drop discs. Line them up to win.',
    hint: 'Line up {n} in any direction.',
    icon: '<circle cx="6" cy="18" r="2.5"/><circle cx="10" cy="14" r="2.5"/><circle cx="14" cy="10" r="2.5"/><circle cx="18" cy="6" r="2.5"/>',
  },
  {
    id: 'popout',
    name: 'Pop Out',
    desc: 'Drop in, or pop your disc off the bottom.',
    hint: 'Drop a disc, or pop one of yours off the bottom.',
    icon: '<rect x="4" y="3" width="16" height="13" rx="3"/><path d="M12 13v8M9 18l3 3 3-3"/>',
  },
  {
    id: 'powerups',
    name: 'Power Ups',
    desc: 'One Anvil, Bomb and Double each.',
    hint: 'Anvil, Bomb and Double: one of each per round.',
    icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  },
  {
    id: 'flip',
    name: 'Gravity Flip',
    desc: `Every ${FLIP_EVERY} moves the board flips. Discs fall up.`,
    hint: 'Gravity flips every few moves.',
    icon: '<path d="M7 3v14M3 13l4 4 4-4M17 21V7M13 11l4-4 4 4"/>',
  },
  {
    id: 'marathon',
    name: 'Marathon',
    desc: 'Fill the board. Every line scores.',
    hint: 'Every line of {n} scores a point.',
    icon: '<path d="M4 20h16"/><path d="M6 16V9M10 16V5M14 16v-5M18 16V7"/>',
  },
  {
    id: 'blind',
    name: 'Blindfold',
    desc: 'Discs go dark after they land.',
    hint: 'Discs go dark. Remember who’s where!',
    icon: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="m4 4 16 16"/>',
  },
];

const SIZES = [
  { id: '6x5', cols: 6, rows: 5, label: '6×5' },
  { id: '7x6', cols: 7, rows: 6, label: '7×6' },
  { id: '8x7', cols: 8, rows: 7, label: '8×7' },
  { id: '9x7', cols: 9, rows: 7, label: '9×7' },
  { id: '10x8', cols: 10, rows: 8, label: '10×8' },
];
const CONNECTS = [3, 4, 5];
const TARGETS = [1, 2, 3, 0]; // wins needed, 0 = endless
const TIMERS = [0, 10, 20, 30];
const DEFAULTS = { mode: 'classic', size: '7x6', connect: 4, target: 2, timer: 0, seats: null };

const ACTIONS = {
  drop: { name: 'Drop', icon: '<circle cx="12" cy="13" r="7"/><path d="M12 2v4"/>' },
  pop: { name: 'Pop', icon: '<path d="M12 4v13M7 12l5 5 5-5M5 21h14"/>' },
  anvil: { name: 'Anvil', icon: '<path d="M3 7h13a5 5 0 0 0 5 0v3a4 4 0 0 1-4 4h-1l1 3H7l1-3c-3 0-5-2-5-4z"/><path d="M6 21h12"/>' },
  bomb: { name: 'Bomb', icon: '<circle cx="11" cy="14" r="7"/><path d="m15 9 2-2M18 3v2M21 6h-2M20 4l-1.5 1.5"/>' },
  double: { name: 'Double', icon: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>' },
};

class ConnectFour {
  constructor(stage, ctx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'c4';
    stage.append(this.root);

    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    this.cfg = { ...DEFAULTS, ...(ctx.storage.get() ?? {}) };
    if (!SIZES.some((z) => z.id === this.cfg.size)) this.cfg.size = DEFAULTS.size;
    if (!MODES.some((m) => m.id === this.cfg.mode)) this.cfg.mode = DEFAULTS.mode;
    const seated = (this.cfg.seats ?? []).map((id) => this.roster.find((p) => p.id === id)).filter(Boolean);
    this.seats = seated.length >= 2 ? [...new Set(seated)].slice(0, MAX_SEATS) : this.roster.slice(0, 2);

    this.timers = [];
    this.pending = [];
    this.locked = false;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get size() {
    return SIZES.find((z) => z.id === this.cfg.size);
  }

  /* ------------------------------------------------------------- Setup */

  showSetup() {
    const rerender = this.view === 'setup';
    this.view = 'setup';
    this.stopTimer();
    this.clearPending();
    this.locked = false;
    const scroll = this.root.querySelector('.kit-setup-scroll')?.scrollTop ?? 0;
    const c = this.cfg;
    const z = this.size;
    const preview = `<span class="c4-preview" style="--c:${z.cols}">${Array.from({ length: z.rows * z.cols }, () => '<i></i>').join('')}</span>`;
    const crowd = this.seats.length > 2 && z.cols * z.rows < 56;

    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          ${playersSection({ roster: this.roster, seats: this.seats, max: MAX_SEATS })}

          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            ${modeGrid(MODES, c.mode)}
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Board ${preview}</h3>
            ${segRow('Size', 'size', SIZES.map((s) => [s.id, s.label]), c.size)}
            ${segRow('Connect', 'connect', CONNECTS.map((n) => [n, n]), c.connect)}
            ${crowd ? '<p class="kit-hint">Tip: with 3 or 4 players, a bigger board gives everyone room.</p>' : ''}
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Match</h3>
            ${segRow('Wins needed', 'target', TARGETS.map((n) => [n, n || '∞']), c.target)}
            ${segRow('Turn timer', 'timer', TIMERS.map((n) => [n, n ? `${n}s` : 'Off']), c.timer)}
          </section>
        </div>
        <div class="kit-start">
          <button class="btn btn-primary" data-act="start">${icon('play')}Start game</button>
        </div>
      </div>`;
    this.root.querySelector('.kit-setup').classList.toggle('no-anim', rerender);
    this.root.querySelector('.kit-setup-scroll').scrollTop = scroll;
  }

  /* -------------------------------------------------------------- Match */

  startMatch() {
    this.cfg.seats = this.seats.map((p) => p.id);
    this.ctx.storage.set(this.cfg);
    this.match = { wins: Array(this.seats.length).fill(0), draws: 0, round: 0 };
    this.nextRound();
  }

  nextRound() {
    this.clearPending();
    this.match.round++;
    this.starter = (this.match.round - 1) % this.seats.length;
    const { rows, cols } = this.size;
    this.state = newRound({ mode: this.cfg.mode, rows, cols, connect: this.cfg.connect, players: this.seats.length }, this.starter);
    this.history = [];
    this.action = 'drop';
    this.locked = false;
    this.renderGame();
    this.ctx.sfx.select();
    this.startTurn();
  }

  get mode() {
    return MODES.find((m) => m.id === this.state.mode);
  }

  renderGame() {
    this.view = 'game';
    const s = this.state;
    const n = this.seats.length;
    const tray = s.mode === 'popout' ? ['drop', 'pop'] : s.mode === 'powerups' ? ['drop', 'anvil', 'bomb', 'double'] : [];

    this.root.innerHTML = `
      <div class="c4-game">
        <div class="c4-hud ${n === 2 ? 'is-duo' : ''}" style="--n:${n}">${this.seats.map((p, i) => this.playerChip(i)).join('')}</div>
        <div class="c4-status"><p class="c4-turn"></p><p class="c4-sub"></p></div>
        <div class="c4-board-wrap">
          <div class="c4-frame" style="--cols:${s.cols};--rows:${s.rows}">
            <div class="c4-rail"><span class="c4-ghost"><i></i><span class="c4-ghost-ico"></span></span></div>
            <div class="c4-board">
              <div class="c4-cells">${Array.from({ length: s.rows * s.cols }, () => '<i></i>').join('')}</div>
              <div class="c4-discs"></div>
              <svg class="c4-front" viewBox="0 0 ${s.cols * 100} ${s.rows * 100}" preserveAspectRatio="none" aria-hidden="true">${this.frontPath()}</svg>
              <div class="c4-marks"></div>
              <svg class="c4-lines" viewBox="0 0 ${s.cols * 100} ${s.rows * 100}" preserveAspectRatio="none" aria-hidden="true"></svg>
              <div class="c4-fx"></div>
            </div>
          </div>
        </div>
        ${
          tray.length
            ? `<div class="c4-tray" style="--n:${tray.length}">${tray
                .map((a) => `<button class="c4-act" data-act="action" data-v="${a}">${svgIcon(ACTIONS[a].icon)}<span>${ACTIONS[a].name}</span><b></b></button>`)
                .join('')}</div>`
            : ''
        }
        <div class="kit-controls">
          <button class="kit-ctrl" data-act="undo">${icon('undo')}<span>Undo</span></button>
          <button class="kit-ctrl" data-act="restart">${icon('replay')}<span>Restart</span></button>
          <button class="kit-ctrl" data-act="setup">${icon('settings')}<span>Setup</span></button>
        </div>
      </div>`;

    this.gameEl = this.root.querySelector('.c4-game');
    this.frame = this.root.querySelector('.c4-frame');
    this.boardEl = this.root.querySelector('.c4-board');
    this.discsEl = this.root.querySelector('.c4-discs');
    this.marksEl = this.root.querySelector('.c4-marks');
    this.linesEl = this.root.querySelector('.c4-lines');
    this.ghost = this.root.querySelector('.c4-ghost');
    this.discEls = new Map();
    this.hoverCol = null;
    this.wireBoard();
    this.sync(s.grid, false);
    this.update();
  }

  // Board face with a round window over every cell (even-odd fill punches the holes).
  frontPath() {
    const s = this.state;
    const R = 38;
    let rims = '';
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = c * 100 + 50;
        const y = r * 100 + 50;
        rims += `M${x - R} ${y}a${R} ${R} 0 1 0 ${R * 2} 0a${R} ${R} 0 1 0 ${-R * 2} 0Z`;
      }
    }
    const d = `M0 0H${s.cols * 100}V${s.rows * 100}H0Z${rims}`;
    return `
      <defs>
        <linearGradient id="c4-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a2550"/><stop offset="1" stop-color="#1a1733"/>
        </linearGradient>
      </defs>
      <path d="${d}" fill="url(#c4-face)" fill-rule="evenodd"/>
      <path d="${rims}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="3"/>`;
  }

  playerChip(seat) {
    const p = this.seats[seat];
    const target = this.cfg.target;
    return `
      <div class="c4-player" data-seat="${seat}" style="--pc:${p.color}">
        <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
        <span class="c4-player-info">
          <span class="c4-player-name">${escapeHtml(p.name)}</span>
          ${target ? `<span class="c4-pips">${Array.from({ length: target }, () => '<i></i>').join('')}</span>` : '<span class="c4-wins"></span>'}
        </span>
        ${this.cfg.mode === 'marathon' ? '<b class="c4-score">0</b>' : '<span class="c4-swatch"></span>'}
        <span class="c4-timer"><i></i></span>
      </div>`;
  }

  /* ------------------------------------------------------------ Discs */

  // Brings the disc elements in line with a grid. With animate, new discs drop
  // in from the rail, moved discs slide and removed discs play their exit.
  sync(grid, animate, removed = []) {
    const s = this.state;
    const seen = new Set();
    const ev = s.events;
    const entry = s.gravity === 1 ? -1 : s.rows;
    let longest = 0;

    grid.forEach((d, i) => {
      if (!d) return;
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      seen.add(d.id);
      let el = this.discEls.get(d.id);
      if (!el) {
        el = document.createElement('span');
        el.className = 'c4-disc';
        el.innerHTML = '<i></i>';
        el.style.setProperty('--pc', this.seats[d.p].color);
        this.discEls.set(d.id, el);
        this.discsEl.append(el);
        this.place(el, r, c);
        if (animate) {
          const heavy = ev?.placed?.id === d.id && ev.move.kind === 'anvil';
          longest = Math.max(longest, this.drop(el, Math.abs(r - entry), heavy));
          if (s.mode === 'blind') this.peek(el);
        }
      } else if (+el.dataset.r !== r || +el.dataset.c !== c) {
        const dr = +el.dataset.r - r;
        const dc = +el.dataset.c - c;
        this.place(el, r, c);
        if (animate) longest = Math.max(longest, this.slide(el, dr, dc));
      }
    });

    for (const [id, el] of this.discEls) {
      if (seen.has(id)) continue;
      this.discEls.delete(id);
      const how = removed.find((x) => x.id === id)?.how;
      if (!animate || !how) {
        el.remove();
        continue;
      }
      const out = {
        pop: [{ transform: 'none' }, { transform: `translateY(${s.gravity * 160}%)`, opacity: 0 }],
        crush: [{ transform: 'none' }, { transform: 'scale(1.2, 0.15)', opacity: 0 }],
        blast: [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'scale(1.6)', opacity: 0, filter: 'brightness(3)' }],
      }[how];
      // Crushed discs break as the anvil reaches them.
      const reach = s.gravity === 1 ? +el.dataset.r + 1 : s.rows - +el.dataset.r;
      const delay = how === 'crush' ? longest * 0.8 * Math.sqrt(reach / s.rows) : 0;
      el.classList.add('is-leaving');
      el.animate(out, { duration: how === 'pop' ? 420 : 320, delay, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished.then(
        () => el.remove(),
        () => el.remove(),
      );
      longest = Math.max(longest, 420 + delay);
    }
    return longest;
  }

  place(el, r, c) {
    el.dataset.r = r;
    el.dataset.c = c;
    el.style.left = `${(c / this.state.cols) * 100}%`;
    el.style.top = `${(r / this.state.rows) * 100}%`;
  }

  // Falls `dist` cells with a little bounce. Returns the duration in ms.
  drop(el, dist, heavy) {
    const g = this.state.gravity;
    const ms = Math.round(170 + Math.sqrt(dist) * 120);
    const from = `translateY(${-g * dist * 100}%)`;
    el.animate(
      heavy
        ? [
            { transform: from, easing: 'cubic-bezier(.6,0,1,1)' },
            { transform: 'none', offset: 0.85 },
            { transform: 'scale(1.08, 0.92)', offset: 0.92 },
            { transform: 'none' },
          ]
        : [
            { transform: from, easing: 'cubic-bezier(.55,0,1,.45)' },
            { transform: 'none', offset: 0.72, easing: 'cubic-bezier(0,.45,.45,1)' },
            { transform: `translateY(${-g * 14}%)`, offset: 0.86, easing: 'cubic-bezier(.55,0,1,.45)' },
            { transform: 'none' },
          ],
      { duration: ms },
    );
    return ms;
  }

  slide(el, dr, dc) {
    const ms = Math.round(220 + Math.sqrt(Math.abs(dr) + Math.abs(dc)) * 110);
    el.animate(
      [
        { transform: `translate(${dc * 100}%, ${dr * 100}%)`, easing: 'cubic-bezier(.55,0,1,.45)' },
        { transform: 'none', offset: 0.8, easing: 'ease-out' },
        { transform: `translateY(${-this.state.gravity * 8}%)`, offset: 0.9 },
        { transform: 'none' },
      ],
      { duration: ms },
    );
    return ms;
  }

  peek(el) {
    el.classList.add('is-peek');
    this.pending.push(setTimeout(() => el.classList.remove('is-peek'), 1100));
  }

  // Plays the move's frames one after another, then calls done().
  animateMove(done) {
    const s = this.state;
    const ev = s.events;
    const frames = ev.frames;
    let i = 0;
    const next = () => {
      const grid = frames[i];
      const last = i === frames.length - 1;
      // Removals happen on the first frame that no longer has the disc.
      const ms = this.sync(grid, true, ev.removed);
      if (i === 0) this.landFx(ev, ms);
      if (frames[i + 1] && ev.flipped && i === frames.length - 2) this.pending.push(setTimeout(() => this.flipFx(), ms));
      i++;
      if (last) this.pending.push(setTimeout(done, Math.max(ms, 120)));
      else {
        // A bomb goes off the moment it lands; a flip pauses so you can see it coming.
        const wait = ev.move.kind === 'bomb' && i === 1 ? ms * 0.72 : ms + (ev.flipped && i === frames.length - 1 ? 380 : 60);
        this.pending.push(setTimeout(next, wait));
      }
    };
    next();
  }

  landFx(ev, ms) {
    const { kind } = ev.move;
    const seat = ev.seat;
    const sfx = this.ctx.sfx;
    const base = 260 + seat * 40;
    if (kind === 'pop') {
      sfx.tone({ freq: 520, to: 260, dur: 0.18, type: 'triangle', gain: 0.045 });
      this.ctx.haptic(10);
      this.shake('pop');
      return;
    }
    sfx.tone({ freq: base * 2, to: base, dur: ms / 1000, type: 'sine', gain: 0.018 });
    this.pending.push(
      setTimeout(() => {
        if (kind === 'anvil') {
          sfx.tone({ freq: 90, to: 40, dur: 0.35, type: 'square', gain: 0.05 });
          sfx.tone({ freq: 1800, to: 900, dur: 0.12, type: 'triangle', gain: 0.03 });
          this.shake('heavy');
          this.ctx.haptic(35);
        } else if (kind === 'bomb') {
          sfx.tone({ freq: 160, to: 30, dur: 0.5, type: 'sawtooth', gain: 0.05 });
          sfx.tone({ freq: 70, to: 30, dur: 0.6, type: 'square', gain: 0.04, delay: 0.03 });
          this.burst(ev.bomb.r, ev.bomb.c);
          this.shake('heavy');
          this.ctx.haptic(40);
        } else {
          sfx.tone({ freq: base * 1.6, dur: 0.07, type: 'triangle', gain: 0.05 });
          sfx.tone({ freq: base * 0.8, dur: 0.1, type: 'square', gain: 0.018 });
          this.ctx.haptic(12);
        }
        ev.scored.forEach((w, k) => this.pending.push(setTimeout(() => this.scoreFx(w), 200 + k * 160)));
      }, ms * 0.72),
    );
  }

  flipFx() {
    this.ctx.sfx.tone({ freq: 180, to: 760, dur: 0.4, type: 'triangle', gain: 0.04 });
    this.ctx.sfx.tone({ freq: 360, to: 1520, dur: 0.4, type: 'sine', gain: 0.015, delay: 0.05 });
    this.ctx.haptic(20);
    this.frame.classList.toggle('is-up', this.state.gravity === -1);
    this.flash('Gravity flipped!');
  }

  flash(text) {
    const el = document.createElement('span');
    el.className = 'c4-flash';
    el.textContent = text;
    this.boardEl.querySelector('.c4-fx').append(el);
    setTimeout(() => el.remove(), 1300);
  }

  burst(r, c) {
    const s = this.state;
    const el = document.createElement('span');
    el.className = 'c4-burst';
    el.style.cssText = `left:${((c + 0.5) / s.cols) * 100}%;top:${((r + 0.5) / s.rows) * 100}%;width:${(300 / s.cols) * 1.1}%`;
    this.boardEl.querySelector('.c4-fx').append(el);
    setTimeout(() => el.remove(), 700);
  }

  shake(kind) {
    this.boardEl.classList.remove('is-shake', 'is-shake-heavy');
    void this.boardEl.offsetWidth;
    this.boardEl.classList.add(kind === 'heavy' ? 'is-shake-heavy' : 'is-shake');
  }

  scoreFx(w) {
    const s = this.state;
    const [a, b] = [w.cells[0], w.cells[w.cells.length - 1]];
    const x = (((a % s.cols) + (b % s.cols)) / 2 + 0.5) / s.cols;
    const y = ((Math.floor(a / s.cols) + Math.floor(b / s.cols)) / 2 + 0.5) / s.rows;
    const el = document.createElement('span');
    el.className = 'c4-float';
    el.style.cssText = `left:${x * 100}%;top:${y * 100}%;--pc:${this.seats[w.p].color}`;
    el.textContent = '+1';
    this.boardEl.querySelector('.c4-fx').append(el);
    setTimeout(() => el.remove(), 1100);
    const f = 523.25 * Math.pow(2, (Math.min(this.state.scores[w.p], 12) * 2) / 12);
    this.ctx.sfx.tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.045 });
    this.ctx.sfx.tone({ freq: f * 1.5, dur: 0.28, type: 'sine', gain: 0.02, delay: 0.05 });
    this.drawLines();
  }

  // Win lines (and Marathon's scored lines) drawn through disc centres.
  drawLines() {
    const s = this.state;
    const seg = (cells, p, cls) => {
      const a = cells[0];
      const b = cells[cells.length - 1];
      const x = (i) => (i % s.cols) * 100 + 50;
      const y = (i) => Math.floor(i / s.cols) * 100 + 50;
      return `<line class="${cls}" x1="${x(a)}" y1="${y(a)}" x2="${x(b)}" y2="${y(b)}" style="--pc:${this.seats[p].color}" pathLength="1"/>`;
    };
    let html = '';
    if (s.mode === 'marathon') html += s.scored.map((w) => seg(w.cells, w.p, 'c4-scored')).join('');
    if (s.result) html += s.result.lines.map((l) => seg(l.cells, l.p, 'c4-winline')).join('');
    this.linesEl.innerHTML = html;
  }

  /* ------------------------------------------------------------ Board input */

  // Press to pick a column, slide to adjust, release to drop.
  wireBoard() {
    const frame = this.frame;
    let pressing = false;
    const colAt = (e) => {
      const rect = this.boardEl.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * this.state.cols);
      return Math.max(0, Math.min(this.state.cols - 1, c));
    };
    frame.addEventListener('pointerdown', (e) => {
      if (this.locked || this.state.result) return;
      pressing = true;
      frame.setPointerCapture(e.pointerId);
      this.setHover(colAt(e));
    });
    frame.addEventListener('pointermove', (e) => pressing && this.setHover(colAt(e)));
    frame.addEventListener('pointerup', () => {
      if (!pressing) return;
      pressing = false;
      const col = this.hoverCol;
      this.setHover(null);
      if (col != null) this.move({ kind: this.action, col });
    });
    frame.addEventListener('pointercancel', () => {
      pressing = false;
      this.setHover(null);
    });
  }

  setHover(col) {
    if (col === this.hoverCol) return;
    this.hoverCol = col;
    this.renderHover();
    if (col != null) this.ctx.haptic(4);
  }

  // Ghost disc in the rail plus a preview of what the move will do.
  renderHover() {
    const s = this.state;
    const col = this.hoverCol;
    const ghost = this.ghost;
    this.marksEl.innerHTML = '';
    this.discEls.forEach((el) => el.classList.remove('is-target'));
    ghost.classList.toggle('on', col != null);
    if (col == null) return;

    const m = { kind: this.action, col };
    const ok = isLegal(s, m);
    ghost.style.left = `${(col / s.cols) * 100}%`;
    ghost.classList.toggle('is-bad', !ok);
    if (!ok) return;

    const mark = (r, c, cls) => {
      const el = document.createElement('span');
      el.className = `c4-mark ${cls}`;
      el.style.cssText = `left:${(c / s.cols) * 100}%;top:${(r / s.rows) * 100}%`;
      this.marksEl.append(el);
    };
    const target = (r, c) => {
      const d = cell(s, r, c);
      if (d) this.discEls.get(d.id)?.classList.add('is-target');
    };
    if (m.kind === 'pop') target(floorRow(s), col);
    else if (m.kind === 'anvil') {
      for (let r = 0; r < s.rows; r++) target(r, col);
      mark(floorRow(s), col, 'is-land');
    } else {
      const r = landingRow(s, col);
      mark(r, col, 'is-land');
      if (m.kind === 'bomb') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) target(r + dr, col + dc);
    }
  }

  /* ------------------------------------------------------------- Turns */

  move(m) {
    if (this.locked) return;
    if (!isLegal(this.state, m)) {
      this.ctx.sfx.deny();
      this.ctx.haptic(6);
      if (m.kind === 'pop') this.ctx.toast('Pick a column with your disc on the bottom.', { icon: 'info', duration: 1700 });
      return;
    }
    this.stopTimer();
    this.history.push(this.state);
    this.state = play(this.state, m);
    this.action = 'drop';
    this.locked = true;
    this.update();
    this.animateMove(() => {
      this.locked = false;
      this.drawLines();
      if (this.state.result) this.endRound();
      else {
        this.update();
        this.startTurn();
      }
    });
  }

  update() {
    const s = this.state;
    const p = this.seats[s.turn];

    this.gameEl.style.setProperty('--tc', p.color);
    this.ghost.style.setProperty('--pc', p.color);
    this.ghost.dataset.kind = this.action;
    this.ghost.querySelector('.c4-ghost-ico').innerHTML = this.action === 'drop' ? '' : svgIcon(ACTIONS[this.action].icon);
    this.frame.classList.toggle('is-up', s.gravity === -1);
    this.frame.classList.toggle('is-blind', s.mode === 'blind' && !s.result);

    this.root.querySelectorAll('.c4-player').forEach((el) => {
      const seat = +el.dataset.seat;
      el.classList.toggle('is-active', seat === s.turn && !s.result);
      const score = el.querySelector('.c4-score');
      if (score) score.textContent = s.scores[seat];
      el.querySelectorAll('.c4-pips i').forEach((pip, j) => pip.classList.toggle('on', j < this.match.wins[seat]));
      const wins = el.querySelector('.c4-wins');
      if (wins) wins.textContent = this.match.wins[seat] ? `${this.match.wins[seat]} win${this.match.wins[seat] === 1 ? '' : 's'}` : '';
    });

    this.root.querySelectorAll('.c4-act').forEach((el) => {
      const a = el.dataset.v;
      const left = s.powers?.[s.turn][a];
      el.classList.toggle('on', this.action === a);
      el.style.setProperty('--pc', p.color);
      el.querySelector('b').textContent = left == null ? '' : left;
      el.disabled = !!s.result || (left != null && (!left || (a === 'double' && s.bonus)));
    });

    const turn = this.root.querySelector('.c4-turn');
    const sub = this.root.querySelector('.c4-sub');
    if (s.result) {
      const names = s.result.winners.map((i) => escapeHtml(this.seats[i].name));
      turn.innerHTML = s.result.winners.length === 1 ? `<span><b>${names[0]}</b> wins the round</span>` : s.result.winners.length ? '<b>It’s a tie</b>' : '<b>It’s a draw</b>';
      sub.textContent = '';
    } else {
      turn.innerHTML = `<span class="c4-turn-dot" style="--pc:${p.color}"></span><span><b>${escapeHtml(p.name)}</b>’s turn</span>`;
      const left = FLIP_EVERY - (s.moves % FLIP_EVERY);
      if (s.bonus) sub.innerHTML = '<span class="c4-chip">Double</span> Drop again!';
      else if (this.action !== 'drop') sub.textContent = { pop: 'Tap a column to pop your bottom disc.', anvil: 'Anvil smashes a whole column.', bomb: 'Bomb blasts every disc around it.', double: 'Drop two discs this turn.' }[this.action];
      else if (s.mode === 'flip') sub.innerHTML = left === 1 ? '<span class="c4-chip">Flip!</span> Gravity flips after this move' : `Gravity flips in <b>${left}</b> moves`;
      else sub.textContent = this.mode.hint.replace('{n}', s.connect);
    }

    const undo = this.root.querySelector('[data-act="undo"]');
    undo.disabled = !this.history.length || !!s.result;
  }

  startTurn() {
    this.stopTimer();
    if (this.state.result) return;
    const player = this.seats[this.state.turn];
    if (isBot(player)) return this.botMove(player);
    if (!this.cfg.timer) return;
    const ms = this.cfg.timer * 1000;
    const bar = this.root.querySelector(`.c4-player[data-seat="${this.state.turn}"] .c4-timer i`);
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = `kit-timer ${ms}ms linear forwards`;
    }
    [3, 2, 1].forEach((t) => this.timers.push(setTimeout(() => this.ctx.sfx.tick(), ms - t * 1000)));
    this.timers.push(setTimeout(() => this.timeUp(), ms));
  }

  // The bot hovers over its column for a beat (showing what the move does), then plays.
  botMove(player) {
    this.locked = true;
    this.root.querySelector('.c4-turn').innerHTML = `<span class="c4-turn-dot" style="--pc:${player.color}"></span>${thinking(player)}`;
    botTurn(
      this,
      () => chooseMove(this.state, botLevel(player)),
      (m) => {
        this.action = m.kind;
        this.update();
        this.setHover(m.col);
        this.pending.push(
          setTimeout(() => {
            this.setHover(null);
            this.locked = false;
            this.move(m);
          }, 420),
        );
      },
      { min: 500 },
    );
  }

  stopTimer() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.root.querySelectorAll('.c4-timer i').forEach((bar) => (bar.style.animation = 'none'));
  }

  clearPending() {
    this.pending.forEach(clearTimeout);
    this.pending = [];
  }

  timeUp() {
    const moves = legalMoves(this.state);
    if (!moves.length || this.locked) return;
    this.setHover(null);
    this.action = 'drop';
    this.ctx.toast('Time’s up! Random drop.', { icon: 'clock', duration: 1600 });
    this.move(moves[Math.floor(Math.random() * moves.length)]);
  }

  undo() {
    if (!this.history.length || this.state.result || this.locked) return;
    cancelBot(this);
    // Step back past the bots' moves to the last turn a person took
    do this.state = this.history.pop();
    while (this.history.length && isBot(this.seats[this.state.turn]));
    this.action = 'drop';
    this.ctx.sfx.close();
    this.ctx.haptic();
    // Rebuild the discs instantly; undo shouldn't replay animations backwards.
    this.discEls.forEach((el) => el.remove());
    this.discEls.clear();
    this.sync(this.state.grid, false);
    this.drawLines();
    this.update();
    this.startTurn();
  }

  /* ------------------------------------------------------------ Results */

  endRound() {
    this.stopTimer();
    this.locked = true;
    const s = this.state;
    const { winners } = s.result;
    if (winners.length === 1) this.match.wins[winners[0]]++;
    else this.match.draws++;
    this.update();
    this.drawLines();
    const cells = new Set(s.result.cells);
    s.grid.forEach((d, i) => d && this.discEls.get(d.id)?.classList.toggle('is-win', cells.has(i)));
    if (cells.size) this.frame.classList.add('has-win');
    if (winners.length === 1) this.pending.push(setTimeout(() => this.ctx.sfx.win(), 250));
    else this.ctx.sfx.draw();
    const t = this.cfg.target;
    const matchOver = t > 0 && winners.length === 1 && this.match.wins[winners[0]] >= t;
    this.pending.push(setTimeout(() => this.showResult(matchOver), s.mode === 'blind' ? 1900 : 1400));
  }

  showResult(matchOver) {
    const s = this.state;
    const { winners } = s.result;
    const single = winners.length === 1;
    const winner = single ? this.seats[winners[0]] : null;
    const marathon = s.mode === 'marathon';
    const pts = (n) => `${n} point${n === 1 ? '' : 's'}`;

    let title;
    let sub;
    if (single) {
      title = matchOver ? `${escapeHtml(winner.name)} takes the match!` : `${escapeHtml(winner.name)} wins!`;
      if (marathon) sub = `Won with ${pts(s.scores[winners[0]])}.`;
      else if (winners[0] !== s.events?.seat) sub = 'Handed the win by someone else’s move!';
      else sub = `Connected ${Math.max(...s.result.lines.map((l) => l.cells.length))} in ${s.moves} moves.`;
    } else if (winners.length) {
      title = 'It’s a tie!';
      sub = `${winners.map((i) => escapeHtml(this.seats[i].name)).join(' & ')} ${marathon ? 'share the top score' : 'connected together'}.`;
    } else {
      title = 'It’s a draw!';
      sub = s.grid.every(Boolean) ? 'The board is full.' : 'Nobody can break through.';
    }

    const two = this.seats.length === 2;
    let table = '';
    if (marathon || !two) {
      const order = this.seats
        .map((p, seat) => ({ seat, v: marathon ? s.scores[seat] : this.match.wins[seat] }))
        .sort((a, b) => b.v - a.v || a.seat - b.seat);
      table = `<ol class="c4-standings">${order
        .map((row) => {
          const p = this.seats[row.seat];
          const rank = order.filter((o) => o.v > row.v).length;
          const w = this.match.wins[row.seat];
          const extra = marathon ? `points${w ? ` · ${w} win${w === 1 ? '' : 's'}` : ''}` : `win${row.v === 1 ? '' : 's'}`;
          return `
            <li class="${winners.includes(row.seat) ? 'is-top' : ''}" style="--pc:${p.color}">
              <span class="c4-rank">${rank + 1}</span>
              <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
              <span class="c4-st-name">${escapeHtml(p.name)}<small>${extra}</small></span>
              <b>${row.v}</b>
            </li>`;
        })
        .join('')}</ol>`;
    } else {
      const [p0, p1] = this.seats;
      table = `
        <div class="kit-result-score">
          <span style="--pc:${p0.color}"><em>${escapeHtml(p0.name)}</em><b>${this.match.wins[0]}</b></span>
          <i></i>
          <span style="--pc:${p1.color}"><b>${this.match.wins[1]}</b><em>${escapeHtml(p1.name)}</em></span>
        </div>
        ${this.match.draws ? `<p class="kit-result-draws">${this.match.draws} draw${this.match.draws === 1 ? '' : 's'}</p>` : ''}`;
    }

    const heroSeats = single ? [] : winners.length ? winners : this.seats.map((_, i) => i);
    const overlay = document.createElement('div');
    overlay.className = 'kit-result';
    overlay.innerHTML = `
      <div class="kit-result-card ${this.seats.length > 2 ? 'is-compact' : ''}" style="--pc:${winner?.color ?? '#a1a1aa'}">
        <div class="kit-result-hero ${single ? '' : 'c4-tie'}">
          ${
            single
              ? `${matchOver ? `<span class="kit-trophy">${icon('trophy')}</span>` : ''}<span class="avatar" style="--pc:${winner.color}">${initial(winner)}</span>`
              : heroSeats.map((i) => `<span class="c4-hero-disc" style="--pc:${this.seats[i].color}"></span>`).join('')
          }
        </div>
        <p class="kit-result-eyebrow">${matchOver ? 'Match winner' : `Round ${this.match.round}`}</p>
        <h2>${title}</h2>
        <p class="kit-result-sub">${sub}</p>
        ${table}
        <div class="kit-result-actions">
          ${
            matchOver
              ? `<button class="btn btn-primary" data-act="rematch">${icon('replay')}Rematch</button>`
              : `<button class="btn btn-primary" data-act="next">${icon('play')}Next round</button>`
          }
          <button class="btn btn-glass" data-act="setup-now">${icon('settings')}Setup</button>
        </div>
      </div>`;
    this.gameEl.append(overlay);

    if (single) {
      this.ctx.confetti({ colors: [winner.color, '#ffffff', '#f59e0b', winner.color] });
      if (matchOver) this.pending.push(setTimeout(() => this.ctx.confetti({ colors: [winner.color, '#ffffff', '#f59e0b'] }), 700));
    }
  }

  /* ------------------------------------------------------------ Input */

  async confirmThen(opts, fn) {
    this.stopTimer();
    if (await this.ctx.confirm(opts)) fn();
    else this.startTurn();
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
      case 'size':
        return setup(() => (c.size = v));
      case 'connect':
        return setup(() => (c.connect = +v));
      case 'target':
        return setup(() => (c.target = +v));
      case 'timer':
        return setup(() => (c.timer = +v));
      case 'start':
        return this.startMatch();

      case 'action':
        if (this.locked) return;
        this.action = this.action === v ? 'drop' : v;
        this.ctx.sfx.tap();
        this.ctx.haptic();
        return this.update();
      case 'undo':
        return this.undo();
      case 'restart':
        if (this.locked || !this.state.moves) return;
        return this.confirmThen({ title: 'Restart this round?', message: 'The board will be cleared.', confirmLabel: 'Restart' }, () => {
          this.match.round--;
          this.nextRound();
        });
      case 'setup':
        if (this.locked) return;
        if (this.match.round === 1 && !this.state.moves) return this.showSetup();
        return this.confirmThen(
          { title: 'Change setup?', message: 'This match and its scores will end.', confirmLabel: 'End match', danger: true },
          () => this.showSetup(),
        );
      case 'next':
        return this.nextRound();
      case 'rematch':
        this.match = { wins: Array(this.seats.length).fill(0), draws: 0, round: 0 };
        return this.nextRound();
      case 'setup-now':
        return this.showSetup();
    }
  }

  destroy() {
    this.stopTimer();
    this.clearPending();
  }
}

export default {
  async mount(stage, ctx) {
    const link = await loadStyles(new URL('./style.css', import.meta.url).href);
    const game = new ConnectFour(stage, ctx);
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};
