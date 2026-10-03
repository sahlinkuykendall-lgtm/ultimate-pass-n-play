// Tic-Tac-Toe bot for every mode. Uses the shared alpha-beta search over the real
// rules (engine.js), with a line-counting evaluation.
import { legalMoves, play, topOf } from './engine.js';
import { search, pick } from '../search.js';

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const windowCache = new Map();

// Every run of k cells in a row on an n×n board.
function windows(n, k) {
  const id = `${n}:${k}`;
  if (!windowCache.has(id)) {
    const out = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        for (const [dr, dc] of DIRS) {
          const er = r + dr * (k - 1);
          const ec = c + dc * (k - 1);
          if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
          out.push(Array.from({ length: k }, (_, i) => (r + dr * i) * n + c + dc * i));
        }
    windowCache.set(id, out);
  }
  return windowCache.get(id);
}

// Sum over windows: open lines with more of my marks score exponentially more.
function lineScore(owner, n, k, me) {
  let score = 0;
  for (const w of windows(n, k)) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      const o = owner(i);
      if (o === me) mine++;
      else if (o != null) theirs++;
    }
    if (mine && !theirs) score += 8 ** mine;
    else if (theirs && !mine) score -= 8 ** theirs;
  }
  return score;
}

const BOARD_WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3];

function evaluate(s, me) {
  switch (s.mode) {
    case 'ultimate': {
      let score = lineScore((b) => (s.boards[b] === 'draw' ? -1 : s.boards[b]), 3, 3, me) * 30;
      for (let b = 0; b < 9; b++) {
        if (s.boards[b] === me) score += BOARD_WEIGHT[b] * 60;
        else if (s.boards[b] !== null && s.boards[b] !== 'draw') score -= BOARD_WEIGHT[b] * 60;
        else if (s.boards[b] === null) score += lineScore((i) => s.cells[b * 9 + i], 3, 3, me) * BOARD_WEIGHT[b] * 0.5;
      }
      return score;
    }
    case 'gobble': {
      let score = lineScore((i) => topOf(s.stacks[i])?.p ?? null, 3, 3, me);
      // Big pieces in hand are threats in waiting
      score += (s.trays[me].filter((x) => x === 3).length - s.trays[1 - me].filter((x) => x === 3).length) * 6;
      return score;
    }
    case 'misere':
      return -lineScore((i) => s.cells[i], s.n, s.k, me);
    default:
      return lineScore((i) => s.cells[i], s.n, s.k, me);
  }
}

// On big boards only cells near existing marks are worth considering.
function candidates(s) {
  const moves = legalMoves(s);
  if (s.mode === 'ultimate' || s.mode === 'gobble' || s.n <= 4) return moves;
  const n = s.n;
  const near = new Set();
  s.cells.forEach((v, i) => {
    if (v === null) return;
    const r = Math.floor(i / n);
    const c = i % n;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) near.add(rr * n + cc);
      }
  });
  if (!near.size) {
    const mid = Math.floor(n / 2);
    return moves.filter((m) => Math.abs(Math.floor(m.idx / n) - mid) <= 1 && Math.abs((m.idx % n) - mid) <= 1);
  }
  const out = moves.filter((m) => near.has(m.idx));
  return out.length ? out : moves;
}

function centerFirst(s, moves) {
  // In Ultimate, rank by position inside the small board (centre, then corners).
  const n = s.mode === 'ultimate' ? 3 : s.n;
  const pos = (i) => (s.mode === 'ultimate' ? i % 9 : i);
  const mid = (n - 1) / 2;
  const d = (i) => Math.abs(Math.floor(pos(i) / n) - mid) + Math.abs((pos(i) % n) - mid);
  return moves.slice().sort((a, b) => (b.size ?? 0) - (a.size ?? 0) || d(a.idx) - d(b.idx));
}

const RULES = {
  moves: candidates,
  play: (s, m) => play(s, m.idx, m.size),
  turn: (s) => s.turn,
  outcome: (s, me) => (s.result ? (s.result.winner === null ? 0 : s.result.winner === me ? 1 : -1) : null),
  evaluate,
  order: centerFirst,
};

// level 0 easy, 1 medium, 2 hard. Returns { idx, size? }.
export function chooseMove(s, level) {
  const me = s.turn;
  const all = legalMoves(s);
  if (level === 0) {
    // Takes a win when it sees one, blocks some of the time, otherwise wanders.
    const quick = search(s, me, RULES, { depth: 1, ms: 60 });
    const wins = RULES.outcome(play(s, quick.idx, quick.size), me) === 1;
    if (wins || Math.random() < 0.45) return search(s, me, RULES, { depth: 2, ms: 80, noise: 40 });
    return pick(all);
  }
  if (level === 1) return search(s, me, RULES, { depth: s.mode === 'ultimate' || s.n > 4 ? 2 : 4, ms: 250, noise: 6 });
  return search(s, me, RULES, { depth: 12, ms: 700 });
}
