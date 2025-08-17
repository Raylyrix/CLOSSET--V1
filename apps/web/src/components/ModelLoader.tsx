import * as React from 'react';

export interface ModelLoaderProps {
  models: { label: string; path: string }[];
  onSelect: (path: string) => void;
}

export function ModelLoader(props: ModelLoaderProps) {
  const [value, setValue] = React.useState(props.models[0]?.path || '');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12 }}>
      <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'nowrap' }}>Model</label>
      <select value={value} onChange={(e) => { setValue(e.target.value); props.onSelect(e.target.value); }} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.06)' }}>
        {props.models.map((m) => (
          <option key={m.path} value={m.path}>{m.label}</option>
        ))}
      </select>
      <input type="file" accept=".glb,.gltf,.obj,.fbx" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) props.onSelect(URL.createObjectURL(f));
      }} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}

