/**
 * build.js — Copies web source files into the www/ folder
 * that Capacitor uses as webDir for the Android build.
 *
 * Run:  node scripts/build.js
 * Or:   npm run build
 *
 * Netlify still deploys from the repo root (index.html at root),
 * so no changes are needed to netlify.toml.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW  = path.join(ROOT, 'www');

// Files and directories to copy into www/
const COPY_TARGETS = [
  { src: 'index.html', dest: 'index.html' },
  { src: 'css',        dest: 'css'        },
  { src: 'js',         dest: 'js'         },
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Clear and recreate www/
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const { src, dest } of COPY_TARGETS) {
  const srcPath  = path.join(ROOT, src);
  const destPath = path.join(WWW,  dest);
  const stat     = fs.statSync(srcPath);
  if (stat.isDirectory()) copyDir(srcPath, destPath);
  else fs.copyFileSync(srcPath, destPath);
  console.log(`  copied  ${src}  →  www/${dest}`);
}

console.log('\n✓ www/ is ready for Capacitor sync');
