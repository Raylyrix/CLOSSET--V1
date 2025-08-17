"use client";
import * as React from 'react';
import { Viewport } from '@/components/Viewport';

export default function DebugPaintPage() {
  const [brush, setBrush] = React.useState<any>({ id: 'debug-brush', name: 'Debug', size: 32, hardness: 1, flow: 1, opacity: 1, spacing: 8 });
  const [modelPath, setModelPath] = React.useState<string | undefined>(undefined);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 200000, background: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, color: '#eee', display: 'flex', gap: 8 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>Model URL</span>
          <input value={modelPath ?? ''} placeholder="(optional) /models/your.glb" onChange={(e) => setModelPath(e.target.value || undefined)} style={{ width: 320 }} />
        </label>
        <button onClick={() => setBrush(brush ? null : { id: 'debug-brush', name: 'Debug', size: 32, hardness: 1, flow: 1, opacity: 1, spacing: 8 })}>
          {brush ? 'Disable Brush (paint off)' : 'Enable Brush (paint on)'}
        </button>
        <span style={{ opacity: 0.8 }}>Use Right Mouse Button to paint</span>
      </div>
      <Viewport brush={brush} modelPath={modelPath} mode="3d" />
    </div>
  );
}
