// Fastify server exposing Krita resources and static models with CORS
// Load .env if available, but don't crash if dotenv isn't installed yet
try { require('dotenv').config(); } catch {}
import Fastify from 'fastify';
import path from 'path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { importKritaResources } from '@closset/brushes-krita';

const app = Fastify();

// Resolve project root from current file
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Config via ENV with sensible defaults
const PORT = Number(process.env.PORT || 3001);
const ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const KRITA_SHARE = path.resolve(PROJECT_ROOT, process.env.KRITA_SHARE || 'krita-x64-5.2.11/krita-x64-5.2.11/share/krita');

app.get('/krita/resources', async (_req, _res) => {
  try {
    const data = await importKritaResources(KRITA_SHARE);
    // Flatten the data so clients can access presets/resources directly
    return { ok: true, ...data } as any;
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Static models directory
const MODELS_DIR = path.resolve(PROJECT_ROOT, process.env.MODELS_DIR || 'models');

// TODO: add tRPC router mount for projects/assets later

export async function start(port = PORT) {
  // CORS for web dev on :3000
  await app.register(cors, { origin: ORIGINS, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });
  // Serve /models/* from local models directory
  await app.register(fastifyStatic, {
    root: MODELS_DIR,
    prefix: '/models/',
    wildcard: false,
    decorateReply: false,
  });
  await app.listen({ port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
  console.log(`[server] CORS origins: ${ORIGINS.join(', ')}`);
  console.log(`[server] KRITA_SHARE: ${KRITA_SHARE}`);
  console.log(`[server] MODELS_DIR: ${MODELS_DIR}`);
}

if (require.main === module) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
