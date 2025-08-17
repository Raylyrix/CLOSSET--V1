#!/usr/bin/env node
/*
Verify KRITA_SHARE directory exists and contains expected subfolders.
Uses same resolution logic as server: resolves relative to project root.
*/
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const envPath = process.env.KRITA_SHARE || 'krita-x64-5.2.11/krita-x64-5.2.11/share/krita';
const KRITA_SHARE = path.resolve(PROJECT_ROOT, envPath);

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

console.log('[check-krita-share] PROJECT_ROOT =', PROJECT_ROOT);
console.log('[check-krita-share] KRITA_SHARE =', KRITA_SHARE);
if (!exists(KRITA_SHARE)) {
  console.error('[check-krita-share] MISSING directory');
  process.exit(1);
}
const entries = fs.readdirSync(KRITA_SHARE, { withFileTypes: true });
const names = entries.slice(0, 20).map(e => (e.isDirectory() ? e.name + '/' : e.name));
console.log('[check-krita-share] entries (first 20):', names.join(', '));

const subdirs = ['brushes', 'paintoppresets', 'patterns', 'gradients'];
for (const s of subdirs) {
  const p = path.join(KRITA_SHARE, s);
  console.log(`[check-krita-share] ${s}:`, exists(p) ? 'OK' : 'MISSING');
}
console.log('[check-krita-share] DONE');
