// Builds js/vendor/three.js: a minified, tree-shaken three.js containing only
// what the games use. Re-run after using new THREE.* classes:
//   npm i --no-save three@0.186.1 esbuild && node scripts/build-three.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = ['js/games/mini-golf/render3d.js'];
const names = new Set();
for (const f of sources) for (const m of readFileSync(root + f, 'utf8').matchAll(/THREE\.([A-Z][A-Za-z0-9]+)/g)) names.add(m[1]);
const entry = `export { ${[...names].sort().join(', ')} } from 'three';\n`;
mkdirSync(root + 'node_modules/.cache', { recursive: true });
writeFileSync(root + 'node_modules/.cache/three-entry.js', entry);
await build({
  entryPoints: [root + 'node_modules/.cache/three-entry.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'safari15',
  outfile: root + 'js/vendor/three.js',
  banner: { js: '/* three.js r186 (MIT) — tree-shaken build, see scripts/build-three.mjs */' },
  legalComments: 'none',
});
console.log(`js/vendor/three.js: ${names.size} exports`, [...names].sort().join(' '));
