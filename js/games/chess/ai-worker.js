// Runs the chess bot off the main thread so the board keeps animating while it thinks.
import { chooseMove } from './ai.js';

self.onmessage = (e) => {
  const { id, state, level } = e.data;
  self.postMessage({ id, move: chooseMove(state, level) });
};
