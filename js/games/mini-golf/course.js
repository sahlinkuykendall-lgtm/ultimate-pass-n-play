// The course: nine handcrafted holes in a 100 × 160 field. See engine.js for the shape format.

const box = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

export const HOLES = [
  {
    name: 'Warm Up',
    par: 2,
    tee: [50, 134],
    cup: [50, 32],
    outline: box(22, 14, 78, 148),
  },
  {
    name: 'Dogleg',
    par: 3,
    tee: [30, 138],
    cup: [74, 30],
    outline: [[14, 150], [46, 150], [46, 48], [88, 48], [88, 12], [14, 12]],
    bumpers: [{ x: 22, y: 20, r: 4.5 }],
    sand: [{ circle: [62, 40, 6] }],
  },
  {
    name: 'The Gate',
    par: 3,
    tee: [50, 138],
    cup: [50, 30],
    outline: box(14, 12, 86, 150),
    walls: [
      [[14, 82], [42, 82]],
      [[58, 82], [86, 82]],
    ],
    sand: [{ rect: [18, 20, 18, 16] }, { rect: [64, 20, 18, 16] }],
  },
  {
    name: 'Windmill',
    par: 3,
    tee: [50, 138],
    cup: [50, 30],
    outline: box(14, 12, 86, 150),
    blocks: [{ rect: [14, 72, 16, 20] }, { rect: [70, 72, 16, 20] }],
    spinners: [{ x: 50, y: 82, len: 36, speed: 1.4 }],
  },
  {
    name: 'Island Green',
    par: 3,
    tee: [50, 136],
    cup: [50, 32],
    outline: box(12, 10, 88, 150),
    water: [{ rect: [12, 64, 31, 30] }, { rect: [57, 64, 31, 30] }],
    sand: [{ circle: [28, 30, 7] }, { circle: [72, 30, 7] }],
  },
  {
    name: 'Bumper Alley',
    par: 3,
    tee: [50, 138],
    cup: [50, 28],
    outline: box(16, 12, 84, 150),
    bumpers: [
      { x: 34, y: 62, r: 5 },
      { x: 66, y: 62, r: 5 },
      { x: 50, y: 86, r: 5 },
      { x: 30, y: 108, r: 5 },
      { x: 70, y: 108, r: 5 },
    ],
  },
  {
    name: 'The Slope',
    par: 3,
    tee: [70, 138],
    cup: [26, 28],
    outline: box(14, 12, 86, 150),
    slopes: [{ shape: { rect: [14, 58, 72, 44] }, accel: [34, 0] }],
    sand: [{ rect: [66, 18, 20, 16] }],
  },
  {
    name: 'Portal',
    par: 3,
    tee: [30, 136],
    cup: [70, 28],
    outline: box(14, 12, 86, 150),
    blocks: [{ rect: [14, 72, 72, 14] }],
    portals: [{ a: [70, 116], b: [30, 50], r: 5 }],
  },
  {
    name: 'Grand Finale',
    par: 4,
    tee: [26, 136],
    cup: [72, 30],
    outline: box(12, 10, 88, 150),
    walls: [
      [[12, 108], [66, 108]],
      [[88, 58], [34, 58]],
    ],
    boosts: [{ shape: { rect: [40, 74, 22, 18] }, accel: [-150, 0] }],
    bumpers: [{ x: 52, y: 128, r: 4 }],
    water: [{ circle: [78, 84, 6] }],
    sand: [{ circle: [54, 22, 6] }],
  },
];

// Which holes to play for shorter rounds (indexes into HOLES).
export const ROUTES = {
  3: [0, 3, 8],
  6: [0, 1, 4, 3, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
