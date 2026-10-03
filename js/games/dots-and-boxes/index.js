import { newRound, play, isPlayable, legalMoves, edgeInfo, edgeId, boxesOf, standings } from './engine.js';
import { icon } from '../../icons.js';
import { escapeHtml } from '../../ui.js';
import { playersSection, toggleSeat, shuffle, loadStyles, initial, isBot, thinking, botTurn, cancelBot } from '../kit.js';
import { botLevel } from '../../bots.js';
import { chooseMove } from './ai.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#8b5cf6' },
  { id: 'guest-2', name: 'Player 2', color: '#ec4899' },
];
const MAX_SEATS = 4;

const MODES = [
  {
    id: 'classic',
    name: 'Classic',
    desc: 'Close a box to claim it, then go again.',
    hint: 'Close a box to claim it and go again.',
    icon: '<path d="M5 5h14v14H5z" opacity=".35"/><path d="M5 5h7v7H5z"/>',
  },
  {
    id: 'treasure',
    name: 'Treasure',
    desc: 'Gold boxes score big. Skulls cost you.',
    hint: 'Gold boxes score big. Skulls cost points.',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  },
  {
    id: 'islands',
    name: 'Islands',
    desc: 'Holes carve the board into islands.',
    hint: 'Holes aren’t boxes. Plan around them.',
    icon: '<path d="M4 4h6v6H4zM14 14h6v6h-6z"/><path d="M14 4h6v6h-6zM4 14h6v6H4z" opacity=".3" stroke-dasharray="2 2"/>',
  },
  {
    id: 'reverse',
    name: 'Reverse',
    desc: 'Fewest points wins. Dodge every box.',
    hint: 'Fewest points wins. Avoid closing boxes!',
    icon: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  },
  {
    id: 'strict',
    name: 'Strict',
    desc: 'No free moves. Closing a box ends your turn.',
    hint: 'Closing a box ends your turn. No free moves.',
    icon: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  },
];

const SIZES = [
  { id: '3x3', rows: 3, cols: 3, label: '3×3' },
  { id: '4x4', rows: 4, cols: 4, label: '4×4' },
  { id: '5x5', rows: 5, cols: 5, label: '5×5' },
  { id: '6x6', rows: 6, cols: 6, label: '6×6' },
  { id: '6x8', rows: 8, cols: 6, label: '6×8' },
];
const TARGETS = [1, 2, 3, 0]; // wins needed, 0 = endless
const TIMERS = [0, 10, 20, 30];
const DEFAULTS = { mode: 'classic', size: '4x4', target: 2, timer: 0, seats: null };

const S = 100; // spacing between dots in SVG units
const PAD = 28;

const svgIcon = (paths) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const fmt = (v) => (v < 0 ? `−${-v}` : `+${v}`);

class DotsAndBoxes {
  constructor(stage, ctx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'dab';
    stage.append(this.root);

    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    this.cfg = { ...DEFAULTS, ...(ctx.storage.get() ?? {}) };
    if (!SIZES.some((z) => z.id === this.cfg.size)) this.cfg.size = DEFAULTS.size;
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
    const opt = (key, value, label) =>
      `<button class="${c[key] === value ? 'on' : ''}" data-act="${key}" data-v="${value}">${label}</button>`;

    const preview = `<span class="dab-preview" style="--c:${z.cols + 1}">${Array.from({ length: (z.rows + 1) * (z.cols + 1) }, () => '<i></i>').join('')}</span>`;

    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          ${playersSection({ roster: this.roster, seats: this.seats, max: MAX_SEATS })}

          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            <div class="kit-modes">
              ${MODES.map(
                (m) => `
                <button class="kit-mode ${c.mode === m.id ? 'on' : ''}" data-act="mode" data-v="${m.id}">
                  <span class="kit-mode-ico">${svgIcon(m.icon)}</span>
                  <strong>${m.name}</strong>
                  <small>${m.desc}</small>
                </button>`,
              ).join('')}
            </div>
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Board ${preview}</h3>
            <div class="kit-row"><span class="kit-label">Boxes</span><div class="kit-seg">${SIZES.map((s) => opt('size', s.id, s.label)).join('')}</div></div>
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Match</h3>
            <div class="kit-row"><span class="kit-label">Wins needed</span><div class="kit-seg">${TARGETS.map((n) => opt('target', n, n || '∞')).join('')}</div></div>
            <div class="kit-row"><span class="kit-label">Turn timer</span><div class="kit-seg">${TIMERS.map((n) => opt('timer', n, n ? `${n}s` : 'Off')).join('')}</div></div>
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
    this.match = { wins: Array(this.seats.length).fill(0), round: 0 };
    this.nextRound();
  }

  nextRound() {
    this.clearPending();
    this.match.round++;
    this.starter = (this.match.round - 1) % this.seats.length;
    const { rows, cols } = this.size;
    this.state = newRound({ mode: this.cfg.mode, rows, cols, players: this.seats.length }, this.starter);
    this.history = [];
    this.locked = false;
    this.renderGame();
    this.ctx.sfx.select();
    this.startTurn();
  }

  renderGame() {
    this.view = 'game';
    const s = this.state;
    const W = s.cols * S + PAD * 2;
    const H = s.rows * S + PAD * 2;

    this.root.innerHTML = `
      <div class="dab-game">
        <div class="dab-hud ${this.seats.length === 2 ? 'is-duo' : ''}" style="--n:${this.seats.length}">${this.seats.map((p, i) => this.playerChip(i)).join('')}</div>
        <div class="dab-status"><p class="dab-turn"></p><p class="dab-sub"></p></div>
        <div class="dab-board-wrap">
          <div class="dab-board-box" style="--ar:${W / H}">
            ${this.boardSvg(W, H)}
            <div class="dab-fx"></div>
          </div>
        </div>
        <div class="kit-controls">
          <button class="kit-ctrl" data-act="undo">${icon('undo')}<span>Undo</span></button>
          <button class="kit-ctrl" data-act="restart">${icon('replay')}<span>Restart</span></button>
          <button class="kit-ctrl" data-act="setup">${icon('settings')}<span>Setup</span></button>
        </div>
      </div>`;

    this.gameEl = this.root.querySelector('.dab-game');
    this.svg = this.root.querySelector('.dab-svg');
    this.previewEl = this.svg.querySelector('.dab-preview-line');
    this.lineEls = [];
    this.svg.querySelectorAll('.dab-line').forEach((el) => (this.lineEls[+el.dataset.e] = el));
    this.boxEls = [];
    this.svg.querySelectorAll('.dab-box').forEach((el) => (this.boxEls[+el.dataset.b] = el));
    this.wireBoard();
    this.update(false);
  }

  playerChip(seat) {
    const p = this.seats[seat];
    const target = this.cfg.target;
    return `
      <div class="dab-player" data-seat="${seat}" style="--pc:${p.color}">
        <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
        <span class="dab-player-info">
          <span class="dab-player-name">${escapeHtml(p.name)}</span>
          ${target ? `<span class="dab-pips">${Array.from({ length: target }, () => '<i></i>').join('')}</span>` : '<span class="dab-wins"></span>'}
        </span>
        <b class="dab-score">0</b>
        <span class="dab-timer"><i></i></span>
      </div>`;
  }

  boardSvg(W, H) {
    const s = this.state;
    const dot = (r, c) => [PAD + c * S, PAD + r * S];
    const boxAt = (r, c) => (r >= 0 && r < s.rows && c >= 0 && c < s.cols ? s.boxes[r * s.cols + c] : null);

    const boxes = s.boxes
      .map((b, i) => {
        const r = Math.floor(i / s.cols);
        const c = i % s.cols;
        const [x, y] = dot(r, c);
        if (b.hole) return `<rect class="dab-hole" x="${x + 14}" y="${y + 14}" width="${S - 28}" height="${S - 28}" rx="16"/>`;
        const cx = x + S / 2;
        const cy = y + S / 2;
        const badge =
          b.value === 1
            ? ''
            : `<g class="dab-val ${b.value > 0 ? 'is-gold' : 'is-skull'}"><circle cx="${cx}" cy="${cy}" r="19"/><text x="${cx}" y="${cy}">${fmt(b.value)}</text></g>`;
        return `
          <g class="dab-box ${b.value === 1 ? '' : 'has-val'}" data-b="${i}">
            <rect x="${x + 9}" y="${y + 9}" width="${S - 18}" height="${S - 18}" rx="16"/>
            <text class="dab-initial" x="${cx}" y="${cy}"></text>
            ${badge}
          </g>`;
      })
      .join('');

    const lines = s.lines
      .map((_, id) => {
        if (!boxesOf(s, id).length) return '';
        const { t, r, c } = edgeInfo(s, id);
        const [x1, y1] = dot(r, c);
        const [x2, y2] = t === 'h' ? dot(r, c + 1) : dot(r + 1, c);
        return `<line class="dab-line" data-e="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="1"/>`;
      })
      .join('');

    let dots = '';
    for (let r = 0; r <= s.rows; r++) {
      for (let c = 0; c <= s.cols; c++) {
        const touches = [boxAt(r - 1, c - 1), boxAt(r - 1, c), boxAt(r, c - 1), boxAt(r, c)].some((b) => b && !b.hole);
        if (!touches) continue;
        const [x, y] = dot(r, c);
        dots += `<circle class="dab-dot" cx="${x}" cy="${y}" r="7"/>`;
      }
    }

    return `
      <svg class="dab-svg" viewBox="0 0 ${W} ${H}" aria-label="Dots and boxes board">
        <g class="dab-boxes">${boxes}</g>
        <g class="dab-lines">${lines}</g>
        <line class="dab-preview-line" pathLength="1"/>
        <g class="dab-dots">${dots}</g>
      </svg>`;
  }

  /* ------------------------------------------------------------ Board input */

  // Press, slide to adjust, release to draw. Picks the closest open line to the finger.
  wireBoard() {
    const svg = this.svg;
    let pressing = false;
    svg.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      pressing = true;
      svg.setPointerCapture(e.pointerId);
      this.setPreview(this.edgeAt(e));
    });
    svg.addEventListener('pointermove', (e) => pressing && this.setPreview(this.edgeAt(e)));
    svg.addEventListener('pointerup', () => {
      if (!pressing) return;
      pressing = false;
      const id = this.previewId;
      this.setPreview(null);
      if (id != null) this.move(id);
    });
    svg.addEventListener('pointercancel', () => {
      pressing = false;
      this.setPreview(null);
    });
  }

  edgeAt(e) {
    const s = this.state;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    const gx = (pt.x - PAD) / S;
    const gy = (pt.y - PAD) / S;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const cands = [];
    const hr = Math.round(gy);
    const hc = clamp(Math.floor(gx), 0, s.cols - 1);
    if (hr >= 0 && hr <= s.rows && gx > -0.4 && gx < s.cols + 0.4) cands.push({ id: edgeId(s, 'h', hr, hc), d: Math.abs(gy - hr) });
    const vc = Math.round(gx);
    const vr = clamp(Math.floor(gy), 0, s.rows - 1);
    if (vc >= 0 && vc <= s.cols && gy > -0.4 && gy < s.rows + 0.4) cands.push({ id: edgeId(s, 'v', vr, vc), d: Math.abs(gx - vc) });
    const hit = cands.sort((a, b) => a.d - b.d).find((c) => c.d < 0.5 && isPlayable(s, c.id));
    return hit ? hit.id : null;
  }

  setPreview(id) {
    if (id === this.previewId) return;
    this.previewId = id;
    const el = this.previewEl;
    if (id == null) {
      el.classList.remove('on');
      return;
    }
    const src = this.lineEls[id];
    ['x1', 'y1', 'x2', 'y2'].forEach((a) => el.setAttribute(a, src.getAttribute(a)));
    el.style.setProperty('--pc', this.seats[this.state.turn].color);
    el.classList.add('on');
    this.ctx.haptic(4);
  }

  /* ------------------------------------------------------------- Turns */

  move(id) {
    if (this.locked || !isPlayable(this.state, id)) return;
    const prev = this.state;
    this.history.push(prev);
    this.state = play(prev, id);
    const s = this.state;
    const seat = prev.turn;

    const base = 330 + seat * 55;
    this.ctx.sfx.tone({ freq: base, to: base * 1.45, dur: 0.09, type: 'triangle', gain: 0.045 });
    this.ctx.haptic(8);

    if (s.claimed.length) {
      const step = Math.min(s.chain || s.claimed.length, 10) - 1;
      const f = 523.25 * Math.pow(2, (step * 2) / 12);
      this.pending.push(
        setTimeout(() => {
          this.ctx.sfx.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.05 });
          this.ctx.sfx.tone({ freq: f * 1.5, dur: 0.3, type: 'sine', gain: 0.025, delay: 0.06 });
          const values = s.claimed.map((b) => s.boxes[b].value);
          if (values.some((v) => v > 1)) this.ctx.sfx.tone({ freq: 2093, dur: 0.4, gain: 0.02, delay: 0.12 });
          if (values.some((v) => v < 0)) this.ctx.sfx.tone({ freq: 160, to: 90, dur: 0.3, type: 'square', gain: 0.03 });
        }, 120),
      );
      this.ctx.haptic(18);
      s.claimed.forEach((b) => this.floatPoints(b, s.boxes[b].value, this.seats[seat].color));
    }

    this.update();
    if (s.result) this.endRound();
    else this.startTurn();
  }

  floatPoints(b, value, color) {
    const s = this.state;
    const W = s.cols * S + PAD * 2;
    const H = s.rows * S + PAD * 2;
    const r = Math.floor(b / s.cols);
    const c = b % s.cols;
    const el = document.createElement('span');
    el.className = `dab-float ${value < 0 ? 'is-neg' : value > 1 ? 'is-gold' : ''}`;
    el.style.cssText = `left:${((PAD + (c + 0.5) * S) / W) * 100}%;top:${((PAD + (r + 0.5) * S) / H) * 100}%;--pc:${color}`;
    el.textContent = fmt(value);
    this.root.querySelector('.dab-fx').append(el);
    setTimeout(() => el.remove(), 1100);
  }

  update(animate = true) {
    const s = this.state;

    this.lineEls.forEach((el, id) => {
      if (!el) return;
      const owner = s.lines[id];
      const key = owner === null ? '' : String(owner);
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.classList.toggle('is-drawn', !!key);
        el.classList.remove('is-new');
        if (key) {
          el.style.setProperty('--pc', this.seats[owner].color);
          if (animate) {
            void el.getBBox();
            el.classList.add('is-new');
          }
        }
      }
      el.classList.toggle('is-last', id === s.last && !s.result);
    });

    this.boxEls.forEach((el, b) => {
      if (!el) return;
      const owner = s.boxes[b].owner;
      const key = owner === null ? '' : String(owner);
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.classList.toggle('is-claimed', !!key);
      el.classList.toggle('is-new', !!key && animate);
      if (key) el.style.setProperty('--pc', this.seats[owner].color);
      el.querySelector('.dab-initial').textContent = key ? this.seats[owner].name.trim()[0]?.toUpperCase() ?? '' : '';
    });

    this.gameEl.style.setProperty('--tc', this.seats[s.turn].color);
    this.root.querySelectorAll('.dab-player').forEach((el) => {
      const seat = +el.dataset.seat;
      el.classList.toggle('is-active', seat === s.turn && !s.result);
      el.querySelector('.dab-score').textContent = s.scores[seat];
      el.querySelectorAll('.dab-pips i').forEach((pip, j) => pip.classList.toggle('on', j < this.match.wins[seat]));
      const wins = el.querySelector('.dab-wins');
      if (wins) wins.textContent = this.match.wins[seat] ? `${this.match.wins[seat]} win${this.match.wins[seat] === 1 ? '' : 's'}` : '';
    });

    const turn = this.root.querySelector('.dab-turn');
    const sub = this.root.querySelector('.dab-sub');
    if (s.result) {
      const names = s.result.winners.map((i) => escapeHtml(this.seats[i].name));
      turn.innerHTML = s.result.winners.length === 1 ? `<span><b>${names[0]}</b> wins the round</span>` : '<b>It’s a tie</b>';
      sub.textContent = '';
    } else {
      const p = this.seats[s.turn];
      turn.innerHTML = `<span class="dab-turn-dot" style="--pc:${p.color}"></span><span><b>${escapeHtml(p.name)}</b>’s turn</span>`;
      const mode = MODES.find((m) => m.id === s.mode);
      if (s.chain >= 2) sub.innerHTML = `<span class="dab-chain">Chain ×${s.chain}</span> Keep going!`;
      else if (s.chain === 1) sub.textContent = 'Box claimed. Go again!';
      else sub.textContent = mode.hint;
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
    const bar = this.root.querySelector(`.dab-player[data-seat="${this.state.turn}"] .dab-timer i`);
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = `kit-timer ${ms}ms linear forwards`;
    }
    [3, 2, 1].forEach((t) => this.timers.push(setTimeout(() => this.ctx.sfx.tick(), ms - t * 1000)));
    this.timers.push(setTimeout(() => this.timeUp(), ms));
  }

  // The bot's line glows for a moment before it's drawn. Chains go quicker.
  botMove(player) {
    this.locked = true;
    if (!this.state.chain) this.root.querySelector('.dab-turn').innerHTML = `<span class="dab-turn-dot" style="--pc:${player.color}"></span>${thinking(player)}`;
    botTurn(
      this,
      () => chooseMove(this.state, botLevel(player)),
      (id) => {
        this.setPreview(id);
        this.pending.push(
          setTimeout(() => {
            this.setPreview(null);
            this.locked = false;
            this.move(id);
          }, 260),
        );
      },
      { min: this.state.chain ? 160 : 520 },
    );
  }

  stopTimer() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.root.querySelectorAll('.dab-timer i').forEach((bar) => (bar.style.animation = 'none'));
  }

  clearPending() {
    this.pending.forEach(clearTimeout);
    this.pending = [];
  }

  timeUp() {
    const moves = legalMoves(this.state);
    if (!moves.length) return;
    this.setPreview(null);
    this.ctx.toast('Time’s up! Random line.', { icon: 'clock', duration: 1600 });
    this.move(moves[Math.floor(Math.random() * moves.length)]);
  }

  undo() {
    if (!this.history.length || this.state.result || this.locked) return;
    cancelBot(this);
    // Step back past the bots' moves to the last turn a person took
    do this.state = this.history.pop();
    while (this.history.length && isBot(this.seats[this.state.turn]));
    this.ctx.sfx.close();
    this.ctx.haptic();
    this.update();
    this.startTurn();
  }

  /* ------------------------------------------------------------ Results */

  endRound() {
    this.stopTimer();
    this.locked = true;
    const { winners } = this.state.result;
    if (winners.length === 1) this.match.wins[winners[0]]++;
    this.update();
    if (winners.length === 1) this.pending.push(setTimeout(() => this.ctx.sfx.win(), 300));
    else this.ctx.sfx.draw();
    const t = this.cfg.target;
    const matchOver = t > 0 && winners.length === 1 && this.match.wins[winners[0]] >= t;
    this.pending.push(setTimeout(() => this.showResult(matchOver), 1100));
  }

  showResult(matchOver) {
    const s = this.state;
    const { winners } = s.result;
    const single = winners.length === 1;
    const winner = single ? this.seats[winners[0]] : null;
    const pts = (n) => `${n} point${Math.abs(n) === 1 ? '' : 's'}`;

    let title;
    let sub;
    if (single) {
      title = matchOver ? `${escapeHtml(winner.name)} takes the match!` : `${escapeHtml(winner.name)} wins!`;
      const score = s.scores[winners[0]];
      sub = s.mode === 'reverse' ? `Dodged with just ${pts(score)}.` : `Won with ${pts(score)}.`;
    } else {
      title = 'It’s a tie!';
      sub = `${winners.map((i) => escapeHtml(this.seats[i].name)).join(' & ')} share the top spot.`;
    }

    const table = standings(s);
    const better = (a, b) => (s.mode === 'reverse' ? a < b : a > b);
    const rows = table
      .map(
        (row) => {
          const rank = table.filter((o) => better(o.score, row.score)).length;
          const p = this.seats[row.seat];
          return `
          <li class="${winners.includes(row.seat) ? 'is-top' : ''}" style="--pc:${p.color}">
            <span class="dab-rank">${rank + 1}</span>
            <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
            <span class="dab-st-name">${escapeHtml(p.name)}<small>${row.boxes} box${row.boxes === 1 ? '' : 'es'}${this.match.wins[row.seat] ? ` · ${this.match.wins[row.seat]} win${this.match.wins[row.seat] === 1 ? '' : 's'}` : ''}</small></span>
            <b>${row.score}</b>
          </li>`;
        },
      )
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'kit-result';
    overlay.innerHTML = `
      <div class="kit-result-card ${this.seats.length > 2 ? 'is-compact' : ''}" style="--pc:${winner?.color ?? '#a1a1aa'}">
        <div class="kit-result-hero ${single ? '' : 'dab-tie'}">
          ${
            single
              ? `${matchOver ? `<span class="kit-trophy">${icon('trophy')}</span>` : ''}<span class="avatar" style="--pc:${winner.color}">${initial(winner)}</span>`
              : winners.map((i) => `<span class="avatar" style="--pc:${this.seats[i].color}">${initial(this.seats[i])}</span>`).join('')
          }
        </div>
        <p class="kit-result-eyebrow">${matchOver ? 'Match winner' : `Round ${this.match.round}`}</p>
        <h2>${title}</h2>
        <p class="kit-result-sub">${sub}</p>
        <ol class="dab-standings">${rows}</ol>
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
      case 'target':
        return setup(() => (c.target = +v));
      case 'timer':
        return setup(() => (c.timer = +v));
      case 'start':
        return this.startMatch();

      case 'undo':
        return this.undo();
      case 'restart':
        if (this.locked || !this.state.moves) return;
        return this.confirmThen({ title: 'Restart this round?', message: 'All lines will be cleared.', confirmLabel: 'Restart' }, () => {
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
        this.match = { wins: Array(this.seats.length).fill(0), round: 0 };
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
    const game = new DotsAndBoxes(stage, ctx);
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};
