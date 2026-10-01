// Connect Four rules. Pure functions over plain state objects, no DOM.
//
// grid[r * cols + c], r = 0 is the top row. A cell is null or a disc
// { id, p } where p is the seat that owns it. Discs keep their id as they
// slide so the board can animate them.
//
// Modes
//   classic   drop discs, first to line up `connect` wins
//   popout    on your turn, drop a disc or pop one of yours off the bottom
//   powerups  everyone gets one Anvil, Bomb and Double per round
//   flip      gravity flips every few moves and every disc falls the other way
//   marathon  the board fills up; every line scores a point
//   blind     discs go dark once they land. Remember who's where.

export const POWERS = ['anvil', 'bomb', 'double'];
export const FLIP_EVERY = 5;
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function newRound({ mode, rows, cols, connect, players }, starter = 0) {
  return {
    mode,
    rows,
    cols,
    connect,
    players,
    grid: Array(rows * cols).fill(null),
    gravity: 1, // 1 = discs fall down, -1 = up
    turn: starter,
    moves: 0,
    nextId: 1,
    powers: mode === 'powerups' ? Array.from({ length: players }, () => ({ anvil: 1, bomb: 1, double: 1 })) : null,
    bonus: false, // the current player gets another drop (Double)
    scores: Array(players).fill(0),
    scored: [], // marathon lines: { p, cells, key }
    events: null,
    result: null,
  };
}

export const cell = (s, r, c) => (r >= 0 && r < s.rows && c >= 0 && c < s.cols ? s.grid[r * s.cols + c] : undefined);
const set = (s, r, c, v) => (s.grid[r * s.cols + c] = v);

// The row a disc dropped into `col` would settle in, or -1 if the column is full.
export function landingRow(s, col) {
  if (s.gravity === 1) {
    for (let r = s.rows - 1; r >= 0; r--) if (!cell(s, r, col)) return r;
  } else {
    for (let r = 0; r < s.rows; r++) if (!cell(s, r, col)) return r;
  }
  return -1;
}

// The row at the gravity end of a column (the "bottom" right now).
export const floorRow = (s) => (s.gravity === 1 ? s.rows - 1 : 0);

export function isLegal(s, m) {
  if (s.result || m.col < 0 || m.col >= s.cols) return false;
  const p = s.turn;
  switch (m.kind) {
    case 'drop':
      return landingRow(s, m.col) >= 0;
    case 'pop':
      return s.mode === 'popout' && cell(s, floorRow(s), m.col)?.p === p;
    case 'anvil':
      return !!s.powers?.[p].anvil && s.grid.some((d, i) => d && i % s.cols === m.col);
    case 'bomb':
    case 'double':
      return !!s.powers?.[p][m.kind] && !(m.kind === 'double' && s.bonus) && landingRow(s, m.col) >= 0;
  }
  return false;
}

export function legalMoves(s) {
  const out = [];
  for (let col = 0; col < s.cols; col++) {
    if (isLegal(s, { kind: 'drop', col })) out.push({ kind: 'drop', col });
    if (s.mode === 'popout' && isLegal(s, { kind: 'pop', col })) out.push({ kind: 'pop', col });
  }
  return out;
}

// Slides every disc toward the current gravity. Returns true if anything moved.
function settle(s) {
  let moved = false;
  for (let c = 0; c < s.cols; c++) {
    const discs = [];
    for (let r = 0; r < s.rows; r++) if (cell(s, r, c)) discs.push(cell(s, r, c));
    const col = Array(s.rows).fill(null);
    if (s.gravity === 1) discs.forEach((d, i) => (col[s.rows - discs.length + i] = d));
    else discs.forEach((d, i) => (col[i] = d));
    for (let r = 0; r < s.rows; r++) {
      if (cell(s, r, c) !== col[r]) moved = true;
      set(s, r, c, col[r]);
    }
  }
  return moved;
}

function remove(s, r, c, how, out) {
  const d = cell(s, r, c);
  if (!d) return;
  out.push({ id: d.id, p: d.p, r, c, how });
  set(s, r, c, null);
}

export function play(prev, m) {
  if (!isLegal(prev, m)) return prev;
  const s = structuredClone({ ...prev, events: null });
  const p = s.turn;
  // frames: snapshots of the grid between steps (land, blast, slide, flip) so the
  // board can animate them one after another. The last frame is the final grid.
  const ev = { move: m, seat: p, placed: null, removed: [], flipped: false, scored: [], frames: [] };
  const snap = () => ev.frames.push(s.grid.slice());
  s.events = ev;

  const place = (r) => {
    const d = { id: s.nextId++, p };
    set(s, r, m.col, d);
    ev.placed = { id: d.id, r, c: m.col, kind: m.kind };
  };

  switch (m.kind) {
    case 'drop':
    case 'double':
      place(landingRow(s, m.col));
      break;
    case 'pop':
      remove(s, floorRow(s), m.col, 'pop', ev.removed);
      snap();
      settle(s);
      break;
    case 'anvil':
      for (let r = 0; r < s.rows; r++) remove(s, r, m.col, 'crush', ev.removed);
      place(floorRow(s));
      break;
    case 'bomb': {
      const r = landingRow(s, m.col);
      place(r);
      snap();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) remove(s, r + dr, m.col + dc, 'blast', ev.removed);
      ev.bomb = { r, c: m.col };
      snap();
      settle(s);
      break;
    }
  }
  if (s.powers && POWERS.includes(m.kind)) s.powers[p][m.kind]--;
  s.moves++;

  if (s.mode === 'flip' && s.moves % FLIP_EVERY === 0) {
    snap();
    s.gravity = -s.gravity;
    settle(s);
    ev.flipped = true;
  }

  snap();
  ev.frames = ev.frames.filter((f, i, all) => i === all.length - 1 || f.some((d, j) => d !== all[i + 1][j]));

  // Where did the placed disc end up after any sliding?
  if (ev.placed) {
    const i = s.grid.findIndex((d) => d?.id === ev.placed.id);
    if (i >= 0) Object.assign(ev.placed, { r: Math.floor(i / s.cols), c: i % s.cols });
  }

  const full = s.grid.every(Boolean);
  if (s.mode === 'marathon') {
    const known = new Set(s.scored.map((w) => w.key));
    for (const w of windows(s)) {
      if (known.has(w.key)) continue;
      s.scored.push(w);
      s.scores[w.p]++;
      ev.scored.push(w);
    }
    if (full) {
      const best = Math.max(...s.scores);
      s.result = { winners: s.scores.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0), cells: [], lines: [] };
    }
  } else {
    const lines = findLines(s);
    if (lines.length) {
      const owners = [...new Set(lines.map((l) => l.p))];
      const winners = owners.includes(p) ? [p] : owners;
      const won = lines.filter((l) => winners.includes(l.p));
      s.result = { winners, lines: won, cells: [...new Set(won.flatMap((l) => l.cells))] };
    }
  }

  if (!s.result) {
    if (m.kind === 'double') s.bonus = true;
    else {
      s.bonus = false;
      s.turn = (p + 1) % s.players;
    }
    // Nobody can move (or Pop Out is going in circles): it's a draw.
    const stuck = !legalMoves(s).length;
    if (stuck || (full && s.mode !== 'popout') || s.moves >= s.rows * s.cols * 4) s.result = { winners: [], cells: [], lines: [] };
  }
  return s;
}

// Every run of `connect` or more discs of one colour: { p, cells: [index...] }.
export function findLines(s) {
  const out = [];
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const d = cell(s, r, c);
      if (!d) continue;
      for (const [dr, dc] of DIRS) {
        if (cell(s, r - dr, c - dc)?.p === d.p) continue; // not the start of the run
        const cells = [];
        for (let k = 0; cell(s, r + dr * k, c + dc * k)?.p === d.p; k++) cells.push((r + dr * k) * s.cols + c + dc * k);
        if (cells.length >= s.connect) out.push({ p: d.p, cells });
      }
    }
  }
  return out;
}

// Every window of exactly `connect` cells owned by one player (Marathon scoring).
export function windows(s) {
  const out = [];
  const n = s.connect;
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const d = cell(s, r, c);
      if (!d) continue;
      DIRS.forEach(([dr, dc], k) => {
        const cells = [];
        for (let i = 0; i < n && cell(s, r + dr * i, c + dc * i)?.p === d.p; i++) cells.push((r + dr * i) * s.cols + c + dc * i);
        if (cells.length === n) out.push({ p: d.p, cells, key: `${r},${c},${k}` });
      });
    }
  }
  return out;
}
