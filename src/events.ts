// 热更新：SSE 推送 + 文件监听
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PUBLIC_DIR, ROOT_DIR } from './config.ts';
import { json, readBody } from './http.ts';
import type { ChangeEvent } from './types.ts';

const clients = new Set<http.ServerResponse>();
let lastChange: ChangeEvent | null = null;
let watchReady = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { frontend: string; backend: string } = { frontend: '', backend: '' };

export interface EventsStatus {
  clients: number;
  watch: boolean;
  lastChange: ChangeEvent | null;
}

export function sseStats(): EventsStatus {
  return { clients: clients.size, watch: watchReady, lastChange };
}

function sseSend(res: http.ServerResponse, event: string, data: unknown): void {
  try {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  } catch (e) {
    clients.delete(res);
  }
}

export function broadcast(event: string, data: unknown): void {
  clients.forEach(function (client) { sseSend(client, event, data); });
  if (event === 'reload') {
    const payload = data as ChangeEvent;
    console.log('[热更新] ' + payload.message + (payload.file ? ' · ' + payload.file : '') + ' · 订阅者 ' + clients.size);
  }
}

export function handleEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  sseSend(res, 'hello', {
    time: new Date().toISOString(),
    clients: clients.size,
    watch: watchReady,
    lastChange,
    interval: 15000
  });

  const heartbeat = setInterval(function () {
    try { res.write(': ping ' + Date.now() + '\n\n'); } catch (e) { /* 忽略 */ }
  }, 15000);

  function cleanup() {
    clearInterval(heartbeat);
    clients.delete(res);
  }
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
}

function queueChange(kind: 'frontend' | 'backend', file: string): void {
  pending[kind] = file;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(function () {
    flushTimer = null;
    const front = pending.frontend;
    const back = pending.backend;
    pending = { frontend: '', backend: '' };
    if (front) {
      lastChange = { type: 'frontend', file: path.basename(front), time: new Date().toISOString(), message: '前端文件已更新，正在刷新页面' };
      broadcast('reload', lastChange);
    }
    if (back) {
      lastChange = { type: 'backend', file: path.basename(back), time: new Date().toISOString(), message: '后端代码已更新，需要重启服务' };
      broadcast('reload', lastChange);
    }
  }, 320);
}

export function startWatch(): number {
  const targets = [
    { path: PUBLIC_DIR, dir: true, kind: 'frontend' as const },
    { path: path.join(ROOT_DIR, 'src'), dir: true, kind: 'backend' as const },
    { path: path.join(ROOT_DIR, 'package.json'), dir: false, kind: 'backend' as const }
  ];
  let ok = 0;
  targets.forEach(function (target) {
    try {
      fs.watch(target.path, { recursive: target.dir }, function (_event, filename) {
        const name = filename ? String(filename) : '';
        if (name.indexOf('~') === 0 || name.indexOf('.tmp') >= 0 || name.indexOf('.swp') >= 0 || name === '4913') return;
        queueChange(target.kind, name ? path.join(target.path, name) : target.path);
      });
      ok++;
    } catch (e) {
      console.warn('[热更新] 监听失败 ' + target.path + '：' + (e as Error).message);
    }
  });
  watchReady = ok > 0;
  if (watchReady) console.log('[热更新] 已监听 ' + ok + ' 个目标（public/ 与 src/、package.json）');
  return ok;
}

export function handleReload(req: http.IncomingMessage, res: http.ServerResponse, urlObj: URL): void {
  const emit = function (raw: string) {
    let scope = String(urlObj.searchParams.get('scope') || '');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { scope?: string };
        scope = parsed.scope || scope;
      } catch (e) { /* 忽略非法 JSON */ }
    }
    const kind: 'frontend' | 'backend' = scope === 'backend' ? 'backend' : 'frontend';
    const payload: ChangeEvent = {
      type: kind,
      file: '手动触发',
      manual: true,
      time: new Date().toISOString(),
      message: kind === 'frontend' ? '手动触发：刷新前端页面' : '手动触发：提示重启后端'
    };
    lastChange = payload;
    broadcast('reload', payload);
    json(res, 200, { ok: true, scope: kind, clients: clients.size, payload });
  };

  if (req.method === 'POST') {
    readBody(req).then(emit).catch(function () { emit(''); });
    return;
  }
  emit('');
}
