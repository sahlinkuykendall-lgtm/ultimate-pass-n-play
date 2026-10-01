// Synthesized UI sounds (no audio files) + haptics where the platform supports it.
import { store } from './store.js';

let ctx;

// iOS only allows audio after a user gesture — call this from the first tap.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq, to, dur = 0.08, type = 'sine', gain = 0.05, delay = 0 }) {
  if (!ctx || !store.settings.sound) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  tone,
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.045, delay: i * 0.09 }));
    tone({ freq: 2093, dur: 0.6, type: 'sine', gain: 0.015, delay: 0.4 });
  },
  draw: () => {
    tone({ freq: 440, dur: 0.25, type: 'triangle', gain: 0.04 });
    tone({ freq: 392, dur: 0.4, type: 'triangle', gain: 0.04, delay: 0.18 });
  },
  tick: () => tone({ freq: 1400, dur: 0.03, type: 'square', gain: 0.012 }),
  tap: () => tone({ freq: 900, to: 620, dur: 0.05, gain: 0.03 }),
  select: () => {
    tone({ freq: 660, dur: 0.09, gain: 0.035 });
    tone({ freq: 990, dur: 0.12, gain: 0.025, delay: 0.05 });
  },
  open: () => tone({ freq: 420, to: 660, dur: 0.16, type: 'triangle', gain: 0.035 }),
  close: () => tone({ freq: 620, to: 380, dur: 0.14, type: 'triangle', gain: 0.03 }),
  deny: () => {
    tone({ freq: 300, to: 240, dur: 0.1, type: 'triangle', gain: 0.04 });
    tone({ freq: 240, to: 200, dur: 0.12, type: 'triangle', gain: 0.035, delay: 0.09 });
  },
  start: () =>
    [523.25, 659.25, 783.99, 987.77, 1318.5].forEach((f, i) =>
      tone({ freq: f, dur: 1.1, type: 'triangle', gain: 0.028, delay: i * 0.075 }),
    ),
  pass: () => {
    tone({ freq: 440, to: 880, dur: 0.22, type: 'sine', gain: 0.04 });
    tone({ freq: 660, to: 1320, dur: 0.25, type: 'sine', gain: 0.02, delay: 0.04 });
  },
};

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
