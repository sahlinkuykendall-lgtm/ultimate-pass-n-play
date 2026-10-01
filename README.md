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

## Adding a game

1. Create `js/games/<id>.js`:

   ```js
   export default {
     mount(stage, ctx) {
       // stage: the element to render into
       // ctx.players: [{ id, name, color }] (capped to the game's max)
       // ctx.passTo(player): shows the handoff screen, resolves when they're ready
       // ctx.toast(msg), ctx.confirm({...}), ctx.sfx.*, ctx.haptic(), ctx.exit()
       stage.innerHTML = `<h1>Hello ${ctx.players[0]?.name}</h1>`;
       return () => {}; // optional cleanup
     },
   };
   ```

2. In `js/games.js`, add `load: () => import('./games/<id>.js')` to that game's entry.
   It flips from "Coming soon" to playable automatically.
3. Add the new file to the `SHELL` list in `sw.js` and bump `CACHE` so installed copies update.

## Project layout

```
index.html              app shell + intro markup
css/app.css             all styles
js/app.js               screens: intro, library, detail, players, settings, game host
js/games.js             the game catalog (edit this to add/rename games)
js/ui.js                sheets, toasts, confirm, pass-the-phone handoff
js/store.js             saved players + settings (localStorage)
js/fx.js                synthesized UI sounds + haptics
js/icons.js             inline SVG icons + logo
sw.js                   offline caching
manifest.webmanifest    install metadata
icons/                  app icons (regenerate with: node scripts/make-icons.mjs)
```
