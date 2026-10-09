import { newPuzzle, newEvil, guess, solve, penalty, canGuess, secretError, normalize, buildPool, hidden } from './engine.js';
import { CATEGORIES, EXTRA } from './words.js';
import { chooseGuess, chooseSecret } from './ai.js';
import { icon } from '../../icons.js';
import { botLevel } from '../../bots.js';
import { playersSection, toggleSeat, shuffle, loadStyles, segRow, modeGrid, initial, escapeHtml, isBot, thinking, botTurn } from '../kit.js';

const GUESTS = [
  { id: 'guest-1', name: 'Player 1', color: '#8b5cf6' },
  { id: 'guest-2', name: 'Player 2', color: '#ec4899' },
];
const MAX_SEATS = 6;

const MODES = [
  { id: 'race', name: 'Race', desc: 'One word for everyone. Hit a letter, go again.', icon: '<path d="M4 20V5M4 5h11l-2 3.5L15 12H4"/><path d="M18 14v6M15 17h6"/>' },
  { id: 'classic', name: 'Word Master', desc: 'Take turns setting a secret word for the rest.', icon: '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/>' },
  { id: 'coop', name: 'Team Streak', desc: 'All of you vs. the gallows. How long can you last?', icon: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>' },
  { id: 'evil', name: 'Evil', desc: 'The computer cheats and changes its word to dodge you.', icon: '<path d="M5 4l3 4M19 4l-3 4"/><circle cx="12" cy="13" r="7"/><path d="M9 12l2 1M15 12l-2 1M9.5 16.5c1.5-1 3.5-1 5 0"/>' },
  { id: 'duel', name: 'Duel', desc: 'Set a word for each other. First to crack theirs wins.', icon: '<path d="M4 20 15 9M15 9l1-5 4 4-5 1M20 20 9 9M9 9 8 4 4 8l5 1"/>' },
  { id: 'blitz', name: 'Blitz', desc: 'Race on a shot clock. Too slow costs a life.', icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
];
const HINTS = {
  race: 'Hit a letter to go again. Solve for a bonus.',
  classic: 'Hit a letter to go again. Solve for a bonus.',
  coop: 'Work together. Every word in a row adds to the streak.',
  evil: 'It’s cheating. Every letter you try, it dodges.',
  duel: 'One guess each. First to crack their word wins.',
  blitz: 'Quick! Run out the clock and you lose a life.',
};

const LIVES = [6, 8, 10];
const ROUNDS = [3, 5, 10];
const LAPS = [1, 2];
const WINS = [1, 2, 3];
const CLOCKS = [5, 8, 12];
const DEFAULTS = { mode: 'race', category: 'all', lives: 8, rounds: 5, laps: 1, wins: 2, clock: 8, seats: null };
const SOLVE_BONUS = 3;
const HANG_BONUS = 3;
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

// The gallows and figure, drawn one part per miss (10 parts; fewer lives start partly built).
const PARTS = [
  '<path d="M16 186h108"/>',
  '<path d="M46 186V18"/>',
  '<path d="M40 18h104M46 52l34-34"/>',
  '<path d="M140 18v26"/>',
  '<circle cx="140" cy="60" r="16"/>',
  '<path d="M140 76v50"/>',
  '<path d="M140 90l-22 20"/>',
  '<path d="M140 90l22 20"/>',
  '<path d="M140 126l-18 32"/>',
  '<path d="M140 126l18 32"/>',
];
const FIGURE_FROM = 4; // parts from here on hang from the rope and swing

const POOL = buildPool(CATEGORIES, EXTRA);
const SINGLE_WORDS = POOL.filter((w) => /^[A-Z]+$/.test(w));

class Hangman {
  constructor(stage, ctx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'hm';
    stage.append(this.root);
    this.roster = ctx.players.length >= 2 ? ctx.players : [...ctx.players, ...GUESTS].slice(0, 2);
    this.cfg = { ...DEFAULTS, ...(ctx.storage.get() ?? {}) };
    if (!MODES.some((m) => m.id === this.cfg.mode)) this.cfg.mode = DEFAULTS.mode;
    if (this.cfg.category !== 'all' && !CATEGORIES.some((c) => c.id === this.cfg.category)) this.cfg.category = 'all';
    const seated = (this.cfg.seats ?? []).map((id) => this.roster.find((p) => p.id === id)).filter(Boolean);
    this.seats = seated.length ? [...new Set(seated)].slice(0, MAX_SEATS) : this.roster.slice(0, 2);
    this.used = new Set();
    this.pending = [];
    this.locked = true;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.onKey = (e) => {
      if (this.view !== 'game' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input')) return;
      const L = e.key?.toUpperCase();
      if (L?.length === 1 && L >= 'A' && L <= 'Z') this.humanGuess(L);
    };
    document.addEventListener('keydown', this.onKey);
  }

  get mode() {
    return this.cfg.mode;
  }

  /* -------------------------------------------------------------- Setup */

  showSetup() {
    const rerender = this.view === 'setup';
    this.view = 'setup';
    this.clearPending();
    this.root.querySelector('.hm-secret')?.remove();
    const scroll = this.root.querySelector('.kit-setup-scroll')?.scrollTop ?? 0;
    const c = this.cfg;
    const cat = (id, emoji, name) =>
      `<button class="hm-cat ${c.category === id ? 'on' : ''}" data-act="category" data-v="${id}"><span>${emoji}</span>${name}</button>`;
    const hint = {
      duel: 'Duel is for exactly two players.',
      classic: 'Everyone takes a turn as the Word Master. 2 to 6 players.',
    }[c.mode] ?? 'Play alone or with up to 6. Tap to add or remove players.';
    let match = '';
    if (c.mode === 'classic') match = segRow('Turns each', 'laps', LAPS.map((n) => [n, `${n}×`]), c.laps);
    else if (c.mode === 'duel') match = segRow('Wins needed', 'wins', WINS.map((n) => [n, n]), c.wins);
    else if (c.mode !== 'coop') match = segRow('Words', 'rounds', ROUNDS.map((n) => [n, n]), c.rounds);
    const best = this.ctx.storage.get()?.best ?? 0;

    this.root.innerHTML = `
      <div class="kit-setup">
        <div class="kit-setup-scroll">
          ${playersSection({ roster: this.roster, seats: this.seats, max: MAX_SEATS, hint })}
          <section class="kit-sec">
            <h3 class="kit-h">Mode</h3>
            ${modeGrid(MODES, c.mode)}
          </section>
          ${
            c.mode === 'evil'
              ? `<section class="kit-sec"><h3 class="kit-h">Words</h3><p class="kit-fixed">Any everyday word, 4 to 6 letters. The computer never actually picks one, it just keeps dodging.</p></section>`
              : `<section class="kit-sec">
                  <h3 class="kit-h">Words</h3>
                  <div class="hm-cats">
                    ${cat('all', '🎲', 'Everything')}
                    ${CATEGORIES.map((x) => cat(x.id, x.emoji, x.name)).join('')}
                  </div>
                  ${c.mode === 'classic' || c.mode === 'duel' ? '<p class="kit-hint">Word Masters type their own word or grab a random one from here.</p>' : ''}
                </section>`
          }
          <section class="kit-sec">
            <h3 class="kit-h">Game</h3>
            ${segRow('Lives', 'lives', LIVES.map((n) => [n, n]), c.lives)}
            ${match}
            ${c.mode === 'blitz' ? segRow('Shot clock', 'clock', CLOCKS.map((n) => [n, `${n}s`]), c.clock) : ''}
            ${c.mode === 'coop' && best ? `<p class="kit-hint">Best streak so far: <b>${best}</b></p>` : ''}
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
    const n = this.seats.length;
    if (this.mode === 'duel' && n !== 2) return this.refuse('Duel is for exactly two players.');
    if (this.mode === 'classic' && n < 2) return this.refuse('Word Master needs at least 2 players.');
    this.cfg.seats = this.seats.map((p) => p.id);
    this.ctx.storage.set({ ...this.ctx.storage.get(), ...this.cfg });
    this.match = {
      round: 0,
      scores: this.seats.map(() => 0),
      wins: this.seats.map(() => 0),
      streak: 0,
      total: this.mode === 'classic' ? n * this.cfg.laps : this.mode === 'coop' || this.mode === 'duel' ? Infinity : this.cfg.rounds,
    };
    this.nextRound();
  }

  refuse(msg) {
    this.ctx.sfx.deny();
    this.ctx.toast(msg, { icon: 'users', duration: 2000 });
  }

  categoryWords() {
    if (this.cfg.category === 'all') return CATEGORIES.flatMap((c) => c.words.map((w) => ({ w, c })));
    const c = CATEGORIES.find((x) => x.id === this.cfg.category);
    return c.words.map((w) => ({ w, c }));
  }

  randomWord() {
    let list = this.categoryWords().filter((x) => !this.used.has(normalize(x.w)));
    if (!list.length) {
      this.used.clear();
      list = this.categoryWords();
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    this.used.add(normalize(pick.w));
    return { answer: pick.w, clue: `${pick.c.emoji} ${pick.c.name}` };
  }

  async nextRound() {
    this.clearPending();
    this.root.querySelector('.kit-result')?.remove();
    const m = this.match;
    m.round++;
    const n = this.seats.length;
    const lives = this.cfg.lives;
    this.locked = true;
    this.lastGuesser = null;
    this.colors = {};
    this.duel = null;
    this.setter = null;

    if (this.mode === 'classic') {
      const setter = (m.round - 1) % n;
      this.setter = setter;
      const { answer, clue } = await this.askSecret(setter, 'everyone');
      if (this.view === 'void') return;
      this.puzzle = newPuzzle(answer, lives);
      this.clue = clue;
      this.guessers = this.seats.map((_, i) => i).filter((i) => i !== setter);
      this.turn = this.guessers.find((g) => g > setter) ?? this.guessers[0];
    } else if (this.mode === 'duel') {
      // Each player sets the word the other one has to crack
      const forOther = [];
      for (const i of [0, 1]) {
        const s = await this.askSecret(i, this.seats[1 - i].name);
        if (this.view === 'void') return;
        forOther[i] = s;
      }
      this.duel = [0, 1].map((i) => ({ puzzle: newPuzzle(forOther[1 - i].answer, lives), clue: forOther[1 - i].clue }));
      this.guessers = [0, 1];
      this.turn = (m.round - 1) % 2;
    } else {
      if (this.mode === 'evil') {
        // 4–6 letters: the lengths with enough words for the computer to keep dodging
        const len = [4, 5, 5, 6, 6][Math.floor(Math.random() * 5)];
        this.puzzle = newEvil(SINGLE_WORDS, len, lives);
        this.clue = `😈 ${len} letters`;
      } else {
        const { answer, clue } = this.randomWord();
        this.puzzle = newPuzzle(answer, lives);
        this.clue = clue;
      }
      this.guessers = this.seats.map((_, i) => i);
      this.turn = (m.round - 1) % n;
    }

    // Hand the phone to whoever guesses first (if a person just set the word)
    const first = this.seats[this.turn];
    const setterPerson = this.mode === 'classic' ? !isBot(this.seats[this.setter]) : this.mode === 'duel' && this.seats.some((p) => !isBot(p));
    if (setterPerson && !isBot(first) && this.seats.filter((p) => !isBot(p)).length > 1) {
      await this.ctx.passTo(first, { message: 'Hand the phone to', hint: this.mode === 'duel' ? 'Both words are locked in.' : 'Time to guess!' });
      if (this.view === 'void') return;
    }
    this.renderGame();
    this.ctx.sfx.select();
    this.startTurn();
  }

  // A secret word from seat `i` (a bot picks one; a person types it in private).
  askSecret(i, forWho) {
    const p = this.seats[i];
    if (isBot(p)) {
      const words = this.categoryWords();
      const answer = chooseSecret(words.map((x) => x.w), botLevel(p));
      const c = words.find((x) => normalize(x.w) === answer)?.c;
      return Promise.resolve({ answer, clue: c ? `${c.emoji} ${c.name}` : '' });
    }
    return new Promise(async (resolve) => {
      if (this.seats.filter((x) => !isBot(x)).length > 1) {
        this.root.innerHTML = '';
        await this.ctx.passTo(p, { message: 'Pass the phone to', hint: 'Everyone else, look away!' });
      }
      if (this.view === 'void') return;
      this.view = 'secret';
      let random = null;
      const el = document.createElement('div');
      el.className = 'hm-secret';
      el.style.setProperty('--pc', p.color);
      el.innerHTML = `
        <div class="hm-secret-card">
          <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
          <p class="hm-secret-eyebrow">${escapeHtml(p.name)}, you’re the Word Master</p>
          <h2>Pick a secret for ${escapeHtml(forWho)}</h2>
          <label class="hm-field">
            <input class="hm-input" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" placeholder="Secret word or phrase" enterkeyhint="next">
            <button class="hm-eye" type="button" data-peek aria-label="Show word">${icon('mask')}</button>
          </label>
          <label class="hm-field"><input class="hm-cluein" type="text" autocomplete="off" maxlength="24" placeholder="Clue (optional), e.g. Animal" enterkeyhint="done"></label>
          <p class="hm-secret-err"></p>
          <div class="hm-secret-actions">
            <button class="btn btn-glass" data-random>${icon('sparkle')}Random</button>
            <button class="btn btn-primary" data-lock>${icon('lock')}Lock it in</button>
          </div>
        </div>`;
      this.root.innerHTML = '';
      this.root.append(el);
      const input = el.querySelector('.hm-input');
      const clue = el.querySelector('.hm-cluein');
      const err = el.querySelector('.hm-secret-err');
      setTimeout(() => input.focus(), 350);
      el.querySelector('[data-peek]').addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        this.ctx.sfx.tap();
      });
      el.querySelector('[data-random]').addEventListener('click', () => {
        random = this.randomWord();
        input.value = normalize(random.answer);
        clue.value = random.clue.replace(/^\S+\s/, '');
        input.type = 'text';
        err.textContent = '';
        this.ctx.sfx.tap();
        this.ctx.haptic();
      });
      const lock = () => {
        const problem = secretError(input.value);
        if (problem) {
          err.textContent = problem;
          this.ctx.sfx.deny();
          this.ctx.haptic(20);
          return;
        }
        this.ctx.sfx.select();
        this.ctx.haptic(12);
        el.remove();
        const text = clue.value.trim();
        resolve({ answer: input.value, clue: text ? `💡 ${text}` : '' });
      };
      el.querySelector('[data-lock]').addEventListener('click', lock);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && clue.focus());
      clue.addEventListener('keydown', (e) => e.key === 'Enter' && lock());
    });
  }

  /* --------------------------------------------------------------- Game */

  // The puzzle the current player is working on.
  get board() {
    return this.duel ? this.duel[this.turn].puzzle : this.puzzle;
  }
  set board(p) {
    if (this.duel) this.duel[this.turn].puzzle = p;
    else this.puzzle = p;
  }
  get boardClue() {
    return this.duel ? this.duel[this.turn].clue : this.clue;
  }

  renderGame() {
    this.view = 'game';
    const m = this.match;
    const coop = this.mode === 'coop';
    const roundLabel =
      this.mode === 'coop' ? `Streak <b class="hm-streak">${m.streak}</b>` : this.mode === 'duel' ? `Round ${m.round}` : `Word ${m.round}<small>/${m.total}</small>`;
    this.root.innerHTML = `
      <div class="hm-game mode-${this.mode}">
        <div class="hm-hud ${this.seats.length <= 2 ? 'is-duo' : ''}" style="--n:${this.seats.length}">
          ${this.seats.map((p, i) => this.playerChip(i, coop)).join('')}
        </div>
        <div class="hm-meta">
          <span class="hm-round">${roundLabel}</span>
          <span class="hm-clue"></span>
          <span class="hm-lives"></span>
        </div>
        <div class="hm-stage">
          <svg class="hm-gallows" viewBox="0 0 200 200" aria-hidden="true">
            <g class="hm-frame">${PARTS.slice(0, FIGURE_FROM).map((d, i) => `<g class="hm-part" data-part="${i}">${d}</g>`).join('')}</g>
            <g class="hm-figure">
              ${PARTS.slice(FIGURE_FROM).map((d, i) => `<g class="hm-part" data-part="${i + FIGURE_FROM}">${d}</g>`).join('')}
              <g class="hm-face hm-face-dead"><path d="M133 55l5 5M138 55l-5 5M142 55l5 5M147 55l-5 5"/><path d="M134 68c4-3 8-3 12 0"/></g>
              <g class="hm-face hm-face-happy"><circle cx="135" cy="57" r="1.6"/><circle cx="145" cy="57" r="1.6"/><path d="M134 64c3 4 9 4 12 0"/></g>
            </g>
          </svg>
          ${this.duel ? '<div class="hm-rival"></div>' : ''}
        </div>
        <div class="hm-word"></div>
        <div class="hm-status"><p class="hm-turn"></p><p class="hm-sub"></p><span class="hm-clock"><i></i></span></div>
        <div class="hm-keys">${KEY_ROWS.map((row) => `<div class="hm-row">${[...row].map((L) => `<button class="hm-key" data-act="key" data-v="${L}">${L}</button>`).join('')}</div>`).join('')}</div>
        <div class="kit-controls">
          <button class="kit-ctrl hm-solve-btn" data-act="solve">${icon('sparkle')}<span>Solve</span></button>
          <button class="kit-ctrl" data-act="setup">${icon('settings')}<span>Setup</span></button>
        </div>
      </div>`;
    this.gameEl = this.root.querySelector('.hm-game');
    this.wordKey = null;
    this.drawn = -1;
    this.resizeObs?.disconnect();
    this.resizeObs = new ResizeObserver(() => this.sizeTiles());
    this.resizeObs.observe(this.root.querySelector('.hm-word'));
    this.update(false);
  }

  playerChip(seat, coop) {
    const p = this.seats[seat];
    const role = this.setter === seat ? '<span class="hm-role">Word Master</span>' : '';
    return `
      <div class="hm-player" data-seat="${seat}" style="--pc:${p.color}">
        <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
        <span class="hm-player-info"><span class="hm-player-name">${escapeHtml(p.name)}</span>${role}</span>
        ${coop ? '' : `<b class="hm-score">0</b>`}
      </div>`;
  }

  // Letter tiles, grouped by word so words never break across lines.
  wordHtml(p) {
    let i = 0;
    return p.shown
      .split(' ')
      .map((word) => {
        const tiles = [...word]
          .map((ch) => {
            const idx = i++;
            if (ch === '-' || ch === "'") return `<span class="hm-punct ${ch === "'" ? 'is-apos' : ''}" data-i="${idx}">${ch === "'" ? '’' : ch}</span>`;
            const color = this.tileColors?.[idx];
            return `<span class="hm-tile ${ch === '_' ? '' : 'is-on'}" data-i="${idx}" ${color ? `style="--pc:${color}"` : ''}><b>${ch === '_' ? '' : ch}</b></span>`;
          })
          .join('');
        i++; // the space
        return `<span class="hm-wordgrp">${tiles}</span>`;
      })
      .join('');
  }

  sizeTiles() {
    const box = this.root.querySelector('.hm-word');
    if (!box || !this.board) return;
    const words = this.board.shown.split(' ');
    const longest = Math.max(...words.map((w) => w.length));
    const total = this.board.shown.length;
    const W = box.clientWidth;
    const gap = 5;
    let ts = Math.floor((W + gap) / longest - gap);
    // Long phrases: shrink so they fit in about three lines
    const perLine = Math.max(longest, Math.ceil(total / 3));
    ts = Math.min(ts, Math.floor((W + gap) / perLine - gap), 46);
    box.style.setProperty('--ts', `${Math.max(16, ts)}px`);
  }

  update(animate = true) {
    const p = this.board;
    const seatP = this.seats[this.turn];
    this.gameEl.style.setProperty('--tc', seatP.color);

    // Word tiles: rebuild for a new puzzle, flip in new letters otherwise
    const box = this.root.querySelector('.hm-word');
    const key = `${this.duel ? this.turn : ''}:${this.match.round}`;
    if (this.wordKey !== key) {
      this.wordKey = key;
      this.tileColors = this.duel ? (this.duel[this.turn].colors ??= {}) : (this.colors ??= {});
      box.innerHTML = this.wordHtml(p);
      this.sizeTiles();
    } else {
      let k = 0;
      [...p.shown].forEach((ch, i) => {
        const el = box.querySelector(`.hm-tile[data-i="${i}"]`);
        if (!el || ch === '_' || el.classList.contains('is-on')) return;
        el.querySelector('b').textContent = ch;
        const color = this.lastGuesser != null ? this.seats[this.lastGuesser].color : '#a1a1aa';
        this.tileColors[i] = color;
        el.style.setProperty('--pc', color);
        el.style.setProperty('--d', `${k++ * 70}ms`);
        el.classList.add('is-on');
        if (animate) el.classList.add('is-flip');
      });
    }
    // Hanged: show what it was, in red
    if (p.status === 'hanged' && p.answer) {
      let k = 0;
      [...p.answer].forEach((ch, i) => {
        const el = box.querySelector(`.hm-tile[data-i="${i}"]`);
        if (!el || el.classList.contains('is-on')) return;
        el.querySelector('b').textContent = ch;
        el.style.setProperty('--d', `${150 + k++ * 60}ms`);
        el.classList.add('is-on', 'is-lost', 'is-flip');
      });
    }
    this.gameEl.classList.toggle('is-solved', p.status === 'solved');
    this.gameEl.classList.toggle('is-hanged', p.status === 'hanged');

    // Gallows
    const pre = PARTS.length - p.lives;
    const shown = pre + p.wrong.length;
    this.root.querySelectorAll('.hm-part').forEach((el) => {
      const i = +el.dataset.part;
      const on = i < shown;
      if (on && !el.classList.contains('on')) {
        el.classList.add('on');
        if (animate && i >= pre) el.classList.add('is-new');
      } else if (!on) el.classList.remove('on', 'is-new');
    });
    this.root.querySelector('.hm-gallows').classList.toggle('is-danger', p.lives - p.wrong.length <= 2 && p.status === 'playing');

    // Meta: clue + lives
    this.root.querySelector('.hm-clue').textContent = this.boardClue || '';
    const left = Math.max(0, p.lives - p.wrong.length);
    this.root.querySelector('.hm-lives').innerHTML = `<span>${left}</span>${'<i></i>'.repeat(left)}${'<i class="off"></i>'.repeat(p.lives - left)}`;

    // Keyboard
    this.root.querySelectorAll('.hm-key').forEach((el) => {
      const L = el.dataset.v;
      const used = p.guessed.includes(L);
      el.classList.toggle('is-hit', used && !p.wrong.includes(L));
      el.classList.toggle('is-miss', p.wrong.includes(L));
      el.disabled = used || p.status !== 'playing';
    });

    // HUD
    this.root.querySelectorAll('.hm-player').forEach((el) => {
      const seat = +el.dataset.seat;
      el.classList.toggle('is-active', seat === this.turn && p.status === 'playing');
      el.classList.toggle('is-setter', seat === this.setter);
      const score = el.querySelector('.hm-score');
      if (score) score.textContent = this.mode === 'duel' ? this.match.wins[seat] : this.match.scores[seat];
    });
    if (this.duel) this.drawRival();

    // Status
    const turn = this.root.querySelector('.hm-turn');
    const sub = this.root.querySelector('.hm-sub');
    if (p.status === 'playing') {
      turn.innerHTML = `<span class="hm-dot" style="--pc:${seatP.color}"></span><span><b>${escapeHtml(seatP.name)}</b>’s guess</span>`;
      sub.textContent = HINTS[this.mode];
    } else {
      turn.innerHTML = p.status === 'solved' ? '<b>Solved!</b>' : '<b>Hanged!</b>';
      sub.textContent = '';
    }
    this.root.querySelector('.hm-solve-btn').disabled = p.status !== 'playing';
  }

  drawRival() {
    const other = 1 - this.turn;
    const q = this.duel[other].puzzle;
    const p = this.seats[other];
    const left = q.lives - q.wrong.length;
    this.root.querySelector('.hm-rival').innerHTML = `
      <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
      <span class="hm-rival-info">
        <b>${escapeHtml(p.name)}</b>
        <span class="hm-rival-word">${[...q.shown].map((c) => (c === ' ' ? '<i class="sp"></i>' : `<i class="${c === '_' ? '' : 'on'}"></i>`)).join('')}</span>
        <small>${left} li${left === 1 ? 'fe' : 'ves'} left</small>
      </span>`;
  }

  /* -------------------------------------------------------------- Turns */

  startTurn() {
    this.stopClock();
    const p = this.board;
    if (p.status !== 'playing') return;
    const player = this.seats[this.turn];
    if (isBot(player)) {
      this.locked = true;
      this.root.querySelector('.hm-turn').innerHTML = `<span class="hm-dot" style="--pc:${player.color}"></span>${thinking(player)}`;
      botTurn(
        this,
        () => chooseGuess(this.board, botLevel(player), POOL),
        (m) => {
          if (m.solve) return this.applySolve(m.solve);
          const key = this.root.querySelector(`.hm-key[data-v="${m.letter}"]`);
          key?.classList.add('is-press');
          this.pending.push(setTimeout(() => this.applyGuess(m.letter), 220));
        },
        { min: 650 },
      );
    } else this.locked = false;
    if (this.mode === 'blitz') this.startClock();
  }

  humanGuess(L) {
    if (this.locked || this.view !== 'game' || isBot(this.seats[this.turn])) return;
    if (!canGuess(this.board, L)) {
      if (this.board.guessed.includes(L)) this.ctx.sfx.deny();
      return;
    }
    this.applyGuess(L);
  }

  applyGuess(L) {
    this.stopClock();
    this.root.querySelectorAll('.hm-key.is-press').forEach((k) => k.classList.remove('is-press'));
    const seat = this.turn;
    const { puzzle, hits } = guess(this.board, L);
    this.board = puzzle;
    this.lastGuesser = seat;
    const sfx = this.ctx.sfx;
    if (hits) {
      if (this.mode !== 'coop' && this.mode !== 'duel') this.match.scores[seat] += hits;
      [0, 1, 2].slice(0, Math.min(3, hits)).forEach((k) => sfx.tone({ freq: 660 * 2 ** (k / 4), dur: 0.12, type: 'triangle', gain: 0.045, delay: k * 0.07 }));
      this.ctx.haptic(10);
      if (hits > 1) this.floatText(`×${hits}`, this.seats[seat].color);
    } else {
      if (this.mode === 'classic') this.match.scores[this.setter]++;
      sfx.tone({ freq: 180, to: 110, dur: 0.22, type: 'sawtooth', gain: 0.03 });
      this.ctx.haptic(22);
      this.gameEl.classList.remove('is-shake');
      void this.gameEl.offsetWidth;
      this.gameEl.classList.add('is-shake');
    }
    this.afterMove(!!hits);
  }

  applySolve(attempt) {
    this.stopClock();
    const seat = this.turn;
    const before = hidden(this.board);
    const { puzzle, correct } = solve(this.board, attempt);
    this.board = puzzle;
    this.lastGuesser = seat;
    const name = this.seats[seat].name;
    if (correct) {
      if (this.mode !== 'coop' && this.mode !== 'duel') this.match.scores[seat] += before + SOLVE_BONUS;
      this.ctx.toast(`${name} solved it!`, { icon: 'sparkle', duration: 1500 });
    } else {
      if (this.mode === 'classic') this.match.scores[this.setter]++;
      this.ctx.sfx.deny();
      this.ctx.haptic(25);
      this.ctx.toast(`Not “${normalize(attempt)}”. That cost a life.`, { icon: 'x', duration: 1800 });
    }
    this.afterMove(correct);
  }

  // After any guess: end the puzzle, keep the turn (a hit), or pass it on.
  afterMove(hit) {
    const p = this.board;
    this.update();
    if (p.status !== 'playing') return this.endPuzzle();
    const order = this.guessers;
    const next = order[(order.indexOf(this.turn) + 1) % order.length];
    if ((this.mode === 'duel' || !hit) && next !== this.turn) {
      this.locked = true; // until the next player's turn starts
      this.turn = next;
      if (this.duel) this.wordKey = null; // other player's puzzle
      this.pending.push(
        setTimeout(() => {
          this.update(false);
          this.startTurn();
        }, this.duel ? 650 : 380),
      );
    } else this.startTurn();
  }

  timeUp() {
    if (this.board.status !== 'playing') return;
    this.ctx.toast('Too slow! −1 life', { icon: 'clock', duration: 1300 });
    this.board = penalty(this.board);
    this.ctx.sfx.tone({ freq: 220, to: 90, dur: 0.3, type: 'square', gain: 0.03 });
    this.afterMove(false);
  }

  startClock() {
    const bar = this.root.querySelector('.hm-clock i');
    const ms = this.cfg.clock * 1000;
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = `kit-timer ${ms}ms linear forwards`;
    this.clockTimers = [3, 2, 1].map((t) => setTimeout(() => this.ctx.sfx.tick(), ms - t * 1000));
    this.clockTimers.push(setTimeout(() => this.timeUp(), ms));
  }

  stopClock() {
    (this.clockTimers ?? []).forEach(clearTimeout);
    this.clockTimers = [];
    const bar = this.root.querySelector('.hm-clock i');
    if (bar) bar.style.animation = 'none';
  }

  floatText(text, color) {
    const el = document.createElement('span');
    el.className = 'hm-float';
    el.textContent = text;
    el.style.setProperty('--pc', color);
    this.root.querySelector('.hm-word')?.append(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ------------------------------------------------------------ Solving */

  askSolve() {
    if (this.locked || isBot(this.seats[this.turn]) || this.board.status !== 'playing') return;
    this.stopClock();
    const p = this.board;
    const el = document.createElement('div');
    el.className = 'hm-solve';
    el.innerHTML = `
      <div class="hm-secret-card">
        <p class="hm-secret-eyebrow">${escapeHtml(this.seats[this.turn].name)}, solve it</p>
        <p class="hm-solve-shown">${escapeHtml(p.shown.replace(/_/g, '•'))}</p>
        <label class="hm-field"><input class="hm-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="The whole answer" enterkeyhint="go"></label>
        <p class="hm-secret-err">A wrong answer costs a life.</p>
        <div class="hm-secret-actions">
          <button class="btn btn-glass" data-cancel>Cancel</button>
          <button class="btn btn-primary" data-go>${icon('sparkle')}Solve</button>
        </div>
      </div>`;
    this.gameEl.append(el);
    const input = el.querySelector('input');
    setTimeout(() => input.focus(), 50);
    const close = () => {
      el.remove();
      if (this.mode === 'blitz') this.startClock();
    };
    el.querySelector('[data-cancel]').addEventListener('click', close);
    const go = () => {
      if (!input.value.trim()) return close();
      el.remove();
      this.applySolve(input.value);
    };
    el.querySelector('[data-go]').addEventListener('click', go);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  }

  /* ------------------------------------------------------------ Results */

  endPuzzle() {
    this.locked = true;
    this.stopClock();
    const p = this.board;
    const m = this.match;
    const solved = p.status === 'solved';
    let over = false;
    if (this.mode === 'duel') {
      const winner = solved ? this.turn : 1 - this.turn;
      m.wins[winner]++;
      this.roundWinner = winner;
      over = m.wins[winner] >= this.cfg.wins;
    } else if (this.mode === 'coop') {
      if (solved) m.streak++;
      else over = true;
    } else {
      if (!solved && this.mode === 'classic') m.scores[this.setter] += HANG_BONUS;
      over = m.round >= m.total;
    }
    this.update();
    if (solved) {
      this.pending.push(setTimeout(() => this.ctx.sfx.win(), 200));
      const color = this.mode === 'duel' ? this.seats[this.roundWinner].color : this.lastGuesser != null ? this.seats[this.lastGuesser].color : '#22c55e';
      this.ctx.confetti({ colors: [color, '#ffffff', '#fde68a'] });
    } else {
      [392, 330, 262, 196].forEach((f, i) => this.ctx.sfx.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.04, delay: i * 0.16 }));
      this.ctx.haptic(40);
    }
    this.pending.push(setTimeout(() => this.showResult(over), solved ? 1200 : 1700));
  }

  standings() {
    const key = this.mode === 'duel' ? this.match.wins : this.match.scores;
    return this.seats.map((p, i) => ({ i, v: key[i] })).sort((a, b) => b.v - a.v);
  }

  showResult(over) {
    const p = this.board;
    const m = this.match;
    const solved = p.status === 'solved';
    const answer = p.answer ?? p.shown;
    const tiles = answer
      .split(' ')
      .map((w) => `<span class="hm-wordgrp">${[...w].map((ch) => `<span class="hm-tile is-on ${solved ? '' : 'is-lost'}"><b>${ch === "'" ? '’' : ch}</b></span>`).join('')}</span>`)
      .join('');

    let eyebrow;
    let title;
    let sub = '';
    let hero = null;
    if (this.mode === 'coop') {
      eyebrow = solved ? `Streak ${m.streak}` : 'Game over';
      title = solved ? 'Got it!' : `Streak of ${m.streak}`;
      if (!solved) {
        const prev = this.ctx.storage.get()?.best ?? 0;
        if (m.streak > prev) {
          this.ctx.storage.set({ ...this.ctx.storage.get(), best: m.streak });
          sub = m.streak ? 'New best streak!' : '';
        } else sub = `Best: ${prev}`;
      }
    } else if (this.mode === 'duel') {
      const w = this.seats[this.roundWinner];
      hero = w;
      eyebrow = over ? 'Match winner' : `Round ${m.round}`;
      title = over ? `${escapeHtml(w.name)} takes the duel!` : `${escapeHtml(w.name)} wins the round`;
      sub = solved ? 'Cracked it first.' : `${escapeHtml(this.seats[1 - this.roundWinner].name)} got hanged.`;
    } else {
      eyebrow = over ? 'Final results' : `Word ${m.round} of ${m.total}`;
      title = solved ? (this.lastGuesser != null ? `${escapeHtml(this.seats[this.lastGuesser].name)} got it!` : 'Solved!') : 'Hanged!';
      if (this.mode === 'evil' && !solved) sub = 'The computer settled on this one in the end. Probably.';
      if (this.mode === 'classic' && !solved) sub = `${escapeHtml(this.seats[this.setter].name)} stumped everyone.`;
      if (over) {
        const top = this.standings();
        hero = top[0].v > (top[1]?.v ?? -1) ? this.seats[top[0].i] : null;
        title = hero ? `${escapeHtml(hero.name)} wins!` : 'It’s a tie!';
      }
    }

    const rows =
      this.mode === 'coop'
        ? ''
        : `<ol class="hm-standings">${this.standings()
            .map(
              ({ i, v }, rank) => `
            <li style="--pc:${this.seats[i].color}">
              <span class="hm-rank">${rank + 1}</span>
              <span class="avatar" style="--pc:${this.seats[i].color}">${initial(this.seats[i])}</span>
              <span class="hm-st-name">${escapeHtml(this.seats[i].name)}</span>
              <b>${v}${this.mode === 'duel' ? `<small> win${v === 1 ? '' : 's'}</small>` : ''}</b>
            </li>`,
            )
            .join('')}</ol>`;

    const done = over || (this.mode === 'coop' && !solved);
    const overlay = document.createElement('div');
    overlay.className = 'kit-result';
    overlay.innerHTML = `
      <div class="kit-result-card ${this.seats.length > 3 ? 'is-compact' : ''}" style="--pc:${hero?.color ?? (solved ? '#22c55e' : '#a1a1aa')}">
        ${hero && done ? `<div class="kit-result-hero"><span class="kit-trophy">${icon('trophy')}</span><span class="avatar" style="--pc:${hero.color}">${initial(hero)}</span></div>` : ''}
        <p class="kit-result-eyebrow">${eyebrow}</p>
        <h2>${title}</h2>
        <div class="hm-answer">${tiles}</div>
        ${sub ? `<p class="kit-result-sub">${sub}</p>` : ''}
        ${rows}
        <div class="kit-result-actions">
          ${
            done
              ? `<button class="btn btn-primary" data-act="rematch">${icon('replay')}Play again</button>`
              : `<button class="btn btn-primary" data-act="next">${icon('play')}${this.mode === 'duel' ? 'Next round' : 'Next word'}</button>`
          }
          <button class="btn btn-glass" data-act="setup-now">${icon('settings')}Setup</button>
        </div>
      </div>`;
    this.gameEl.append(overlay);
    if (done && hero) this.ctx.confetti({ colors: [hero.color, '#ffffff', '#f59e0b'] });
  }

  /* -------------------------------------------------------------- Input */

  async confirmThen(opts, fn) {
    this.stopClock();
    if (await this.ctx.confirm(opts)) fn();
    else if (this.mode === 'blitz' && this.view === 'game' && this.board?.status === 'playing') this.startClock();
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
        if (toggleSeat(this.ctx, { roster: this.roster, seats: this.seats, id: v, min: 1, max: MAX_SEATS })) setup(() => {});
        return;
      case 'shuffle':
        return setup(() => shuffle(this.seats));
      case 'mode':
        return setup(() => (c.mode = v));
      case 'category':
        return setup(() => (c.category = v));
      case 'lives':
      case 'rounds':
      case 'laps':
      case 'wins':
      case 'clock':
        return setup(() => (c[act] = +v));
      case 'start':
        return this.startMatch();
      case 'key':
        return this.humanGuess(v);
      case 'solve':
        return this.askSolve();
      case 'setup':
        if (this.board?.status !== 'playing') return this.showSetup();
        return this.confirmThen({ title: 'Leave this game?', message: 'Scores so far will be lost.', confirmLabel: 'End game', danger: true }, () => this.showSetup());
      case 'next':
        return this.nextRound();
      case 'rematch':
        return this.startMatch();
      case 'setup-now':
        return this.showSetup();
    }
  }

  clearPending() {
    this.pending.forEach(clearTimeout);
    this.pending = [];
    this.botToken = (this.botToken ?? 0) + 1;
    this.stopClock?.();
  }

  destroy() {
    this.view = 'void';
    this.clearPending();
    this.resizeObs?.disconnect();
    document.removeEventListener('keydown', this.onKey);
  }
}

export default {
  async mount(stage, ctx) {
    const link = await loadStyles(new URL('./style.css', import.meta.url).href);
    const game = new Hangman(stage, ctx);
    if (new URLSearchParams(location.search).has('debug')) window.__hm = game; // test hook
    game.showSetup();
    return () => {
      game.destroy();
      link.remove();
    };
  },
};

