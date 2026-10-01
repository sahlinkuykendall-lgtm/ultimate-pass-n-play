# Ultimate Pass & Play

The ultimate pass and play app with hella games bruhv.

One phone, every game, all your friends. Built as an installable iPhone web app (PWA)
with no build step, so it can later be wrapped as a native app (e.g. with Capacitor).

## What's here

- **Opening**: animated intro (the two "passed" cards), tap to begin
- **Game library**: featured carousel, category filters, game grid, game detail sheets
- **Players**: add, rename and remove players. Saved on the device and used by every game
- **Settings**: sound effects toggle, replay intro
- **Game host**: full-screen game container with a leave-game confirm
- **Pass-the-phone screen**: the "Pass the phone to Maya" handoff that games call between turns
- **Installable**: home screen icon, full-screen launch, works offline

## Run it locally

Any static file server works:

```sh
npx serve .            # or: python3 -m http.server 8000
```

Open the printed URL. Add `?skip` to the URL to jump past the intro while developing.

**On your iPhone:** run the server on your computer, then open `http://<your-computer's-LAN-IP>:3000`
in Safari on the same Wi-Fi.

## Put it on your phone for real (GitHub Pages)

1. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)`.
2. Open `https://<username>.github.io/ultimate-pass-n-play/` in Safari.
3. Tap **Share → Add to Home Screen**. It launches full-screen like a native app.

## Games

- **Mini Golf**: 2 to 4 players on a 9-hole course with windmills, portals, water, sand, slopes, boosts and bumpers.
  Drag back to aim and putt. Classic, Ice Rink, Pinball, Bumper Balls, Wild Card and Closest to Pin modes,
  3/6/9-hole rounds, stroke limits and a full scorecard.
- **Tic-Tac-Toe**: Classic, Vanishing, Ultimate, Misère and Gobble modes, boards from 3×3 to 7×7,
  adjustable line length, emoji mark themes, best-of series, turn timer, undo and a face-to-face table mode.
- **Dots & Boxes**: 2 to 4 players. Classic, Treasure, Islands, Reverse and Strict modes, five board sizes,
  press-and-slide line drawing, chain combos, turn timer, undo and multi-round matches.

## Adding a game

1. Create `js/games/<id>.js` (or a folder, `js/games/<id>/index.js`, like Tic-Tac-Toe):

   ```js
   export default {
     async mount(stage, ctx) {
       // stage: the element to render into
       // ctx.players: the saved roster [{ id, name, color }], pick who plays inside the game
       // ctx.storage.get() / .set(value): remember this game's settings between sessions
       // ctx.passTo(player): shows the handoff screen, resolves when they're ready
       // ctx.toast(msg), ctx.confirm({...}), ctx.confetti({ colors }), ctx.sfx.*, ctx.haptic(), ctx.exit()
       stage.innerHTML = `<h1>Hello ${ctx.players[0]?.name}</h1>`;
       return () => {}; // optional cleanup
     },
   };
   ```

2. In `js/games.js`, add `load: () => import('./games/<id>.js')` to that game's entry.
   It flips from "Coming soon" to playable automatically.
3. Add the new files to the `SHELL` list in `sw.js` and bump `CACHE` so they work offline.

## Project layout

```
index.html              app shell + intro markup
css/app.css             app shell styles
css/kit.css             shared game UI: setup screens, mode cards, controls, result cards
js/app.js               screens: intro, library, detail, players, settings, game host
js/games.js             the game catalog (edit this to add/rename games)
js/games/tic-tac-toe/   rules engine, UI and styles for Tic-Tac-Toe
js/games/dots-and-boxes/ rules engine, UI and styles for Dots & Boxes
js/games/mini-golf/     physics engine, course, canvas renderer, UI and styles for Mini Golf
js/games/kit.js         shared setup helpers: player picker, segmented rows, mode cards
js/ui.js                sheets, toasts, confirm, pass-the-phone handoff
js/store.js             saved players + settings (localStorage)
js/fx.js                synthesized UI sounds + haptics
js/icons.js             inline SVG icons + logo
sw.js                   offline caching
manifest.webmanifest    install metadata
icons/                  app icons (regenerate with: node scripts/make-icons.mjs)
```
