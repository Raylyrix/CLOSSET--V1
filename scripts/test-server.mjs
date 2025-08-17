#!/usr/bin/env node
/*
 Simple test script to verify the server brushes endpoint.
 Usage: node scripts/test-server.mjs [baseUrl]
 Default baseUrl is http://localhost:3001
*/
const base = process.argv[2] || process.env.TEST_SERVER_URL || 'http://localhost:3001';
const url = base.replace(/\/$/, '') + '/krita/resources';

(async () => {
  try {
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    const ok = res.ok;
    const status = res.status;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    console.log(`[test-server] GET ${url} -> ${status} ${ok ? 'OK' : 'FAIL'}`);
    if (!ok) {
      console.error('[test-server] Body (truncated to 500):', text.slice(0, 500));
      process.exit(1);
    }
    if (!json || typeof json !== 'object') {
      console.error('[test-server] Expected JSON but got:', text.slice(0, 200));
      process.exit(1);
    }
    // Support both shapes: { ok:true, data:{ presets, resources }} and { ok:true, presets, resources }
    const root = json || {};
    const payload = root.presets || root.resources ? root : (root.data || {});
    const presets = Array.isArray(payload.presets) ? payload.presets.length : 0;
    const resources = payload.resources ? Object.keys(payload.resources).length : 0;
    console.log(`[test-server] presets: ${presets}, resourceTypes: ${resources}`);
    console.log('[test-server] PASS');
  } catch (e) {
    console.error('[test-server] ERROR:', e?.message || e);
    process.exit(1);
  }
})();
