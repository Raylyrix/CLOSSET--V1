"use client";
import * as React from 'react';
import { BrushPanel } from '../components/BrushPanel';
import { Viewport } from '../components/Viewport';
import { ModelLoader } from '../components/ModelLoader';

const defaultModels = [
  { label: 'T-shirt', path: '/models/t-shirt.glb' },
  { label: 'Hooded Jacket', path: '/models/hooded_jacket.glb' },
  { label: 'Leather Jacket', path: '/models/leather_jacket.glb' },
];

export default function Page() {
  const [brush, setBrush] = React.useState<any>(null);
  const [modelPath, setModelPath] = React.useState<string>(defaultModels[0].path);
  const [mode, setMode] = React.useState<'3d' | 'uv'>('3d');
  const [visibleNodeNames, setVisibleNodeNames] = React.useState<string[] | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--panel-border)', background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.5 }}>3D Design Studio</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Interactive painting & viewer</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setMode('3d')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--panel-border)', background: mode === '3d' ? 'rgba(255,255,255,0.12)' : 'var(--panel-bg)' }}>3D</button>
          <button onClick={() => { setMode('uv'); setVisibleNodeNames(null); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--panel-border)', background: mode === 'uv' ? 'rgba(255,255,255,0.12)' : 'var(--panel-bg)' }}>UV</button>
        </div>
      </header>
      <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
        <aside style={{ width: 320, display: 'flex', flexDirection: 'column', background: 'var(--panel-bg)', borderRight: '1px solid var(--panel-border)', backdropFilter: 'blur(6px)' }}>
          <div style={{ borderBottom: '1px solid var(--panel-border)' }}>
            <ModelLoader models={defaultModels} onSelect={setModelPath} />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ height: '100%', overflow: 'auto' }}>
              <BrushPanel onSelect={setBrush} />
            </div>
          </div>
        </aside>
        <main style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Viewport
            key={modelPath + '|' + mode}
            brush={brush}
            modelPath={modelPath}
            mode={mode}
            onRequestMode={(m) => setMode(m)}
            visibleNodeNames={visibleNodeNames ?? undefined}
            onRequestVisibleNames={(names) => setVisibleNodeNames(names)}
          />
          <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.55)', color: '#d0d0d0', border: '1px solid var(--panel-border)', borderRadius: 10, backdropFilter: 'blur(4px)' }}>
            {brush ? `Paint mode • ${brush.name} • ${brush.size}px (RMB to paint, LMB/MMB to move)` : 'Move mode • Select a brush to paint'}
          </div>
        </main>
      </div>
    </div>
  );
}

