#!/usr/bin/env node
// 本地转发服务入口：node dashscope-relay-server.mjs [--port 8787] [--base-url https://dashscope.aliyuncs.com]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {handleRequest, DEFAULT_BASE_URL} from './dashscope-relay.mjs';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'};
const STATIC_ROOTS = new Set(['references']);
const APP_FILE = /\.(html|mjs|js|css|json|txt)$/i;
const ASSET_FILE = /\.(webp|png|jpe?g|svg|woff2)$/i;

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'start-creating.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel.includes('\0')) return false;
  if (rel.split('/').some(seg => seg === '..' || seg.startsWith('.'))) return false;
  const top = rel.split('/')[0];
  const inAssets = STATIC_ROOTS.has(top) && rel.split('/').length > 1 && ASSET_FILE.test(rel);
  if (!(rel.indexOf('/') === -1 && APP_FILE.test(rel)) && !inAssets) return false;
  const full = path.resolve(APP_ROOT, rel);
  if (!full.startsWith(APP_ROOT + path.sep)) return false;
  let data;
  try { data = await fs.readFile(full); } catch { return false; }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(data);
  return true;
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = err => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export async function startServer({port = 0, host = '127.0.0.1', baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl, sleep, autoPort = false, portCandidates = null} = {}) {
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (path === '/health') {
        res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          res.end(JSON.stringify({ok: true, service: 'dashscope-relay', baseUrl}));
          return;
        }
        if (await serveStatic(path, res)) return;
      }
      const body = req.method === 'POST' ? await readBody(req) : null;
      const out = await handleRequest({method: req.method, path, headers: req.headers, body}, {baseUrl, fetch: fetchImpl, sleep});
      res.writeHead(out.status, out.headers);
      res.end(out.json ? JSON.stringify(out.json) : '');
    } catch (err) {
      res.writeHead(400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify({error: {message: '请求体不是合法 JSON：' + String(err?.message || err)}}));
    }
  });
  const candidates = portCandidates || (autoPort ? [port, port + 1, port + 2, port + 3, port + 4] : [port]);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      await listen(server, candidate, host);
      return server;
    } catch (err) {
      lastError = err;
      if (!autoPort || err?.code !== 'EADDRINUSE') break;
    }
  }
  throw lastError || new Error('无法监听端口');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const port = Number(argValue('--port', '8787'));
  const baseUrl = argValue('--base-url', DEFAULT_BASE_URL);
  let server;
  try {
    server = await startServer({port, baseUrl, autoPort: true});
  } catch (err) {
    console.error('无法启动本地服务：' + String(err?.message || err));
    process.exit(1);
  }
  const actual = server.address().port;
  if (actual !== port) console.log('端口 ' + port + ' 已被占用，已自动改用 ' + actual + '。');
  console.log('工作台已启动：http://127.0.0.1:' + actual + '/start-creating.html');
  console.log('请从这个地址打开页面（而不是 GitHub Pages），否则浏览器会拦截本机 HTTP 转发请求。');
  console.log('百炼转发接口：http://127.0.0.1:' + actual + '/api/generate');
  if (process.platform === 'darwin' && !process.argv.includes('--no-open')) {
    try {
      const {spawn} = await import('node:child_process');
      spawn('open', ['http://127.0.0.1:' + actual + '/start-creating.html'], {stdio: 'ignore', detached: true}).unref();
      console.log('已尝试自动打开浏览器（如未弹出请手动打开上面的地址）。');
    } catch {}
  }
}
