// Hangman bot. Guessing: narrow the word bank down to everything that still fits
// the board and pick the letter most of those words contain. Easier bots lean on
// plain English letter frequency and pick a little randomly.
import { LETTERS, normalize } from './engine.js';

const FREQ = 'ETAOINSRHLDCUMFPGWYBVKXJQZ';

// Every pool entry (words and phrases) that could be the answer.
export function candidates(p, pool) {
  const shown = p.shown;
  const wrong = new Set(p.wrong);
  const guessed = new Set(p.guessed);
  return pool.filter((w) => {
    if (w.length !== shown.length) return false;
    for (let i = 0; i < w.length; i++) {
      const s = shown[i];
      const c = w[i];
      if (s === '_') {
        if (c < 'A' || c > 'Z' || guessed.has(c)) return false;
      } else if (s !== c) return false;
      if (wrong.has(c)) return false;
    }
    return true;
  });
}

function bestLetter(list, guessed) {
  const count = new Map();
  for (const w of list) for (const c of new Set(w)) if (c >= 'A' && c <= 'Z' && !guessed.has(c)) count.set(c, (count.get(c) ?? 0) + 1);
  let best = null;
  for (const [c, n] of count) if (!best || n > best[1] || (n === best[1] && FREQ.indexOf(c) < FREQ.indexOf(best[0]))) best = [c, n];
  return best?.[0] ?? null;
}

const byFrequency = (guessed) => [...FREQ].filter((c) => !guessed.has(c));

// level 0 easy, 1 medium, 2 hard. Returns { letter } or { solve: answer }.
export function chooseGuess(p, level, pool) {
  // Evil boards are built from the same word bank, so bots lean on it less there
  const recall = p.evil ? 0.5 : 1;
  const guessed = new Set(p.guessed);
  const open = [...LETTERS].filter((c) => !guessed.has(c));
  const unknown = new Set([...p.shown].map((c, i) => (c === '_' ? i : -1)).filter((i) => i >= 0)).size;
  const fits = candidates(p, pool);
  // Solve when sure. Easier bots wait until the word is nearly done.
  if (fits.length === 1 && unknown > 1 && (level === 2 || (level === 1 && unknown <= 3) || (level === 0 && unknown <= 2 && Math.random() < 0.5))) {
    return { solve: fits[0] };
  }
  const smart = (level === 2 ? 0.9 : level === 1 ? 0.55 : 0.15) * recall;
  if (fits.length && Math.random() < smart) {
    const l = bestLetter(fits, guessed);
    if (l) return { letter: l };
  }
  const freq = byFrequency(guessed);
  const spread = [2, 5, 9][2 - level] ?? 5;
  return { letter: freq[Math.floor(Math.random() * Math.min(spread, freq.length))] ?? open[0] };
}

// A secret for a bot to set. Harder bots like words with rarer letters.
export function chooseSecret(words, level) {
  const list = words.map(normalize);
  if (level === 0) return list[Math.floor(Math.random() * list.length)];
  const rarity = (w) => {
    const letters = new Set(w.replace(/[^A-Z]/g, ''));
    let r = 0;
    for (const c of letters) r += FREQ.indexOf(c);
    return r / Math.max(1, letters.size) - letters.size * (level === 2 ? 0.2 : 0);
  };
  const ranked = list.map((w) => ({ w, r: rarity(w) + Math.random() * 4 })).sort((a, b) => b.r - a.r);
  const top = ranked.slice(0, Math.max(3, Math.round(ranked.length * (level === 2 ? 0.25 : 0.5))));
  return top[Math.floor(Math.random() * top.length)].w;
}
