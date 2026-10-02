// Chess piece artwork: Staunton-style profiles on a 40×60 grid with the base on
// the bottom edge, so pieces can stand upright on the tilted board. Shading comes
// from shared gradients (see PIECE_DEFS) that make them look turned from wood.
const BASE = 'M5.5 58.5h29c.3-2.8-1.4-4.6-4.2-5.4H9.7c-2.8.8-4.5 2.6-4.2 5.4z';
const PATHS = {
  p: `<path d="M20 22.5a6.2 6.2 0 0 0-3.9 11c-2.4.6-3.9 1.8-3.9 3.4h3.6c-.4 5.5-2.3 9.8-5.6 13.3h19.6c-3.3-3.5-5.2-7.8-5.6-13.3h3.6c0-1.6-1.5-2.8-3.9-3.4a6.2 6.2 0 0 0-3.9-11z"/>`,
  r: `<path d="M8.5 15.5h5v4h3.6v-4h5.8v4h3.6v-4h5v8.4l-3.4 3.2.9 19.6c1.9 1.2 3.2 2.5 3.6 3.9H7.4c.4-1.4 1.7-2.7 3.6-3.9l.9-19.6-3.4-3.2z"/><path d="M11.5 27h17M10.8 46.7h18.4" fill="none"/>`,
  n: `<path d="M10.5 50.4h21.6c.6-11.4-.6-20.6-5.4-27.4l.7-7.6-4.4 3.9c-6-1.1-11.4 2.1-14.8 8.3l-4.6 8.4c-.9 1.9.3 3.7 2.4 3.4l5.4-2.2 3-1.8c.9 4.1-3.2 7.5-3.9 15z"/><circle cx="18.6" cy="25.6" r="1.6" class="pc-eye"/><path d="M27.5 23.5c2.2 4.6 3.1 10 2.9 16.4" fill="none" class="pc-line"/>`,
  b: `<circle cx="20" cy="9.4" r="2.9"/><path d="M20 12.6c-6.6 4.7-9.6 10.6-7.4 16.4 1 2.6 3 3.8 3 5.6h8.8c0-1.8 2-3 3-5.6 2.2-5.8-.8-11.7-7.4-16.4z"/><path d="M14.5 34.6h11c0 1.4-1 2.2-2.2 2.6.5 5.2 2.4 9.3 5.6 13.2H11.1c3.2-3.9 5.1-8 5.6-13.2-1.2-.4-2.2-1.2-2.2-2.6z"/><path d="M20 18.5v7M16.5 22h7" fill="none" class="pc-line"/>`,
  q: `<circle cx="7.5" cy="12.8" r="2.4"/><circle cx="14.2" cy="9.6" r="2.4"/><circle cx="20" cy="8.4" r="2.4"/><circle cx="25.8" cy="9.6" r="2.4"/><circle cx="32.5" cy="12.8" r="2.4"/><path d="M7.5 14.5l4.2 17h16.6l4.2-17-5.8 9.6-1.2-12.8-4.2 11.4L20 10.6l-1.3 12.1-4.2-11.4-1.2 12.8z"/><path d="M11.7 31.5h16.6c0 1.6-1.3 2.6-2.9 3 .7 5.8 2.4 10.6 5.2 15.9H9.4c2.8-5.3 4.5-10.1 5.2-15.9-1.6-.4-2.9-1.4-2.9-3z"/>`,
  k: `<path d="M20 1.8v9.2M16.2 5.6h7.6" fill="none" class="pc-cross"/><path d="M20 15.3c-1.7-3.4-6.6-4.7-9.8-2.3-3.6 2.8-2.6 8.4 1.9 12.6l-.6 6h17l-.6-6c4.5-4.2 5.5-9.8 1.9-12.6-3.2-2.4-8.1-1.1-9.8 2.3z"/><path d="M20 15.3v10" fill="none" class="pc-line"/><path d="M11.5 31.6h17c0 1.6-1.3 2.6-2.9 3 .7 5.8 2.4 10.6 5.2 15.8H9.2c2.8-5.2 4.5-10 5.2-15.8-1.6-.4-2.9-1.4-2.9-3z"/>`,
};

export const pieceSvg = (t, c) =>
  `<svg class="pc pc-${c} pc-${t}" viewBox="0 0 40 60" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><g stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" fill="url(#ch-${c})">${PATHS[t]}<path d="${BASE}"/></g></svg>`;

// Gradients shared by every piece on the page (inserted once by the game).
export const PIECE_DEFS = `
  <svg class="ch-defs" width="0" height="0" aria-hidden="true" style="position:absolute">
    <defs>
      <linearGradient id="ch-w" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#d9c29a"/>
        <stop offset=".28" stop-color="#fffaf0"/>
        <stop offset=".5" stop-color="#f6ead2"/>
        <stop offset="1" stop-color="#b8976a"/>
      </linearGradient>
      <linearGradient id="ch-b" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#1b1622"/>
        <stop offset=".3" stop-color="#5a4b63"/>
        <stop offset=".52" stop-color="#2d2433"/>
        <stop offset="1" stop-color="#0c0a10"/>
      </linearGradient>
    </defs>
  </svg>`;

export const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
