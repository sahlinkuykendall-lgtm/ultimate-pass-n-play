// Dots & Boxes rules. Pure functions over plain state objects, no DOM.
//
// The board is rows × cols boxes. Every line between two neighbouring dots has
// a numeric id: horizontal lines first (row-major, (rows + 1) × cols of them),
// then vertical lines (rows × (cols + 1)).
//
// Modes
//   classic   close a box to claim it and move again; most points wins
//   treasure  some boxes are gold (+2 / +3), some are skulls (−2)
//   islands   symmetric holes carve the board into islands
//   reverse   fewest points wins
//   strict    closing a box does not earn another move

export function newRound({ mode, rows, cols, players }, starter = 0, rng = Math.random) {
  const boxes = Array.from({ length: rows * cols }, () => ({ owner: null, value: 1, hole: false }));
  if (mode === 'islands') carveIslands(boxes, rows, cols, rng);
  if (mode === 'treasure') seedTreasure(boxes, rng);
  const H = (rows + 1) * cols;
  const V = rows * (cols + 1);
  return {
    mode,
    rows,
    cols,
    players,
    lines: Array(H + V).fill(null),
    boxes,
    turn: starter,
    scores: Array(players).fill(0),
    counts: Array(players).fill(0),
    last: null,
    claimed: [],
    chain: 0,
    moves: 0,
    result: null,
  };
}

function carveIslands(boxes, rows, cols, rng) {
  const total = rows * cols;
  const target = Math.max(1, Math.round(total * 0.16));
  let holes = 0;
  for (let tries = 0; holes < target && tries < 200; tries++) {
    const i = Math.floor(rng() * total);
    const mirror = total - 1 - i; // point-symmetric partner keeps the board looking designed
    if (boxes[i].hole) continue;
    boxes[i].hole = true;
    holes++;
    if (mirror !== i && !boxes[mirror].hole) {
      boxes[mirror].hole = true;
      holes++;
    }
  }
}

function seedTreasure(boxes, rng) {
  boxes.forEach((b) => {
    const r = rng();
    b.value = r < 0.1 ? 3 : r < 0.24 ? 2 : r < 0.33 ? -2 : 1;
  });
  // Always at least one gold and one skull so the mode feels like itself.
  const pick = (exclude) => {
    let i;
    do i = Math.floor(rng() * boxes.length);
    while (boxes.length > 1 && i === exclude);
    return i;
  };
  let gold = boxes.findIndex((b) => b.value > 1);
  if (gold < 0) boxes[(gold = pick(-1))].value = 3;
  if (!boxes.some((b) => b.value < 0)) boxes[pick(gold)].value = -2;
}

export const hCount = (s) => (s.rows + 1) * s.cols;

export function edgeInfo(s, id) {
  const H = hCount(s);
  if (id < H) return { t: 'h', r: Math.floor(id / s.cols), c: id % s.cols };
  const k = id - H;
  return { t: 'v', r: Math.floor(k / (s.cols + 1)), c: k % (s.cols + 1) };
}

export function edgeId(s, t, r, c) {
  return t === 'h' ? r * s.cols + c : hCount(s) + r * (s.cols + 1) + c;
}

// Non-hole boxes touching a line.
export function boxesOf(s, id) {
  const { t, r, c } = edgeInfo(s, id);
  const out = [];
  if (t === 'h') {
    if (r > 0) out.push((r - 1) * s.cols + c);
    if (r < s.rows) out.push(r * s.cols + c);
  } else {
    if (c > 0) out.push(r * s.cols + c - 1);
    if (c < s.cols) out.push(r * s.cols + c);
  }
  return out.filter((b) => !s.boxes[b].hole);
}

export function boxEdges(s, b) {
  const r = Math.floor(b / s.cols);
  const c = b % s.cols;
  return [edgeId(s, 'h', r, c), edgeId(s, 'h', r + 1, c), edgeId(s, 'v', r, c), edgeId(s, 'v', r, c + 1)];
}

export const isPlayable = (s, id) => !s.result && s.lines[id] === null && boxesOf(s, id).length > 0;

export function legalMoves(s) {
  const out = [];
  for (let id = 0; id < s.lines.length; id++) if (isPlayable(s, id)) out.push(id);
  return out;
}

export function play(prev, id) {
  if (!isPlayable(prev, id)) return prev;
  const s = structuredClone(prev);
  const p = s.turn;
  s.lines[id] = p;
  s.last = id;
  s.moves++;

  s.claimed = boxesOf(s, id).filter((b) => s.boxes[b].owner === null && boxEdges(s, b).every((e) => s.lines[e] !== null));
  for (const b of s.claimed) {
    s.boxes[b].owner = p;
    s.scores[p] += s.boxes[b].value;
    s.counts[p]++;
  }

  if (s.boxes.every((b) => b.hole || b.owner !== null)) {
    s.chain += s.claimed.length;
    s.result = resultOf(s);
  } else if (s.claimed.length && s.mode !== 'strict') {
    s.chain += s.claimed.length;
  } else {
    s.turn = (p + 1) % s.players;
    s.chain = 0;
  }
  return s;
}

function resultOf(s) {
  const best = s.mode === 'reverse' ? Math.min(...s.scores) : Math.max(...s.scores);
  const winners = s.scores.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  return { winners, best };
}

// Seats ordered from best to worst for the standings screen.
export function standings(s) {
  return s.scores
    .map((score, seat) => ({ seat, score, boxes: s.counts[seat] }))
    .sort((a, b) => (s.mode === 'reverse' ? a.score - b.score : b.score - a.score) || a.seat - b.seat);
}
