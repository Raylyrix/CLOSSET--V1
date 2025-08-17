import * as React from 'react';
import type { ViewerControlsApi } from './ViewerR3F';

export function NavigationPanel(props: { apiRef: React.RefObject<ViewerControlsApi | null> }) {
	const [speed, setSpeed] = React.useState<number>(2);
  const [step, setStep] = React.useState<number>(0.5);
  const [hover, setHover] = React.useState<boolean>(false);

	React.useEffect(() => {
		props.apiRef.current?.setSpeed(speed);
	}, [speed, props.apiRef]);

  // keep step responsive to camera distance
  React.useEffect(() => {
    const id = setInterval(() => {
      const s = props.apiRef.current?.getSuggestedStep?.();
      if (s) setStep(s);
    }, 500);
    return () => clearInterval(id);
  }, [props.apiRef]);

	const api = () => props.apiRef.current;

	const btn = {
		padding: '6px 10px',
		borderRadius: 6,
		border: '1px solid rgba(255,255,255,0.2)',
		background: 'rgba(255,255,255,0.08)',
		color: '#eee',
		cursor: 'pointer',
		minWidth: 36,
	};

  // Only shield wheel/context menu; allow normal pointer events to flow to buttons
  const eatWheel = (e: React.WheelEvent) => { e.stopPropagation(); };

  // Disable OrbitControls while hovering over the panel so canvas doesn't consume clicks
  React.useEffect(() => {
    props.apiRef.current?.setControlsEnabled(!hover);
    return () => { props.apiRef.current?.setControlsEnabled(true); };
  }, [hover, props.apiRef]);

	return (
		<div
			data-ui-overlay
			style={{ position: 'fixed', right: 12, top: 12, zIndex: 100000, display: 'flex', flexDirection: 'column', gap: 8 as any, pointerEvents: 'auto', userSelect: 'none' }}
			onPointerEnter={() => { try { console.debug('[NavPanel] hover enter'); } catch {}; setHover(true); }}
			onPointerLeave={() => { try { console.debug('[NavPanel] hover leave'); } catch {}; setHover(false); }}
			onWheel={eatWheel}
			onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
		>
			<div style={{ padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.1)' }}>
				<div style={{ color: '#fff', fontWeight: 600, marginBottom: 8 }}>Camera Navigation</div>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 6 }}>
					<button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] pitch + click'); } catch {}; api()?.rotatePitch(+0.1); }}
                      onClick={() => { try { console.debug('[NavPanel] pitch + click (onClick)'); } catch {}; api()?.rotatePitch(+0.1); }}>⤵</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move forward'); } catch {}; api()?.move(0, 0, +step); }}
                      onClick={() => { try { console.debug('[NavPanel] move forward (onClick)'); } catch {}; api()?.move(0, 0, +step); }}>Forward</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] pitch -'); } catch {}; api()?.rotatePitch(-0.1); }}
                      onClick={() => { try { console.debug('[NavPanel] pitch - (onClick)'); } catch {}; api()?.rotatePitch(-0.1); }}>⤴</button>

					<button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move left'); } catch {}; api()?.move(-step, 0, 0); }}
                      onClick={() => { try { console.debug('[NavPanel] move left (onClick)'); } catch {}; api()?.move(-step, 0, 0); }}>Left</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move back'); } catch {}; api()?.move(0, 0, -step); }}
                      onClick={() => { try { console.debug('[NavPanel] move back (onClick)'); } catch {}; api()?.move(0, 0, -step); }}>Back</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move right'); } catch {}; api()?.move(+step, 0, 0); }}
                      onClick={() => { try { console.debug('[NavPanel] move right (onClick)'); } catch {}; api()?.move(+step, 0, 0); }}>Right</button>

					<button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] yaw -'); } catch {}; api()?.rotateYaw(-0.1); }}
                      onClick={() => { try { console.debug('[NavPanel] yaw - (onClick)'); } catch {}; api()?.rotateYaw(-0.1); }}>⟲</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move up'); } catch {}; api()?.move(0, +step, 0); }}
                      onClick={() => { try { console.debug('[NavPanel] move up (onClick)'); } catch {}; api()?.move(0, +step, 0); }}>Up</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] yaw +'); } catch {}; api()?.rotateYaw(+0.1); }}
                      onClick={() => { try { console.debug('[NavPanel] yaw + (onClick)'); } catch {}; api()?.rotateYaw(+0.1); }}>⟳</button>

					<button type="button" style={{ ...(btn as any), gridColumn: '1 / span 3', pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] move down'); } catch {}; api()?.move(0, -step, 0); }}
                      onClick={() => { try { console.debug('[NavPanel] move down (onClick)'); } catch {}; api()?.move(0, -step, 0); }}>Down</button>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
					<label style={{ color: '#ddd' }}>Speed</label>
					<input type="range" min={0.5} max={10} step={0.5} value={speed}
                      onInput={e => { try { console.debug('[NavPanel] speed input'); } catch {}; setSpeed(parseFloat((e.target as HTMLInputElement).value)); }}
                      onChange={e => { try { console.debug('[NavPanel] speed change'); } catch {}; setSpeed(parseFloat(e.target.value)); }}
                      style={{ pointerEvents: 'auto' }} />
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] zoom in'); } catch {}; api()?.zoomIn(); }}
                      onClick={() => { try { console.debug('[NavPanel] zoom in (onClick)'); } catch {}; api()?.zoomIn(); }}>Zoom +</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] zoom out'); } catch {}; api()?.zoomOut(); }}
                      onClick={() => { try { console.debug('[NavPanel] zoom out (onClick)'); } catch {}; api()?.zoomOut(); }}>Zoom -</button>
                    <button type="button" style={{ ...(btn as any), pointerEvents: 'auto' }}
                      onPointerUp={() => { try { console.debug('[NavPanel] reset'); } catch {}; api()?.reset(); }}
                      onClick={() => { try { console.debug('[NavPanel] reset (onClick)'); } catch {}; api()?.reset(); }}>Reset</button>
				</div>
				<div style={{ color: '#aaa', fontSize: 12, marginTop: 6 }}>Tips: WASD + QE to move, drag to rotate, wheel to zoom.</div>
			</div>
		</div>
	);
}


