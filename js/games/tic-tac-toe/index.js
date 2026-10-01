import { newRound, play, canPlay, legalMoves, nextToFade, topOf } from './engine.js';
import { icon } from '../../icons.js';
import { escapeHtml } from '../../ui.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#8b5cf6' },
  { id: 'guest-2', name: 'Player 2', color: '#ec4899' },
];

const MODES = [
  {
    id: 'classic',
    name: 'Classic',
    desc: (k) => `Get ${k} in a row to win.`,
    icon: '<path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17"/>',
  },
  {
    id: 'vanishing',
    name: 'Vanishing',
    desc: (k) => `Only ${k} marks each. Your oldest one fades.`,
    icon: '<circle cx="5.5" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5" opacity=".55"/><circle cx="18.5" cy="12" r="2.5" opacity=".2"/>',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    desc: () => 'Nine boards. Your move picks theirs.',
    icon: [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect x="${3 + c * 6.5}" y="${3 + r * 6.5}" width="5" height="5" rx="1.3"/>`)).join(''),
  },
  {
    id: 'misere',
    name: 'Misère',
    desc: (k) => `Make ${k} in a row and you lose.`,
    icon: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  },
  {
    id: 'gobble',
    name: 'Gobble',
    desc: () => 'Big pieces swallow small ones. Out-size your rival.',
    icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>',
  },
];

const THEMES = [
  { id: 'classic', name: 'Classic', marks: ['x', 'o'] },
  { id: 'elements', name: 'Fire & Ice', marks: ['🔥', '❄️'] },
  { id: 'pets', name: 'Pets', marks: ['🐶', '🐱'] },
  { id: 'spooky', name: 'Spooky', marks: ['👻', '🎃'] },
  { id: 'snacks', name: 'Snacks', marks: ['🍕', '🌮'] },
  { id: 'space', name: 'Space', marks: ['🚀', '🪐'] },
];

const SIZES = [3, 4, 5, 6, 7];
const DEFAULT_LINE = { 3: 3, 4: 4, 5: 4, 6: 4, 7: 4 };
const BEST_OF = [1, 3, 5, 7, 0]; // 0 = endless
const TIMERS = [0, 5, 10, 20];
const DEFAULTS = { mode: 'classic', size: 3, line: 3, theme: 'classic', bestOf: 3, timer: 0, table: false, seats: null };

const svg = (paths) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const initial = (p) => escapeHtml(p.name.trim()[0]?.toUpperCase() ?? '?');

class TicTacToe {
  constructor(stage, ctx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ttt';
    stage.append(this.root);

    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    const saved = ctx.storage.get() ?? {};
    this.cfg = { ...DEFAULTS, ...saved };
    if (!SIZES.includes(this.cfg.size)) this.cfg.size = 3;
    this.cfg.line = Math.min(this.cfg.line, this.cfg.size, 5);

    const seated = (this.cfg.seats ?? []).map((id) => this.roster.find((p) => p.id === id)).filter(Boolean);
    this.seats = seated.length === 2 && seated[0] !== seated[1] ? seated : [this.roster[0], this.roster[1]];
    this.focusSeat = 1;
    this.timers = [];
    this.pending = [];
    this.locked = false;

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => {
      if (e.target.matches('[data-setting="table"]')) {
        this.cfg.table = e.target.checked;
        this.ctx.sfx.tap();
        this.ctx.haptic();
      }
    });
  }

  get theme() {
    return THEMES.find((t) => t.id === this.cfg.theme) ?? THEMES[0];
  }

  get target() {
    return this.cfg.bestOf ? Math.ceil(this.cfg.bestOf / 2) : 0;
  }

  /* ------------------------------------------------------------- Marks */

  mark(seat, { size = 3, animate = false, theme = this.theme } = {}) {
    const color = this.seats[seat].color;
    let inner;
    if (theme.id === 'classic') {
      inner =
        seat === 0
          ? '<svg viewBox="0 0 100 100" class="mk-x"><path d="M29 29 71 71" pathLength="1"/><path d="M71 29 29 71" pathLength="1"/></svg>'
          : '<svg viewBox="0 0 100 100" class="mk-o"><circle cx="50" cy="50" r="24" pathLength="1"/></svg>';
    } else {
      inner = `<span class="mk-emoji">${theme.marks[seat]}</span>`;
    }
    return `<span class="mk s${size}${animate ? ' is-new' : ''}" style="--pc:${color}">${inner}</span>`;
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
    const k = c.mode === 'ultimate' || c.mode === 'gobble' ? 3 : c.line;
    const fixedBoard = c.mode === 'ultimate' || c.mode === 'gobble';
    const lines = [];
    for (let i = 3; i <= Math.min(c.size, 5); i++) lines.push(i);

    const opt = (key, value, label) =>
      `<button class="${c[key] === value ? 'on' : ''}" data-act="${key}" data-v="${value}">${label}</button>`;

    const seatPick = (i) => {
      const p = this.seats[i];
      const focus = this.roster.length > 2 && this.focusSeat === i;
      return `
        <button class="ttt-seat-pick ${focus ? 'is-focus' : ''}" data-act="seat" data-v="${i}" style="--pc:${p.color}">
          <span class="ttt-seat-mark mk-box">${this.mark(i)}</span>
          <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
          <strong>${escapeHtml(p.name)}</strong>
          <small>${i === 0 ? 'Goes first' : 'Goes second'}</small>
        </button>`;
    };

    const bench = this.roster.filter((p) => !this.seats.includes(p));
    const preview = fixedBoard
      ? ''
      : `<span class="ttt-preview" style="--n:${c.size}">${Array.from({ length: c.size * c.size }, (_, i) => {
          const r = Math.floor(i / c.size);
          return `<i class="${r === i % c.size && r < k ? 'on' : ''}"></i>`;
        }).join('')}</span>`;

    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          <section class="kit-sec">
            <h3 class="kit-h">Players</h3>
            <div class="ttt-seats">
              ${seatPick(0)}
              <button class="ttt-swap" data-act="swap" aria-label="Swap who goes first">${icon('swap')}</button>
              ${seatPick(1)}
            </div>
            ${
              bench.length
                ? `<p class="kit-hint">Tap a seat, then a player to swap them in.</p>
                   <div class="kit-people">${bench
                     .map((p) => `<button class="kit-person" data-act="bench" data-v="${p.id}"><span class="avatar" style="--pc:${p.color}">${initial(p)}</span>${escapeHtml(p.name)}</button>`)
                     .join('')}</div>`
                : ''
            }
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            <div class="kit-modes">
              ${MODES.map(
                (m) => `
                <button class="kit-mode ${c.mode === m.id ? 'on' : ''}" data-act="mode" data-v="${m.id}">
                  <span class="kit-mode-ico">${svg(m.icon)}</span>
                  <strong>${m.name}</strong>
                  <small>${m.desc(m.id === 'ultimate' || m.id === 'gobble' ? 3 : c.line)}</small>
                </button>`,
              ).join('')}
            </div>
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Board ${preview}</h3>
            ${
              fixedBoard
                ? `<p class="kit-fixed">${c.mode === 'ultimate' ? 'Nine 3×3 boards in a 3×3 grid. Win three boards in a row.' : '3×3 board. Each player gets two small, two medium and two large pieces.'}</p>`
                : `<div class="kit-row"><span class="kit-label">Size</span><div class="kit-seg">${SIZES.map((n) => opt('size', n, `${n}×${n}`)).join('')}</div></div>
                   <div class="kit-row"><span class="kit-label">In a row</span><div class="kit-seg">${lines.map((n) => opt('line', n, n)).join('')}</div></div>`
            }
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Marks</h3>
            <div class="ttt-themes">
              ${THEMES.map(
                (t) => `
                <button class="ttt-theme ${c.theme === t.id ? 'on' : ''}" data-act="theme" data-v="${t.id}">
                  <span class="ttt-theme-marks"><span class="mk-box">${this.mark(0, { theme: t })}</span><span class="mk-box">${this.mark(1, { theme: t })}</span></span>
                  <small>${t.name}</small>
                </button>`,
              ).join('')}
            </div>
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Match</h3>
            <div class="kit-row"><span class="kit-label">Best of</span><div class="kit-seg">${BEST_OF.map((n) => opt('bestOf', n, n || '∞')).join('')}</div></div>
            <div class="kit-row"><span class="kit-label">Turn timer</span><div class="kit-seg">${TIMERS.map((n) => opt('timer', n, n ? `${n}s` : 'Off')).join('')}</div></div>
            <div class="list kit-list">
              <label class="row">
                <span class="row-icon" style="--rc:#14b8a6">${icon('table')}</span>
                <span class="row-label">Table mode<small>Face each other across a table. The top side flips.</small></span>
                <input type="checkbox" class="switch" data-setting="table" ${c.table ? 'checked' : ''}>
              </label>
            </div>
          </section>
        </div>
        <div class="kit-start">
          <button class="btn btn-primary" data-act="start">${icon('play')}Start match</button>
        </div>
      </div>`;
    this.root.querySelector('.kit-setup').classList.toggle('no-anim', rerender);
    this.root.querySelector('.kit-setup-scroll').scrollTop = scroll;
  }

  /* -------------------------------------------------------------- Match */

  startMatch() {
    this.cfg.seats = this.seats.map((p) => p.id);
    this.ctx.storage.set(this.cfg);
    this.match = { scores: [0, 0], draws: 0, round: 0 };
    this.nextRound();
  }

  nextRound() {
    this.clearPending();
    this.match.round++;
    this.starter = (this.match.round - 1) % 2;
    this.state = newRound(this.cfg, this.starter);
    this.history = [];
    this.piece = null;
    this.locked = false;
    this.renderGame();
    this.ctx.sfx.select();
    this.startTurn();
  }

  renderGame() {
    this.view = 'game';
    const c = this.cfg;
    const s = this.state;
    const roundInfo = `<span>Round ${this.match.round}</span><small>${this.target ? `First to ${this.target}` : 'Endless'}</small>`;

    this.root.innerHTML = `
      <div class="ttt-game ${c.table ? 'is-table' : ''}" style="--p0:${this.seats[0].color};--p1:${this.seats[1].color}">
        ${c.table ? this.playerCard(1, true) : `<div class="ttt-hud">${this.playerCard(0)}<div class="ttt-round">${roundInfo}</div>${this.playerCard(1)}</div>`}
        ${c.table ? '' : '<div class="ttt-status"><p class="ttt-turn"></p><p class="ttt-sub"></p></div>'}
        <div class="ttt-board-wrap"><div class="ttt-board-box">${s.mode === 'ultimate' ? this.ultimateHtml() : this.gridHtml()}</div></div>
        ${s.mode === 'gobble' ? '<div class="ttt-tray-slot"></div>' : ''}
        ${c.table ? this.playerCard(0) : ''}
        <div class="kit-controls">
          <button class="kit-ctrl" data-act="undo">${icon('undo')}<span>Undo</span></button>
          ${c.table ? `<span class="ttt-round-inline">${roundInfo}</span>` : ''}
          <button class="kit-ctrl" data-act="restart">${icon('replay')}<span>Restart</span></button>
          <button class="kit-ctrl" data-act="setup">${icon('settings')}<span>Setup</span></button>
        </div>
      </div>`;

    this.gameEl = this.root.querySelector('.ttt-game');
    this.cellEls = [];
    this.root.querySelectorAll('.ttt-cell').forEach((el) => (this.cellEls[+el.dataset.i] = el));
    this.update(false);
  }

  playerCard(seat, flipped = false) {
    const p = this.seats[seat];
    const score = this.match.scores[seat];
    const pips = this.target
      ? `<span class="ttt-pips">${Array.from({ length: this.target }, (_, i) => `<i class="${i < score ? 'on' : ''}"></i>`).join('')}</span>`
      : '';
    return `
      <div class="ttt-player ${flipped ? 'is-flipped' : ''}" data-seat="${seat}" style="--pc:${p.color}">
        <span class="ttt-player-top">
          <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
          <span class="ttt-player-mark mk-box">${this.mark(seat)}</span>
        </span>
        <span class="ttt-player-info">
          <strong class="ttt-player-name">${escapeHtml(p.name)}</strong>
          ${pips}
        </span>
        <b class="ttt-score">${score}</b>
        <span class="ttt-turn-tag">Your turn</span>
        <span class="ttt-timer"><i></i></span>
      </div>`;
  }

  gridHtml() {
    const { n } = this.state;
    return `
      <div class="ttt-board" style="--n:${n}">
        ${Array.from({ length: n * n }, (_, i) => `<button class="ttt-cell mk-box" data-act="cell" data-i="${i}" aria-label="Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}"></button>`).join('')}
        <svg class="ttt-strike" viewBox="0 0 100 100" aria-hidden="true"></svg>
      </div>`;
  }

  ultimateHtml() {
    return `
      <div class="ttt-board ttt-ultimate">
        ${Array.from(
          { length: 9 },
          (_, b) => `
          <div class="ttt-mini" data-b="${b}">
            ${Array.from({ length: 9 }, (_, c) => `<button class="ttt-cell mk-box" data-act="cell" data-i="${b * 9 + c}" aria-label="Board ${b + 1}, cell ${c + 1}"></button>`).join('')}
            <span class="ttt-mini-win mk-box"></span>
            <svg class="ttt-strike" viewBox="0 0 100 100" aria-hidden="true"></svg>
          </div>`,
        ).join('')}
        <svg class="ttt-strike ttt-strike-big" viewBox="0 0 100 100" aria-hidden="true"></svg>
      </div>`;
  }

  cellKey(i) {
    const s = this.state;
    if (s.mode === 'gobble') {
      const top = topOf(s.stacks[i]);
      return top ? `${top.p}-${top.size}` : '';
    }
    return s.cells[i] === null ? '' : String(s.cells[i]);
  }

  // Sync the DOM with the current state, animating only what changed.
  update(animate = true) {
    const s = this.state;
    const fade = nextToFade(s);
    const winLine = s.mode === 'ultimate' ? null : s.result?.line;

    this.cellEls.forEach((el, i) => {
      const key = this.cellKey(i);
      if (el.dataset.key !== key) {
        if (!key) {
          const old = el.querySelector('.mk');
          if (old) {
            old.classList.add('is-leaving');
            setTimeout(() => old.remove(), 380);
          }
        } else {
          const [p, size] = key.split('-').map(Number);
          el.innerHTML = this.mark(p, { size: size || 3, animate });
        }
        el.dataset.key = key;
      }
      el.classList.toggle('is-last', i === s.last && !s.result);
      el.classList.toggle('is-fading', i === fade);
      el.classList.toggle('is-win', !!winLine?.includes(i));
      el.classList.toggle('is-lose', !!winLine?.includes(i) && s.result.reason === 'misere');
    });

    if (s.mode === 'ultimate') this.updateUltimate(animate);
    if (s.mode === 'gobble') this.renderTray();

    const turnColor = this.seats[s.turn].color;
    this.gameEl.style.setProperty('--tc', turnColor);
    this.root.querySelectorAll('.ttt-player').forEach((el) => {
      const seat = +el.dataset.seat;
      el.classList.toggle('is-active', seat === s.turn && !s.result);
      el.querySelector('.ttt-score').textContent = this.match.scores[seat];
      el.querySelectorAll('.ttt-pips i').forEach((pip, j) => pip.classList.toggle('on', j < this.match.scores[seat]));
    });

    const turn = this.root.querySelector('.ttt-turn');
    if (turn) {
      const sub = this.root.querySelector('.ttt-sub');
      const r = s.result;
      if (!r) {
        turn.innerHTML = `<span class="ttt-turn-mark mk-box">${this.mark(s.turn)}</span><span><b>${escapeHtml(this.seats[s.turn].name)}</b>’s turn</span>`;
        sub.textContent = this.hint();
      } else if (r.winner === null) {
        turn.innerHTML = '<span><b>Draw</b></span>';
        sub.textContent = 'No more moves.';
      } else {
        turn.innerHTML = `<span class="ttt-turn-mark mk-box">${this.mark(r.winner)}</span><span><b>${escapeHtml(this.seats[r.winner].name)}</b> wins the round</span>`;
        sub.textContent = r.reason === 'misere' ? `${this.seats[1 - r.winner].name} made a line.` : '';
      }
    }

    const undo = this.root.querySelector('[data-act="undo"]');
    if (undo) undo.disabled = !this.history.length || !!s.result;
  }

  hint() {
    const s = this.state;
    switch (s.mode) {
      case 'ultimate':
        return s.active === null ? 'Play in any open board.' : 'Play in the glowing board.';
      case 'vanishing':
        return nextToFade(s) !== null ? 'Your faded mark disappears when you move.' : `Keep up to ${s.k} marks on the board.`;
      case 'misere':
        return `Don’t make ${s.k} in a row!`;
      case 'gobble':
        return 'Pick a piece, then a square. Bigger pieces cover smaller ones.';
      default:
        return `Get ${s.k} in a row.`;
    }
  }

  updateUltimate(animate) {
    const s = this.state;
    this.root.querySelectorAll('.ttt-mini').forEach((mini) => {
      const b = +mini.dataset.b;
      const owner = s.boards[b];
      const open = owner === null;
      mini.classList.toggle('is-active', !s.result && open && (s.active === null || s.active === b));
      mini.classList.toggle('is-dim', !s.result && (!open || (s.active !== null && s.active !== b)));
      mini.classList.toggle('is-won', owner === 0 || owner === 1);
      mini.classList.toggle('is-drawn', owner === 'draw');

      const win = mini.querySelector('.ttt-mini-win');
      const strike = mini.querySelector('.ttt-strike');
      const key = owner === 0 || owner === 1 ? String(owner) : '';
      if (win.dataset.key !== key) {
        win.dataset.key = key;
        win.innerHTML = key ? this.mark(owner, { animate }) : '';
        strike.innerHTML = key ? this.strikeLine(s.boardLines[b], 3, this.seats[owner].color, 7) : '';
      }
    });
  }

  renderTray() {
    const slot = this.root.querySelector('.ttt-tray-slot');
    if (!slot) return;
    const s = this.state;
    const tray = s.trays[s.turn];
    const flipped = this.cfg.table && s.turn === 1;
    slot.innerHTML = `
      <div class="ttt-tray ${flipped ? 'is-flipped' : ''}" style="--pc:${this.seats[s.turn].color}">
        ${[1, 2, 3]
          .map((size) => {
            const count = tray.filter((x) => x === size).length;
            return `<button class="ttt-piece ${this.piece === size ? 'on' : ''}" data-act="piece" data-v="${size}" ${count && !s.result ? '' : 'disabled'} aria-label="${['Small', 'Medium', 'Large'][size - 1]} piece, ${count} left">
              <span class="mk-box">${this.mark(s.turn, { size })}</span>
              <span class="ttt-count">×${count}</span>
            </button>`;
          })
          .join('')}
      </div>`;
  }

  strikeLine(line, n, color, width = 4.5) {
    const at = (i) => [((i % n) + 0.5) * (100 / n), (Math.floor(i / n) + 0.5) * (100 / n)];
    const [x1, y1] = at(line[0]);
    const [x2, y2] = at(line[line.length - 1]);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ext = 100 / n / 2.6;
    const dx = ((x2 - x1) / len) * ext;
    const dy = ((y2 - y1) / len) * ext;
    return `<line x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 + dx}" y2="${y2 + dy}" pathLength="1" style="--pc:${color};stroke-width:${width}"/>`;
  }

  /* ------------------------------------------------------------- Turns */

  startTurn() {
    this.stopTimer();
    const s = this.state;
    if (s.result) return;
    if (s.mode === 'gobble') {
      const tray = s.trays[s.turn];
      if (!tray.includes(this.piece)) this.piece = Math.min(...tray);
      this.renderTray();
    }
    if (!this.cfg.timer) return;

    const ms = this.cfg.timer * 1000;
    const bar = this.root.querySelector(`.ttt-player[data-seat="${s.turn}"] .ttt-timer i`);
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = `ttt-timer ${ms}ms linear forwards`;
    }
    [3, 2, 1].forEach((t) => ms > t * 1000 && this.timers.push(setTimeout(() => this.ctx.sfx.tick(), ms - t * 1000)));
    this.timers.push(setTimeout(() => this.timeUp(), ms));
  }

  stopTimer() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.root.querySelectorAll('.ttt-timer i').forEach((bar) => (bar.style.animation = 'none'));
  }

  clearPending() {
    this.pending.forEach(clearTimeout);
    this.pending = [];
  }

  timeUp() {
    const moves = legalMoves(this.state);
    if (!moves.length) return;
    const move = moves[Math.floor(Math.random() * moves.length)];
    if (move.size) this.piece = move.size;
    this.ctx.toast('Time’s up! Random move.', { icon: 'clock', duration: 1600 });
    this.onCell(move.idx);
  }

  onCell(i) {
    if (this.locked) return;
    const s = this.state;
    const size = s.mode === 'gobble' ? this.piece : undefined;
    if (!canPlay(s, i, size)) return this.deny(i);

    this.history.push(s);
    this.state = play(s, i, size);
    this.placeSound(s.turn, size);
    this.ctx.haptic(10);
    if (this.state.vanished !== null) {
      this.pending.push(setTimeout(() => this.ctx.sfx.tone({ freq: 520, to: 240, dur: 0.28, gain: 0.03 }), 90));
    }
    this.update();
    if (this.state.result) this.endRound();
    else this.startTurn();
  }

  placeSound(seat, size = 3) {
    const base = (seat === 0 ? 523.25 : 659.25) * [1, 1.25, 1, 0.8][size];
    this.ctx.sfx.tone({ freq: base, to: base * 1.5, dur: 0.12, type: 'triangle', gain: 0.05 });
    this.ctx.sfx.tone({ freq: base * 2, dur: 0.18, gain: 0.015, delay: 0.03 });
  }

  deny(i) {
    const s = this.state;
    if (s.result) return;
    this.ctx.sfx.deny();
    this.ctx.haptic(20);
    const el = this.cellEls[i];
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    if (s.mode === 'ultimate' && s.cells[i] === null && s.boards[Math.floor(i / 9)] === null) {
      this.root.querySelectorAll('.ttt-mini.is-active').forEach((m) => {
        m.classList.remove('is-nudge');
        void m.offsetWidth;
        m.classList.add('is-nudge');
      });
    } else if (s.mode === 'gobble' && topOf(s.stacks[i])) {
      this.ctx.toast('Only a bigger piece can gobble that.', { icon: 'sparkle', duration: 1800 });
    }
  }

  undo() {
    if (!this.history.length || this.state.result || this.locked) return;
    this.state = this.history.pop();
    this.ctx.sfx.close();
    this.ctx.haptic();
    this.update();
    this.startTurn();
  }

  /* ------------------------------------------------------------ Results */

  endRound() {
    this.stopTimer();
    this.locked = true;
    const s = this.state;
    const r = s.result;
    if (r.winner === null) this.match.draws++;
    else this.match.scores[r.winner]++;
    this.update();

    if (r.line) {
      const lineColor = this.seats[r.reason === 'misere' ? 1 - r.winner : r.winner].color;
      this.gameEl.style.setProperty('--wc', lineColor);
      const strike = this.root.querySelector(s.mode === 'ultimate' ? '.ttt-strike-big' : '.ttt-board > .ttt-strike');
      strike.innerHTML = this.strikeLine(r.line, s.n, lineColor, s.mode === 'ultimate' ? 3.5 : Math.max(2.5, 6 - s.n * 0.5));
    }
    if (r.winner === null) this.ctx.sfx.draw();
    else this.pending.push(setTimeout(() => this.ctx.sfx.win(), 250));

    const matchOver = this.target > 0 && r.winner !== null && this.match.scores[r.winner] >= this.target;
    this.pending.push(setTimeout(() => this.showResult(matchOver), r.line ? 1150 : 650));
  }

  showResult(matchOver) {
    const r = this.state.result;
    const [p0, p1] = this.seats;
    const [s0, s1] = this.match.scores;
    const winner = r.winner === null ? null : this.seats[r.winner];
    const loser = r.winner === null ? null : this.seats[1 - r.winner];

    let eyebrow = `Round ${this.match.round}`;
    let title = 'Draw!';
    let sub = 'Nobody blinked.';
    if (winner) {
      title = matchOver ? `${escapeHtml(winner.name)} takes the match!` : `${escapeHtml(winner.name)} wins!`;
      sub = r.reason === 'misere' ? `${escapeHtml(loser.name)} made a line.` : matchOver ? 'Champion of the board.' : 'Clean line.';
      if (matchOver) eyebrow = 'Match winner';
    }

    const overlay = document.createElement('div');
    overlay.className = 'kit-result';
    overlay.innerHTML = `
      <div class="kit-result-card ${winner ? '' : 'is-draw'}" style="--pc:${winner?.color ?? '#a1a1aa'}">
        ${
          winner
            ? `<div class="kit-result-hero">${matchOver ? `<span class="kit-trophy">${icon('trophy')}</span>` : ''}<span class="avatar" style="--pc:${winner.color}">${initial(winner)}</span></div>`
            : `<div class="kit-result-hero is-draw"><span class="mk-box">${this.mark(0)}</span><span class="mk-box">${this.mark(1)}</span></div>`
        }
        <p class="kit-result-eyebrow">${eyebrow}</p>
        <h2>${title}</h2>
        <p class="kit-result-sub">${sub}</p>
        <div class="kit-result-score">
          <span style="--pc:${p0.color}"><em>${escapeHtml(p0.name)}</em><b>${s0}</b></span>
          <i></i>
          <span style="--pc:${p1.color}"><b>${s1}</b><em>${escapeHtml(p1.name)}</em></span>
        </div>
        ${this.match.draws ? `<p class="kit-result-draws">${this.match.draws} draw${this.match.draws === 1 ? '' : 's'}</p>` : ''}
        <div class="kit-result-actions">
          ${
            matchOver
              ? `<button class="btn btn-primary" data-act="rematch">${icon('replay')}Rematch</button>`
              : `<button class="btn btn-primary" data-act="next">${icon('play')}Next round</button>`
          }
          <button class="btn btn-glass" data-act="setup-now">${icon('settings')}Change setup</button>
        </div>
      </div>`;
    this.gameEl.append(overlay);

    if (winner) {
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
      case 'swap':
        return setup(() => this.seats.reverse());
      case 'seat':
        return setup(() => (this.focusSeat = +v));
      case 'bench':
        return setup(() => (this.seats[this.focusSeat] = this.roster.find((p) => p.id === v)));
      case 'mode':
        return setup(() => (c.mode = v));
      case 'size':
        return setup(() => {
          c.size = +v;
          c.line = DEFAULT_LINE[c.size];
        });
      case 'line':
        return setup(() => (c.line = +v));
      case 'theme':
        return setup(() => (c.theme = v));
      case 'bestOf':
        return setup(() => (c.bestOf = +v));
      case 'timer':
        return setup(() => (c.timer = +v));
      case 'start':
        return this.startMatch();

      case 'cell':
        return this.onCell(+t.dataset.i);
      case 'piece':
        this.piece = +v;
        this.ctx.sfx.tap();
        this.ctx.haptic();
        return this.renderTray();
      case 'undo':
        return this.undo();
      case 'restart':
        if (this.locked) return;
        if (!this.state.moves) return;
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
        this.match = { scores: [0, 0], draws: 0, round: 0 };
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
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href;
    await new Promise((resolve) => {
      link.onload = link.onerror = resolve;
      document.head.append(link);
    });
    const game = new TicTacToe(stage, ctx);
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};
