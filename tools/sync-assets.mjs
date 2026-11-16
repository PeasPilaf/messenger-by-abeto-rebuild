import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const siteAssets = path.join(root, '..', 'site', 'assets');
const mirrorAssets = path.join(root, '..', 'mirror', 'assets');
const outRoot = path.join(root, 'public', 'assets');

const force = process.argv.includes('--force');

const trees = [
  { from: path.join(siteAssets, 'geometries'), to: path.join(outRoot, 'geometries') },
  { from: path.join(siteAssets, 'audio'), to: path.join(outRoot, 'audio') },
  { from: path.join(siteAssets, 'images'), to: path.join(outRoot, 'images') },
  { from: path.join(siteAssets, 'libs'), to: path.join(outRoot, 'libs') },

  { from: path.join(mirrorAssets, 'fonts'), to: path.join(outRoot, 'fonts') },
  { from: path.join(mirrorAssets, 'images', 'ui'), to: path.join(outRoot, 'images', 'ui') },
];

let copied = 0;
let skipped = 0;
let bytes = 0;

function copyTree(from, to) {
  if (!fs.existsSync(from)) {
    console.warn('missing source directory:', from);
    return;
  }
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyTree(src, dst);
    } else if (stat.isFile()) {
      if (!force && fs.existsSync(dst) && fs.statSync(dst).size === stat.size) {
        skipped++;
        continue;
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(fs.realpathSync(src), dst);
      copied++;
      bytes += stat.size;
    }
  }
}

for (const { from, to } of trees) copyTree(from, to);

console.log(`assets synced: ${copied} copied, ${skipped} up to date, ${(bytes / 1e6).toFixed(1)} MB -> ${path.relative(root, outRoot)}`);
