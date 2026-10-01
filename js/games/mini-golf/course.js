// The course: nine long, winding holes. Each fairway is a centerline
// ([x, y, height?] points) with a width; features are placed along it with
// along(path, t, side), where t is 0..1 of the way down the fairway and side
// pushes left (+) or right (−) of the centerline.
import { along } from './engine.js';

const at = (path, t, side = 0) => along(path, t, side);
const circle = ([x, y], r) => ({ circle: [x, y, r] });
const square = ([x, y], s) => ({ rect: [x - s / 2, y - s / 2, s, s] });
const hill = ([x, y], r, h) => ({ x, y, r, h });
const bumper = ([x, y], r = 4.5) => ({ x, y, r });
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

/* 1 ─ gentle S, slightly downhill */
const p1 = [[60, 10, 5], [62, 70, 4], [82, 130, 2], [74, 190, 0], [68, 222, 0]];

/* 2 ─ sharp dogleg with a banked outer corner */
const p2 = [[124, 10, 0], [124, 110, 0], [112, 162, 0], [70, 186, 0], [20, 188, 0]];

/* 3 ─ lake along the right, narrow neck to the green */
const p3 = [[60, 10, 3], [58, 110, 2], [74, 200, 0], [78, 262, 0]];

/* 4 ─ windmill guarding an S-bend */
const p4 = [[70, 10, 0], [58, 80, 0], [72, 150, 0], [72, 210, 0], [84, 262, 0]];

/* 5 ─ climb the volcano: the cup sits on the summit */
const p5 = [[40, 10, 0], [42, 120, 0], [86, 200, 0], [96, 236, 0]];

/* 6 ─ winding garden of bumpers */
const p6 = [[70, 10, 0], [84, 90, 0], [58, 170, 0], [70, 260, 0]];

/* 7 ─ big drop, then a climb to an elevated green */
const p7 = [[40, 10, 16], [40, 80, 11], [62, 150, 0], [102, 200, 0], [112, 262, 6], [102, 320, 12], [92, 352, 12]];

/* 8 ─ two islands joined by a portal */
const p8a = [[34, 10, 0], [34, 112, 0]];
const p8b = [[130, 150, 0], [112, 220, 0], [118, 290, 0]];

/* 9 ─ grand finale: long S with every trick */
const p9 = [[30, 10, 10], [30, 100, 8], [60, 160, 5], [120, 190, 3], [140, 250, 2], [112, 312, 0], [62, 334, 0], [42, 392, 0], [46, 432, 0]];

export const HOLES = [
  {
    name: 'First Tee',
    par: 3,
    fairways: [{ path: p1, width: 30 }],
    hills: [hill(at(p1, 0.48, -8), 16, 2.5)],
    sand: [circle(at(p1, 0.86, 9), 6)],
  },
  {
    name: 'Dogleg',
    par: 3,
    fairways: [{ path: p2, width: 28 }],
    hills: [hill(at(p2, 0.52, -16), 18, 5)],
    bumpers: [bumper(at(p2, 0.55, 9), 4)],
    sand: [circle(at(p2, 0.84, -8), 6)],
  },
  {
    name: 'Lakeside',
    par: 3,
    fairways: [{ path: p3, width: 42 }],
    water: [circle(at(p3, 0.5, -11), 13)],
    sand: [circle(at(p3, 0.9, 12), 7)],
    hills: [hill(at(p3, 0.25, 10), 14, 2)],
  },
  {
    name: 'Windmill',
    par: 3,
    fairways: [{ path: p4, width: 30 }],
    spinners: [{ ...pt(at(p4, 0.6)), len: 27, speed: 1.3 }],
    hills: [hill(at(p4, 0.3, 8), 12, 2), hill(at(p4, 0.3, -8), 12, 2)],
    sand: [circle(at(p4, 0.9, -9), 5)],
  },
  {
    name: 'Volcano',
    par: 4,
    fairways: [{ path: p5, width: 46 }],
    cup: at(p5, 0.9),
    hills: [hill(at(p5, 0.9), 40, 7)],
    sand: [circle(at(p5, 0.45, 14), 8)],
    bumpers: [bumper(at(p5, 0.62, -14), 4)],
  },
  {
    name: 'Bumper Garden',
    par: 3,
    fairways: [{ path: p6, width: 44 }],
    bumpers: [
      bumper(at(p6, 0.3, 10)),
      bumper(at(p6, 0.3, -10)),
      bumper(at(p6, 0.45, 0)),
      bumper(at(p6, 0.6, 12)),
      bumper(at(p6, 0.6, -12)),
      bumper(at(p6, 0.75, 0)),
    ],
  },
  {
    name: 'Rollercoaster',
    par: 4,
    fairways: [{ path: p7, width: 28 }],
    water: [circle(at(p7, 0.47, -8), 6)],
    sand: [circle(at(p7, 0.66, 7), 6)],
  },
  {
    name: 'Portal Jump',
    par: 3,
    fairways: [
      { path: p8a, width: 30 },
      { path: p8b, width: 30 },
    ],
    tee: at(p8a, 0.1),
    cup: at(p8b, 0.92),
    portals: [{ a: at(p8a, 0.86), b: at(p8b, 0.12), r: 5.5 }],
    bumpers: [bumper(at(p8b, 0.55, 8), 4)],
  },
  {
    name: 'Grand Finale',
    par: 5,
    fairways: [{ path: p9, width: 28 }],
    boosts: [boost(p9, 0.27)],
    water: [circle(at(p9, 0.5, -9), 6)],
    spinners: [{ ...pt(at(p9, 0.72)), len: 25, speed: 1.6 }],
    bumpers: [bumper(at(p9, 0.85, 8), 3.5), bumper(at(p9, 0.85, -8), 3.5)],
    sand: [circle(at(p9, 0.94, 8), 5)],
    hills: [hill(at(p9, 0.4, 0), 20, 3)],
  },
];

function pt([x, y]) {
  return { x, y };
}

// Which holes to play for shorter rounds (indexes into HOLES).
export const ROUTES = {
  3: [0, 3, 8],
  6: [0, 1, 3, 4, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
