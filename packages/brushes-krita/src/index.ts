// Krita resource importer
import * as path from 'path';
import * as fs from 'fs';
import type { BrushPreset } from '@closset/shared';
import { scanKrita } from './scan';
import { parseKppFile, KppPresetMeta } from './kpp';

export interface KritaResourcesIndex {
  patterns: { pngs: string[]; pats: string[] };
  gradients: string[];
  palettes: string[];
}

export interface KritaImportResult {
  presets: BrushPreset[];
  resources: KritaResourcesIndex;
  warnings: string[];
}

function toId(fp: string): string {
  return fp.replace(/\\/g, '/');
}

function filenameBase(fp: string): string {
  return path.basename(fp).replace(path.extname(fp), '');
}

function mapMetaToPreset(filePath: string, meta: KppPresetMeta | null): BrushPreset {
  const name = meta?.name || filenameBase(filePath);
  const size = Math.max(1, Math.floor(meta?.size || 24));
  const opacity = Math.min(1, Math.max(0, meta?.opacity ?? 1));
  const flow = Math.min(1, Math.max(0, meta?.flow ?? 1));
  const spacing = Math.max(0, meta?.spacing ?? Math.max(1, Math.floor(size * 0.15)));
  const texturePath = meta?.texturePath;
  const hardness = Math.min(1, Math.max(0, meta?.hardness ?? 0.7));
  const rotation = Math.floor(meta?.rotation ?? 0);
  const dynamics = {
    pressureToSize: meta?.pressureToSize ?? true,
    pressureToFlow: meta?.pressureToFlow ?? true,
    pressureToOpacity: meta?.pressureToOpacity ?? false,
    tiltToRotation: meta?.tiltToRotation ?? false,
    spacing: spacing / size,
  };
  return {
    id: toId(filePath),
    name,
    size,
    hardness,
    flow,
    opacity,
    rotation,
    spacing,
    texture: texturePath ? { kind: 'tip', path: texturePath } : undefined,
    dynamics,
    tags: meta?.tags || [],
    source: 'krita',
  };
}

function tryParseKpp(filePath: string): KppPresetMeta | null {
  const meta = parseKppFile(filePath);
  if (!meta?.raw) return meta;
  const raw: string = String(meta.raw);
  // Try JSON first
  try {
    const obj = JSON.parse(raw);
    meta.name = obj.name || meta.name;
    meta.size = Number(obj.size) || meta.size;
    meta.opacity = Number(obj.opacity) || meta.opacity;
    meta.flow = Number(obj.flow) || meta.flow;
    meta.spacing = Number(obj.spacing) || meta.spacing;
    meta.texturePath = obj.texture || meta.texturePath;
    return meta;
  } catch {}
  // Try XML-ish attribute extraction
  const getAttr = (attr: string) => {
    const m = raw.match(new RegExp(attr + '="([^"]+)"'));
    return m ? m[1] : undefined;
  };
  const n = getAttr('name');
  const s = Number(getAttr('size'));
  const o = Number(getAttr('opacity'));
  const f = Number(getAttr('flow'));
  const sp = Number(getAttr('spacing'));
  const tex = getAttr('texture') || getAttr('pattern');
  if (n) meta.name = n;
  if (!Number.isNaN(s)) meta.size = s;
  if (!Number.isNaN(o)) meta.opacity = o;
  if (!Number.isNaN(f)) meta.flow = f;
  if (!Number.isNaN(sp)) meta.spacing = sp;
  if (tex) meta.texturePath = tex;
  return meta;
}

function parseMyb(filePath: string): BrushPreset | null {
  // MyPaint brush (INI-like). We'll map a few common keys.
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const get = (key: string) => {
      const m = txt.match(new RegExp('^' + key.replace(/[-]/g, '[-]') + '\\s*=\\s*([^\n\r]+)', 'm'));
      return m ? m[1].trim() : undefined;
    };
    const name = filenameBase(filePath);
    const opacity = Number(get('opacity')) || 1;
    const radiusLog = Number(get('radius_logarithmic')) || Math.log(12);
    const size = Math.max(1, Math.floor(Math.exp(radiusLog)));
    const hardness = Number(get('hardness')) || 0.7;
    const spacing = Number(get('dabs_per_actual_radius')) ? Math.round(size / Number(get('dabs_per_actual_radius')!)) : Math.round(size * 0.2);
    const flow = Number(get('opaque_multiply')) || 1;
    const preset: BrushPreset = {
      id: toId(filePath),
      name,
      size,
      hardness,
      flow,
      opacity,
      rotation: 0,
      spacing,
      dynamics: { pressureToSize: true, pressureToFlow: true, spacing: spacing / size },
      source: 'krita',
      tags: ['mypaint'],
    };
    return preset;
  } catch {
    return null;
  }
}

export async function importKritaResources(root: string): Promise<KritaImportResult> {
  // root points to .../share/krita
  const scan = scanKrita(root);
  const presets: BrushPreset[] = [];
  const warnings: string[] = [];

  for (const p of scan.presets) {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.kpp') {
      const meta = tryParseKpp(p);
      presets.push(mapMetaToPreset(p, meta));
    } else if (ext === '.myb') {
      const pr = parseMyb(p);
      if (pr) presets.push(pr); else warnings.push(`Failed to parse MyPaint brush: ${p}`);
    }
  }

  const resources: KritaResourcesIndex = {
    patterns: { pngs: scan.patternPNGs, pats: scan.patternPATs },
    gradients: scan.gradients,
    palettes: scan.palettes,
  };

  return { presets, resources, warnings };
}

