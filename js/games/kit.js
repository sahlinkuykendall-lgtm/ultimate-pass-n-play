// Shared building blocks for game setup screens. Styles live in css/kit.css.
import { icon } from '../icons.js';
import { escapeHtml } from '../ui.js';

export { escapeHtml };

export const initial = (p) => escapeHtml(p.name.trim()[0]?.toUpperCase() ?? '?');

export const svgIcon = (paths) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

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
            <small>${ORDINALS[i]}</small>
          </div>`,
          )
          .join('')}
      </div>
      <div class="kit-order-actions">
        <button class="kit-ctrl" data-act="shuffle">${icon('swap')}<span>Shuffle order</span></button>
      </div>
      ${
        roster.length > 2
          ? `<p class="kit-hint">${hint ?? `Tap to add or remove players. 2 to ${max} can play.`}</p>
             <div class="kit-people">${roster
               .map((p) => {
                 const seat = seats.indexOf(p);
                 return `<button class="kit-person ${seat >= 0 ? 'on' : ''}" data-act="toggle" data-v="${p.id}" style="--pc:${p.color}">
                   <span class="avatar" style="--pc:${p.color}">${initial(p)}</span>${escapeHtml(p.name)}
                   ${seat >= 0 ? `<span class="kit-badge">${seat + 1}</span>` : ''}
                 </button>`;
               })
               .join('')}</div>`
          : `<p class="kit-hint">Add more players on the home screen to play with up to ${max}.</p>`
      }
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
