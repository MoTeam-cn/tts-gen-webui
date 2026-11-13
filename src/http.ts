// HTTP 基础设施：JSON 响应、请求体读取、通用请求（http/https）
import http from 'node:http';
import https from 'node:https';
import { MAX_BODY } from './config.ts';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
  timeout?: number;
}

export interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(buf.length)
  });
  res.end(buf);
}

export function text(res: http.ServerResponse, status: number, body: string): void {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(buf.length)
  });
  res.end(buf);
}

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(function (resolve, reject) {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', function (chunk: Buffer) {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大（上限 ' + MAX_BODY + ' 字节）'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

export async function readJson<T>(req: http.IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error('请求体不是合法 JSON：' + (e as Error).message);
  }
}

export function requestUrl(urlString: string, options: RequestOptions = {}): Promise<RawResponse> {
  return new Promise(function (resolve, reject) {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (e) {
      reject(new Error('URL 非法：' + urlString));
      return;
    }
    const isHttp = url.protocol === 'http:';
    const lib = isHttp ? http : https;
    const outHeaders: Record<string, string | number> = Object.assign({}, options.headers || {});
    // 有实体时显式给 content-length：Azure 前置网关对 chunked 请求体容易直接回 400 空响应
    if (options.body && !Object.keys(outHeaders).some(function (k) { return k.toLowerCase() === 'content-length'; })) {
      outHeaders['content-length'] = Buffer.byteLength(options.body);
    }
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttp ? 80 : 443),
      method: options.method || 'GET',
      path: url.pathname + url.search,
      headers: outHeaders,
      timeout: options.timeout || 30000
    }, function (res) {
      const chunks: Buffer[] = [];
      res.on('data', function (c: Buffer) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on('timeout', function () { req.destroy(new Error('上游请求超时：' + urlString)); });
    req.on('error', function (e) { reject(e); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// 流式请求：返回上游响应流（用于 agent SSE 透传）
export function requestStream(urlString: string, options: RequestOptions = {}): Promise<http.IncomingMessage> {
  return new Promise(function (resolve, reject) {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (e) {
      reject(new Error('URL 非法：' + urlString));
      return;
    }
    const isHttp = url.protocol === 'http:';
    const lib = isHttp ? http : https;
    const outHeaders: Record<string, string | number> = Object.assign({}, options.headers || {});
    if (options.body && !Object.keys(outHeaders).some(function (k) { return k.toLowerCase() === 'content-length'; })) {
      outHeaders['content-length'] = Buffer.byteLength(options.body);
    }
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttp ? 80 : 443),
      method: options.method || 'POST',
      path: url.pathname + url.search,
      headers: outHeaders,
      timeout: options.timeout || 120000
    }, function (res) { resolve(res); });
    req.on('timeout', function () { req.destroy(new Error('上游请求超时：' + urlString)); });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export function trimDomain(value: unknown): string {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
}

export interface ParsedDomain { host: string; origin: string; }

// 默认 https；显式写 http:// 时保留协议（本地 mock / 企业网关）
export function parseDomain(value: unknown): ParsedDomain | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const insecure = /^http:\/\//i.test(raw);
  const host = trimDomain(raw);
  if (!host) return null;
  return { host, origin: (insecure ? 'http://' : 'https://') + host };
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function str(value: unknown, fallback = ''): string {
  return String(value === undefined || value === null ? fallback : value).trim();
}
