// Hangman rules. Pure functions over plain state objects, no DOM.
//
// A puzzle: { answer, shown, guessed, wrong, lives, status, evil }
//   answer   the secret in capitals (null while an Evil puzzle hasn't committed)
//   shown    the answer with unguessed letters as "_" (spaces, hyphens, apostrophes shown)
//   guessed  every letter tried, in order; wrong = the misses
//   lives    misses allowed before the hangman is complete
//   status   'playing' | 'solved' | 'hanged'
//   evil     Evil mode only: { candidates } every word still consistent with what's shown.
//            Each guess keeps the biggest family of words, so the computer dodges you.

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const isLetter = (ch) => ch >= 'A' && ch <= 'Z';

export const normalize = (s) => s.toUpperCase().replace(/[‘’`]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const lettersOnly = (s) => normalize(s).replace(/[^A-Z]/g, '');

// Checks a word typed in by a player. Returns an error message, or null if it's fine.
export function secretError(raw) {
  const s = normalize(raw);
  if (!s) return 'Type a word or phrase.';
  if (/[^A-Z '\-]/.test(s)) return 'Letters only (spaces, - and ’ are fine).';
  if (lettersOnly(s).length < 2) return 'Make it at least 2 letters.';
  if (s.length > 32) return 'Keep it to 32 characters or fewer.';
  return null;
}

const mask = (answer, guessed) => [...answer].map((ch) => (isLetter(ch) && !guessed.includes(ch) ? '_' : ch)).join('');

export function newPuzzle(answer, lives) {
  answer = normalize(answer);
  return { answer, shown: mask(answer, []), guessed: [], wrong: [], lives, status: 'playing', evil: null };
}

// Evil: no word is chosen. Starts from every pool word of `length` letters.
export function newEvil(pool, length, lives) {
  const candidates = pool.filter((w) => w.length === length && /^[A-Z]+$/.test(w));
  return { answer: null, shown: '_'.repeat(length), guessed: [], wrong: [], lives, status: 'playing', evil: { candidates } };
}

export const hidden = (p) => [...p.shown].filter((c) => c === '_').length;
export const canGuess = (p, L) => p.status === 'playing' && isLetter(L) && !p.guessed.includes(L);

// Guess a letter. Returns { puzzle, hits } (hits = how many places it appeared).
export function guess(prev, L) {
  if (!canGuess(prev, L)) return { puzzle: prev, hits: 0 };
  const p = { ...prev, guessed: [...prev.guessed, L] };
  let hits;
  if (p.evil) {
    // Group the remaining words by where L appears; keep the biggest group.
    // Ties go to the group that reveals nothing (a miss), then to fewer reveals.
    const groups = new Map();
    for (const w of p.evil.candidates) {
      let key = '';
      for (let i = 0; i < w.length; i++) key += w[i] === L ? '1' : '0';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    let bestKey = null;
    for (const [key, list] of groups) {
      if (bestKey === null) {
        bestKey = key;
        continue;
      }
      const best = groups.get(bestKey);
      const ones = (k) => [...k].filter((c) => c === '1').length;
      if (list.length > best.length || (list.length === best.length && ones(key) < ones(bestKey))) bestKey = key;
    }
    p.evil = { candidates: groups.get(bestKey) };
    hits = [...bestKey].filter((c) => c === '1').length;
    p.shown = [...p.shown].map((c, i) => (bestKey[i] === '1' ? L : c)).join('');
  } else {
    hits = [...p.answer].filter((c) => c === L).length;
    p.shown = mask(p.answer, p.guessed);
  }
  if (!hits) p.wrong = [...p.wrong, L];
  settle(p);
  return { puzzle: p, hits };
}

// Guess the whole answer. A wrong guess costs a life. Returns { puzzle, correct }.
export function solve(prev, attempt) {
  if (prev.status !== 'playing') return { puzzle: prev, correct: false };
  const a = lettersOnly(attempt);
  const p = { ...prev };
  let correct;
  if (p.evil) {
    // The computer only gives in when there's truly nothing else it could be
    const left = p.evil.candidates.filter((w) => w !== a);
    correct = p.evil.candidates.length === 1 && p.evil.candidates[0] === a;
    if (!correct && left.length) p.evil = { candidates: left };
    if (correct) p.answer = a;
  } else correct = lettersOnly(p.answer) === a;
  if (correct) {
    p.shown = p.answer;
    p.status = 'solved';
  } else {
    p.wrong = [...p.wrong, '*'];
    settle(p);
  }
  return { puzzle: p, correct };
}

// A lost life without a guess (Blitz shot clock running out).
export function penalty(prev) {
  if (prev.status !== 'playing') return prev;
  const p = { ...prev, wrong: [...prev.wrong, '*'] };
  settle(p);
  return p;
}

// Reveal one hidden letter for free (used by nothing that scores; handy for hints/tests).
export function revealAnswer(prev) {
  const p = { ...prev };
  if (p.evil && !p.answer) {
    const c = p.evil.candidates;
    p.answer = c[Math.floor(Math.random() * c.length)] ?? p.shown.replace(/_/g, '?');
  }
  return p;
}

function settle(p) {
  if (!p.shown.includes('_')) {
    p.status = 'solved';
    if (!p.answer) p.answer = p.shown;
  } else if (p.wrong.length >= p.lives) {
    p.status = 'hanged';
    Object.assign(p, revealAnswer(p));
  }
}

// Words for Evil mode and the bots: every single word in the bank, in capitals.
export function buildPool(categories, extra) {
  const all = new Set();
  for (const c of categories) for (const w of c.words) all.add(normalize(w));
  for (const w of extra) all.add(normalize(w));
  return [...all];
}
