import * as React from 'react';
import { useDualCanvas } from '@closset/jeeliz-integration';
import { PaintingEngine } from '@closset/engine';
import { ViewerR3F, type ViewerControlsApi } from './ViewerR3F';
import { UVEditor } from './UVEditor';
import { NavigationPanel } from './NavigationPanel';

export function Viewport(props: { brush?: any | null; modelPath?: string; mode?: '3d' | 'uv'; onRequestMode?: (m: '3d' | 'uv') => void; visibleNodeNames?: string[]; onRequestVisibleNames?: (names: string[] | null) => void }) {
  const dc = useDualCanvas({ fit: 'contain', dpr: 2 });
  const engineRef = React.useRef<PaintingEngine | null>(null);
  const controlsApiRef = React.useRef<ViewerControlsApi | null>(null);
  const [colorHex, setColorHex] = React.useState<string>('#ff0000');
  const [eraser, setEraser] = React.useState<boolean>(false);
  const [controlBarHover, setControlBarHover] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (dc.paintRef.current) {
      engineRef.current = new PaintingEngine({ canvas: dc.paintRef.current, width: dc.width, height: dc.height });
      // initialize color and eraser
      const rgb = hexToRgb01(colorHex);
      engineRef.current.setColor(rgb);
      engineRef.current.setEraser(eraser);
    }
  }, [dc.paintRef.current, dc.width, dc.height]);

  React.useEffect(() => {
    if (engineRef.current) {
      if (props.brush) engineRef.current.setBrush(props.brush);
      else engineRef.current.setBrush({ id: 'cursor', name: 'Cursor', size: 1, hardness: 1, flow: 1, opacity: 0, spacing: 8 });
    }
  }, [props.brush]);

  React.useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setColor(hexToRgb01(colorHex));
    }
  }, [colorHex]);

  React.useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setEraser(eraser);
    }
  }, [eraser]);

  // Disable orbit controls while hovering over bottom-right controls
  React.useEffect(() => {
    controlsApiRef.current?.setControlsEnabled(!controlBarHover);
    return () => controlsApiRef.current?.setControlsEnabled(true);
  }, [controlBarHover]);

  const onUVSample = (uv: [number, number], pressure?: number) => {
    if (!engineRef.current) return;
    // Use spacing-aware stroke when available
    (engineRef.current as any).strokeUV?.(uv, pressure ?? 1) ?? engineRef.current.stampUV(uv, pressure ?? 1);
  };

  const onBeginPaint = (uv: [number, number], pressure?: number) => {
    try { engineRef.current?.beginStroke({ position: [0,0,0], normal: [0,0,0], uv, faceIndex: 0 }); } catch {}
  };
  const onEndPaint = () => { try { engineRef.current?.endStroke(); } catch {} };

  const isUV = props.mode === 'uv';
  const onIsolate = (names: string[]) => {
    props.onRequestVisibleNames?.(names);
    props.onRequestMode?.('3d');
  };
  return (
    <div ref={dc.containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isUV ? (
        // UV mode: only the UV editor takes the full area
        <UVEditor modelPath={props.modelPath} onUVSample={onUVSample} getPaintCanvas={() => engineRef.current?.getPaintCanvas() ?? null} onIsolate={onIsolate} />
      ) : (
        // 3D mode: 3D viewer and paint overlay
        <>
          <canvas
            ref={dc.viewerRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: '#0b0b0b', zIndex: 1 }}
          />
          <canvas
            ref={dc.paintRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', pointerEvents: 'none', zIndex: 3 }}
          />
          <div
            style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 100001, display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,0,0,0.55)', border: '1px solid var(--panel-border)', borderRadius: 10, padding: '8px 10px', pointerEvents: 'auto' }}
            onPointerEnter={() => setControlBarHover(true)}
            onPointerLeave={() => setControlBarHover(false)}
            onWheel={(e) => { e.stopPropagation(); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ddd', fontSize: 12 }}>
              <span>Color</span>
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} style={{ width: 28, height: 20, border: 'none', background: 'transparent', padding: 0 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ddd', fontSize: 12 }}>
              <input type="checkbox" checked={eraser} onChange={(e) => setEraser(e.target.checked)} />
              <span>Eraser</span>
            </label>
            <button onClick={() => { try { console.debug('[Viewport.UI] Undo click'); } catch {}; engineRef.current?.undo(); }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.08)', color: '#eee' }}>Undo</button>
            <button onClick={() => { try { console.debug('[Viewport.UI] Redo click'); } catch {}; engineRef.current?.redo(); }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.08)', color: '#eee' }}>Redo</button>
            <button onClick={() => {
              try { console.debug('[Viewport.UI] Export click'); } catch {}
              const url = engineRef.current?.exportPNG();
              if (url) { const a = document.createElement('a'); a.href = url; a.download = 'paint.png'; a.click(); }
            }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.08)', color: '#eee' }}>Export</button>
          </div>
          <ViewerR3F
            canvasRef={dc.viewerRef}
            controlsElementRef={dc.containerRef}
            onUVSample={onUVSample}
            modelPath={props.modelPath}
            getPaintCanvas={() => engineRef.current?.getPaintCanvas() ?? null}
            controlsApiRef={controlsApiRef}
            visibleNodeNames={props.visibleNodeNames ?? undefined}
            paintEnabled={!!props.brush}
            onBeginPaint={onBeginPaint}
            onEndPaint={onEndPaint}
          />
          <NavigationPanel apiRef={controlsApiRef} />
        </>
      )}
    </div>
  );
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [1, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

