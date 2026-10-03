// Game-tree search shared by the turn-based bots.
//
// Minimax with alpha-beta from one player's point of view (`me`): positions where
// it's my turn maximise, everyone else minimises. That covers games where a player
// can move twice in a row, and treats 3–4 player games "paranoidly" (everyone else
// is out to get me), which plays sensibly enough at shallow depths.
//
// Iterative deepening under a time budget: the answer from the deepest finished
// pass is used.
//
//   rules = {
//     moves(s)            → legal moves
//     play(s, m)          → next state
//     turn(s)             → whose turn it is
//     outcome(s, me)      → null while playing, else 1 (I win), -1 (I lose), 0 (draw)
//     evaluate(s, me)     → heuristic score, positive is good for me (keep it well under WIN)
//     order?(s, moves)    → moves sorted best-first (optional, speeds up pruning)
//   }

export const WIN = 1e7;
const TIMEOUT = Symbol('timeout');

export function search(root, me, rules, { depth = 4, ms = 400, noise = 0, rng = Math.random } = {}) {
  const deadline = performance.now() + ms;
  let nodes = 0;
  // Shuffle first so equally good moves vary from game to game (ordering sorts are stable).
  let moves = shuffle(rules.moves(root).slice(), rng);
  if (moves.length <= 1) return moves[0];
  if (rules.order) moves = rules.order(root, moves);

  const ab = (s, d, alpha, beta, ply) => {
    if ((++nodes & 127) === 0 && performance.now() > deadline) throw TIMEOUT;
    const out = rules.outcome(s, me);
    if (out !== null) return out > 0 ? WIN - ply : out < 0 ? -WIN + ply : 0;
    if (d <= 0) return rules.evaluate(s, me);
    let list = rules.moves(s);
    if (!list.length) return rules.evaluate(s, me);
    if (rules.order) list = rules.order(s, list);
    if (rules.turn(s) === me) {
      let best = -Infinity;
      for (const m of list) {
        best = Math.max(best, ab(rules.play(s, m), d - 1, alpha, beta, ply + 1));
        alpha = Math.max(alpha, best);
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of list) {
      best = Math.min(best, ab(rules.play(s, m), d - 1, alpha, beta, ply + 1));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  };

  // Score every root move at a given depth. With noise, scores must be exact
  // (full window) so near-equal moves can be compared; otherwise prune.
  let scored = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= depth; d++) {
    try {
      const next = [];
      let alpha = -Infinity;
      for (const { m } of scored) {
        const v = ab(rules.play(root, m), d - 1, noise ? -Infinity : alpha, Infinity, 1);
        next.push({ m, v });
        alpha = Math.max(alpha, v);
      }
      next.sort((a, b) => b.v - a.v);
      scored = next;
      if (Math.abs(scored[0].v) > WIN / 2) break; // a forced result: no need to look deeper
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }

  // Without noise the root was pruned: later moves tied with the best are only upper
  // bounds, so the first (exactly scored) best move is the one to play.
  if (!noise) return scored[0].m;
  // Pick a reasonable move at random: anything whose score is within `noise` of the best
  // (never one that throws away a forced win or walks into a forced loss when avoidable).
  const best = scored[0].v;
  const ok = scored.filter((x) => x.v >= best - noise && (best < WIN / 2 || x.v > WIN / 2) && (x.v > -WIN / 2 || best <= -WIN / 2));
  return ok[Math.floor(rng() * ok.length)].m;
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];
