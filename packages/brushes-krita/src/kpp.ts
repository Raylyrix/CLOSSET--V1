// Krita .kpp presets are PNG files with embedded zTXt chunk named 'preset'.
// We'll extract the embedded text (zlib) and parse richer fields.
import * as fs from 'fs';

export interface KppPresetMeta {
  name?: string;
  size?: number; // px
  opacity?: number; // 0..1
  flow?: number; // 0..1
  spacing?: number; // px
  hardness?: number; // 0..1
  rotation?: number; // deg
  texturePath?: string;
  textureScale?: number;
  pressureToSize?: boolean;
  pressureToFlow?: boolean;
  pressureToOpacity?: boolean;
  tiltToRotation?: boolean;
  tags?: string[];
  raw?: any;
}

// Minimal PNG chunk scanner to find zTXt 'preset' and gunzip it.
export function extractKppPresetMeta(buffer: Buffer): KppPresetMeta | null {
  // magic bytes check
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8; // skip PNG signature
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    if (type === 'zTXt') {
      const data = buffer.subarray(offset, offset + length);
      // zTXt format: keyword (null-terminated) + compression method + compressed text
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = data.subarray(0, nul).toString('ascii');
        if (keyword === 'preset') {
          const method = data[nul + 1];
          const comp = data.subarray(nul + 2);
          if (method === 0) {
            const zlib = require('zlib');
            try {
              const txt = zlib.inflateSync(comp).toString('utf8');
              return { raw: txt };
            } catch {}
          }
        }
      }
    }
    offset += length + 4; // skip CRC
  }
  return null;
}

export function parseKppFile(filePath: string): KppPresetMeta | null {
  try {
    const buf = fs.readFileSync(filePath);
    const meta = extractKppPresetMeta(buf);
    if (!meta?.raw) return meta;
    const raw: string = String(meta.raw);

    // JSON form
    try {
      const j = JSON.parse(raw);
      meta.name = j.name ?? meta.name;
      meta.size = num(j.size, meta.size);
      meta.opacity = clamp01(num(j.opacity, meta.opacity));
      meta.flow = clamp01(num(j.flow, meta.flow));
      meta.spacing = num(j.spacing, meta.spacing);
      meta.hardness = clamp01(num(j.hardness, meta.hardness));
      meta.rotation = num(j.rotation, meta.rotation);
      meta.texturePath = j.texture ?? meta.texturePath;
      meta.textureScale = num(j.textureScale, meta.textureScale);
      meta.pressureToSize = bool(j.pressureToSize, meta.pressureToSize);
      meta.pressureToFlow = bool(j.pressureToFlow, meta.pressureToFlow);
      meta.pressureToOpacity = bool(j.pressureToOpacity, meta.pressureToOpacity);
      meta.tiltToRotation = bool(j.tiltToRotation, meta.tiltToRotation);
      meta.tags = Array.isArray(j.tags) ? j.tags : meta.tags;
      return meta;
    } catch {}

    // XML-ish or key="value" form fallback
    const getS = (key: string) => attr(raw, key);
    meta.name = getS('name') ?? meta.name;
    meta.size = num(getS('size'), meta.size);
    meta.opacity = clamp01(num(getS('opacity'), meta.opacity));
    meta.flow = clamp01(num(getS('flow'), meta.flow));
    meta.spacing = num(getS('spacing'), meta.spacing);
    meta.hardness = clamp01(num(getS('hardness'), meta.hardness));
    meta.rotation = num(getS('rotation'), meta.rotation);
    meta.texturePath = getS('texture') ?? getS('pattern') ?? meta.texturePath;
    meta.textureScale = num(getS('textureScale'), meta.textureScale);
    meta.pressureToSize = bool(getS('pressureToSize'), meta.pressureToSize);
    meta.pressureToFlow = bool(getS('pressureToFlow'), meta.pressureToFlow);
    meta.pressureToOpacity = bool(getS('pressureToOpacity'), meta.pressureToOpacity);
    meta.tiltToRotation = bool(getS('tiltToRotation'), meta.tiltToRotation);
    const tags = getS('tags');
    if (tags) meta.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);

    return meta;
  } catch {
    return null;
  }
}

function num(v: any, fallback?: number) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp01(n?: number) { return typeof n === 'number' ? Math.max(0, Math.min(1, n)) : n; }
function bool(v: any, fallback?: boolean) { if (v === undefined || v === null) return fallback; if (typeof v === 'boolean') return v; if (typeof v === 'string') return v === 'true' || v === '1'; return fallback; }
function attr(raw: string, key: string) { const m = raw.match(new RegExp(key + '="([^"]+)"')); return m ? m[1] : undefined; }

