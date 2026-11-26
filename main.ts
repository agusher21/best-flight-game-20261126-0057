import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Debug: show current working directory
console.log('Current working directory:', process.cwd());

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_SCREENSHOT_BYTES = 262144; // 256 KiB — the gate refuses anything larger
const MIN_SCREENSHOTS = 1; // Require at least 1 screenshot

function fail(message: string): void {
    console.error(`main.ts: ${message}`);
    process.exit(1);
}

// Create caps object with required text_max_bytes
const caps = {
    text_max_bytes: 262144, // 256 KiB
    // Optional: screenshots capacity
    screenshots: {
        max: 10,
        max_bytes: 10 * 1024 * 1024 // 10 MB
    }
};

// Preconditions: the game entrypoint and at least one real screenshot.
if (!existsSync(join(here, 'game', 'index.html'))) {
    fail('game/index.html is missing — nothing to ship');
}
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) {
    fail('screenshots/ is missing — the entry must include at least one screenshot');
}

// Debug: see what files are actually in the directory
const allFiles = readdirSync(shotsDir);
console.log('All files in screenshots/:', allFiles);

// Filter for image files
const shotFiles = readdirSync(shotsDir).filter(f => {
    const ext = f.toLowerCase().split('.').pop();
    const validExts = ['png', 'jpg', 'jpeg', 'webp'];
    return validExts.includes(ext);
});
console.log('Filtered shotFiles:', shotFiles);

if (shotFiles.length < MIN_SCREENSHOTS) {
    fail(`screenshots/ must contain at least ${MIN_SCREENSHOTS} image file(s)`);
}
for (const f of shotFiles) {
    const fullPath = join(shotsDir, f);
    if (statSync(fullPath).size > MAX_SCREENSHOT_BYTES) {
        fail(`screenshots/${f} exceeds ${MAX_SCREENSHOT_BYTES} bytes (256 KiB gate limit)`);
    }
}

// Prepare output: clear only what we own, then recreate.
for (const dir of ['game', 'screenshots']) {
    const target = join(out, dir);
    if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(target, { recursive: true });
}

const dossierPath = join(out, 'dossier.json');
if (existsSync(dossierPath)) {
    rmSync(dossierPath);
}

// Copy game/ (static entry) and screenshots/ verbatim.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// Build and write the dossier — the judge reads this.
// buildDossier returns a Uint8Array: write it DIRECTLY (v1's proven form).
// NEVER JSON.stringify it — that turns the bytes into a giant numeric-key object.
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Built entry in ${out}:`);
console.log(`  game/        ${readdirSync(join(out, 'game')).length} files`);
console.log(`  screenshots/ ${shotFiles.length} files (${shotFiles.join(', ')})`);
console.log(`  dossier.json ${(statSync(dossierPath).size / 1024).toFixed(1)} KiB`);