// Tiny persisted store for players + settings (localStorage).

const KEY = 'pnp:v1';
export const MAX_PLAYERS = 12;
const PLAYER_COLORS = [
  '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#14b8a6', '#f97316', '#a855f7', '#84cc16', '#06b6d4', '#e11d48',
];

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  return {
    players: Array.isArray(saved.players) ? saved.players : [],
    settings: { sound: true, ...saved.settings },
    flags: { ...saved.flags },
    games: { ...saved.games },
  };
}

const data = load();
const listeners = new Set();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
  listeners.forEach((fn) => fn(data));
}

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const store = {
  get players() {
    return data.players;
  },
  get settings() {
    return data.settings;
  },

  addPlayer(name) {
    name = name.trim();
    if (!name || data.players.length >= MAX_PLAYERS) return null;
    const used = new Set(data.players.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[data.players.length % PLAYER_COLORS.length];
    const player = { id: uid(), name, color };
    data.players.push(player);
    save();
    return player;
  },
  renamePlayer(id, name) {
    const p = data.players.find((p) => p.id === id);
    name = name.trim();
    if (!p || !name || p.name === name) return;
    p.name = name;
    save();
  },
  removePlayer(id) {
    data.players = data.players.filter((p) => p.id !== id);
    save();
  },

  setSetting(key, value) {
    data.settings[key] = value;
    save();
  },

  flag(key) {
    return !!data.flags[key];
  },
  setFlag(key, value = true) {
    data.flags[key] = value;
    save();
  },

  gameData(id) {
    return data.games[id] ?? null;
  },
  setGameData(id, value) {
    data.games[id] = value;
    save();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
