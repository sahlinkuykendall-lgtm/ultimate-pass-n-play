// Chess piece artwork: one silhouette per piece on a 45×45 grid, filled and
// outlined per side so they read on any board theme.
const PATHS = {
  p: '<path d="M22.5 8.5a5 5 0 0 0-3 9c-2.3 1.4-3.7 3.5-3.7 5.6h3.4c-.6 4.4-3.2 7.3-6.2 9.9v3.5h19v-3.5c-3-2.6-5.6-5.5-6.2-9.9h3.4c0-2.1-1.4-4.2-3.7-5.6a5 5 0 0 0-3-9z"/>',
  r: '<path d="M11.5 9.5h4.5v3.5h3.5V9.5h6v3.5h3.5V9.5h4.5v7l-3.5 3v12l2.8 2.6v3.4h-20.6V34l2.8-2.6v-12l-3.5-3z"/><path d="M15 19.5h15M15 31.5h15" fill="none"/>',
  n: '<path d="M14 36.5h19.5c.4-8.2-.7-15.6-5-21.5l.6-6.3-3.6 3.3c-5-.6-9.6 2.6-12.3 7.6l-4 7.2c-.8 1.6.2 3.2 2 3l4.6-1.9 2.6-1.5c.9 2.9-3.7 5.6-4.9 10.1z"/><circle cx="20.8" cy="17.6" r="1.4" class="pc-eye"/>',
  b: '<path d="M22.5 6.5a2.6 2.6 0 1 0 .01 0z"/><path d="M22.5 10.5c-5.8 4.3-8.8 9.4-6.7 14.6 1 2.4 2.7 3.6 2.7 5.4h8c0-1.8 1.7-3 2.7-5.4 2.1-5.2-.9-10.3-6.7-14.6z"/><path d="M12.5 37.5h20v-3.2c-2.2-1.6-4.6-2.4-5.3-4.3h-9.4c-.7 1.9-3.1 2.7-5.3 4.3z"/><path d="M22.5 16v6M19.5 19h6" fill="none"/>',
  q: '<path d="M10.5 15.5l4 15.5h16l4-15.5-6.2 8-2.4-11.5-3.4 10.6-3.4-10.6-2.4 11.5z"/><circle cx="10.5" cy="13.5" r="2.2"/><circle cx="18.6" cy="10.2" r="2.2"/><circle cx="26.4" cy="10.2" r="2.2"/><circle cx="34.5" cy="13.5" r="2.2"/><path d="M13.5 31h18l1 6.5h-20z"/>',
  k: '<path d="M22.5 5.5v7M19 9h7" fill="none"/><path d="M22.5 15.5c-1.6-3.4-6.4-5-9.6-2.6-3.6 2.8-2.6 8.2 1.6 12.4l-1.5 5.7h19l-1.5-5.7c4.2-4.2 5.2-9.6 1.6-12.4-3.2-2.4-8-.8-9.6 2.6z"/><path d="M22.5 15.5v9" fill="none"/><path d="M12.5 31h20l.8 6.5H11.7z"/>',
};

export const pieceSvg = (t, c) =>
  `<svg class="pc pc-${c}" viewBox="0 0 45 45" aria-hidden="true"><g stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${PATHS[t]}</g></svg>`;

export const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
