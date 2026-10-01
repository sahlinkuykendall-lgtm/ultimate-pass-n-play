// Inline SVG icon set. Everything is stroke-based on a 24×24 grid so icons
// inherit `currentColor` and scale cleanly.

const PATHS = {
  // UI
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M6 12h12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  play: '<path d="M8 5.2v13.6a1 1 0 0 0 1.52.85l10.4-6.8a1 1 0 0 0 0-1.7L9.52 4.35A1 1 0 0 0 8 5.2z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  table: '<rect x="3" y="8.5" width="18" height="7" rx="2"/><path d="M8 4.5h8M8 19.5h8"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',

  // Game glyphs
  grid: '<path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17"/>',
  flag: '<path d="M6 21V3.5"/><path d="M6 4l11 4.5L6 13"/><path d="M3 21h7"/>',
  boxes: '<path d="M5 5h7v7H5z"/><path d="M12 12h7M12 12v7" opacity=".55"/><circle cx="19" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="19" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="19" r="1.3" fill="currentColor" stroke="none"/>',
  dots: '<circle cx="6" cy="6" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="18" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  mask: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8a7 7 0 0 0 7 7z"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.25v.01"/>',
  split: '<path d="M16 3h5v5M8 3H3v5M21 3l-9 9M3 3l9 9M12 12v9"/>',
  bomb: '<circle cx="11" cy="14" r="7"/><path d="M16 9l2.5-2.5M19.5 2.5v2M21.5 4.5h-2M18 4l1 1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  anchor: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

// Small static version of the brand mark (two passed cards).
export function logoMark(cls = '') {
  return `<svg class="${cls}" viewBox="96 96 320 320" aria-hidden="true">
    <defs>
      <linearGradient id="lm-brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b5cf6"/><stop offset=".55" stop-color="#ec4899"/><stop offset="1" stop-color="#f59e0b"/>
      </linearGradient>
    </defs>
    <rect x="150" y="125" width="170" height="250" rx="42" transform="rotate(-14 235 250)" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.35)" stroke-width="8"/>
    <g transform="rotate(10 285 262)">
      <rect x="200" y="137" width="170" height="250" rx="42" fill="url(#lm-brand)"/>
      <path d="M266 222v80a6 6 0 0 0 9.2 5l61-40a6 6 0 0 0 0-10l-61-40a6 6 0 0 0-9.2 5z" fill="#fff"/>
    </g>
  </svg>`;
}
