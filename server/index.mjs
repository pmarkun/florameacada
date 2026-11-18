import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {openDatabase} from './sqlite.mjs';
import worker from '../dist/server/index.js';

const port = Number(process.env.PORT || 8080);
const origin = new URL(process.env.FLORA_PUBLIC_ORIGIN || 'http://localhost:' + port);
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (process.env.RAILWAY_ENVIRONMENT_ID && !volume) {
  throw new Error('O serviço Railway precisa de um volume persistente.');
}
if (!process.env.FLORA_ADMIN_EMAIL || !process.env.FLORA_RATE_KEY) {
  throw new Error('Configure FLORA_ADMIN_EMAIL e FLORA_RATE_KEY.');
}
const data = volume || process.env.FLORA_DATA_DIR || '.data';
mkdirSync(data, {recursive:true, mode:0o700});
const env = {
  DB:openDatabase(join(data, 'flora.sqlite'), process.env.FLORA_MIGRATION_JSON),
  FLORA_STANDALONE:true,
  FLORA_ADMIN_EMAIL:process.env.FLORA_ADMIN_EMAIL,
  FLORA_ADMIN_SETUP_HASH:process.env.FLORA_ADMIN_SETUP_HASH,
  FLORA_RATE_KEY:process.env.FLORA_RATE_KEY
};

const server = createServer({requestTimeout:30_000}, async (req, res) => {
  try {
    if (req.url === '/healthz' && req.method === 'GET') {
      env.DB.prepare('SELECT id FROM letter_submissions LIMIT 1').first();
      res.writeHead(200, {'Content-Type':'text/plain', 'Cache-Control':'no-store'}).end('ok');
      return;
    }
    const url = new URL(req.url, origin);
    if (url.origin !== origin.origin) {
      res.writeHead(400).end();
      return;
    }
    const headers = new Headers(req.headers);
    headers.delete('oai-authenticated-user-id');
    headers.delete('oai-authenticated-user-email');
    const forwarded = req.headers['x-forwarded-for'];
    const source = volume && typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : req.socket.remoteAddress;
    headers.set('CF-Connecting-IP', source || 'unknown');
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url, {
      method:req.method, headers,
      ...(hasBody ? {body:Readable.toWeb(req), duplex:'half'} : {})
    });
    const result = await worker.fetch(request, env);
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) await pipeline(Readable.fromWeb(result.body), res);
    else res.end();
  } catch {
    if (!res.headersSent) res.writeHead(503, {'Content-Type':'text/plain', 'Cache-Control':'no-store'});
    res.end();
  }
});

server.listen(port, '0.0.0.0', () => console.log('Guia disponível na porta ' + port));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close(() => env.DB.close()));
}
