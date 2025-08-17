import * as React from 'react';

export function UVEditor(props: {
	modelPath?: string;
	onUVSample: (uv: [number, number], pressure?: number) => void;
	getPaintCanvas?: () => HTMLCanvasElement | null;
	onIsolate?: (visibleNames: string[]) => void;
}) {
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
	const dpr = Math.max(1, Math.min(2, (typeof window !== 'undefined' && (window as any).devicePixelRatio) ? (window as any).devicePixelRatio : 1));

	type Island = {
		id: number;
		tris: Array<[number, number, number]>; // triangle as uv indices (not multiplied by 2)
		centroid: [number, number];
		uv: Float32Array;
		meshName?: string;
		bbox: [number, number, number, number]; // [minU, minV, maxU, maxV]
		name?: string;
	};
	const islandsRef = React.useRef<Island[]>([]);
	const selectedIdRef = React.useRef<number | null>(null);
	const hitIsolateRef = React.useRef<{ x: number; y: number; r: number } | null>(null);
	const cachedForPathRef = React.useRef<string | null>(null);

	const inferIslandNames = (islands: Island[]) => {
		islands.forEach(i => {
			const [u, v] = i.centroid;
			let name = 'Part';
			if (v > 0.6) name = 'Collar/Upper';
			else if (u < 0.33) name = 'Left Sleeve';
			else if (u > 0.66) name = 'Right Sleeve';
			else name = 'Body/Front';
			i.name = name;
		});
	};

	React.useEffect(() => {
		let disposed = false;
		let ro: ResizeObserver | null = null;
		let intervalId: any = null;
		(async () => {
			try {
				const cv = canvasRef.current;
				if (!cv) return;
				const ctx = cv.getContext('2d');
				if (!ctx) return;
				const resize = () => {
					const rect = cv.getBoundingClientRect();
					cv.width = Math.max(1, Math.floor(rect.width * dpr));
					cv.height = Math.max(1, Math.floor(rect.height * dpr));
				};
				resize();

				// Build islands only when modelPath changes and not already built
				if (props.modelPath && cachedForPathRef.current !== props.modelPath) {
					try {
						const THREE: any = await import('three');
						const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
						const loader = new GLTFLoader();
						const gltf = await loader.loadAsync(props.modelPath);
						const root: any = gltf ? (gltf.scene || gltf.scenes?.[0]) : null;
						const meshes: any[] = [];
						root?.traverse?.((o: any) => { if (o.isMesh && o.geometry?.attributes?.uv) meshes.push(o); });
						const islands: Island[] = [];
						let nextId = 1;
						meshes.forEach((m: any) => {
							const uvAttr = m.geometry.attributes.uv;
							const indexAttr = m.geometry.index;
							if (!uvAttr) return;
							const triCount = indexAttr ? (indexAttr.count / 3) | 0 : (uvAttr.array.length / 6) | 0;
							const trisUvIdx: Array<[number, number, number]> = [];
							if (indexAttr) {
								const ia = indexAttr.array as ArrayLike<number>;
								for (let i = 0; i < ia.length; i += 3) trisUvIdx.push([ia[i], ia[i + 1], ia[i + 2]]);
							} else {
								for (let i = 0; i < triCount; i++) trisUvIdx.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
							}
							const parent = new Array(triCount).fill(0).map((_, i) => i);
							const rank = new Array(triCount).fill(0);
							const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
							const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra === rb) return; if (rank[ra] < rank[rb]) parent[ra] = rb; else if (rank[ra] > rank[rb]) parent[rb] = ra; else { parent[rb] = ra; rank[ra]++; } };
							const uvToTris = new Map<number, number[]>();
							trisUvIdx.forEach((t, ti) => { t.forEach(uvIdx => { const arr = uvToTris.get(uvIdx) || []; arr.push(ti); uvToTris.set(uvIdx, arr); }); });
							uvToTris.forEach(list => { for (let i = 1; i < list.length; i++) union(list[0], list[i]); });
							const compToTris = new Map<number, number[]>();
							for (let ti = 0; ti < triCount; ti++) { const r = find(ti); const arr = compToTris.get(r) || []; arr.push(ti); compToTris.set(r, arr); }
							compToTris.forEach((triIdxs) => {
								const tris: Array<[number, number, number]> = triIdxs.map(ti => trisUvIdx[ti]);
								let cx = 0, cy = 0, n = 0;
								let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
								tris.forEach(([a,b,c]) => {
									const ax = uvAttr.array[a*2], ay = uvAttr.array[a*2+1];
									const bx = uvAttr.array[b*2], by = uvAttr.array[b*2+1];
									const cxu = uvAttr.array[c*2], cyu = uvAttr.array[c*2+1];
									cx += (ax + bx + cxu) / 3; cy += (ay + by + cyu) / 3; n++;
									minU = Math.min(minU, ax, bx, cxu);
									minV = Math.min(minV, ay, by, cyu);
									maxU = Math.max(maxU, ax, bx, cxu);
									maxV = Math.max(maxV, ay, by, cyu);
								});
								const centroid: [number, number] = n ? [cx/n, cy/n] : [0.5, 0.5];
								const bbox: [number, number, number, number] = [minU, minV, maxU, maxV];
								islands.push({ id: nextId++, tris, centroid, uv: uvAttr.array as Float32Array, meshName: m.name || undefined, bbox });
							});
						});
						inferIslandNames(islands);
						islandsRef.current = islands;
						cachedForPathRef.current = props.modelPath;
					} catch {
						// ignore loading failure; we'll draw fallback grid
					}
				}

				const draw = () => {
					if (disposed) return;
					const cv = canvasRef.current;
					if (!cv) return;
					const ctx = cv.getContext('2d');
					if (!ctx) return;
					ctx.clearRect(0, 0, cv.width, cv.height);
					const paint = props.getPaintCanvas?.();
					if (paint && paint.width > 0 && paint.height > 0) ctx.drawImage(paint, 0, 0, paint.width, paint.height, 0, 0, cv.width, cv.height);
					else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height); }
					ctx.strokeStyle = 'rgba(255,255,255,0.06)';
					for (let i = 0; i <= 16; i++) {
						const x = Math.floor((i / 16) * cv.width);
						const y = Math.floor((i / 16) * cv.height);
						ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
						ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
					}
					// outlines
					if (islandsRef.current.length) {
						ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
						ctx.lineWidth = 1 * dpr;
						islandsRef.current.forEach(island => {
							const uv = island.uv;
							island.tris.forEach(([a,b,c]) => {
								const x0 = uv[a*2] * cv.width, y0 = (1 - uv[a*2+1]) * cv.height;
								const x1 = uv[b*2] * cv.width, y1 = (1 - uv[b*2+1]) * cv.height;
								const x2 = uv[c*2] * cv.width, y2 = (1 - uv[c*2+1]) * cv.height;
								ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.stroke();
							});
						});
						// highlight selected
						if (selectedIdRef.current) {
							const sel = islandsRef.current.find(i => i.id === selectedIdRef.current);
							if (sel) {
								ctx.strokeStyle = 'rgba(255, 200, 0, 0.95)';
								ctx.lineWidth = 2 * dpr;
								sel.tris.forEach(([a,b,c]) => {
									const uv = sel.uv;
									const x0 = uv[a*2] * cv.width, y0 = (1 - uv[a*2+1]) * cv.height;
									const x1 = uv[b*2] * cv.width, y1 = (1 - uv[b*2+1]) * cv.height;
									const x2 = uv[c*2] * cv.width, y2 = (1 - uv[c*2+1]) * cv.height;
									ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.stroke();
								});
							}
						}
						// labels or isolate icon
						hitIsolateRef.current = null;
						ctx.font = `${12 * dpr}px sans-serif`;
						ctx.textAlign = 'center';
						ctx.textBaseline = 'middle';
						islandsRef.current.forEach(island => {
							const [u, v] = island.centroid;
							const x = u * cv.width, y = (1 - v) * cv.height;
							const r = 12 * dpr;
							ctx.fillStyle = 'rgba(0,0,0,0.75)';
							ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
							if (selectedIdRef.current === island.id) {
								ctx.fillStyle = '#ffd54d';
								ctx.font = `${14 * dpr}px sans-serif`;
								ctx.fillText('🖌️', x, y + 0.5);
								hitIsolateRef.current = { x, y, r };
							} else {
								ctx.fillStyle = '#fff';
								ctx.fillText(island.name || String(island.id), x, y + 0.5);
							}
						});
					} else {
						// Fallback message
						ctx.fillStyle = '#888';
						ctx.font = `${14 * dpr}px sans-serif`;
						ctx.fillText('No UVs found for model', cv.width/2, cv.height/2);
					}
				};

				const onClick = (e: PointerEvent) => {
					const cv = canvasRef.current;
					if (!cv) return;
					const rect = cv.getBoundingClientRect();
					const px = (e.clientX - rect.left) / rect.width;
					const py = 1 - ((e.clientY - rect.top) / rect.height);
					const hx = (e.clientX - rect.left) * (cv.width / rect.width);
					const hy = (e.clientY - rect.top) * (cv.height / rect.height);
					const h = hitIsolateRef.current;
					if (h) {
						const dx = hx - h.x, dy = hy - h.y;
						if (dx*dx + dy*dy <= h.r*h.r) {
							const sel = islandsRef.current.find(i => i.id === selectedIdRef.current);
							if (sel && props.onIsolate) props.onIsolate([sel.meshName || 'Mesh']);
							return;
						}
					}
					let picked: number | null = null;
					for (const island of islandsRef.current) {
						const [minU, minV, maxU, maxV] = island.bbox;
						if (px < minU || px > maxU || py < minV || py > maxV) continue;
						for (const [a,b,c] of island.tris) {
							const uv = island.uv;
							const ax = uv[a*2], ay = uv[a*2+1];
							const bx = uv[b*2], by = uv[b*2+1];
							const cxu = uv[c*2], cyu = uv[c*2+1];
							if (ax === undefined || ay === undefined || bx === undefined || by === undefined || cxu === undefined || cyu === undefined) continue;
							const v0x = cxu - ax, v0y = cyu - ay;
							const v1x = bx - ax, v1y = by - ay;
							const v2x = px - ax, v2y = py - ay;
							const dot00 = v0x*v0x + v0y*v0y;
							const dot01 = v0x*v1x + v0y*v1y;
							const dot02 = v0x*v2x + v0y*v2y;
							const dot11 = v1x*v1x + v1y*v1y;
							const dot12 = v1x*v2x + v1y*v2y;
							const invDen = 1 / Math.max(1e-12, (dot00 * dot11 - dot01 * dot01));
							const u = (dot11 * dot02 - dot01 * dot12) * invDen;
							const v = (dot00 * dot12 - dot01 * dot02) * invDen;
							if (u >= 0 && v >= 0 && (u + v) <= 1) { picked = island.id; break; }
						}
						if (picked) break;
					}
					selectedIdRef.current = picked;
					draw();
				};
				canvasRef.current!.addEventListener('pointerdown', onClick);

				draw();
				ro = new ResizeObserver(() => { resize(); draw(); });
				ro.observe(cv);
				if (disposed) { ro.disconnect(); }
				// Lower redraw frequency to reduce overhead
				if (props.getPaintCanvas) {
					intervalId = setInterval(() => { draw(); }, 300);
				}
			} catch {}
		})();
		return () => { disposed = true; ro?.disconnect(); try { clearInterval(intervalId); } catch {} };
	}, [props.modelPath]);

	React.useEffect(() => {
		const cv = canvasRef.current; if (!cv) return;
		const onMove = (e: PointerEvent) => {
			const rect = cv.getBoundingClientRect();
			const u = (e.clientX - rect.left) / rect.width;
			const v = (e.clientY - rect.top) / rect.height;
			if (u >= 0 && v >= 0 && u <= 1 && v <= 1) props.onUVSample([u, 1 - v], (e as any).pressure ?? 1);
		};
		cv.addEventListener('pointermove', onMove);
		return () => cv.removeEventListener('pointermove', onMove);
	}, [props.onUVSample]);

	return (
		<canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: '#0b0b0b' }} />
	);
}


