// The course: nine long, intricate holes. Each fairway is a centerline
// ([x, y, height?] points) with a width; features are placed along it with
// along(path, t, side), where t is 0..1 of the way down the fairway and side
// pushes left (+) or right (−) of the centerline.
//
// Fairways may overlap: where they do, their rails merge, which is how forks
// and junctions are built. Heights roll the ball: underhit a climb and it comes
// back down. Negative hills are dips; one around a cup makes a funnel.
import { along } from './engine.js';

const at = (path, t, side = 0) => along(path, t, side);
const circle = ([x, y], r) => ({ circle: [x, y, r] });
const square = ([x, y], s) => ({ rect: [x - s / 2, y - s / 2, s, s] });
const hill = ([x, y], r, h) => ({ x, y, r, h });
const bumper = ([x, y], r = 5) => ({ x, y, r });
const pt = ([x, y]) => ({ x, y });
const dir = (path, t) => {
  const [x1, y1] = at(path, t - 0.01);
  const [x2, y2] = at(path, t + 0.01);
  const l = Math.hypot(x2 - x1, y2 - y1) || 1;
  return [(x2 - x1) / l, (y2 - y1) / l];
};
const boost = (path, t, size = 18, power = 150) => {
  const [dx, dy] = dir(path, t);
  return { shape: square(at(path, t), size), accel: [dx * power, dy * power] };
};

/* 1 ─ First Tee: a long S over rolling mounds into a funnel green */
const p1 = [[60, 10, 6], [60, 80, 5], [104, 150, 3], [104, 225, 1], [64, 295, 0], [60, 330, 0]];
const c1 = at(p1, 0.955);

/* 2 ─ Switchback: three terraces joined by hairpin ramps */
const p2 = [[20, 20, 14], [195, 20, 14], [232, 55, 10], [195, 90, 7], [45, 90, 7], [8, 125, 3], [45, 160, 0], [225, 160, 0]];

/* 3 ─ Fork in the Road: long safe loop left or a narrow ridge right */
const p3stem = [[100, 10, 4], [100, 95, 3]];
const p3left = [[100, 85, 3], [48, 140, 2], [34, 225, 1], [58, 305, 0], [100, 345, 0]];
const p3right = [[100, 85, 3], [140, 145, 3], [134, 225, 2], [118, 300, 0], [100, 345, 0]];
const p3green = [[100, 335, 0], [100, 410, 0]];
const c3 = at(p3green, 0.82);

/* 4 ─ Windmill Valley: down into the valley, past the windmill, up to a plateau */
const p4 = [[40, 10, 12], [48, 90, 10], [96, 160, 0], [150, 215, 0], [156, 285, 6], [118, 345, 10], [92, 390, 10]];
const c4 = at(p4, 0.95);

/* 5 ─ Volcano: spiral up the cone and drop into the crater */
const V = { x: 140, y: 150 };
const p5 = [];
for (let k = 0; k <= 16; k++) {
  const a = Math.PI * 0.5 + (k / 16) * Math.PI * 2 * 1.3;
  const r = 118 - (k / 16) * 78;
  p5.push([V.x + Math.cos(a) * r, V.y + Math.sin(a) * r, (k / 16) * 14]);
}
const c5 = at(p5, 0.96);

/* 6 ─ Pinball Alley: a wide zigzag packed with bumpers */
const p6 = [[60, 10, 0], [94, 100, 0], [40, 190, 0], [104, 285, 0], [56, 375, 0], [80, 445, 0]];

/* 7 ─ Rollercoaster: drop, climb, drop again, then up to the green */
const p7 = [[40, 10, 20], [40, 85, 16], [72, 160, 2], [140, 200, 0], [198, 262, 10], [198, 330, 12], [150, 392, 2], [90, 432, 0], [62, 500, 6], [82, 560, 8], [112, 590, 8]];

/* 8 ─ Portal Maze: three islands; the long way round or a gamble */
const p8a = [[30, 10, 0], [30, 125, 0]];
const p8b = [[124, 40, 0], [172, 100, 0], [132, 168, 0], [172, 240, 0]];
const p8c = [[58, 205, 0], [40, 280, 0], [70, 345, 0]];

/* 9 ─ Grand Finale: boost ramp, a fork, then a climb to the crater green */
const p9stem = [[40, 10, 16], [40, 100, 12], [80, 152, 8]];
const p9left = [[80, 142, 8], [36, 220, 6], [36, 300, 4], [90, 362, 2]];
const p9right = [[80, 142, 8], [150, 200, 6], [162, 290, 4], [90, 362, 2]];
const p9end = [[90, 352, 2], [100, 432, 0], [172, 482, 0], [202, 560, 6], [162, 632, 10], [112, 662, 10]];
const c9 = at(p9end, 0.95);

export const HOLES = [
  {
    name: 'First Tee',
    par: 3,
    fairways: [{ path: p1, width: 32 }],
    cup: c1,
    hills: [hill(at(p1, 0.33, 9), 18, 4), hill(at(p1, 0.55, -9), 18, 4), hill(at(p1, 0.72, 8), 16, 3), hill(c1, 24, -2.5)],
    sand: [circle(at(p1, 0.84, -10), 6)],
  },
  {
    name: 'Switchback',
    par: 4,
    fairways: [{ path: p2, width: 30 }],
    tee: at(p2, 0.03),
    cup: at(p2, 0.96),
    hills: [hill(at(p2, 0.14, 7), 14, 3), hill(at(p2, 0.5, -7), 14, 3), hill(at(p2, 0.56, 7), 14, 3), hill(at(p2, 0.96), 18, -2)],
    bumpers: [bumper(at(p2, 0.27, -8)), bumper(at(p2, 0.69, 8))],
    sand: [circle(at(p2, 0.38, 0), 6)],
    water: [circle(at(p2, 0.86, 8), 6)],
  },
  {
    name: 'Fork in the Road',
    par: 4,
    fairways: [
      { path: p3stem, width: 36 },
      { path: p3left, width: 30 },
      { path: p3right, width: 18 },
      { path: p3green, width: 40 },
    ],
    tee: at(p3stem, 0.15),
    cup: c3,
    hills: [hill(at(p3right, 0.48), 16, 5), hill(at(p3left, 0.45, 8), 18, 3), hill(c3, 26, -2.5)],
    bumpers: [bumper(at(p3left, 0.25, -7)), bumper(at(p3left, 0.7, 7))],
    sand: [circle(at(p3left, 0.55, -8), 6), circle(at(p3green, 0.5, 13), 6)],
    water: [circle(at(p3right, 0.72, 0), 5)],
  },
  {
    name: 'Windmill Valley',
    par: 4,
    fairways: [{ path: p4, width: 32 }],
    cup: c4,
    spinners: [{ ...pt(at(p4, 0.45)), len: 28, speed: 1.3 }],
    hills: [hill(at(p4, 0.22, 9), 16, 4), hill(at(p4, 0.68, -9), 16, 4), hill(c4, 22, -2)],
    sand: [circle(at(p4, 0.58, 9), 6), circle(at(p4, 0.86, -10), 5)],
    bumpers: [bumper(at(p4, 0.33, -9))],
  },
  {
    name: 'Volcano',
    par: 4,
    fairways: [{ path: p5, width: 30 }],
    tee: at(p5, 0.02),
    cup: c5,
    hills: [hill(c5, 26, -3.5), hill(at(p5, 0.3, -8), 14, 3), hill(at(p5, 0.6, 8), 14, 3)],
    sand: [circle(at(p5, 0.45, 0), 6)],
    bumpers: [bumper(at(p5, 0.75, 8), 4.5)],
  },
  {
    name: 'Pinball Alley',
    par: 4,
    fairways: [{ path: p6, width: 46 }],
    tee: at(p6, 0.02),
    cup: at(p6, 0.97),
    bumpers: [
      bumper(at(p6, 0.12, 12)),
      bumper(at(p6, 0.18, -10)),
      bumper(at(p6, 0.27, 6)),
      bumper(at(p6, 0.36, -14)),
      bumper(at(p6, 0.42, 10)),
      bumper(at(p6, 0.5, -4)),
      bumper(at(p6, 0.58, 14)),
      bumper(at(p6, 0.65, -12)),
      bumper(at(p6, 0.72, 4)),
      bumper(at(p6, 0.8, -10)),
      bumper(at(p6, 0.86, 12)),
    ],
    boosts: [boost(p6, 0.31, 14, 120)],
    hills: [hill(at(p6, 0.97), 22, -2)],
  },
  {
    name: 'Rollercoaster',
    par: 5,
    fairways: [{ path: p7, width: 30 }],
    cup: at(p7, 0.97),
    hills: [hill(at(p7, 0.36, -10), 14, 4), hill(at(p7, 0.46, 10), 16, 4), hill(at(p7, 0.97), 18, -2)],
    water: [circle(at(p7, 0.3, 8), 6), circle(at(p7, 0.67, -8), 6)],
    sand: [circle(at(p7, 0.53, -7), 6), circle(at(p7, 0.88, 9), 5)],
    bumpers: [bumper(at(p7, 0.77, 8))],
  },
  {
    name: 'Portal Maze',
    par: 4,
    fairways: [
      { path: p8a, width: 30 },
      { path: p8b, width: 30 },
      { path: p8c, width: 34 },
    ],
    tee: at(p8a, 0.08),
    cup: at(p8c, 0.92),
    portals: [
      { a: at(p8a, 0.9), b: at(p8b, 0.08), r: 5.5 },
      { a: at(p8b, 0.94), b: at(p8c, 0.08), r: 5.5 },
      { a: at(p8a, 0.55, -10), b: at(p8c, 0.22, -6), r: 3.5 },
    ],
    bumpers: [bumper(at(p8a, 0.5, -3), 4), bumper(at(p8a, 0.62, -12), 3.5)],
    hills: [hill(at(p8b, 0.35, 6), 16, 4), hill(at(p8b, 0.68, -6), 16, 4), hill(at(p8c, 0.92), 18, -2)],
    sand: [circle(at(p8c, 0.7, -9), 5)],
  },
  {
    name: 'Grand Finale',
    par: 5,
    fairways: [
      { path: p9stem, width: 30 },
      { path: p9left, width: 26 },
      { path: p9right, width: 30 },
      { path: p9end, width: 30 },
    ],
    tee: at(p9stem, 0.08),
    cup: c9,
    boosts: [boost(p9stem, 0.55, 16, 140)],
    spinners: [{ ...pt(at(p9left, 0.5)), len: 22, speed: 1.6 }],
    bumpers: [bumper(at(p9right, 0.38, 8)), bumper(at(p9right, 0.5, -8)), bumper(at(p9right, 0.62, 6))],
    water: [circle(at(p9right, 0.25, -8), 6), circle(at(p9end, 0.4, 8), 6)],
    sand: [circle(at(p9end, 0.86, 9), 5), circle(at(p9end, 0.86, -9), 5)],
    hills: [hill(at(p9end, 0.22), 18, 3), hill(c9, 22, -2.5)],
  },
];

// Which holes to play for shorter rounds (indexes into HOLES).
export const ROUTES = {
  3: [0, 4, 8],
  6: [0, 1, 2, 4, 6, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
