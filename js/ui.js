// Shared UI primitives: bottom sheets, toasts, confirm dialogs and the
// "pass the phone" handoff screen that games use between turns.
import { sfx, haptic } from './fx.js';
import { icon } from './icons.js';

const root = () => document.getElementById('overlay-root');
const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let openCount = 0;
export const sheetIsOpen = () => openCount > 0;

export function openSheet({ html, className = '', onClose } = {}) {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true">
      <div class="sheet-grabber"><span></span></div>
      <div class="sheet-body">${html ?? ''}</div>
    </div>`;
  const sheet = layer.querySelector('.sheet');
  const body = layer.querySelector('.sheet-body');
  root().append(layer);
  openCount++;
  nextFrame(() => layer.classList.add('is-open'));
  sfx.open();
  haptic();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount--;
    sfx.close();
    layer.classList.remove('is-open');
    setTimeout(() => layer.remove(), 450);
    onClose?.();
  };

  layer.querySelector('.sheet-backdrop').addEventListener('click', close);
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  enableDragToDismiss(sheet, close);
  return { el: body, close };
}

function enableDragToDismiss(sheet, close) {
  let startY = 0;
  let dy = 0;
  let t0 = 0;
  let dragging = false;

  sheet.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.sheet-grabber, .sheet-drag')) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    t0 = performance.now();
    sheet.style.transition = 'none';
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const raw = e.clientY - startY;
    // Rubber-band when pulling up, follow the finger when pulling down.
    dy = raw < 0 ? raw / 6 : raw;
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const velocity = dy / (performance.now() - t0);
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110 || velocity > 0.6) close();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

export function toast(message, { icon: ico = 'sparkle', duration = 2400 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(ico)}<span>${escapeHtml(message)}</span>`;
  root().append(el);
  nextFrame(() => el.classList.add('is-shown'));
  setTimeout(() => {
    el.classList.remove('is-shown');
    setTimeout(() => el.remove(), 500);
  }, duration);
}

export function confirm({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const { el, close } = openSheet({
      className: 'sheet-compact',
      onClose: () => resolve(result),
      html: `
        <div class="confirm">
          <h2 class="sheet-title">${escapeHtml(title)}</h2>
          ${message ? `<p class="sheet-sub">${escapeHtml(message)}</p>` : ''}
          <div class="confirm-actions">
            <button class="btn btn-glass" data-close>${escapeHtml(cancelLabel)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`,
    });
    el.querySelector('[data-confirm]').addEventListener('click', () => {
      result = true;
      close();
    });
  });
}

// Full-screen "Pass the phone to ___" interstitial. Resolves when the next
// player taps to say they're ready.
export function passTo(player, { message = 'Pass the phone to', hint = 'No peeking.' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'handoff';
    el.style.setProperty('--c', player.color ?? '#8b5cf6');
    el.innerHTML = `
      <div class="handoff-inner">
        <div class="handoff-avatar">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</div>
        <p class="handoff-eyebrow">${escapeHtml(message)}</p>
        <h1 class="handoff-name">${escapeHtml(player.name)}</h1>
        <p class="handoff-hint">${escapeHtml(hint)}</p>
      </div>
      <div class="handoff-cta">Tap when you’re ready</div>`;
    root().append(el);
    sfx.pass();
    nextFrame(() => el.classList.add('is-shown'));

    const armedAt = performance.now() + 600; // avoid accidental double-tap through
    el.addEventListener('click', () => {
      if (performance.now() < armedAt) return;
      sfx.select();
      haptic(12);
      el.classList.remove('is-shown');
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 500);
      resolve();
    });
  });
}
