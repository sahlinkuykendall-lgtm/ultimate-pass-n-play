import { newGame, play, legalMoves, inCheck, kingSq, visible, material, sqName, CENTER } from './engine.js';
import { pieceSvg, PIECE_DEFS } from './pieces.js';
import { icon } from '../../icons.js';
import { playersSection, shuffle, loadStyles, segRow, modeGrid, initial, escapeHtml, isBot, thinking } from '../kit.js';
import { botLevel } from '../../bots.js';
import { chooseMove } from './ai.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#e5e7eb' },
  { id: 'guest-2', name: 'Player 2', color: '#8b5cf6' },
];

const MODES = [
  { id: 'classic', name: 'Classic', desc: 'The real thing. Checkmate wins.', icon: '<path d="M8 21h8M9 17h6l1-7H8zM12 3v4M10 5h4"/>' },
  { id: 'chess960', name: 'Chess960', desc: 'Shuffled back rank. No opening theory.', icon: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="m7 4 3 3-3 3M17 14l-3 3 3 3"/>' },
  { id: 'threecheck', name: 'Three-Check', desc: 'Check your opponent three times to win.', icon: '<path d="M4 12l3 3 6-7M11 15l1 1 8-9"/>' },
  { id: 'koth', name: 'King of the Hill', desc: 'March your king to the centre to win.', icon: '<path d="M3 20l6-9 4 5 3-4 5 8z"/><path d="M12 3v5M10 5h4"/>' },
  { id: 'atomic', name: 'Atomic', desc: 'Every capture explodes. Blow up the king.', icon: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-60 12 12)"/>' },
  { id: 'fog', name: 'Fog of War', desc: 'See only what your pieces can reach.', icon: '<path d="M4 14h16M6 18h12M7 10a5 5 0 0 1 10 0"/>' },
];
const HINTS = {
  classic: 'Checkmate wins.',
  chess960: 'Castle by moving your king onto your rook.',
  threecheck: 'Three checks wins.',
  koth: 'King on a glowing square wins.',
  atomic: 'Captures explode. Kings can’t capture.',
  fog: 'Capture the king. There is no check in the fog.',
};
const CLOCKS = [
  ['off', 'Off', 0, 0],
  ['3+2', '3+2', 3, 2],
  ['5+3', '5+3', 5, 3],
  ['10', '10', 10, 0],
  ['15+10', '15+10', 15, 10],
];
const VIEWS = [['flip', 'Flip'], ['fixed', 'Fixed'], ['table', 'Table']];
const THEMES = [['wood', 'Wood'], ['marble', 'Marble'], ['midnight', 'Midnight']];
const DEFAULTS = { mode: 'classic', clock: 'off', view: 'flip', theme: 'wood', hints: 'on', seats: null };
const REASONS = {
  checkmate: 'Checkmate',
  threecheck: 'Three checks',
  hill: 'King of the Hill',
  exploded: 'Kaboom! The king exploded',
  captured: 'King captured',
  time: 'Out of time',
  resign: 'Resignation',
  stalemate: 'Stalemate',
  repetition: 'Threefold repetition',
  fifty: '50-move rule',
  material: 'Not enough material to mate',
  agreed: 'Draw agreed',
};
const ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };
const fmtClock = (ms) => {
  const t = Math.max(0, ms);
  if (t < 10000) return `${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const m = Math.floor(t / 60000);
  const sec = Math.floor((t % 60000) / 1000);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

class Chess {
  constructor(stage, ctx, Board3D = null) {
    this.ctx = ctx;
    this.Board3D = Board3D;
    this.root = document.createElement('div');
    this.root.className = 'ch';
    stage.append(this.root);
    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    this.cfg = { ...DEFAULTS, ...(ctx.storage.get() ?? {}) };
    if (!MODES.some((m) => m.id === this.cfg.mode)) this.cfg.mode = DEFAULTS.mode;
    if (!THEMES.some(([id]) => id === this.cfg.theme)) this.cfg.theme = DEFAULTS.theme;
    const seated = (this.cfg.seats ?? []).map((id) => this.roster.find((p) => p.id === id)).filter(Boolean);
    this.seats = seated.length === 2 && seated[0] !== seated[1] ? seated : this.roster.slice(0, 2);
    this.pending = [];
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  /* ------------------------------------------------------------- Setup */

  showSetup() {
    const rerender = this.view === 'setup';
    this.view = 'setup';
    this.stopClock();
    this.clearPending();
    this.disposeBoard();
    const scroll = this.root.querySelector('.kit-setup-scroll')?.scrollTop ?? 0;
    const c = this.cfg;
    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          ${playersSection({ roster: this.roster, seats: this.seats, max: 2, hint: 'Tap someone to swap them in. Shuffle to switch colours.' })}
          <p class="ch-sides">${[0, 1].map((i) => `<span>${pieceSvg('k', i ? 'b' : 'w')}<span><small>${i ? 'Black' : 'White'}</small><b>${escapeHtml(this.seats[i].name)}</b></span></span>`).join('')}</p>

          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            ${modeGrid(MODES, c.mode)}
          </section>

          <section class="kit-sec">
            <h3 class="kit-h">Game</h3>
            ${segRow('Clock', 'clock', CLOCKS.map(([id, label]) => [id, label]), c.clock)}
            ${segRow('Board', 'view', VIEWS, c.view)}
            ${segRow('Theme', 'theme', THEMES, c.theme)}
            ${segRow('Move hints', 'hints', [['on', 'On'], ['off', 'Off']], c.hints)}
            <p class="kit-hint">${c.view === 'flip' ? 'The board turns to face whoever’s move it is.' : c.view === 'table' ? 'Lay the phone flat between you. Black’s side faces the other way.' : 'White stays at the bottom the whole game.'}${c.mode === 'fog' ? ' Fog of War always flips and hides the board between turns.' : ''}</p>
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
    this.match = { score: [0, 0], draws: 0, games: 0 };
    this.newRound();
  }

  // seats[0] is white this game.
  newRound() {
    this.clearPending();
    this.match.games++;
    this.state = newGame({ mode: this.cfg.mode });
    this.history = [];
    this.sans = [];
    this.selected = -1;
    this.over = null;
    this.hold = null;
    this.fogViewer = null;
    this.busy = false;
    this.thinking = false;
    this.botToken = (this.botToken ?? 0) + 1;
    const clk = CLOCKS.find((x) => x[0] === this.cfg.clock);
    this.clock = clk[2] ? { w: clk[2] * 60000, b: clk[2] * 60000, inc: clk[3] * 1000 } : null;
    this.renderGame();
    this.ctx.sfx.select();
    if (this.handoffs) this.handoff();
    else this.startTurn();
  }

  startTurn() {
    this.startClock();
    const p = this.playerOf(this.state.turn);
    if (isBot(p) && !this.over) this.botMove(p);
  }

  // The bot thinks in a worker (main thread if workers aren't available), then plays.
  botMove(player) {
    const token = (this.botToken = (this.botToken ?? 0) + 1);
    const state = this.state;
    const start = performance.now();
    this.busy = true;
    this.thinking = true;
    this.drawHud();
    this.askBot(state, botLevel(player)).then((move) => {
      const wait = Math.max(0, 750 - (performance.now() - start));
      this.pending.push(
        setTimeout(() => {
          if (token !== this.botToken || this.state !== state || this.over || this.view !== 'game') return;
          this.busy = false;
          this.thinking = false;
          this.commit(move, false);
        }, wait),
      );
    });
  }

  askBot(state, level) {
    const local = () => new Promise((resolve) => setTimeout(() => resolve(chooseMove(state, level)), 30));
    if (!this.worker && this.worker !== false) {
      try {
        this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.workerJobs.get(e.data.id)?.(e.data.move);
        this.workerJobs = new Map();
        this.jobId = 0;
      } catch {
        this.worker = false;
      }
    }
    if (!this.worker) return local();
    return new Promise((resolve) => {
      const id = ++this.jobId;
      // If the worker never answers (old Safari without module workers), think here instead
      const fallback = setTimeout(() => {
        this.workerJobs.delete(id);
        this.worker?.terminate();
        this.worker = false;
        local().then(resolve);
      }, 6000);
      this.workerJobs.set(id, (move) => {
        clearTimeout(fallback);
        this.workerJobs.delete(id);
        resolve(move);
      });
      this.worker.onerror = () => {
        clearTimeout(fallback);
        this.workerJobs.delete(id);
        this.worker = false;
        local().then(resolve);
      };
      this.worker.postMessage({ id, state, level });
    });
  }

  get fog() {
    return this.cfg.mode === 'fog';
  }
  // Against a bot the board stays on the one person's side the whole game.
  get solo() {
    const people = [0, 1].filter((i) => !isBot(this.seats[i]));
    return people.length === 1 ? (people[0] === 0 ? 'w' : 'b') : null;
  }
  // Fog of War hand-offs only make sense between two people.
  get handoffs() {
    return this.fog && !this.seats.some(isBot);
  }
  playerOf(color) {
    return this.seats[color === 'w' ? 0 : 1];
  }
  // Whose eyes the board is drawn for (bottom of the screen).
  get viewer() {
    if (this.solo) return this.solo;
    if (this.fog) return this.fogViewer ?? 'w';
    if (this.hold) return this.hold;
    return this.cfg.view === 'flip' ? this.state.turn : 'w';
  }

  renderGame() {
    this.view = 'game';
    const table = this.cfg.view === 'table' && !this.fog;
    const files = [...'abcdefgh'].map((f) => `<span class="ch-lbl">${f}</span>`).join('');
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1].map((r) => `<span class="ch-lbl">${r}</span>`).join('');
    this.root.innerHTML = `
      ${PIECE_DEFS}
      <div class="ch-game theme-${this.cfg.theme} ${table ? 'is-table' : 'is-3d'}">
        <div class="ch-hud ch-top"></div>
        <div class="ch-board-wrap">
          <div class="ch-scene">
            <div class="ch-table">
              <i class="ch-edge ch-edge-s"></i><i class="ch-edge ch-edge-n"></i><i class="ch-edge ch-edge-e"></i><i class="ch-edge ch-edge-w"></i>
              <div class="ch-frame">
                <div class="ch-files ch-files-s">${files}</div><div class="ch-files ch-files-n">${files}</div>
                <div class="ch-ranks ch-ranks-w">${ranks}</div><div class="ch-ranks ch-ranks-e">${ranks}</div>
                <div class="ch-board">
                  <div class="ch-squares">${Array.from({ length: 64 }, (_, i) => `<i data-sq="${i}" style="--g:${(i * 37) % 100}"></i>`).join('')}</div>
                  <div class="ch-marks"></div>
                  <div class="ch-fx"></div>
                  <div class="ch-pieces"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ch-hud ch-bottom"></div>
        <div class="ch-moves"><div class="ch-moves-inner"></div></div>
        <p class="ch-status"></p>
        <div class="kit-controls">
          <button class="kit-ctrl" data-act="undo">${icon('undo')}<span>Undo</span></button>
          <button class="kit-ctrl" data-act="draw">${icon('swap')}<span>Draw</span></button>
          <button class="kit-ctrl" data-act="resign">${icon('flag')}<span>Resign</span></button>
          <button class="kit-ctrl ch-icon-btn" data-act="setup" aria-label="Setup">${icon('settings')}</button>
          <button class="kit-ctrl ch-over-btn" data-act="result">${icon('trophy')}<span>Result</span></button>
          <button class="kit-ctrl ch-over-btn" data-act="rematch">${icon('replay')}<span>Rematch</span></button>
        </div>
      </div>`;
    this.gameEl = this.root.querySelector('.ch-game');
    this.wrapEl = this.root.querySelector('.ch-board-wrap');
    this.boardEl = this.root.querySelector('.ch-board');
    this.tableEl = this.root.querySelector('.ch-table');
    this.piecesEl = this.root.querySelector('.ch-pieces');
    this.marksEl = this.root.querySelector('.ch-marks');
    this.pieceEls = new Map();
    this.gameEl.classList.toggle('is-flipped', this.viewer === 'b');
    this.disposeBoard();
    if (this.Board3D) {
      // Real 3D board: replace the CSS scene with a WebGL canvas
      this.root.querySelector('.ch-scene').remove();
      this.gameEl.classList.add('is-webgl');
      try {
        this.b3 = new this.Board3D(this.wrapEl, { theme: this.cfg.theme, table });
        this.b3.setViewer(this.viewer, false);
      } catch {
        this.b3 = null;
        this.Board3D = null;
        return this.renderGame();
      }
    }
    this.wireBoard();
    this.draw(false);
  }

  disposeBoard() {
    this.b3?.dispose();
    this.b3 = null;
  }

  /* -------------------------------------------------------------- Drawing */

  // The board itself always lies with white at the near edge; turning it to face
  // black is a CSS rotation, so squares and pieces never need remapping.
  draw(animate = true) {
    const s = this.state;
    const seen = this.fog && !this.over ? visible(s, this.viewer) : null;
    const hidden = this.gameEl.classList.contains('is-hidden');
    const flip = this.viewer === 'b';
    if (this.b3) {
      const live = animate && !hidden;
      this.b3.setViewer(this.viewer, live);
      const fogged = seen ? new Set([...Array(64).keys()].filter((i) => !seen.has(i))) : null;
      this.b3.sync(s.board, { animate: live, hidden: fogged });
      this.drawMarks();
      this.drawHud();
      return;
    }
    if (this.gameEl.classList.contains('is-flipped') !== flip) {
      this.gameEl.classList.toggle('is-flipped', flip);
      if (animate && !hidden) {
        this.ctx.sfx.tone({ freq: 220, to: 330, dur: 0.5, type: 'sine', gain: 0.02 });
      }
    }

    this.root.querySelectorAll('.ch-squares i').forEach((el) => {
      const sq = +el.dataset.sq;
      const r = Math.floor(sq / 8);
      const c = sq % 8;
      let cls = (r + c) % 2 ? 'dk' : 'lt';
      if (seen && !seen.has(sq)) cls += ' fog';
      if (s.mode === 'koth' && CENTER.includes(sq)) cls += ' hill';
      if (el.className !== cls) el.className = cls;
    });

    const keep = new Set();
    s.board.forEach((p, sq) => {
      if (!p) return;
      if (seen && !seen.has(sq) && p.c !== this.viewer) return;
      keep.add(p.id);
      let el = this.pieceEls.get(p.id);
      const art = `${p.c}${p.t}`;
      if (!el) {
        el = document.createElement('span');
        el.className = 'ch-piece';
        el.innerHTML = '<i class="ch-shadow"></i><span class="ch-stand"></span>';
        this.pieceEls.set(p.id, el);
        this.piecesEl.append(el);
        if (animate) el.classList.add('is-new');
      }
      if (el.dataset.art !== art) {
        el.dataset.art = art;
        el.querySelector('.ch-stand').innerHTML = pieceSvg(p.t, p.c);
      }
      el.classList.toggle('is-black', p.c === 'b');
      el.dataset.sq = sq;
      this.placeEl(el, sq, animate && !hidden);
    });
    for (const [id, el] of this.pieceEls) {
      if (keep.has(id)) continue;
      this.pieceEls.delete(id);
      if (animate) {
        el.classList.add('is-gone');
        setTimeout(() => el.remove(), 350);
      } else el.remove();
    }
    this.drawMarks();
    this.drawHud();
  }

  placeEl(el, sq, animate) {
    el.classList.toggle('no-anim', !animate);
    el.classList.remove('is-lifted');
    el.style.transform = `translate(${(sq % 8) * 100}%, ${Math.floor(sq / 8) * 100}%)`;
  }

  drawMarks() {
    const s = this.state;
    const seen = this.fog && !this.over ? visible(s, this.viewer) : null;
    if (this.b3) {
      let check = -1;
      if (!this.over && inCheck(s, s.turn)) check = kingSq(s.board, s.turn);
      if (this.over?.winner && ['checkmate', 'threecheck', 'time', 'resign'].includes(this.over.reason)) check = kingSq(s.board, this.over.winner === 'w' ? 'b' : 'w');
      const targets = [];
      if (this.selected >= 0 && this.cfg.hints === 'on') {
        const done = new Set();
        for (const m of this.targets) {
          const to = this.targetSq(m);
          if (done.has(to)) continue;
          done.add(to);
          targets.push({ sq: to, capture: !!m.capture });
        }
      }
      this.b3.setMarks({
        last: s.last && (!seen || (seen.has(s.last.from) && seen.has(s.last.to))) ? s.last : null,
        selected: this.selected,
        targets,
        check,
        hill: s.mode === 'koth' ? CENTER : [],
        fog: seen,
      });
      return;
    }
    const mark = (sq, cls) => `<span class="ch-mark ${cls}" style="transform:translate(${(sq % 8) * 100}%, ${Math.floor(sq / 8) * 100}%)"></span>`;
    let html = '';
    if (s.last && (!seen || (seen.has(s.last.from) && seen.has(s.last.to)))) html += mark(s.last.from, 'is-last') + mark(s.last.to, 'is-last');
    if (!this.over && inCheck(s, s.turn)) html += mark(kingSq(s.board, s.turn), 'is-check');
    if (this.over?.winner && ['checkmate', 'threecheck', 'time', 'resign'].includes(this.over.reason)) {
      const loser = this.over.winner === 'w' ? 'b' : 'w';
      const k = kingSq(s.board, loser);
      if (k >= 0) html += mark(k, 'is-check');
    }
    this.pieceEls.forEach((el) => el.classList.toggle('is-sel', +el.dataset.sq === this.selected));
    if (this.selected >= 0) {
      html += mark(this.selected, 'is-sel');
      if (this.cfg.hints === 'on') {
        const seenTo = new Set();
        for (const m of this.targets) {
          const to = this.targetSq(m);
          if (seenTo.has(to)) continue;
          seenTo.add(to);
          html += mark(to, m.capture ? 'is-cap' : 'is-dot');
        }
      }
    }
    this.marksEl.innerHTML = html;
  }

  // Where to tap for a move. Chess960 castling where the king barely moves: tap the rook.
  targetSq(m) {
    if (m.castle && (this.state.mode === 'chess960' || m.to === m.from)) return m.rookFrom;
    return m.to;
  }

  hudHtml(color) {
    const s = this.state;
    const p = this.playerOf(color);
    const caps = [...s.captured[color]].filter((t) => t !== 'k').sort((a, b) => ORDER[a] - ORDER[b]);
    const diff = material(s) * (color === 'w' ? 1 : -1);
    const checks = s.mode === 'threecheck' ? `<span class="ch-checks">${[0, 1, 2].map((i) => `<i class="${i < s.checks[color] ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const active = !this.over && s.turn === color;
    const low = this.clock && this.clock[color] < 20000;
    return `
      <div class="ch-player ${active ? 'is-active' : ''}" style="--pc:${p.color}">
        <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
        <span class="ch-player-info">
          <span class="ch-player-name">${escapeHtml(p.name)}<em>${pieceSvg('k', color)}</em>${this.match.score[color === 'w' ? 0 : 1] ? `<small>${this.match.score[color === 'w' ? 0 : 1]}</small>` : ''}</span>
          <span class="ch-caps">${caps.map((t) => pieceSvg(t, color === 'w' ? 'b' : 'w')).join('')}${diff > 0 ? `<b>+${diff}</b>` : ''}${checks}</span>
        </span>
        ${this.clock ? `<span class="ch-clock ${active ? 'is-running' : ''} ${low ? 'is-low' : ''}" data-clock="${color}">${fmtClock(this.clock[color])}</span>` : ''}
      </div>`;
  }

  drawHud() {
    const s = this.state;
    const bottom = this.viewer;
    const top = bottom === 'w' ? 'b' : 'w';
    this.root.querySelector('.ch-top').innerHTML = this.hudHtml(top);
    this.root.querySelector('.ch-bottom').innerHTML = this.hudHtml(bottom);

    const moves = this.root.querySelector('.ch-moves-inner');
    moves.innerHTML = this.sans.length
      ? this.sans
          .map((san, i) => `${i % 2 === 0 ? `<span class="ch-num">${i / 2 + 1}.</span>` : ''}<span class="ch-san ${i === this.sans.length - 1 ? 'is-last' : ''}">${escapeHtml(san)}</span>`)
          .join('')
      : '<span class="ch-num">Moves will show here</span>';
    const strip = this.root.querySelector('.ch-moves');
    strip.scrollLeft = strip.scrollWidth;

    const status = this.root.querySelector('.ch-status');
    if (this.over) status.textContent = this.over.winner ? `${this.playerOf(this.over.winner).name} wins · ${REASONS[this.over.reason]}` : `Draw · ${REASONS[this.over.reason]}`;
    else {
      const p = this.playerOf(s.turn);
      const check = inCheck(s, s.turn) ? ' · Check!' : '';
      status.innerHTML = this.thinking
        ? `<span class="ch-dot ${s.turn === 'b' ? 'is-black' : ''}"></span>${thinking(p)}${check}`
        : `<span class="ch-dot ${s.turn === 'b' ? 'is-black' : ''}"></span><b>${escapeHtml(p.name)}</b> to move${check} <span class="ch-hint">${HINTS[s.mode]}</span>`;
    }
    this.gameEl.classList.toggle('is-over', !!this.over);
    this.root.querySelector('[data-act="undo"]').disabled = !this.history.length || !!this.over;
    this.root.querySelector('[data-act="draw"]').disabled = !!this.over;
    this.root.querySelector('[data-act="resign"]').disabled = !!this.over;
  }

  /* ---------------------------------------------------------------- Input */

  // Hit-test through the 3D board: a tall piece counts as its own square,
  // otherwise whichever square is under the finger.
  sqAt(e, squaresOnly = false) {
    if (this.b3) return this.b3.pick(e.clientX, e.clientY, squaresOnly);
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      if (squaresOnly && el.closest('.ch-piece')) continue;
      const hit = el.closest('.ch-piece[data-sq], .ch-squares i[data-sq]');
      if (hit && this.boardEl.contains(hit) && !hit.classList.contains('is-gone')) return +hit.dataset.sq;
    }
    return -1;
  }

  // Tap a piece then a square, or drag a piece: it lifts and hops square to square under your finger.
  wireBoard() {
    const wrap = this.wrapEl;
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (this.over || this.busy) return;
      // With a piece picked up, a legal square under the finger wins over a piece standing in front of it
      if (this.selected >= 0) {
        const under = this.sqAt(e, true);
        if (under >= 0 && under !== this.selected && this.tryMove(under)) return;
      }
      const sq = this.sqAt(e);
      if (sq < 0) return;
      const p = this.state.board[sq];
      if (this.selected >= 0 && this.selected !== sq && this.tryMove(sq)) return;
      if (p && p.c === this.state.turn) {
        this.select(sq);
        const el = this.b3 ? null : this.pieceEls.get(p.id);
        if (el || this.b3) {
          wrap.setPointerCapture(e.pointerId);
          drag = { el, sq, over: sq, x: e.clientX, y: e.clientY, moved: false };
        }
      } else this.select(-1);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.moved = true;
      if (this.b3) {
        const over = this.b3.drag(drag.sq, e.clientX, e.clientY);
        if (over !== drag.over) {
          drag.over = over;
          if (over >= 0) this.ctx.haptic(3);
        }
        return;
      }
      const over = this.sqAt(e, true);
      if (over < 0 || over === drag.over) return;
      drag.over = over;
      drag.el.classList.remove('no-anim');
      drag.el.classList.add('is-lifted');
      drag.el.style.transform = `translate(${(over % 8) * 100}%, ${Math.floor(over / 8) * 100}%)`;
      this.ctx.haptic(3);
    });
    const end = (e) => {
      if (!drag) return;
      const { el, sq, over, moved } = drag;
      drag = null;
      if (!moved) return;
      if (e.type === 'pointerup' && over >= 0 && over !== sq && this.tryMove(over, true)) return;
      if (this.b3) this.b3.endDrag(sq);
      else this.placeEl(el, sq, true);
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
  }

  select(sq) {
    this.selected = sq;
    this.targets = sq >= 0 ? legalMoves(this.state).filter((m) => m.from === sq) : [];
    if (sq >= 0) this.ctx.haptic(4);
    this.drawMarks();
  }

  tryMove(to, dropped = false) {
    const opts = this.targets.filter((m) => this.targetSq(m) === to || (m.castle && m.to === to));
    if (!opts.length) return false;
    if (opts.some((m) => m.promo)) {
      this.pickPromotion(to, opts, dropped);
      return true;
    }
    this.commit(opts[0], dropped);
    return true;
  }

  pickPromotion(to, opts, dropped) {
    const color = this.state.turn;
    const el = document.createElement('div');
    el.className = 'ch-promo';
    el.innerHTML = `<div class="ch-promo-card"><p>Promote to</p>${['q', 'r', 'b', 'n']
      .map((t) => `<button data-promo="${t}">${pieceSvg(t, color)}</button>`)
      .join('')}</div>`;
    this.wrapEl.append(el);
    this.busy = true;
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-promo]')?.dataset.promo;
      el.remove();
      this.busy = false;
      if (!t) {
        this.b3?.endDrag(opts[0].from);
        this.draw(false);
        return;
      }
      this.commit(opts.find((m) => m.promo === t), dropped);
    });
  }

  commit(m, dropped) {
    const prev = this.state;
    const next = play(prev, m);
    if (next === prev) return;
    this.history.push({ state: prev, sans: this.sans.slice() });
    this.state = next;
    this.sans.push(next.events.san);
    this.selected = -1;
    this.targets = [];
    if (this.clock) this.clock[prev.turn] += this.clock.inc;
    if (this.b3 && dropped) {
      this.b3.dropFromHover(m.to);
      dropped = false; // let everything else (captures, castling rook) animate
    }
    this.moveFx(next.events, dropped);
    if (this.handoffs && !next.result) {
      // Show the mover their own move for a beat, then hide the board and hand over
      this.draw(!dropped);
      this.stopClock();
      this.busy = true;
      this.pending.push(setTimeout(() => this.handoff(), 650));
      return;
    }
    if (this.cfg.view === 'flip' && !next.result) {
      // Let the move land before the board turns around
      this.hold = prev.turn;
      this.busy = true;
      this.draw(!dropped);
      this.pending.push(
        setTimeout(() => {
          this.hold = null;
          this.busy = false;
          this.draw(true);
        }, 520),
      );
    } else this.draw(!dropped);
    if (next.result) this.finish(next.result);
    else this.startTurn();
  }

  moveFx(ev, dropped) {
    const sfx = this.ctx.sfx;
    const capture = ev.removed.length > 0;
    if (ev.blast != null) {
      sfx.tone({ freq: 140, to: 30, dur: 0.55, type: 'sawtooth', gain: 0.05 });
      sfx.tone({ freq: 80, to: 25, dur: 0.6, type: 'square', gain: 0.04, delay: 0.03 });
      this.ctx.haptic(40);
      this.burst(ev.blast);
    } else if (capture) {
      sfx.tone({ freq: 300, to: 140, dur: 0.12, type: 'square', gain: 0.03 });
      sfx.tone({ freq: 900, dur: 0.05, type: 'triangle', gain: 0.03 });
      this.ctx.haptic(14);
    } else {
      sfx.tone({ freq: 620, dur: 0.05, type: 'triangle', gain: 0.045, delay: dropped ? 0 : 0.12 });
      if (ev.move.castle) sfx.tone({ freq: 560, dur: 0.05, type: 'triangle', gain: 0.04, delay: 0.26 });
      this.ctx.haptic(8);
    }
    if (ev.check) {
      sfx.tone({ freq: 880, dur: 0.12, type: 'sine', gain: 0.03, delay: 0.18 });
      sfx.tone({ freq: 1320, dur: 0.18, type: 'sine', gain: 0.025, delay: 0.26 });
    }
  }

  burst(sq) {
    if (this.b3) return this.b3.burst(sq);
    const el = document.createElement('span');
    el.className = 'ch-burst';
    el.style.cssText = `left:${((sq % 8) + 0.5) * 12.5}%;top:${(Math.floor(sq / 8) + 0.5) * 12.5}%`;
    this.root.querySelector('.ch-fx').append(el);
    this.boardEl.classList.remove('is-shake');
    void this.boardEl.offsetWidth;
    this.boardEl.classList.add('is-shake');
    setTimeout(() => el.remove(), 800);
  }

  async handoff() {
    this.busy = true;
    this.gameEl.classList.add('is-hidden');
    await this.ctx.passTo(this.playerOf(this.state.turn), { message: 'Pass the phone to', hint: `Playing ${this.state.turn === 'w' ? 'White' : 'Black'} in the fog.` });
    if (this.view !== 'game') return;
    this.fogViewer = this.state.turn;
    this.gameEl.classList.remove('is-hidden');
    this.busy = false;
    this.draw(false);
    this.startTurn();
  }

  /* ---------------------------------------------------------------- Clock */

  startClock() {
    this.stopClock();
    if (!this.clock || this.over) return;
    this.tickAt = performance.now();
    this.ticker = setInterval(() => this.tick(), 100);
  }

  stopClock() {
    if (this.ticker) this.tick();
    clearInterval(this.ticker);
    this.ticker = null;
  }

  tick() {
    const now = performance.now();
    const color = this.state.turn;
    this.clock[color] -= now - this.tickAt;
    this.tickAt = now;
    const el = this.root.querySelector(`[data-clock="${color}"]`);
    if (el) {
      el.textContent = fmtClock(this.clock[color]);
      el.classList.toggle('is-low', this.clock[color] < 20000);
    }
    const left = this.clock[color];
    if (left < 10000 && left > 0 && Math.floor(left / 1000) !== this.lastBeep) {
      this.lastBeep = Math.floor(left / 1000);
      this.ctx.sfx.tick();
    }
    if (left <= 0 && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
      this.finish({ winner: color === 'w' ? 'b' : 'w', reason: 'time' });
    }
  }

  /* -------------------------------------------------------------- Results */

  finish(result) {
    this.stopClock();
    this.over = result;
    this.busy = false;
    this.gameEl.classList.remove('is-hidden');
    if (result.winner) this.match.score[result.winner === 'w' ? 0 : 1]++;
    else this.match.draws++;
    this.draw(false);
    if (result.winner) this.pending.push(setTimeout(() => this.ctx.sfx.win(), 250));
    else this.ctx.sfx.draw();
    this.pending.push(setTimeout(() => this.showResult(), 1200));
  }

  showResult() {
    const r = this.over;
    const winner = r.winner ? this.playerOf(r.winner) : null;
    const [p0, p1] = this.seats;
    const overlay = document.createElement('div');
    overlay.className = 'kit-result';
    overlay.innerHTML = `
      <div class="kit-result-card" style="--pc:${winner?.color ?? '#a1a1aa'}">
        <div class="kit-result-hero ${winner ? '' : 'ch-draw'}">
          ${winner ? `<span class="kit-trophy">${icon('trophy')}</span><span class="avatar" style="--pc:${winner.color}">${initial(winner)}</span>` : `${pieceSvg('k', 'w')}${pieceSvg('k', 'b')}`}
        </div>
        <p class="kit-result-eyebrow">${REASONS[r.reason]}</p>
        <h2>${winner ? `${escapeHtml(winner.name)} wins!` : 'It’s a draw'}</h2>
        <p class="kit-result-sub">${winner ? `Playing ${r.winner === 'w' ? 'White' : 'Black'} in ${Math.ceil(this.sans.length / 2)} moves.` : `After ${Math.ceil(this.sans.length / 2)} moves.`}</p>
        <div class="kit-result-score">
          <span style="--pc:${p0.color}"><em>${escapeHtml(p0.name)}</em><b>${this.match.score[0]}</b></span>
          <i></i>
          <span style="--pc:${p1.color}"><b>${this.match.score[1]}</b><em>${escapeHtml(p1.name)}</em></span>
        </div>
        ${this.match.draws ? `<p class="kit-result-draws">${this.match.draws} draw${this.match.draws === 1 ? '' : 's'}</p>` : ''}
        <div class="kit-result-actions">
          <button class="btn btn-primary" data-act="rematch">${icon('replay')}Rematch</button>
          <button class="btn btn-glass" data-act="review">${icon('map')}See board</button>
          <button class="btn btn-glass" data-act="setup-now">${icon('settings')}Setup</button>
        </div>
      </div>`;
    this.gameEl.append(overlay);
    if (winner) this.ctx.confetti({ colors: [winner.color, '#ffffff', '#f59e0b'] });
  }

  async confirmThen(opts, fn) {
    const wasRunning = !!this.ticker;
    this.stopClock();
    if (await this.ctx.confirm(opts)) fn();
    else if (wasRunning) this.startClock();
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
      case 'toggle': {
        // Exactly two players: tapping someone new swaps them in for Black
        const p = this.roster.find((x) => x.id === v);
        if (this.seats.includes(p)) {
          this.ctx.sfx.deny();
          this.ctx.toast('Tap someone else to swap them in.', { icon: 'users', duration: 1800 });
          return;
        }
        return setup(() => (this.seats[1] = p));
      }
      case 'shuffle':
        return setup(() => shuffle(this.seats));
      case 'mode':
        return setup(() => (c.mode = v));
      case 'clock':
      case 'view':
      case 'theme':
      case 'hints':
        return setup(() => (c[act] = v));
      case 'start':
        return this.startMatch();

      case 'undo': {
        if (this.busy || !this.history.length || this.over) return;
        // Fog of War: undo both plies so the board goes back to your own turn.
        // Against a bot, step back past its moves to the last one a person made.
        const steps = this.handoffs && this.history.length >= 2 ? 2 : 1;
        let h;
        for (let i = 0; i < steps; i++) h = this.history.pop();
        while (this.history.length && isBot(this.playerOf(h.state.turn))) h = this.history.pop();
        this.botToken = (this.botToken ?? 0) + 1;
        this.state = h.state;
        this.sans = h.sans;
        this.selected = -1;
        this.ctx.sfx.close();
        this.draw(true);
        this.startTurn();
        return;
      }
      case 'draw': {
        if (this.busy || this.over) return;
        const from = this.playerOf(this.state.turn);
        const to = this.playerOf(this.state.turn === 'w' ? 'b' : 'w');
        if (isBot(to)) {
          // Bots take a draw only when they're behind
          const behind = material(this.state) * (this.state.turn === 'w' ? 1 : -1) >= 2;
          if (behind) return this.finish({ winner: null, reason: 'agreed' });
          this.ctx.sfx.deny();
          return this.ctx.toast(`${to.name} declines. Play on!`, { icon: 'swap', duration: 1800 });
        }
        return this.confirmThen(
          { title: `${to.name}, accept a draw?`, message: `${from.name} is offering a draw.`, confirmLabel: 'Accept draw' },
          () => this.finish({ winner: null, reason: 'agreed' }),
        );
      }
      case 'resign': {
        if (this.busy || this.over) return;
        const me = this.state.turn;
        return this.confirmThen(
          { title: `${this.playerOf(me).name}, resign?`, message: 'Your opponent wins this game.', confirmLabel: 'Resign', danger: true },
          () => this.finish({ winner: me === 'w' ? 'b' : 'w', reason: 'resign' }),
        );
      }
      case 'setup':
        if (this.busy) return;
        if (!this.sans.length || this.over) return this.showSetup();
        return this.confirmThen({ title: 'Leave this game?', message: 'The game in progress will end.', confirmLabel: 'End game', danger: true }, () => this.showSetup());
      case 'rematch':
        this.root.querySelector('.kit-result')?.remove();
        // Swap colours each game
        this.seats.reverse();
        this.match.score.reverse();
        return this.newRound();
      case 'review':
        this.root.querySelector('.kit-result')?.remove();
        return;
      case 'result':
        if (!this.root.querySelector('.kit-result')) this.showResult();
        return;
      case 'setup-now':
        return this.showSetup();
    }
  }

  clearPending() {
    this.pending.forEach(clearTimeout);
    this.pending = [];
  }

  destroy() {
    this.stopClock();
    this.clearPending();
    this.botToken = (this.botToken ?? 0) + 1;
    if (this.worker) this.worker.terminate();
    this.disposeBoard();
  }
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export default {
  async mount(stage, ctx) {
    const link = await loadStyles(new URL('./style.css', import.meta.url).href);
    // Real 3D board when WebGL is available (?flat forces the lightweight CSS board)
    let Board3D = null;
    if (!new URLSearchParams(location.search).has('flat') && hasWebGL()) Board3D = (await import('./board3d.js').catch(() => null))?.Board3D ?? null;
    const game = new Chess(stage, ctx, Board3D);
    if (new URLSearchParams(location.search).has('debug')) window.__chess = game;
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};
