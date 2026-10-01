import { GAMES, CATEGORIES, isReady, formatPlayers } from './games.js';
import { store, MAX_PLAYERS } from './store.js';
import { sfx, haptic, unlockAudio } from './fx.js';
import { icon, logoMark } from './icons.js';
import { openSheet, sheetIsOpen, toast, confirm, passTo, confetti, escapeHtml } from './ui.js';

export const APP_VERSION = '0.6.0';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const app = $('#app');
const screens = { splash: $('#splash'), home: $('#home'), game: $('#game') };
const state = { screen: 'splash', category: 'all', lastInteraction: 0 };

// iOS only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

function show(name) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle('is-active', key === name));
  app.dataset.screen = name;
  state.screen = name;
}

/* ------------------------------------------------------------------ Splash */

function startSplash() {
  const splash = screens.splash;
  splash.classList.remove('is-leaving');
  show('splash');
  // Restart the CSS intro timeline.
  splash.classList.remove('play');
  void splash.offsetWidth;
  splash.classList.add('play');

  const readyAt = performance.now() + 700;
  const onTap = () => {
    if (performance.now() < readyAt) return;
    splash.removeEventListener('click', onTap);
    unlockAudio();
    sfx.start();
    haptic(15);
    splash.classList.add('is-leaving');
    setTimeout(enterHome, 650);
  };
  splash.addEventListener('click', onTap);
}

/* -------------------------------------------------------------------- Home */

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night crew';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const metaChips = (game) => `
  <span>${icon('users')}${formatPlayers(game.players)}</span>
  <span>${icon('clock')}${escapeHtml(game.time)}</span>`;

const gameVars = (game) => `--c1:${game.colors[0]};--c2:${game.colors[1]}`;

function renderHome() {
  const featured = GAMES.filter((g) => g.featured);
  screens.home.innerHTML = `
    <header class="navbar">
      <div class="navbar-brand">${logoMark('navbar-logo')}<span>Pass &amp; Play</span></div>
      <div class="navbar-actions">
        <button class="icon-btn" data-action="players" aria-label="Players">${icon('users')}</button>
        <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </header>

    <div class="home-scroll">
      <div class="home-hero-title rise" style="--d:0">
        <p class="eyebrow">${greeting()}</p>
        <h1 class="large-title">Let’s play.</h1>
      </div>

      <div class="players-slot rise" style="--d:1"></div>

      <section class="featured rise" style="--d:2" aria-label="Featured games">
        <div class="carousel">
          ${featured.map((g) => `
            <button class="hero" style="${gameVars(g)}" data-game="${g.id}">
              <span class="hero-shine"></span>
              <span class="hero-art">${icon(g.icon)}</span>
              <span class="hero-copy">
                <span class="hero-eyebrow">${icon('sparkle')}Featured</span>
                <span class="hero-name">${escapeHtml(g.name)}</span>
                <span class="hero-tagline">${escapeHtml(g.tagline)}</span>
                <span class="hero-meta">${metaChips(g)}</span>
              </span>
              <span class="pill">${isReady(g) ? 'Play now' : 'Coming soon'}</span>
            </button>`).join('')}
        </div>
        <div class="dots">${featured.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
      </section>

      <nav class="chips rise" style="--d:3" aria-label="Categories">
        ${CATEGORIES.map((c) => `<button class="chip ${c.id === state.category ? 'on' : ''}" data-category="${c.id}">${c.label}</button>`).join('')}
      </nav>

      <div class="section-head rise" style="--d:4">
        <h2>Game library</h2>
        <span class="count"></span>
      </div>
      <div class="grid rise" style="--d:5"></div>

      <footer class="home-foot rise" style="--d:6">
        ${logoMark('foot-logo')}
        <p>More games are on the way.</p>
      </footer>
    </div>`;

  renderPlayersStrip();
  renderGrid();
  wireHome();
}

function renderPlayersStrip() {
  const slot = $('.players-slot', screens.home);
  if (!slot) return;
  const players = store.players;
  if (!players.length) {
    slot.innerHTML = `
      <button class="players-strip empty" data-action="players">
        <span class="ps-add">${icon('plus')}</span>
        <span class="ps-copy"><strong>Add players</strong><small>Names make every game better</small></span>
        ${icon('chevronRight', 'ps-chev')}
      </button>`;
    return;
  }
  const shown = players.slice(0, 5);
  const extra = players.length - shown.length;
  slot.innerHTML = `
    <button class="players-strip" data-action="players">
      <span class="avatars">
        ${shown.map((p) => `<span class="avatar" style="--pc:${p.color}">${escapeHtml(p.name[0].toUpperCase())}</span>`).join('')}
        ${extra > 0 ? `<span class="avatar more">+${extra}</span>` : ''}
      </span>
      <span class="ps-copy">
        <strong>${players.length} player${players.length === 1 ? '' : 's'}</strong>
        <small>${escapeHtml(players.map((p) => p.name).join(', '))}</small>
      </span>
      ${icon('chevronRight', 'ps-chev')}
    </button>`;
}

function renderGrid() {
  const list = state.category === 'all' ? GAMES : GAMES.filter((g) => g.categories.includes(state.category));
  $('.count', screens.home).textContent = `${list.length} game${list.length === 1 ? '' : 's'}`;
  $('.grid', screens.home).innerHTML = list
    .map(
      (g, i) => `
      <button class="card" style="${gameVars(g)};--i:${i}" data-game="${g.id}">
        <span class="card-glow"></span>
        <span class="tile">${icon(g.icon)}</span>
        ${isReady(g) ? '' : '<span class="badge">Soon</span>'}
        <span class="card-copy">
          <span class="card-name">${escapeHtml(g.name)}</span>
          <span class="card-tagline">${escapeHtml(g.tagline)}</span>
        </span>
        <span class="card-meta">${metaChips(g)}</span>
      </button>`,
    )
    .join('');
}

function wireHome() {
  const home = screens.home;
  const scroller = $('.home-scroll', home);
  const navbar = $('.navbar', home);

  scroller.addEventListener('scroll', () => navbar.classList.toggle('is-scrolled', scroller.scrollTop > 56), {
    passive: true,
  });

  home.addEventListener('click', (e) => {
    const target = e.target.closest('[data-game], [data-category], [data-action]');
    if (!target) return;
    state.lastInteraction = performance.now();

    if (target.dataset.game) {
      openGameDetail(GAMES.find((g) => g.id === target.dataset.game));
    } else if (target.dataset.category) {
      if (target.dataset.category === state.category) return;
      sfx.tap();
      haptic();
      state.category = target.dataset.category;
      $$('.chip', home).forEach((c) => c.classList.toggle('on', c === target));
      const row = target.parentElement;
      row.scrollTo({ left: target.offsetLeft - (row.clientWidth - target.offsetWidth) / 2, behavior: 'smooth' });
      renderGrid();
    } else if (target.dataset.action === 'players') {
      openPlayers();
    } else if (target.dataset.action === 'settings') {
      openSettings();
    }
  });

  wireCarousel($('.carousel', home), $$('.dots i', home));
}

function wireCarousel(track, dots) {
  const slideWidth = () => track.firstElementChild.getBoundingClientRect().width + 12;
  const current = () => Math.round(track.scrollLeft / slideWidth());

  track.addEventListener(
    'scroll',
    () => {
      const i = current();
      dots.forEach((d, j) => d.classList.toggle('on', i === j));
    },
    { passive: true },
  );
  track.addEventListener('pointerdown', () => (state.lastInteraction = performance.now()), { passive: true });

  // Gentle auto-advance while the library is idle.
  setInterval(() => {
    if (state.screen !== 'home' || sheetIsOpen() || document.hidden) return;
    if (performance.now() - state.lastInteraction < 8000) return;
    const next = (current() + 1) % dots.length;
    track.scrollTo({ left: next * slideWidth(), behavior: 'smooth' });
  }, 5500);
}

function enterHome() {
  if (!screens.home.childElementCount) renderHome();
  screens.home.classList.remove('entered');
  show('home');
  requestAnimationFrame(() => screens.home.classList.add('entered'));
  maybeShowInstallTip();
}

/* ---------------------------------------------------------- Game details */

function openGameDetail(game) {
  sfx.select();
  const [min, max] = game.players;
  const have = store.players.length;
  const ready = isReady(game);
  const needed = Math.max(0, min - have);
  const category = CATEGORIES.find((c) => c.id === game.categories[0])?.label ?? 'Game';

  let cta;
  if (!ready) cta = `<button class="btn btn-locked" data-play>${icon('lock')}Coming soon</button>`;
  else if (needed > 0) cta = `<button class="btn btn-primary" data-add-players>${icon('users')}Add ${needed} more player${needed === 1 ? '' : 's'}</button>`;
  else cta = `<button class="btn btn-primary" data-play>${icon('play')}Play</button>`;

  const note =
    have && have > max
      ? `<p class="detail-note">You’ll pick ${max} of your ${have} players to play.</p>`
      : '';

  const { el, close } = openSheet({
    className: 'sheet-detail',
    html: `
      <div class="detail" style="${gameVars(game)}">
        <div class="detail-banner sheet-drag">
          <span class="detail-banner-bg"><span class="detail-banner-art">${icon(game.icon)}</span></span>
          <span class="tile tile-xl">${icon(game.icon)}</span>
        </div>
        <h2 class="detail-name">${escapeHtml(game.name)}</h2>
        <p class="detail-tagline">${escapeHtml(game.tagline)}</p>
        <div class="stats">
          <div><span>${icon('users')}Players</span><strong>${formatPlayers(game.players)}</strong></div>
          <div><span>${icon('clock')}Time</span><strong>${escapeHtml(game.time)}</strong></div>
          <div><span>${icon('bolt')}Type</span><strong>${category}</strong></div>
        </div>
        <p class="detail-desc">${escapeHtml(game.description)}</p>
        ${note}
        ${cta}
      </div>`,
  });

  el.querySelector('[data-add-players]')?.addEventListener('click', () => {
    close();
    setTimeout(openPlayers, 250);
  });
  el.querySelector('[data-play]')?.addEventListener('click', (e) => {
    if (!ready) {
      sfx.deny();
      haptic(20);
      e.currentTarget.classList.remove('shake');
      void e.currentTarget.offsetWidth;
      e.currentTarget.classList.add('shake');
      toast('We’re still building this one. Stay tuned!', { icon: 'sparkle' });
      return;
    }
    close();
    setTimeout(() => launchGame(game), 300);
  });
}

/* ----------------------------------------------------------------- Players */

function openPlayers() {
  const { el } = openSheet({
    className: 'sheet-players',
    onClose: renderPlayersStrip,
    html: `
      <div class="sheet-drag">
        <h2 class="sheet-title">Who’s playing?</h2>
        <p class="sheet-sub">Add everyone in the room. Games will call you by name when it’s your turn.</p>
      </div>
      <form class="add-player" autocomplete="off">
        <input type="text" name="name" placeholder="Player name" maxlength="16" enterkeyhint="done" autocapitalize="words" spellcheck="false" aria-label="Player name">
        <button type="submit" class="add-btn" aria-label="Add player">${icon('plus')}</button>
      </form>
      <ul class="player-list"></ul>
      <button class="btn btn-primary" data-close>Done</button>`,
  });

  const form = $('.add-player', el);
  const input = form.elements.name;
  const list = $('.player-list', el);

  const renderList = (newId) => {
    const players = store.players;
    form.classList.toggle('is-full', players.length >= MAX_PLAYERS);
    input.placeholder = players.length >= MAX_PLAYERS ? `Max ${MAX_PLAYERS} players` : `Player ${players.length + 1} name`;
    input.disabled = players.length >= MAX_PLAYERS;
    list.innerHTML = players.length
      ? players
          .map(
            (p) => `
          <li class="player-row ${p.id === newId ? 'is-new' : ''}" data-id="${p.id}">
            <span class="avatar" style="--pc:${p.color}">${escapeHtml(p.name[0].toUpperCase())}</span>
            <input class="player-name" value="${escapeHtml(p.name)}" maxlength="16" aria-label="Rename ${escapeHtml(p.name)}" enterkeyhint="done" spellcheck="false">
            <button class="remove-btn" data-remove aria-label="Remove ${escapeHtml(p.name)}">${icon('minus')}</button>
          </li>`,
          )
          .join('')
      : `<li class="player-empty">${icon('users')}<span>No players yet</span></li>`;
  };
  renderList();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const player = store.addPlayer(input.value);
    if (!player) {
      sfx.deny();
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      return;
    }
    sfx.select();
    haptic();
    input.value = '';
    renderList(player.id);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const row = btn.closest('.player-row');
    sfx.tap();
    haptic();
    row.classList.add('is-removing');
    setTimeout(() => {
      store.removePlayer(row.dataset.id);
      renderList();
    }, 220);
  });

  list.addEventListener('change', (e) => {
    if (!e.target.matches('.player-name')) return;
    const row = e.target.closest('.player-row');
    if (!e.target.value.trim()) {
      e.target.value = store.players.find((p) => p.id === row.dataset.id)?.name ?? '';
      return;
    }
    store.renamePlayer(row.dataset.id, e.target.value);
    $('.avatar', row).textContent = e.target.value.trim()[0].toUpperCase();
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.player-name')) e.target.blur();
  });
}

/* ---------------------------------------------------------------- Settings */

function openSettings() {
  const { el, close } = openSheet({
    className: 'sheet-settings',
    html: `
      <h2 class="sheet-title sheet-drag">Settings</h2>
      <div class="list">
        <label class="row">
          <span class="row-icon" style="--rc:#ec4899">${icon('sound')}</span>
          <span class="row-label">Sound effects</span>
          <input type="checkbox" class="switch" data-setting="sound" ${store.settings.sound ? 'checked' : ''}>
        </label>
        <button class="row" data-row="players">
          <span class="row-icon" style="--rc:#8b5cf6">${icon('users')}</span>
          <span class="row-label">Players</span>
          <span class="row-value">${store.players.length}</span>
          ${icon('chevronRight', 'row-chev')}
        </button>
        <button class="row" data-row="intro">
          <span class="row-icon" style="--rc:#f59e0b">${icon('replay')}</span>
          <span class="row-label">Replay intro</span>
          ${icon('chevronRight', 'row-chev')}
        </button>
        <button class="row" data-row="update">
          <span class="row-icon" style="--rc:#10b981">${icon('download')}</span>
          <span class="row-label">Force update<small>Download the latest version now</small></span>
          ${icon('chevronRight', 'row-chev')}
        </button>
      </div>
      <div class="about">
        ${logoMark('about-logo')}
        <strong>Ultimate Pass &amp; Play</strong>
        <small>Version ${APP_VERSION}</small>
      </div>`,
  });

  $('[data-setting="sound"]', el).addEventListener('change', (e) => {
    store.setSetting('sound', e.target.checked);
    haptic();
    sfx.tap();
  });
  $('[data-row="players"]', el).addEventListener('click', () => {
    close();
    setTimeout(openPlayers, 250);
  });
  $('[data-row="intro"]', el).addEventListener('click', () => {
    close();
    setTimeout(startSplash, 300);
  });
  $('[data-row="update"]', el).addEventListener('click', () => {
    close();
    forceUpdate();
  });
}

/* ----------------------------------------------------------------- Updates */

// Wipes the offline cache and service worker, then reloads straight from the network.
async function forceUpdate() {
  toast('Updating to the latest version…', { icon: 'download', duration: 4000 });
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await globalThis.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  setTimeout(() => location.replace(`${location.pathname}?v=${Date.now()}`), 600);
}

let reloadPending = false;
function onUpdateReady() {
  // Never yank someone out of a game; reload as soon as they're back in the library.
  if (state.screen === 'game') reloadPending = true;
  else location.reload();
}

/* --------------------------------------------------------------- Game host */

let teardown = null;

async function launchGame(game) {
  let mod;
  try {
    mod = (await game.load()).default;
  } catch (err) {
    console.error(err);
    toast('Couldn’t load that game. Try again.', { icon: 'x' });
    return;
  }

  screens.game.style.cssText = gameVars(game);
  screens.game.innerHTML = `
    <header class="game-bar">
      <button class="icon-btn" data-exit aria-label="Leave game">${icon('x')}</button>
      <span class="game-bar-title"><span class="tile tile-sm">${icon(game.icon)}</span>${escapeHtml(game.name)}</span>
      <span class="icon-btn-spacer"></span>
    </header>
    <main class="game-stage"></main>`;

  const exit = () => {
    teardown?.();
    teardown = null;
    if (reloadPending) return location.reload();
    show('home');
    setTimeout(() => (screens.game.innerHTML = ''), 500);
  };

  $('[data-exit]', screens.game).addEventListener('click', async () => {
    sfx.tap();
    const leave = await confirm({
      title: 'Leave this game?',
      message: 'Your current progress will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Keep playing',
      danger: true,
    });
    if (leave) exit();
  });

  show('game');
  sfx.start();
  const ctx = {
    game,
    players: [...store.players],
    storage: { get: () => store.gameData(game.id), set: (value) => store.setGameData(game.id, value) },
    passTo,
    toast,
    confirm,
    confetti,
    sfx,
    haptic,
    exit,
  };
  const cleanup = await mod.mount($('.game-stage', screens.game), ctx);
  teardown = typeof cleanup === 'function' ? cleanup : null;
}

/* ------------------------------------------------------------- Install tip */

function maybeShowInstallTip() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS || navigator.standalone || store.flag('installTipDismissed')) return;

  setTimeout(() => {
    if (state.screen !== 'home' || $('.install-tip')) return;
    const tip = document.createElement('div');
    tip.className = 'install-tip';
    tip.innerHTML = `
      <img src="icons/apple-touch-icon.png" alt="">
      <span class="it-copy">
        <strong>Get the full-screen app</strong>
        <small>Tap ${icon('share')} then “Add to Home Screen”</small>
      </span>
      <button class="it-close" aria-label="Dismiss">${icon('x')}</button>`;
    screens.home.append(tip);
    requestAnimationFrame(() => tip.classList.add('is-shown'));
    $('.it-close', tip).addEventListener('click', () => {
      store.setFlag('installTipDismissed');
      tip.classList.remove('is-shown');
      setTimeout(() => tip.remove(), 400);
    });
  }, 1400);
}

/* -------------------------------------------------------------------- Boot */

if (new URLSearchParams(location.search).has('skip')) {
  renderHome();
  enterHome();
} else {
  startSplash();
}

// Clean the cache-busting param left by "Force update".
if (new URLSearchParams(location.search).has('v')) history.replaceState(null, '', location.pathname);

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && !isLocal) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    onUpdateReady();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // iOS resumes home-screen apps instead of relaunching them, so check whenever we come back.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
      reg.update().catch(() => {});
    } catch {}
  });
}
