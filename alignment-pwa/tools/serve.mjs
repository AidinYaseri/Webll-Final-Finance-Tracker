/**
 * Static file server for local development.
 *
 *   node tools/serve.mjs            -> http://localhost:5173
 *   node tools/serve.mjs --https    -> https://<your-lan-ip>:5173
 *
 * The https mode exists because phones only expose motion sensors on a secure
 * origin, and `localhost` is not a secure origin when you reach it from
 * another device. It makes a throwaway self-signed certificate with openssl on
 * first run; your phone will warn about it once and then let you through.
 */

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CERT_DIR = join(ROOT, '.certs');
const PORT = Number(process.env.PORT || 5173);
const USE_HTTPS = process.argv.includes('--https');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

async function ensureCert() {
  await mkdir(CERT_DIR, { recursive: true });
  const key = join(CERT_DIR, 'key.pem');
  const cert = join(CERT_DIR, 'cert.pem');
  try {
    await access(key);
    await access(cert);
  } catch {
    console.log('Making a self-signed certificate…');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '825',
      '-subj', '/CN=trueline.local',
      '-addext', `subjectAltName=DNS:localhost,IP:127.0.0.1${lanIps().map((ip) => `,IP:${ip}`).join('')}`,
    ], { stdio: 'inherit' });
  }
  return { key: await readFile(key), cert: await readFile(cert) };
}

function lanIps() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end('Nope');
      return;
    }
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      // Sensors are gated behind permissions policy in some embedders.
      'permissions-policy': 'accelerometer=(self), gyroscope=(self), magnetometer=(self)',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

const server = USE_HTTPS ? createHttps(await ensureCert(), handler) : createHttp(handler);

server.listen(PORT, '0.0.0.0', () => {
  const scheme = USE_HTTPS ? 'https' : 'http';
  console.log(`TrueLine on ${scheme}://localhost:${PORT}`);
  for (const ip of lanIps()) console.log(`             ${scheme}://${ip}:${PORT}  ← open this on the phone`);
  if (!USE_HTTPS) console.log('Motion sensors need https on a phone: re-run with --https');
});
