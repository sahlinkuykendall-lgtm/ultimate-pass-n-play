// Tic-Tac-Toe rules. Pure functions over plain state objects, no DOM.
//
// Modes
//   classic    N×N board, K in a row wins
//   vanishing  like classic, but each player keeps at most K marks; placing one more removes their oldest
//   misere     like classic, but completing a line loses
//   ultimate   3×3 grid of 3×3 boards; the cell you play sends your opponent to that board
//   gobble     3×3 with small/medium/large pieces; a bigger piece can cover a smaller one
//
// Players are seats 0 and 1. `result` is null while playing, otherwise
// { winner: 0 | 1 | null (draw), line: number[] | null, reason: 'line' | 'misere' | 'draw' }.

export const GOBBLE_TRAY = [1, 1, 2, 2, 3, 3];
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function newRound({ mode, size, line }, starter = 0) {
  const base = { mode, turn: starter, result: null, last: null, moves: 0, vanished: null };
  if (mode === 'ultimate') {
    return { ...base, n: 3, k: 3, cells: Array(81).fill(null), boards: Array(9).fill(null), boardLines: Array(9).fill(null), active: null };
  }
  if (mode === 'gobble') {
    return { ...base, n: 3, k: 3, stacks: Array.from({ length: 9 }, () => []), trays: [[...GOBBLE_TRAY], [...GOBBLE_TRAY]] };
  }
  const n = size;
  const k = Math.min(line, n);
  return { ...base, n, k, cells: Array(n * n).fill(null), queues: [[], []] };
}

// Longest run of `player` through `idx` on an n×n board, if it reaches k. Ordered end to end.
export function lineThrough(owner, n, k, idx) {
  const p = owner(idx);
  if (p == null) return null;
  const r0 = Math.floor(idx / n);
  const c0 = idx % n;
  for (const [dr, dc] of DIRS) {
    const run = [idx];
    for (const step of [1, -1]) {
      let r = r0 + dr * step;
      let c = c0 + dc * step;
      while (r >= 0 && r < n && c >= 0 && c < n && owner(r * n + c) === p) {
        if (step === 1) run.push(r * n + c);
        else run.unshift(r * n + c);
        r += dr * step;
        c += dc * step;
      }
    }
    if (run.length >= k) return run;
  }
  return null;
}

export const topOf = (stack) => stack[stack.length - 1] ?? null;

export function canPlay(s, idx, size) {
  if (s.result) return false;
  switch (s.mode) {
    case 'ultimate': {
      const b = Math.floor(idx / 9);
      return s.cells[idx] === null && s.boards[b] === null && (s.active === null || s.active === b);
    }
    case 'gobble': {
      if (!s.trays[s.turn].includes(size)) return false;
      const top = topOf(s.stacks[idx]);
      return !top || top.size < size;
    }
    default:
      return s.cells[idx] === null;
  }
}

export function legalMoves(s) {
  const moves = [];
  if (s.result) return moves;
  if (s.mode === 'gobble') {
    const sizes = [...new Set(s.trays[s.turn])];
    s.stacks.forEach((_, idx) => sizes.forEach((size) => canPlay(s, idx, size) && moves.push({ idx, size })));
    return moves;
  }
  const total = s.mode === 'ultimate' ? 81 : s.n * s.n;
  for (let idx = 0; idx < total; idx++) if (canPlay(s, idx)) moves.push({ idx });
  return moves;
}

export function play(prev, idx, size) {
  if (!canPlay(prev, idx, size)) return prev;
  const s = structuredClone(prev);
  const p = s.turn;
  s.last = idx;
  s.moves++;
  s.vanished = null;

  if (s.mode === 'ultimate') playUltimate(s, idx, p);
  else if (s.mode === 'gobble') playGobble(s, idx, p, size);
  else playGrid(s, idx, p);

  s.turn = 1 - p;
  if (s.mode === 'gobble' && !s.result && !legalMoves(s).length) {
    s.result = { winner: null, line: null, reason: 'draw' };
  }
  return s;
}

function playGrid(s, idx, p) {
  s.cells[idx] = p;
  if (s.mode === 'vanishing') {
    s.queues[p].push(idx);
    if (s.queues[p].length > s.k) {
      s.vanished = s.queues[p].shift();
      s.cells[s.vanished] = null;
    }
  }
  const line = lineThrough((i) => s.cells[i], s.n, s.k, idx);
  if (line) {
    s.result = s.mode === 'misere' ? { winner: 1 - p, line, reason: 'misere' } : { winner: p, line, reason: 'line' };
  } else if (s.mode !== 'vanishing' && s.cells.every((c) => c !== null)) {
    s.result = { winner: null, line: null, reason: 'draw' };
  }
}

function playUltimate(s, idx, p) {
  const b = Math.floor(idx / 9);
  const c = idx % 9;
  s.cells[idx] = p;

  const mini = lineThrough((i) => s.cells[b * 9 + i], 3, 3, c);
  if (mini) {
    s.boards[b] = p;
    s.boardLines[b] = mini;
  } else if (s.cells.slice(b * 9, b * 9 + 9).every((v) => v !== null)) {
    s.boards[b] = 'draw';
  }

  if (s.boards[b] === p) {
    const big = lineThrough((i) => (s.boards[i] === 'draw' ? null : s.boards[i]), 3, 3, b);
    if (big) s.result = { winner: p, line: big, reason: 'line' };
  }
  if (!s.result && s.boards.every((v) => v !== null)) {
    s.result = { winner: null, line: null, reason: 'draw' };
  }
  s.active = s.boards[c] === null ? c : null;
}

function playGobble(s, idx, p, size) {
  s.trays[p].splice(s.trays[p].indexOf(size), 1);
  s.stacks[idx].push({ p, size });
  const line = lineThrough((i) => topOf(s.stacks[i])?.p ?? null, 3, 3, idx);
  if (line) s.result = { winner: p, line, reason: 'line' };
}

// The mark that will disappear on this player's next move (vanishing mode).
export function nextToFade(s) {
  if (s.mode !== 'vanishing' || s.result) return null;
  const q = s.queues[s.turn];
  return q.length >= s.k ? q[0] : null;
}
