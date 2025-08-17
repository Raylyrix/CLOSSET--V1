import * as fs from 'fs';
import * as path from 'path';

export interface KritaPaths {
  root: string; // .../share/krita
  paintoppresets: string;
  patterns: string;
  gradients: string;
  palettes: string;
}

export function resolveKritaPaths(root: string): KritaPaths {
  return {
    root,
    paintoppresets: path.join(root, 'paintoppresets'),
    patterns: path.join(root, 'patterns'),
    gradients: path.join(root, 'gradients'),
    palettes: path.join(root, 'palettes'),
  };
}

export function listFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f));
}

export interface KritaScan {
  presets: string[];
  patternPNGs: string[];
  patternPATs: string[];
  gradients: string[];
  palettes: string[];
}

export function scanKrita(root: string): KritaScan {
  const p = resolveKritaPaths(root);
  return {
    presets: listFiles(p.paintoppresets, ['.kpp', '.myb']),
    patternPNGs: listFiles(p.patterns, ['.png']),
    patternPATs: listFiles(p.patterns, ['.pat']),
    gradients: listFiles(p.gradients, ['.ggr']),
    palettes: listFiles(p.palettes, ['.gpl']),
  };
}

