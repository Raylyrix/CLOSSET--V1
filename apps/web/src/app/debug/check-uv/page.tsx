"use client";
import * as React from 'react';

export default function CheckUVPage() {
  const [modelPath, setModelPath] = React.useState<string>("");
  const [results, setResults] = React.useState<Array<{ name: string; hasUV: boolean }>>([]);
  const [error, setError] = React.useState<string | null>(null);

  const onCheck = async () => {
    setError(null);
    setResults([]);
    if (!modelPath) { setError('Enter a model URL (e.g., /models/agc_jacket.glb)'); return; }
    try {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(modelPath);
      const root = gltf.scene || gltf.scenes?.[0];
      const out: Array<{name: string; hasUV: boolean}> = [];
      root?.traverse((obj: any) => {
        if (obj.isMesh && obj.geometry) {
          const hasUV = !!(obj.geometry.attributes && obj.geometry.attributes.uv);
          out.push({ name: obj.name || '(unnamed mesh)', hasUV });
        }
      });
      setResults(out);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Check Model UVs</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="/models/agc_jacket.glb" value={modelPath} onChange={(e) => setModelPath(e.target.value)} style={{ width: 400 }} />
        <button onClick={onCheck}>Check UVs</button>
      </div>
      {error && <div style={{ color: 'salmon', marginTop: 8 }}>Error: {error}</div>}
      <ul style={{ marginTop: 12 }}>
        {results.map((r, i) => (
          <li key={i}>
            <code>{r.name}</code> — {r.hasUV ? 'has UVs' : 'NO UVs'}
          </li>
        ))}
      </ul>
      <p style={{ opacity: 0.8, marginTop: 12 }}>Tip: Painting requires meshes to have UVs.</p>
    </div>
  );
}
