// Chess rules. Pure functions over plain state objects, no DOM.
//
// Squares are 0..63, index = row * 8 + col, row 0 is rank 8 (the top as white
// sees it). A square holds null or a piece { c: 'w' | 'b', t: 'p' | 'n' | 'b' | 'r' | 'q' | 'k', id }.
// Pieces keep their id when they move so the board can animate them.
//
// Modes
//   classic     standard chess
//   chess960    Fischer Random: shuffled back rank, same rules
//   threecheck  check your opponent three times to win
//   koth        King of the Hill: walk your king onto a centre square to win
//   atomic      captures explode, wiping out every non-pawn piece around them
//   fog         Fog of War: you only see what your pieces can reach; capture the king

export const FILES = 'abcdefgh';
export const CENTER = [27, 28, 35, 36]; // d5 e5 d4 e4
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
export const sqIndex = (name) => (8 - +name[1]) * 8 + FILES.indexOf(name[0]);
const rc = (i) => [Math.floor(i / 8), i % 8];
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (c) => (c === 'w' ? 'b' : 'w');

/* ---------------------------------------------------------------- Setup */

// A Chess960 back rank: bishops on opposite colours, king between the rooks.
export function back960(rng = Math.random) {
  const rank = Array(8).fill(null);
  const free = () => rank.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  rank[pick([0, 2, 4, 6])] = 'b';
  rank[pick([1, 3, 5, 7])] = 'b';
  rank[pick(free())] = 'q';
  rank[pick(free())] = 'n';
  rank[pick(free())] = 'n';
  const [a, k, b] = free();
  rank[a] = 'r';
  rank[k] = 'k';
  rank[b] = 'r';
  return rank.join('');
}

export function newGame({ mode = 'classic', rng = Math.random } = {}) {
  const back = mode === 'chess960' ? back960(rng) : 'rnbqkbnr';
  const fen = `${back}/pppppppp/8/8/8/8/PPPPPPPP/${back.toUpperCase()} w KQkq - 0 1`;
  return fromFEN(fen, mode);
}

// Castling rights are stored as rook files so Chess960 works the same as classic.
export function fromFEN(fen, mode = 'classic') {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  const board = Array(64).fill(null);
  let id = 1;
  placement.split('/').forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) c += +ch;
      else {
        board[r * 8 + c] = { c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase(), id: id++ };
        c++;
      }
    }
  });
  const castle = { w: { k: null, q: null }, b: { k: null, q: null } };
  for (const color of ['w', 'b']) {
    const row = color === 'w' ? 7 : 0;
    const kc = board.findIndex((p, i) => p?.t === 'k' && p.c === color && Math.floor(i / 8) === row) % 8;
    if (kc < 0) continue;
    const rooks = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => board[row * 8 + c]?.t === 'r' && board[row * 8 + c].c === color);
    const hasK = castling.includes(color === 'w' ? 'K' : 'k');
    const hasQ = castling.includes(color === 'w' ? 'Q' : 'q');
    // Outermost rook on each side of the king
    if (hasK) castle[color].k = rooks.filter((c) => c > kc).pop() ?? null;
    if (hasQ) castle[color].q = rooks.find((c) => c < kc) ?? null;
  }
  const s = {
    mode,
    board,
    turn,
    castle,
    ep: ep === '-' ? -1 : sqIndex(ep),
    half: +half || 0,
    full: +full || 1,
    checks: { w: 0, b: 0 },
    captured: { w: [], b: [] }, // pieces each side has taken
    positions: {},
    last: null,
    events: null,
    result: null,
  };
  s.positions[key(s)] = 1;
  return s;
}

export function key(s) {
  let k = '';
  for (const p of s.board) k += p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.';
  const cs = s.castle;
  return `${k} ${s.turn} ${cs.w.k ?? '-'}${cs.w.q ?? '-'}${cs.b.k ?? '-'}${cs.b.q ?? '-'} ${s.ep}`;
}

/* -------------------------------------------------------------- Attacks */

export const kingSq = (board, color) => board.findIndex((p) => p?.t === 'k' && p.c === color);

// Is square `sq` attacked by `by`?
export function attacked(board, sq, by) {
  const [r, c] = rc(sq);
  const at = (rr, cc) => (on(rr, cc) ? board[rr * 8 + cc] : undefined);
  const pr = by === 'w' ? r + 1 : r - 1; // a white pawn attacks from the row below
  for (const dc of [-1, 1]) {
    const p = at(pr, c + dc);
    if (p?.t === 'p' && p.c === by) return true;
  }
  for (const [dr, dc] of KNIGHT) {
    const p = at(r + dr, c + dc);
    if (p?.t === 'n' && p.c === by) return true;
  }
  for (const [dr, dc] of KING) {
    const p = at(r + dr, c + dc);
    if (p?.t === 'k' && p.c === by) return true;
  }
  for (const [dirs, kinds] of [[ROOK, 'rq'], [BISHOP, 'bq']]) {
    for (const [dr, dc] of dirs) {
      for (let k = 1; ; k++) {
        const p = at(r + dr * k, c + dc * k);
        if (p === undefined) break;
        if (p) {
          if (p.c === by && kinds.includes(p.t)) return true;
          break;
        }
      }
    }
  }
  return false;
}

const kingsTouch = (board) => {
  const a = kingSq(board, 'w');
  const b = kingSq(board, 'b');
  if (a < 0 || b < 0) return false;
  const [r1, c1] = rc(a);
  const [r2, c2] = rc(b);
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
};

export function inCheck(s, color = s.turn, board = s.board) {
  if (s.mode === 'fog') return false;
  const k = kingSq(board, color);
  if (k < 0) return false;
  if (s.mode === 'atomic' && kingsTouch(board)) return false; // touching kings can't hurt each other
  return attacked(board, k, other(color));
}

/* ---------------------------------------------------------------- Moves */

// Moves that follow piece movement rules, before checking the king's safety.
function pseudo(s) {
  const { board, turn: me } = s;
  const out = [];
  const add = (from, to, extra) => out.push({ from, to, ...extra });
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.c !== me) continue;
    const [r, c] = rc(from);
    if (p.t === 'p') {
      const dir = me === 'w' ? -1 : 1;
      const start = me === 'w' ? 6 : 1;
      const last = me === 'w' ? 0 : 7;
      const push = (to, extra = {}) => {
        if (Math.floor(to / 8) === last) for (const promo of 'qrbn') add(from, to, { ...extra, promo });
        else add(from, to, extra);
      };
      const one = (r + dir) * 8 + c;
      if (on(r + dir, c) && !board[one]) {
        push(one);
        const two = (r + dir * 2) * 8 + c;
        if (r === start && !board[two]) add(from, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (board[to] && board[to].c !== me) push(to, { capture: true });
        else if (to === s.ep) add(from, to, { capture: true, ep: true });
      }
      continue;
    }
    const steps = { n: KNIGHT, k: KING }[p.t];
    if (steps) {
      for (const [dr, dc] of steps) {
        if (!on(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (!board[to]) add(from, to);
        else if (board[to].c !== me) add(from, to, { capture: true });
      }
    } else {
      const dirs = p.t === 'r' ? ROOK : p.t === 'b' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [dr, dc] of dirs) {
        for (let k = 1; on(r + dr * k, c + dc * k); k++) {
          const to = (r + dr * k) * 8 + c + dc * k;
          if (!board[to]) add(from, to);
          else {
            if (board[to].c !== me) add(from, to, { capture: true });
            break;
          }
        }
      }
    }
  }
  out.push(...castles(s));
  return out;
}

// Castling: king to the g/c file, rook to f/d, everything between empty and
// (except in Fog of War) the king never passes through check.
function castles(s) {
  const { board, turn: me } = s;
  const row = me === 'w' ? 7 : 0;
  const k = kingSq(board, me);
  if (k < 0 || Math.floor(k / 8) !== row) return [];
  const kc = k % 8;
  const out = [];
  for (const side of ['k', 'q']) {
    const rcol = s.castle[me][side];
    if (rcol == null) continue;
    const rook = board[row * 8 + rcol];
    if (rook?.t !== 'r' || rook.c !== me) continue;
    const kTo = side === 'k' ? 6 : 2;
    const rTo = side === 'k' ? 5 : 3;
    const span = (a, b) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    };
    const need = new Set([...span(kc, kTo), ...span(rcol, rTo)]);
    if ([...need].some((c) => c !== kc && c !== rcol && board[row * 8 + c])) continue;
    if (s.mode !== 'fog') {
      if (span(kc, kTo).some((c) => attackedAfterLift(s, row * 8 + c, row * 8 + rcol))) continue;
    }
    out.push({ from: k, to: row * 8 + kTo, castle: side, rookFrom: row * 8 + rcol, rookTo: row * 8 + rTo });
  }
  return out;
}

// Attack test with the castling rook lifted off the board (matters in Chess960).
function attackedAfterLift(s, sq, rookSq) {
  const board = s.board.slice();
  board[rookSq] = null;
  if (s.mode === 'atomic' && kingsTouchAt(board, sq, s.turn)) return false;
  return attacked(board, sq, other(s.turn));
}
function kingsTouchAt(board, sq, me) {
  const e = kingSq(board, other(me));
  if (e < 0) return false;
  const [r1, c1] = rc(sq);
  const [r2, c2] = rc(e);
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
}

export function legalMoves(s) {
  if (s.result) return [];
  const moves = pseudo(s);
  if (s.mode === 'fog') return moves;
  const me = s.turn;
  return moves.filter((m) => {
    if (s.mode === 'atomic' && m.capture && s.board[m.from].t === 'k') return false; // kings can't capture
    const after = apply(s, m);
    if (s.mode === 'atomic') {
      if (kingSq(after.board, me) < 0) return false; // blew up your own king
      if (kingSq(after.board, other(me)) < 0) return true; // blowing up theirs wins on the spot
    }
    return !inCheck(s, me, after.board);
  });
}

export const movesFrom = (s, from) => legalMoves(s).filter((m) => m.from === from);

// Board changes of a move, without any bookkeeping. Returns { board, removed, blast }.
function apply(s, m) {
  const board = s.board.slice();
  const piece = board[m.from];
  const removed = [];
  let blast = null;
  if (m.castle) {
    const rook = board[m.rookFrom];
    board[m.from] = null;
    board[m.rookFrom] = null;
    board[m.to] = piece;
    board[m.rookTo] = rook;
    return { board, removed, blast };
  }
  let capturedSq = m.to;
  if (m.ep) capturedSq = Math.floor(m.from / 8) * 8 + (m.to % 8);
  if (board[capturedSq] && m.capture) removed.push({ sq: capturedSq, piece: board[capturedSq], how: 'capture' });
  board[capturedSq] = null;
  board[m.from] = null;
  board[m.to] = m.promo ? { ...piece, t: m.promo } : piece;
  if (s.mode === 'atomic' && m.capture) {
    // The capturing piece and every non-pawn neighbour go up in smoke
    blast = m.to;
    removed.push({ sq: m.to, piece: board[m.to], how: 'blast' });
    board[m.to] = null;
    const [r, c] = rc(m.to);
    for (const [dr, dc] of KING) {
      if (!on(r + dr, c + dc)) continue;
      const i = (r + dr) * 8 + c + dc;
      if (board[i] && board[i].t !== 'p') {
        removed.push({ sq: i, piece: board[i], how: 'blast' });
        board[i] = null;
      }
    }
  }
  return { board, removed, blast };
}

export function play(prev, m) {
  const legal = legalMoves(prev).find((x) => x.from === m.from && x.to === m.to && (x.promo ?? null) === (m.promo ?? null));
  if (!legal) return prev;
  m = legal;
  const s = structuredClone({ ...prev, events: null, board: null });
  const me = prev.turn;
  const them = other(me);
  const piece = prev.board[m.from];
  const { board, removed, blast } = apply(prev, m);
  s.board = board;
  const san = toSAN(prev, m);

  // Castling rights: a king or rook that moves (or a rook that disappears) loses them
  for (const color of ['w', 'b']) {
    const row = color === 'w' ? 7 : 0;
    for (const side of ['k', 'q']) {
      const f = s.castle[color][side];
      if (f == null) continue;
      const r = board[row * 8 + f];
      if (r?.t !== 'r' || r.c !== color || (piece.t === 'k' && piece.c === color)) s.castle[color][side] = null;
    }
  }
  if (m.castle) s.castle[me] = { k: null, q: null };

  s.ep = m.double ? (m.from + m.to) / 2 : -1;
  s.half = piece.t === 'p' || m.capture ? 0 : prev.half + 1;
  if (me === 'b') s.full++;
  for (const x of removed) if (x.piece && x.piece.c !== me) s.captured[me].push(x.piece.t);
  for (const x of removed) if (x.piece && x.piece.c === me && x.how === 'blast') s.captured[them].push(x.piece.t);
  s.turn = them;
  s.last = { from: m.from, to: m.to };
  const check = inCheck(s, them);
  if (check) s.checks[me]++;
  const k = key(s);
  s.positions[k] = (s.positions[k] ?? 0) + 1;
  s.events = { move: m, san, piece, removed, blast, check, mover: me };
  s.result = outcome(s, me);
  if (s.result?.winner === me && s.result.reason === 'checkmate') s.events.san = san.replace(/\+$/, '#');
  return s;
}

function outcome(s, mover) {
  const them = other(mover);
  if (s.mode === 'fog' || s.mode === 'atomic') {
    if (kingSq(s.board, them) < 0) return { winner: mover, reason: s.mode === 'atomic' ? 'exploded' : 'captured' };
  }
  if (s.mode === 'koth' && CENTER.includes(kingSq(s.board, mover))) return { winner: mover, reason: 'hill' };
  if (s.mode === 'threecheck' && s.checks[mover] >= 3) return { winner: mover, reason: 'threecheck' };
  const moves = legalMoves(s);
  if (!moves.length) {
    if (inCheck(s, them)) return { winner: mover, reason: 'checkmate' };
    return { winner: null, reason: 'stalemate' };
  }
  if (s.half >= 100) return { winner: null, reason: 'fifty' };
  if (s.positions[key(s)] >= 3) return { winner: null, reason: 'repetition' };
  if (['classic', 'chess960', 'threecheck'].includes(s.mode) && insufficient(s.board)) return { winner: null, reason: 'material' };
  return null;
}

// King vs king, or king and one minor piece vs king.
function insufficient(board) {
  const rest = board.filter((p) => p && p.t !== 'k');
  return !rest.length || (rest.length === 1 && 'nb'.includes(rest[0].t));
}

/* -------------------------------------------------------------- Helpers */

export function toSAN(s, m) {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const p = s.board[m.from];
  let out = '';
  if (p.t === 'p') {
    if (m.capture) out += FILES[m.from % 8] + 'x';
    out += sqName(m.to);
    if (m.promo) out += '=' + m.promo.toUpperCase();
  } else {
    out += p.t.toUpperCase();
    const rivals = legalMoves(s).filter((x) => x.to === m.to && x.from !== m.from && s.board[x.from].t === p.t && !x.castle);
    if (rivals.length) {
      const sameFile = rivals.some((x) => x.from % 8 === m.from % 8);
      const sameRank = rivals.some((x) => Math.floor(x.from / 8) === Math.floor(m.from / 8));
      if (!sameFile) out += FILES[m.from % 8];
      else if (!sameRank) out += 8 - Math.floor(m.from / 8);
      else out += sqName(m.from);
    }
    if (m.capture) out += 'x';
    out += sqName(m.to);
  }
  if (s.mode !== 'fog') {
    const after = { ...s, board: apply(s, m).board };
    if (inCheck(after, other(s.turn))) out += '+';
  }
  return out;
}

// Material balance from white's point of view (by captured pieces).
export const material = (s) => s.captured.w.reduce((a, t) => a + VALUE[t], 0) - s.captured.b.reduce((a, t) => a + VALUE[t], 0);

// Squares `color` can see in Fog of War: its own pieces and everywhere they could move.
export function visible(s, color) {
  const seen = new Set();
  s.board.forEach((p, i) => p?.c === color && seen.add(i));
  const probe = { ...s, turn: color, result: null };
  for (const m of pseudo(probe)) {
    seen.add(m.to);
    if (m.ep) seen.add(Math.floor(m.from / 8) * 8 + (m.to % 8));
  }
  // Pawns also see the squares diagonally ahead of them
  s.board.forEach((p, i) => {
    if (p?.c !== color || p.t !== 'p') return;
    const [r, c] = rc(i);
    const dir = color === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) if (on(r + dir, c + dc)) seen.add((r + dir) * 8 + c + dc);
  });
  return seen;
}

// Node-count test helper (perft) for validating the move generator.
export function perft(s, depth) {
  if (!depth) return 1;
  let n = 0;
  for (const m of legalMoves(s)) n += depth === 1 ? 1 : perft(playRaw(s, m), depth - 1);
  return n;
}
// Fast play for perft: no SAN/outcome bookkeeping.
function playRaw(prev, m) {
  const s = { ...prev, board: apply(prev, m).board, castle: structuredClone(prev.castle), result: null };
  const piece = prev.board[m.from];
  for (const color of ['w', 'b']) {
    const row = color === 'w' ? 7 : 0;
    for (const side of ['k', 'q']) {
      const f = s.castle[color][side];
      if (f == null) continue;
      const r = s.board[row * 8 + f];
      if (r?.t !== 'r' || r.c !== color || (piece.t === 'k' && piece.c === color)) s.castle[color][side] = null;
    }
  }
  s.ep = m.double ? (m.from + m.to) / 2 : -1;
  s.turn = other(prev.turn);
  return s;
}
