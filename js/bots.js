// Computer players. They sit in every game's roster next to the real players
// and take their own turns. level: 0 easy, 1 medium, 2 hard.

export const BOTS = [
  { id: 'bot-easy', name: 'Pip', color: '#06b6d4', bot: { level: 0, label: 'Easy' } },
  { id: 'bot-medium', name: 'Bolt', color: '#f97316', bot: { level: 1, label: 'Medium' } },
  { id: 'bot-hard', name: 'Nova', color: '#84cc16', bot: { level: 2, label: 'Hard' } },
];

export const isBot = (p) => !!p?.bot;
export const botLevel = (p) => p?.bot?.level ?? 0;

// Little robot face used in place of a bot's initial.
export const BOT_FACE =
  '<svg class="bot-face" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><circle cx="12" cy="2.6" r=".6" fill="currentColor"/><rect x="4" y="6.5" width="16" height="13" rx="4.5"/><circle cx="9" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><path d="M9.5 16.3h5"/></svg>';

// Yields to the browser so a "thinking" state paints before heavy work starts.
export const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
