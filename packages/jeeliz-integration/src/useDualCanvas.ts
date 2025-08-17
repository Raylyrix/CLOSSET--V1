import * as React from 'react';

export type FitMode = 'contain' | 'cover' | 'fill';

export interface UseDualCanvasOptions {
  fit?: FitMode;
  dpr?: number; // device pixel ratio multiplier
}

export interface DualCanvasRefs {
  containerRef: React.RefObject<HTMLDivElement>;
  viewerRef: React.RefObject<HTMLCanvasElement>;
  paintRef: React.RefObject<HTMLCanvasElement>;
  width: number;
  height: number;
}

export function useDualCanvas(opts: UseDualCanvasOptions = {}): DualCanvasRefs {
  const { fit = 'contain', dpr: dprProp } = opts;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<HTMLCanvasElement>(null);
  const paintRef = React.useRef<HTMLCanvasElement>(null);

  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const dpr = Math.max(1, dprProp ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const cw = Math.max(1, Math.floor(rect.width));
      const ch = Math.max(1, Math.floor(rect.height));
      setSize({ width: cw, height: ch });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const w = size.width;
    const h = size.height;
    if (w <= 0 || h <= 0) return;

    const viewer = viewerRef.current;
    const paint = paintRef.current;

    // Common CSS for both canvases
    const applyCss = (c: HTMLCanvasElement) => {
      c.style.position = 'absolute';
      c.style.inset = '0px';
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.style.display = 'block';
      c.style.touchAction = 'none';
    };

    // Common pixel sizing for both canvases
    const applyPixelSize = (c: HTMLCanvasElement) => {
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      if (c.width !== pw) c.width = pw;
      if (c.height !== ph) c.height = ph;
    };

    // Important: let the 3D viewer component own sizing of its WebGL canvas to avoid
    // race conditions with Three.js renderer. We only ensure layering via container styles.
    // If you need to style the viewer canvas, do it where it is rendered.

    if (paint) {
      applyCss(paint);
      applyPixelSize(paint);
      const ctx2d = paint.getContext('2d');
      if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // container styles to layer canvases
    if (containerRef.current) {
      const el = containerRef.current;
      el.style.position = 'relative';
      el.style.overflow = 'hidden';
    }
  }, [size.width, size.height, dpr, fit]);

  return {
    containerRef,
    viewerRef,
    paintRef,
    width: size.width,
    height: size.height,
  };
}
