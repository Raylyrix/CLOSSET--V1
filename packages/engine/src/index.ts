// Closset Engine: MVP painting bridge with UV stamping interface.
import type { BrushPreset, Layer } from '../../shared/src/types';
import { GPUUVPainter } from './gl';

export interface RaycastHit {
  position: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
  faceIndex: number;
}

export interface StrokeSample {
  x: number; y: number; // screen coords or NDC
  pressure?: number; // 0..1
  tilt?: { x: number; y: number };
  time: number;
}

export interface EngineInitOptions {
  canvas: HTMLCanvasElement; // paint FBO target
  width: number;
  height: number;
}

type RGBA = [number, number, number, number];

export class PaintingEngine {
  private layers: Layer[] = [];
  private brush: BrushPreset | null = null;
  private ctx: CanvasRenderingContext2D | null = null; // temporary 2D prototype for strokes
  private gpu: GPUUVPainter | null = null;
  private lastUV: [number, number] | null = null;
  private color: [number, number, number] = [1, 0, 0]; // default red (0..1)
  private eraser = false;
  private history: Array<{ width: number; height: number; pixels: Uint8Array } | null> = [];
  private historyIndex = -1;
  private painting = false;

  constructor(private opts: EngineInitOptions) {
    this.ctx = opts.canvas.getContext('2d');
    this.gpu = new GPUUVPainter();
    this.gpu.init(opts.width, opts.height);
    // Initialize history with current blank state
    const snap = this.gpu?.snapshot();
    if (snap) { this.history = [snap]; this.historyIndex = 0; }
    else { this.history = [null]; this.historyIndex = 0; }
  }

  setLayers(layers: Layer[]) { this.layers = layers; }

  setBrush(preset: BrushPreset) { this.brush = preset; }

  setColor(rgb: [number, number, number]) { this.color = rgb; }
  setEraser(on: boolean) { this.eraser = on; }

  beginStroke(_hit: RaycastHit) {
    this.painting = true;
    this.lastUV = null;
  }

  // Screen-space stroke (prototype)
  updateStroke(samples: StrokeSample[]) {
    if (!this.ctx || !this.brush) return;
    const b = this.brush;
    const baseSize = b.size;
    const hardness = b.hardness;
    samples.forEach((s) => {
      const pressure = s.pressure ?? 1;
      const size = (b.dynamics?.pressureToSize ? baseSize * pressure : baseSize);
      const alpha = (b.opacity ?? 1) * (b.dynamics?.pressureToOpacity ? (pressure) : 1);
      const r = Math.max(1, size * 0.5);
      const grd = this.ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grd.addColorStop(0, rgba([0,0,0,alpha]));
      grd.addColorStop(Math.max(0.01, hardness), rgba([0,0,0,alpha]));
      grd.addColorStop(1, rgba([0,0,0,0]));
      this.ctx!.fillStyle = grd;
      this.ctx!.globalAlpha = 1;
      this.ctx!.globalCompositeOperation = 'source-over';
      this.ctx!.beginPath();
      this.ctx!.arc(s.x, s.y, r, 0, Math.PI * 2);
      this.ctx!.fill();
    });
  }

  // Low-level: single stamp
  stampUV(uv: [number, number], pressure = 1) {
    if (!this.brush) return;
    try { console.debug('[PaintEngine] stampUV', { uv, pressure, size: this.brush.size, hardness: this.brush.hardness, opacity: this.brush.opacity }); } catch {}
    // GPU path (no-op shader yet); call for structure then also do 2D fallback preview
    this.gpu?.stamp(uv, { size: this.brush.size, hardness: this.brush.hardness, opacity: this.brush.opacity, color: this.color, erase: this.eraser });

    if (!this.ctx) return;
    const b = this.brush;
    const size = (b.dynamics?.pressureToSize ? b.size * pressure : b.size);
    const x = uv[0] * this.opts.width;
    const y = uv[1] * this.opts.height;
    const r = Math.max(1, size * 0.5);
    const grd = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = (b.opacity ?? 1) * (b.dynamics?.pressureToOpacity ? pressure : 1);
    const col: [number, number, number] = this.color;
    grd.addColorStop(0, rgba([col[0], col[1], col[2], alpha]));
    grd.addColorStop(Math.max(0.01, b.hardness), rgba([col[0], col[1], col[2], alpha]));
    grd.addColorStop(1, rgba([0,0,0,0]));
    this.ctx.fillStyle = grd;
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = this.eraser ? 'destination-out' : 'source-over';
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  // High-level: spacing-aware stroke in UV space
  strokeUV(uv: [number, number], pressure = 1) {
    if (!this.brush) return;
    const texW = this.opts.width;
    const texH = this.opts.height;
    const spacingPx = Math.max(1, this.brush.spacing ?? Math.ceil(this.brush.size * 0.25));
    const spacingU = spacingPx / texW; // approximate, assuming square pixels
    const spacingV = spacingPx / texH;
    if (!this.lastUV) {
      try { console.debug('[PaintEngine] beginStroke at', { uv, pressure }); } catch {}
      this.stampUV(uv, pressure);
      this.lastUV = uv;
      return;
    }
    const [u0, v0] = this.lastUV;
    const [u1, v1] = uv;
    const du = u1 - u0;
    const dv = v1 - v0;
    const dist = Math.sqrt((du * du) / (spacingU * spacingU) + (dv * dv) / (spacingV * spacingV));
    const steps = Math.max(1, Math.ceil(dist));
    try { console.debug('[PaintEngine] strokeUV segment', { from: this.lastUV, to: uv, steps, spacingPx }); } catch {}
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const su = u0 + du * t;
      const sv = v0 + dv * t;
      this.stampUV([su, sv], pressure);
    }
    this.lastUV = uv;
  }

  endStroke() {
    this.painting = false;
    // Capture snapshot into history
    const snap = this.gpu?.snapshot();
    if (snap) {
      // Truncate any redo tail
      if (this.historyIndex < this.history.length - 1) this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(snap);
      this.historyIndex = this.history.length - 1;
    }
  }

  composite(): { dirtyTiles: Array<{ x: number; y: number; w: number; h: number }> } { return { dirtyTiles: [] }; }

  // Expose the internal GPU canvas for use as a dynamic texture in the viewer
  getPaintCanvas(): HTMLCanvasElement | null {
    const gpuCanvas = this.gpu?.getCanvas();
    if (gpuCanvas) return gpuCanvas;
    // Fallback to the 2D preview canvas so the viewer can still display strokes
    return (this as any).opts?.canvas ?? null;
  }

  // Undo/Redo operations
  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    const snap = this.history[this.historyIndex];
    if (snap) this.gpu?.loadSnapshot(snap.pixels, snap.width, snap.height);
    this.redrawFallbackFromSnapshot(snap);
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    const snap = this.history[this.historyIndex];
    if (snap) this.gpu?.loadSnapshot(snap.pixels, snap.width, snap.height);
    this.redrawFallbackFromSnapshot(snap);
  }

  exportPNG(): string | null {
    const c = this.getPaintCanvas();
    try { return c ? c.toDataURL('image/png') : null; } catch { return null; }
  }

  private redrawFallbackFromSnapshot(snap: { width: number; height: number; pixels: Uint8Array } | null) {
    if (!this.ctx || !snap) return;
    const imageData = new ImageData(new Uint8ClampedArray(snap.pixels), snap.width, snap.height);
    const tmp = document.createElement('canvas'); tmp.width = snap.width; tmp.height = snap.height;
    const tctx = tmp.getContext('2d'); if (!tctx) return;
    tctx.putImageData(imageData, 0, 0);
    this.ctx.clearRect(0, 0, this.opts.width, this.opts.height);
    this.ctx.drawImage(tmp, 0, 0, this.opts.width, this.opts.height);
  }
}

function rgba([r,g,b,a]: RGBA) { return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`; }

