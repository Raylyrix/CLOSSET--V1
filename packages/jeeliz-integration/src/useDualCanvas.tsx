import * as React from 'react';

export interface CanvasSizingOptions {
  dpr?: number; // device pixel ratio override
  fit: 'contain' | 'cover';
  maxWidth?: number;
  maxHeight?: number;
}

export interface DualCanvas {
  containerRef: React.RefObject<HTMLDivElement>;
  viewerRef: React.RefObject<HTMLCanvasElement>;
  paintRef: React.RefObject<HTMLCanvasElement>;
  width: number;
  height: number;
  dpr: number;
}

/**
 * Dual-canvas management patterned after Jeeliz helpers and R3F demo:
 * - viewer canvas (zIndex 2)
 * - paint canvas (zIndex 1)
 * Handles resize and DPR.
 */
export function useDualCanvas(opts: CanvasSizingOptions): DualCanvas {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<HTMLCanvasElement>(null);
  const paintRef = React.useRef<HTMLCanvasElement>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0, dpr: 1 });

  React.useLayoutEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr ?? 2);

    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const bounds = el.getBoundingClientRect();
      let w = bounds.width;
      let h = bounds.height;
      if (opts.maxWidth) w = Math.min(w, opts.maxWidth);
      if (opts.maxHeight) h = Math.min(h, opts.maxHeight);
      setSize({ w: Math.floor(w), h: Math.floor(h), dpr });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [opts.dpr, opts.maxWidth, opts.maxHeight, opts.fit]);

  React.useLayoutEffect(() => {
    const { w, h, dpr } = size;
    const canvases = [viewerRef.current, paintRef.current];
    canvases.forEach((cv, i) => {
      if (!cv) return;
      cv.style.position = 'absolute';
      cv.style.left = '0px';
      cv.style.top = '0px';
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.style.zIndex = i === 0 ? '2' : '1';
      // set backing store size
      const bw = Math.max(1, Math.floor(w * dpr));
      const bh = Math.max(1, Math.floor(h * dpr));
      if (cv.width !== bw) cv.width = bw;
      if (cv.height !== bh) cv.height = bh;
    });
  }, [size]);

  return {
    containerRef,
    viewerRef,
    paintRef,
    width: size.w,
    height: size.h,
    dpr: size.dpr,
  };
}

