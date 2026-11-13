// 静态文件服务
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { MIME, PUBLIC_DIR } from './config.ts';

export function serveStatic(_req: http.IncomingMessage, res: http.ServerResponse, urlObj: URL): void {
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const target = path.join(PUBLIC_DIR, pathname);
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  fs.readFile(target, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'max-age=60',
      'content-length': String(buf.length)
    });
    res.end(buf);
  });
}
