// SOLHAVEN — entry program for make.fun "Make GTA 6" (gta6-01).
//
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json there with the kit's buildDossier.
// Node 22, standard library only. Running it twice writes the same bytes.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps for this bounty: dossier text, screenshots, game tree.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error(`SOLHAVEN main.ts: ${message}`);
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(gameDir)) fail('game/ is missing from the repository');
if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(repoRoot, caps);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`SOLHAVEN: wrote ${join(outputDir, 'dossier.json')} (${dossier.length} bytes)`);
