// Jakarta Night Courier — make.fun entry program (Node 22+, standard library only).
// The game is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library, no network
// request). This program copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, using
// the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is hermetic: it clears the three things it owns inside the
// output directory (game/, screenshots/, dossier.json) before writing, so a
// re-run never carries stale files from an earlier build, and two runs from
// the same source always write the same bytes. It refuses to build a broken
// entry: the game entrypoint and at least one screenshot must exist, and no
// screenshot may exceed the 256 KiB gate limit.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_SCREENSHOT_BYTES = 262144; // 256 KiB — the gate refuses anything larger

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// Preconditions: the game entrypoint and at least one real screenshot.
if (!existsSync(join(here, 'game', 'index.html'))) fail('game/index.html is missing — nothing to ship');
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing — the entry needs a cover');
const shots = readdirSync(shotsDir)
  .filter((name) => /\.(png|jpe?g)$/i.test(name))
  .sort();
if (shots.length === 0) fail('screenshots/ holds no PNG/JPEG — the entry needs a cover');
if (shots.length > 4) fail(`screenshots/ holds ${shots.length} images — the gate allows at most 4`);
for (const shot of shots) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > MAX_SCREENSHOT_BYTES) fail(`${shot} is ${size} bytes — over the 256 KiB gate limit`);
}

// Hermetic output: clear only what this program owns, then write.
mkdirSync(out, { recursive: true });
for (const owned of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, owned), { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`Jakarta Night Courier: game/ + ${shots.length} screenshot(s) (${shots.join(', ')}) -> ${out} (dossier.json ${dossierBytes} bytes)`);
