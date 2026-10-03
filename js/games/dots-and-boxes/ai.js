// Dots & Boxes bot.
//
// Works on a compact copy of the board. The core policy is the one good players
// use: take boxes that are worth taking, otherwise draw a "safe" line that gives
// nothing away, and when nothing is safe, hand over as little as possible.
// The hard bot plays the endgame by simulation, which finds the classic
// double-cross (leave the last two boxes of a chain to keep control).
import { boxesOf, boxEdges, isPlayable, legalMoves } from './engine.js';

function compact(s) {
  const nb = s.boxes.length;
  const edgeBoxes = s.lines.map((_, id) => boxesOf(s, id));
  const boxLines = Array.from({ length: nb }, (_, b) => boxEdges(s, b));
  const sides = new Int8Array(nb);
  for (let b = 0; b < nb; b++) sides[b] = boxLines[b].filter((e) => s.lines[e] !== null).length;
  return {
    sign: s.mode === 'reverse' ? -1 : 1,
    strict: s.mode === 'strict',
    players: s.players,
    edgeBoxes,
    boxLines,
    value: s.boxes.map((b) => b.value),
    hole: s.boxes.map((b) => b.hole),
    // mutable part
    lines: Uint8Array.from(s.lines, (v) => (v === null ? 0 : 1)),
    sides,
    owner: Int8Array.from(s.boxes, (b) => (b.owner === null ? -1 : b.owner)),
    scores: s.scores.slice(),
    turn: s.turn,
    left: s.boxes.filter((b) => !b.hole && b.owner === null).length,
  };
}

const clone = (c) => ({ ...c, lines: c.lines.slice(), sides: c.sides.slice(), owner: c.owner.slice(), scores: c.scores.slice() });

const open = (c) => {
  const out = [];
  for (let id = 0; id < c.lines.length; id++) if (!c.lines[id] && c.edgeBoxes[id].length) out.push(id);
  return out;
};

// Draw a line. Returns the boxes it closed. Updates the turn like the real rules.
function apply(c, id) {
  c.lines[id] = 1;
  const p = c.turn;
  let closed = 0;
  for (const b of c.edgeBoxes[id]) {
    if (++c.sides[b] === 4 && c.owner[b] < 0) {
      c.owner[b] = p;
      c.scores[p] += c.value[b];
      c.left--;
      closed++;
    }
  }
  if (!closed || c.strict) c.turn = (p + 1) % c.players;
  return closed;
}

// What a line is worth to whoever draws it right now (boxes it closes).
function gain(c, id) {
  let v = 0;
  for (const b of c.edgeBoxes[id]) if (c.sides[b] === 3) v += c.value[b] * c.sign;
  return v;
}
const closes = (c, id) => c.edgeBoxes[id].some((b) => c.sides[b] === 3);
// A line that hands the next player a box.
const gives = (c, id) => !closes(c, id) && c.edgeBoxes[id].some((b) => c.sides[b] === 2);

// Value the next player collects if they greedily take everything worth taking.
function greedyTurn(c) {
  const p = c.turn;
  const start = c.scores[p];
  for (let guard = 0; guard < 200 && c.left > 0 && c.turn === p; guard++) {
    let best = -1;
    let bestV = 0;
    for (let id = 0; id < c.lines.length; id++) {
      if (c.lines[id] || !c.edgeBoxes[id].length || !closes(c, id)) continue;
      const v = gain(c, id);
      if (v > bestV) {
        bestV = v;
        best = id;
      }
    }
    if (best < 0) break;
    apply(c, best);
  }
  return (c.scores[p] - start) * c.sign;
}

// Pick a line with the basic policy. `rng` decides between equal choices.
function policy(c, rng = Math.random) {
  const lines = open(c);
  // 1. Take anything worth taking (biggest first)
  let best = null;
  let bestV = 0;
  for (const id of lines) {
    const v = gain(c, id);
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  if (best !== null) return best;
  // 2. A safe line
  const safe = lines.filter((id) => !closes(c, id) && !gives(c, id));
  if (safe.length) return safe[Math.floor(rng() * safe.length)];
  // 3. Give away as little as possible
  let least = Infinity;
  let choice = [];
  for (const id of lines) {
    const t = clone(c);
    apply(t, id);
    const given = t.turn === c.turn ? -gain(c, id) : greedyTurn(t);
    if (given < least) {
      least = given;
      choice = [id];
    } else if (given === least) choice.push(id);
  }
  return choice[Math.floor(rng() * choice.length)];
}

function rollout(c, me, rng) {
  const t = clone(c);
  for (let guard = 0; guard < 400 && t.left > 0; guard++) apply(t, policy(t, rng));
  let rival = -Infinity;
  for (let p = 0; p < t.players; p++) if (p !== me) rival = Math.max(rival, t.scores[p]);
  return (t.scores[me] - rival) * t.sign;
}

export function chooseMove(s, level) {
  const c = compact(s);
  const lines = open(c);
  if (lines.length === 1) return lines[0];
  if (level === 0) {
    if (Math.random() < 0.65) {
      const take = lines.find((id) => gain(c, id) > 0);
      if (take !== undefined) return take;
    }
    const safe = lines.filter((id) => !gives(c, id));
    const pool = safe.length && Math.random() < 0.6 ? safe : lines;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const safe = lines.filter((id) => !closes(c, id) && !gives(c, id));
  if (level === 1 || safe.length > 6) return policy(c);

  // Hard, near the endgame: try every line and play the rest out a few times.
  const me = c.turn;
  const deadline = performance.now() + 700;
  const tries = safe.length ? 6 : 3;
  let best = null;
  let bestV = -Infinity;
  for (const id of lines) {
    if (performance.now() > deadline) break;
    const t = clone(c);
    apply(t, id);
    let total = 0;
    for (let k = 0; k < tries; k++) total += rollout(t, me, Math.random);
    const v = total / tries;
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best ?? policy(c);
}

// Sanity helper for tests: the bot's choice is always a playable line.
export const validMove = (s, id) => isPlayable(s, id) && legalMoves(s).includes(id);
