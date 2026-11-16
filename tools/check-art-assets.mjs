import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'art');
const swPath = path.join(root, 'sw.js');
const entries = await readdir(artDir);
const sourceNames = entries.filter(name => name.toLowerCase().endsWith('.webp') && !name.toLowerCase().endsWith('-128.webp')).sort();
const sourceSet = new Set(sourceNames);
const variantNames = entries.filter(name => name.toLowerCase().endsWith('-128.webp')).sort();
const missingVariants = sourceNames.filter(name => !variantNames.includes(name.replace(/\.webp$/i, '-128.webp')));
const orphanVariants = variantNames.filter(name => !sourceSet.has(name.replace(/-128\.webp$/i, '.webp')));
const sw = await readFile(swPath, 'utf8');
const artBlock = sw.match(/const ART = \[([\s\S]*?)\];/);
if (!artBlock) throw new Error('sw.js is missing its ART list.');
const cachedArt = [...artBlock[1].matchAll(/'\.\/art\/([^']+)'/g)].map(match => match[1]);
const missingFromWorker = sourceNames.filter(name => !cachedArt.includes(name));
const extraInWorker = cachedArt.filter(name => !sourceSet.has(name));

for (const file of [
  './styles.css',
  './js/00-core.js',
  './js/10-storage-dialogs.js',
  './js/20-theme-speech-trending.js',
  './js/30-lock-support.js',
  './js/40-board-ui.js',
  './js/50-settings-editors.js',
  './js/60-events-boot.js'
]) {
  await access(path.join(root, file));
}

if (missingVariants.length || orphanVariants.length || missingFromWorker.length || extraInWorker.length || cachedArt.length !== sourceNames.length) {
  throw new Error(JSON.stringify({ missingVariants, orphanVariants, missingFromWorker, extraInWorker, sourceCount: sourceNames.length, cachedCount: cachedArt.length }, null, 2));
}

console.log(`Artwork cache is in sync: ${sourceNames.length} original images and ${variantNames.length} 128px variants.`);
