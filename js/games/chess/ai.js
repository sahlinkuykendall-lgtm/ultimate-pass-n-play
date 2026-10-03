// Chess bot: negamax with alpha-beta, quiescence on captures, iterative deepening
// under a time budget, and a material + piece-square evaluation with extras for
// the variants (hill distance in King of the Hill, checks in Three-Check).
// In Fog of War it only searches what it can actually see.
import { legalMoves, playRaw, inCheck, kingSq, key, visible, CENTER } from './engine.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 1e6;
const TIMEOUT = Symbol('timeout');

// Piece-square tables from white's side, index 0 = a8.
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
const mirror = (i) => (7 - Math.floor(i / 8)) * 8 + (i % 8);
const other = (c) => (c === 'w' ? 'b' : 'w');
const hillDist = (sq) => Math.min(...CENTER.map((c) => Math.max(Math.abs(Math.floor(c / 8) - Math.floor(sq / 8)), Math.abs((c % 8) - (sq % 8)))));

// Score from white's point of view.
function evaluateWhite(s) {
  let score = 0;
  let heavy = 0;
  for (const p of s.board) if (p && p.t !== 'k' && p.t !== 'p') heavy += VAL[p.t];
  const endgame = heavy <= 1300;
  s.board.forEach((p, i) => {
    if (!p) return;
    const idx = p.c === 'w' ? i : mirror(i);
    const table = p.t === 'k' && endgame ? PST.kEnd : PST[p.t];
    const v = VAL[p.t] + table[idx];
    score += p.c === 'w' ? v : -v;
  });
  if (s.mode === 'koth') {
    for (const c of ['w', 'b']) {
      const k = kingSq(s.board, c);
      if (k >= 0) score += (c === 'w' ? 1 : -1) * [0, 120, 40, 10][Math.min(3, hillDist(k))];
    }
  }
  if (s.mode === 'threecheck') score += (s.checks.w ** 2 - s.checks.b ** 2) * 90;
  return score;
}
const evaluate = (s) => (s.turn === 'w' ? 1 : -1) * evaluateWhite(s);

// Has the game already been decided against the side to move?
function lost(s, ctx) {
  const me = s.turn;
  const them = other(me);
  if (ctx.kings[me] && kingSq(s.board, me) < 0) return true;
  if (s.mode === 'koth') {
    const k = kingSq(s.board, them);
    if (k >= 0 && CENTER.includes(k)) return true;
  }
  if (s.mode === 'threecheck' && s.checks[them] >= 3) return true;
  return false;
}

// Most valuable victim, least valuable attacker; promotions first.
function order(s, moves, first) {
  const score = (m) => {
    if (first && m.from === first.from && m.to === first.to && m.promo === first.promo) return 1e5;
    let v = 0;
    if (m.promo) v += VAL[m.promo] * 10;
    if (m.capture) v += 10 * (s.board[m.to] ? VAL[s.board[m.to].t] : 100) - VAL[s.board[m.from].t] / 10 + 1000;
    return v;
  };
  return moves.map((m) => ({ m, v: score(m) })).sort((a, b) => b.v - a.v).map((x) => x.m);
}

function quiesce(s, alpha, beta, ctx, qd) {
  tick(ctx);
  if (lost(s, ctx)) return -MATE;
  const stand = evaluate(s);
  if (stand >= beta || qd <= 0) return stand;
  if (stand > alpha) alpha = stand;
  const caps = order(s, legalMoves(s).filter((m) => m.capture || m.promo === 'q'));
  for (const m of caps) {
    const v = -quiesce(playRaw(s, m), -beta, -alpha, ctx, qd - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(s, depth, alpha, beta, ply, ctx) {
  tick(ctx);
  if (lost(s, ctx)) return -MATE + ply;
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (s.half >= 100) return 0;
  if (depth <= 0) return ctx.quiet ? quiesce(s, alpha, beta, ctx, 6) : evaluate(s);
  let best = -Infinity;
  for (const m of order(s, moves)) {
    const v = -negamax(playRaw(s, m), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function tick(ctx) {
  if ((++ctx.nodes & 63) === 0 && performance.now() > ctx.deadline) throw TIMEOUT;
}

// What the bot believes the board looks like (Fog of War hides most of it).
function perceived(s) {
  if (s.mode !== 'fog') return s;
  const seen = visible(s, s.turn);
  return { ...s, board: s.board.map((p, i) => (seen.has(i) ? p : null)) };
}

const LEVELS = [
  { depth: 1, ms: 300, quiet: false, noise: 140 },
  { depth: 2, ms: 900, quiet: true, noise: 25 },
  { depth: 6, ms: 1600, quiet: true, noise: 0 },
];

// Returns a move from legalMoves(real).
export function chooseMove(real, level) {
  const legal = legalMoves(real);
  if (legal.length <= 1) return legal[0];
  const cfg = LEVELS[level] ?? LEVELS[1];
  const s = perceived(real);
  const ctx = {
    nodes: 0,
    deadline: performance.now() + cfg.ms,
    quiet: cfg.quiet,
    kings: { w: kingSq(s.board, 'w') >= 0, b: kingSq(s.board, 'b') >= 0 },
  };
  const isLegal = (m) => legal.some((x) => x.from === m.from && x.to === m.to && (x.promo ?? null) === (m.promo ?? null));
  let roots = (s === real ? legal : legalMoves(s)).filter((m) => s === real || isLegal(m));
  if (!roots.length) roots = legal;
  roots = order(s, roots.sort(() => Math.random() - 0.5));

  let scored = roots.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= cfg.depth; d++) {
    try {
      const next = [];
      let alpha = -Infinity;
      for (const { m } of scored) {
        const child = playRaw(s, m);
        // Steer clear of a threefold repetition unless losing
        const v = s === real && (real.positions[key(child)] ?? 0) >= 2 ? 0 : -negamax(child, d - 1, -Infinity, cfg.noise ? Infinity : -alpha, 1, ctx);
        next.push({ m, v });
        if (v > alpha) alpha = v;
      }
      next.sort((a, b) => b.v - a.v);
      scored = next;
      if (Math.abs(scored[0].v) > MATE / 2) break;
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }
  let move = scored[0].m;
  if (cfg.noise && Math.abs(scored[0].v) < MATE / 2) {
    const ok = scored.filter((x) => x.v >= scored[0].v - cfg.noise && x.v > -MATE / 2);
    move = ok[Math.floor(Math.random() * ok.length)].m;
  }
  return legal.find((x) => x.from === move.from && x.to === move.to && (x.promo ?? null) === (move.promo ?? null)) ?? legal[0];
}
