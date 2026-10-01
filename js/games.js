// The game catalog. Everything in the library is driven from this list.
//
// To make a game playable:
//   1. Create js/games/<id>.js with a default export:
//        export default {
//          mount(stage, ctx) {   // stage = HTMLElement to render into (may be async)
//            ...                  // ctx = { game, players (full roster), storage, passTo, toast,
//                                 //         confirm, confetti, sfx, haptic, exit }
//            return () => {};     // optional cleanup, called when the game closes
//          },
//        };
//      Bigger games can live in a folder: js/games/<id>/index.js
//   2. Add `load: () => import('./games/<id>.js')` to its entry below.
// Entries without `load` show up as "Coming soon".

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'party', label: 'Party' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'quick', label: 'Quick' },
  { id: 'word', label: 'Word' },
];

export const GAMES = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    tagline: 'The classic, reinvented.',
    description: 'Five ways to play: Classic, Vanishing, Ultimate, Misère and Gobble. Boards up to 7×7, custom marks, turn timers and best-of series.',
    players: [2, 2],
    time: '2 min',
    categories: ['strategy', 'quick'],
    colors: ['#3b82f6', '#06b6d4'],
    icon: 'grid',
    featured: true,
    load: () => import('./games/tic-tac-toe/index.js'),
  },
  {
    id: 'dots-and-boxes',
    name: 'Dots & Boxes',
    tagline: 'Close the box. Steal the game.',
    description: 'Five ways to play for 2 to 4 players: Classic, Treasure, Islands, Reverse and Strict. Five board sizes, chain combos, turn timers and multi-round matches.',
    players: [2, 4],
    time: '5–15 min',
    categories: ['strategy', 'quick'],
    colors: ['#e879f9', '#f43f5e'],
    icon: 'boxes',
    featured: true,
    load: () => import('./games/dots-and-boxes/index.js'),
  },
  {
    id: 'imposter',
    name: 'Imposter',
    tagline: 'One of you is lying.',
    description: 'Everyone sees the secret word except the imposter. Pass the phone, give one-word clues, and vote out the faker before they blend in.',
    players: [3, 12],
    time: '10 min',
    categories: ['party'],
    colors: ['#7c3aed', '#db2777'],
    icon: 'mask',
    featured: true,
  },
  {
    id: 'truth-or-dare',
    name: 'Truth or Dare',
    tagline: 'No backing out.',
    description: 'Spicy, silly or wholesome. Pick a vibe, pass the phone, and take whatever the deck hands you.',
    players: [2, 12],
    time: 'Endless',
    categories: ['party'],
    colors: ['#ef4444', '#f97316'],
    icon: 'flame',
  },
  {
    id: 'connect-four',
    name: 'Connect Four',
    tagline: 'Drop. Stack. Connect.',
    description: 'Take turns dropping discs into the grid. First to line up four in any direction takes the round.',
    players: [2, 2],
    time: '5 min',
    categories: ['strategy'],
    colors: ['#f43f5e', '#f59e0b'],
    icon: 'dots',
  },
  {
    id: 'charades',
    name: 'Charades',
    tagline: 'Act it out. No talking.',
    description: 'Hold the phone up, let your team shout guesses, and tilt to score before the clock runs out.',
    players: [3, 12],
    time: '5 min',
    categories: ['party', 'word'],
    colors: ['#10b981', '#84cc16'],
    icon: 'card',
  },
  {
    id: 'would-you-rather',
    name: 'Would You Rather',
    tagline: 'Impossible choices only.',
    description: 'Two options, zero good answers. Everyone picks a side, then defend your choice.',
    players: [2, 12],
    time: 'Endless',
    categories: ['party'],
    colors: ['#6366f1', '#22d3ee'],
    icon: 'split',
  },
  {
    id: 'hot-potato',
    name: 'Hot Potato',
    tagline: 'Don’t be holding it.',
    description: 'Answer the prompt and pass before the hidden timer runs out. Whoever is holding the phone when it blows loses the round.',
    players: [3, 12],
    time: '3 min',
    categories: ['party', 'quick'],
    colors: ['#f59e0b', '#ef4444'],
    icon: 'bomb',
  },
  {
    id: 'word-chain',
    name: 'Word Chain',
    tagline: 'Last letter, first letter.',
    description: 'Each word has to start with the last letter of the one before it. Hesitate and you’re out.',
    players: [2, 8],
    time: '5 min',
    categories: ['word', 'quick'],
    colors: ['#14b8a6', '#3b82f6'],
    icon: 'link',
  },
  {
    id: 'battleship',
    name: 'Battleship',
    tagline: 'Hide your fleet. Sink theirs.',
    description: 'Place your ships in secret, then take turns calling shots. Pass-and-play screens keep every board hidden.',
    players: [2, 2],
    time: '15 min',
    categories: ['strategy'],
    colors: ['#0ea5e9', '#1e40af'],
    icon: 'anchor',
  },
  {
    id: 'checkers',
    name: 'Checkers',
    tagline: 'Jump, crown, conquer.',
    description: 'The timeless board game. Forced jumps, kings, and a board that flips for each player.',
    players: [2, 2],
    time: '15 min',
    categories: ['strategy'],
    colors: ['#fb7185', '#be123c'],
    icon: 'crown',
  },
];

export const isReady = (game) => typeof game.load === 'function';

export function formatPlayers([min, max]) {
  return min === max ? `${min}` : `${min}–${max}`;
}
