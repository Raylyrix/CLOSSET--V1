import * as React from 'react';

type BrushPreset = {
  id: string;
  name: string;
  size: number;
  hardness: number;
  flow: number;
  opacity: number;
  spacing?: number;
  tags?: string[];
};

type KritaResources = {
  presets: BrushPreset[];
  resources: { patterns: { pngs: string[]; pats: string[] }; gradients: string[]; palettes: string[] };
};

export function BrushPanel(props: { onSelect: (preset: BrushPreset | null) => void }) {
  const [data, setData] = React.useState<KritaResources | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, '') || '';
    const url = base ? `${base}/krita/resources` : '/krita/resources';
    fetch(url).then(async (r) => {
      const j = await r.json();
      // Support both shapes: { ok:true, presets, resources } and { ok:true, data:{ presets, resources }}
      if (!j || j.ok === false) { setError(j?.error || 'Failed to load'); return; }
      const payload = (j && (j.presets || j.resources)) ? j : (j.data || null);
      if (!payload) { setError('Invalid payload'); return; }
      // Fallback: if no presets, provide a couple of basic defaults so painting can be tested
      if (!Array.isArray(payload.presets) || payload.presets.length === 0) {
        const fallback = {
          presets: [
            { id: 'basic-16', name: 'Basic Round 16', size: 16, hardness: 1, flow: 1, opacity: 1, spacing: 8 },
            { id: 'basic-32', name: 'Basic Round 32', size: 32, hardness: 1, flow: 1, opacity: 1, spacing: 8 },
          ],
          resources: payload.resources || { patterns: { pngs: [], pats: [] }, gradients: [], palettes: [] },
        } as KritaResources;
        setData(fallback);
      } else {
        setData(payload as KritaResources);
      }
    }).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={{ padding: 12, color: 'salmon' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 12 }}>Loading brushes…</div>;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 8px 0' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Krita Brushes</h3>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{data.presets.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => { setSelectedId(null); props.onSelect(null); }}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--panel-border)', background: selectedId === null ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)', color: '#e8e8e8', cursor: 'pointer' }}
        >
          Cursor (move)
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr', gap: 4 as any }}>
        {data.presets.map((p) => {
          const active = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => { setSelectedId(p.id); props.onSelect(p); }}
                style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: active ? '1px solid #66d9ef' : '1px solid var(--panel-border)', background: active ? 'rgba(102,217,239,0.18)' : 'rgba(255,255,255,0.03)', color: '#e8e8e8', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12, opacity: 0.8, minWidth: 36, textAlign: 'right' }}>{p.size}px</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

