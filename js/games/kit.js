// Shared building blocks for game setup screens. Styles live in css/kit.css.
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';
import { isBot, BOT_FACE } from '../bots.js';

export { escapeHtml, isBot };

// What goes inside a player's avatar circle: their initial, or a robot face for bots.
export const initial = (p) => (isBot(p) ? BOT_FACE : escapeHtml(p.name.trim()[0]?.toUpperCase() ?? '?'));

// A roster chip (setup screens). `on`/`badge` mark a seated player.
export const personChip = (p, { act = 'toggle', on = false, badge = '' } = {}) =>
  `<button class="kit-person ${on ? 'on' : ''} ${isBot(p) ? 'is-bot' : ''}" data-act="${act}" data-v="${p.id}" style="--pc:${p.color}">
    <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>${escapeHtml(p.name)}${isBot(p) ? `<small class="kit-lvl">${p.bot.label}</small>` : ''}
    ${badge ? `<span class="kit-badge">${badge}</span>` : ''}
  </button>`;

// "Pip is thinking…" for status lines.
export const thinking = (p) => `<span><b>${escapeHtml(p.name)}</b> is thinking</span><span class="kit-dots"><i></i><i></i><i></i></span>`;

export const svgIcon = (paths) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const BOT_TAG = `<span class="kit-sub-ico">${BOT_FACE}</span>`;
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

// Loads a game's stylesheet and resolves once it's applied (avoids a flash of unstyled game).
export function loadStyles(url) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  return new Promise((resolve) => {
    link.onload = link.onerror = () => resolve(link);
    document.head.append(link);
  });
}

// "Players" section: turn order cards, shuffle button and roster chips to add/remove.
// Wire clicks with toggleSeat() for data-act="toggle" and shuffle() for data-act="shuffle".
export function playersSection({ roster, seats, max, hint }) {
  return `
    <section class="kit-sec">
      <h3 class="kit-h">Players <span class="kit-count">${seats.length} of ${max}</span></h3>
      <div class="kit-order" style="--n:${seats.length}">
        ${seats
          .map(
            (p, i) => `
          <div class="kit-seat" style="--pc:${p.color}">
            <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>
            <strong>${escapeHtml(p.name)}</strong>
            <small>${ORDINALS[i]}${isBot(p) ? ` · ${p.bot.label}` : ''}</small>
          </div>`,
          )
          .join('')}
      </div>
      <div class="kit-order-actions">
        <button class="kit-ctrl" data-act="shuffle">${icon('swap')}<span>Shuffle order</span></button>
      </div>
      ${(() => {
        const chip = (p) => {
          const seat = seats.indexOf(p);
          return personChip(p, { on: seat >= 0, badge: seat >= 0 ? seat + 1 : '' });
        };
        const people = roster.filter((p) => !isBot(p));
        const bots = roster.filter(isBot);
        return `<p class="kit-hint">${hint ?? `Tap to add or remove players. 2 to ${max} can play.`}</p>
          ${people.length ? `<div class="kit-people">${people.map(chip).join('')}</div>` : ''}
          ${bots.length ? `<p class="kit-sub">${BOT_TAG}Computer players</p><div class="kit-people">${bots.map(chip).join('')}</div>` : ''}`;
      })()}
    </section>`;
}

// Adds or removes a roster player from the seats. Returns false (with feedback) if not allowed.
export function toggleSeat(ctx, { roster, seats, id, min = 2, max }) {
  const p = roster.find((x) => x.id === id);
  const at = seats.indexOf(p);
  if (at >= 0 && seats.length <= min) {
    ctx.sfx.deny();
    ctx.toast(`You need at least ${min} players.`, { icon: 'users', duration: 1800 });
    return false;
  }
  if (at < 0 && seats.length >= max) {
    ctx.sfx.deny();
    ctx.toast(`Up to ${max} players.`, { icon: 'users', duration: 1800 });
    return false;
  }
  if (at >= 0) seats.splice(at, 1);
  else seats.push(p);
  return true;
}

export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Segmented control row. options: [[value, label], ...]
export const segRow = (label, key, options, current) => `
  <div class="kit-row"><span class="kit-label">${label}</span><div class="kit-seg">${options
    .map(([value, text]) => `<button class="${current === value ? 'on' : ''}" data-act="${key}" data-v="${value}">${text}</button>`)
    .join('')}</div></div>`;

// Mode picker grid. modes: [{ id, name, desc, icon (svg paths) }]
export const modeGrid = (modes, current) => `
  <div class="kit-modes">
    ${modes
      .map(
        (m) => `
      <button class="kit-mode ${current === m.id ? 'on' : ''}" data-act="mode" data-v="${m.id}">
        <span class="kit-mode-ico">${svgIcon(m.icon)}</span>
        <strong>${m.name}</strong>
        <small>${m.desc}</small>
      </button>`,
      )
      .join('')}
  </div>`;

// Plays a bot's turn: a short beat so it feels considered, then `compute()` picks the
// move and `act(move)` makes it. Any newer botTurn/cancelBot call voids a pending one.
// Timeouts go on owner.pending so the game's clearPending() also stops them.
export function botTurn(owner, compute, act, { min = 700 } = {}) {
  const token = (owner.botToken = (owner.botToken ?? 0) + 1);
  const start = performance.now();
  owner.pending.push(
    setTimeout(() => {
      if (owner.botToken !== token) return;
      const move = compute();
      const wait = Math.max(0, min - (performance.now() - start));
      owner.pending.push(setTimeout(() => owner.botToken === token && act(move), wait));
    }, 160),
  );
}
export const cancelBot = (owner) => (owner.botToken = (owner.botToken ?? 0) + 1);
