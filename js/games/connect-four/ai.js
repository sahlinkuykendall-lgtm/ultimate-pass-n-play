// Connect Four bot. Searches a compact copy of the board (plain seat numbers,
// no disc ids or animation frames) so it can look several moves ahead quickly.
// Covers drops, Pop Out, Gravity Flip and Marathon scoring; Power Ups are judged
// at the top level with the real rules.
import { legalMoves, play as playReal, isLegal, FLIP_EVERY, POWERS } from './engine.js';
import { search, pick } from '../search.js';

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Compact state: g[r * cols + c] = seat or -1.
function compact(s) {
  return {
    mode: s.mode,
    rows: s.rows,
    cols: s.cols,
    k: s.connect,
    players: s.players,
    g: Int8Array.from(s.grid, (d) => (d ? d.p : -1)),
    gravity: s.gravity,
    turn: s.turn,
    moves: s.moves,
    scores: s.scores.slice(),
    seen: s.mode === 'marathon' ? new Set(s.scored.map((w) => w.key)) : null,
    result: null,
  };
}

function landing(s, c) {
  if (s.gravity === 1) {
    for (let r = s.rows - 1; r >= 0; r--) if (s.g[r * s.cols + c] < 0) return r;
  } else {
    for (let r = 0; r < s.rows; r++) if (s.g[r * s.cols + c] < 0) return r;
  }
  return -1;
}

function settle(s) {
  for (let c = 0; c < s.cols; c++) {
    const discs = [];
    for (let r = 0; r < s.rows; r++) if (s.g[r * s.cols + c] >= 0) discs.push(s.g[r * s.cols + c]);
    for (let r = 0; r < s.rows; r++) s.g[r * s.cols + c] = -1;
    const off = s.gravity === 1 ? s.rows - discs.length : 0;
    discs.forEach((p, i) => (s.g[(off + i) * s.cols + c] = p));
  }
}

function moves(s) {
  const out = [];
  if (s.result) return out;
  const floor = s.gravity === 1 ? s.rows - 1 : 0;
  for (let c = 0; c < s.cols; c++) {
    if (landing(s, c) >= 0) out.push(c);
    if (s.mode === 'popout' && s.g[floor * s.cols + c] === s.turn) out.push(~c); // negative = pop
  }
  return out;
}

// All runs of k+ for each player (bitmask of owners with a line).
function lineOwners(s) {
  let mask = 0;
  const { rows, cols, k, g } = s;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = g[r * cols + c];
      if (p < 0 || mask & (1 << p)) continue;
      for (const [dr, dc] of DIRS) {
        let n = 1;
        let rr = r + dr;
        let cc = c + dc;
        while (n < k && rr >= 0 && rr < rows && cc >= 0 && cc < cols && g[rr * cols + cc] === p) {
          n++;
          rr += dr;
          cc += dc;
        }
        if (n >= k) {
          mask |= 1 << p;
          break;
        }
      }
    }
  return mask;
}

function play(prev, m) {
  const s = { ...prev, g: prev.g.slice(), scores: prev.scores.slice(), seen: prev.seen && new Set(prev.seen) };
  const p = s.turn;
  if (m >= 0) s.g[landing(s, m) * s.cols + m] = p;
  else {
    const c = ~m;
    s.g[(s.gravity === 1 ? s.rows - 1 : 0) * s.cols + c] = -1;
    settle(s);
  }
  s.moves++;
  if (s.mode === 'flip' && s.moves % FLIP_EVERY === 0) {
    s.gravity = -s.gravity;
    settle(s);
  }
  const full = !s.g.includes(-1);
  if (s.mode === 'marathon') {
    scoreWindows(s);
    if (full) {
      const best = Math.max(...s.scores);
      s.result = s.scores.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    }
  } else {
    const mask = lineOwners(s);
    if (mask) {
      const owners = [...Array(s.players).keys()].filter((i) => mask & (1 << i));
      s.result = owners.includes(p) ? [p] : owners;
    } else if (full && s.mode !== 'popout') s.result = [];
  }
  if (!s.result) s.turn = (p + 1) % s.players;
  return s;
}

function scoreWindows(s) {
  const { rows, cols, k, g } = s;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = g[r * cols + c];
      if (p < 0) continue;
      DIRS.forEach(([dr, dc], d) => {
        const key = `${r},${c},${d}`;
        if (s.seen.has(key)) return;
        for (let i = 1; i < k; i++) {
          const rr = r + dr * i;
          const cc = c + dc * i;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || g[rr * cols + cc] !== p) return;
        }
        s.seen.add(key);
        s.scores[p]++;
      });
    }
}

// Open windows: the more of one player's discs (and no one else's), the better for them.
const W = [0, 1, 6, 40, 300, 2000];
function evaluate(s, me) {
  const { rows, cols, k, g, players } = s;
  const per = new Float64Array(players);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (const [dr, dc] of DIRS) {
        const er = r + dr * (k - 1);
        const ec = c + dc * (k - 1);
        if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
        let owner = -1;
        let n = 0;
        for (let i = 0; i < k; i++) {
          const p = g[(r + dr * i) * cols + c + dc * i];
          if (p < 0) continue;
          if (owner < 0) owner = p;
          else if (owner !== p) {
            owner = -2;
            break;
          }
          n++;
        }
        if (owner >= 0) per[owner] += W[Math.min(n, W.length - 1)];
      }
  // Centre columns are worth more
  const mid = (cols - 1) / 2;
  for (let i = 0; i < g.length; i++) if (g[i] >= 0) per[g[i]] += 3 - Math.min(3, Math.abs((i % cols) - mid));
  let rival = 0;
  for (let p = 0; p < players; p++) if (p !== me) rival = Math.max(rival, per[p]);
  let score = per[me] - rival * 1.1;
  if (s.mode === 'marathon') {
    let best = 0;
    for (let p = 0; p < players; p++) if (p !== me) best = Math.max(best, s.scores[p]);
    score += (s.scores[me] - best) * 1500;
  }
  return score;
}

const centreFirst = (s, list) => {
  const mid = (s.cols - 1) / 2;
  const col = (m) => (m >= 0 ? m : ~m);
  return list.slice().sort((a, b) => Math.abs(col(a) - mid) - Math.abs(col(b) - mid) || b - a);
};

const RULES = {
  moves,
  play,
  turn: (s) => s.turn,
  outcome: (s, me) => (s.result ? (s.result.includes(me) ? (s.result.length === 1 ? 1 : 0) : s.result.length ? -1 : 0) : null),
  evaluate,
  order: centreFirst,
};

const toMove = (m) => (m >= 0 ? { kind: 'drop', col: m } : { kind: 'pop', col: ~m });

// Should a power-up beat the best normal move? Judged one move deep with the real rules.
function powerMove(real, me, level) {
  const powers = real.powers?.[me];
  if (!powers || real.bonus) return null;
  let best = null;
  const base = evaluate(compact(real), me);
  for (const kind of POWERS) {
    if (!powers[kind]) continue;
    for (let col = 0; col < real.cols; col++) {
      const m = { kind, col };
      if (!isLegal(real, m)) continue;
      const after = playReal(real, m);
      let v;
      if (after.result) v = after.result.winners.includes(me) ? 1e6 : -1e6;
      else {
        const c = compact(after);
        // Make sure it doesn't hand the next player a win
        const reply = c.turn === me ? search(c, me, RULES, { depth: 2, ms: 60 }) : null;
        v = evaluate(c, me) - base;
        if (c.turn !== me && moves(c).some((x) => RULES.outcome(play(c, x), me) === -1)) v = -1e6;
        if (reply !== null && reply !== undefined && RULES.outcome(play(c, reply), me) === 1) v = 1e6;
      }
      if (!best || v > best.v) best = { m, v };
    }
  }
  // Save power-ups for when they really swing things
  const bar = [Infinity, 900, 500][level];
  return best && best.v >= bar ? best.m : null;
}

export function chooseMove(real, level) {
  const me = real.turn;
  const s = compact(real);
  const many = real.players > 2;
  if (real.mode === 'powerups' && level > 0) {
    const pm = powerMove(real, me, level);
    if (pm) return pm;
  }
  let m;
  if (level === 0) {
    const r = Math.random();
    if (r < 0.5) m = search(s, me, RULES, { depth: 2, ms: 80, noise: 150 });
    else if (r < 0.8) m = search(s, me, RULES, { depth: 1, ms: 50 });
    else m = pick(moves(s));
  } else if (level === 1) m = search(s, me, RULES, { depth: many ? 3 : 4, ms: 300, noise: 25 });
  else m = search(s, me, RULES, { depth: 14, ms: 900 });
  const move = toMove(m);
  // Belt and braces: never return something the real rules reject
  return isLegal(real, move) ? move : legalMoves(real)[0];
}
