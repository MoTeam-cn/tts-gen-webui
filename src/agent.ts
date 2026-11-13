// Agent 代理：把浏览器发起的模型调用转到用户配置的模型地址（避免 CORS），支持流式与非流式
import type http from 'node:http';
import { json, requestStream, requestUrl, str } from './http.ts';

export interface AgentConfig {
  baseUrl: string;
  key: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ChatMessage { role: string; content: string; }

// 端点拼接：base 已带 /v1 就直接接，否则补 /v1
export function apiUrl(baseUrl: string, pathname: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('模型地址为空');
  const withVersion = /\/v\d+$/.test(base) || /\/v\d+\//.test(base) ? base : base + '/v1';
  return withVersion + pathname;
}

function authHeaders(cfg: AgentConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'ms-tts-web/2.2'
  };
  if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
  return headers;
}

export function normalizeConfig(raw: Record<string, unknown>): AgentConfig {
  return {
    baseUrl: str(raw.baseUrl),
    key: str(raw.key),
    model: str(raw.model),
    temperature: raw.temperature === undefined ? 0.2 : Number(raw.temperature),
    maxTokens: raw.maxTokens === undefined ? 2000 : Number(raw.maxTokens),
    jsonMode: raw.jsonMode === undefined ? true : raw.jsonMode === true
  };
}

// 拉取模型列表（OpenAI 兼容 GET {base}/models）
export async function listModels(cfg: AgentConfig): Promise<{ ok: boolean; models: string[]; error?: string; raw?: unknown }> {
  if (!cfg.baseUrl) return { ok: false, models: [], error: '请先填模型地址（如 https://api.openai.com/v1）' };
  let url: string;
  try {
    url = apiUrl(cfg.baseUrl, '/models');
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
  try {
    const res = await requestUrl(url, { method: 'GET', headers: authHeaders(cfg), timeout: 20000 });
    const text = res.body.toString('utf8');
    if (res.status !== 200) {
      return { ok: false, models: [], error: 'HTTP ' + res.status + ' · ' + text.slice(0, 200) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, models: [], error: '返回不是 JSON：' + text.slice(0, 120) };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data) ? (parsed as { data: unknown[] }).data : []);
    const models = list
      .map(function (item) {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as { id?: string; name?: string; model?: string };
          return String(obj.id || obj.name || obj.model || '');
        }
        return '';
      })
      .filter(Boolean);
    return { ok: true, models: models, raw: list.length };
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
}

function chatBody(cfg: AgentConfig, messages: ChatMessage[], stream: boolean, useJsonMode: boolean): string {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map(function (m) { return { role: m.role, content: m.content }; }),
    temperature: cfg.temperature === undefined ? 0.2 : cfg.temperature,
    max_tokens: cfg.maxTokens === undefined ? 2000 : cfg.maxTokens,
    stream: stream
  };
  // 结构化输出：支持的网关会强制返回 JSON 对象
  if (useJsonMode) body.response_format = { type: 'json_object' };
  return JSON.stringify(body);
}

// response_format 不被支持时（部分老网关/模型会 400），去掉该字段重试一次
function jsonModeUnsupported(status: number, body: string): boolean {
  return status === 400 && /response_format|json_object|json mode|unsupported/i.test(body);
}

// 非流式：一次性返回文本
export async function chatOnce(cfg: AgentConfig, messages: ChatMessage[]): Promise<{ ok: boolean; text: string; reasoning?: string; error?: string; usage?: unknown }> {
  if (!cfg.baseUrl) return { ok: false, text: '', error: '请先填模型地址' };
  if (!cfg.model) return { ok: false, text: '', error: '请先选择或填写模型名' };
  let url: string;
  try {
    url = apiUrl(cfg.baseUrl, '/chat/completions');
  } catch (e) {
    return { ok: false, text: '', error: (e as Error).message };
  }
  const useJson = cfg.jsonMode !== false;
  let res = await requestUrl(url, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: Buffer.from(chatBody(cfg, messages, false, useJson), 'utf8'),
    timeout: 120000
  });
  let text = res.body.toString('utf8');
  if (useJson && jsonModeUnsupported(res.status, text)) {
    res = await requestUrl(url, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: Buffer.from(chatBody(cfg, messages, false, false), 'utf8'),
      timeout: 120000
    });
    text = res.body.toString('utf8');
  }
  if (res.status !== 200) return { ok: false, text: '', error: 'HTTP ' + res.status + ' · ' + text.slice(0, 240) };
  try {
    const data = JSON.parse(text) as {
      choices?: { message?: { content?: string; reasoning_content?: string; reasoning?: string } }[];
      usage?: unknown;
    };
    const msg = data.choices && data.choices[0] ? data.choices[0].message : undefined;
    const content = msg ? String(msg.content || '') : '';
    const reasoning = msg ? String(msg.reasoning_content || msg.reasoning || '') : '';
    return { ok: true, text: content, reasoning: reasoning, usage: data.usage };
  } catch (e) {
    return { ok: false, text: '', error: '模型返回不是 JSON：' + text.slice(0, 160) };
  }
}

// 流式：把上游 SSE 转成本项目自己的事件流（delta / done / error）
export async function chatStream(res: http.ServerResponse, cfg: AgentConfig, messages: ChatMessage[]): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });

  const send = function (event: string, data: unknown) {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  if (!cfg.baseUrl || !cfg.model) {
    send('error', { error: !cfg.baseUrl ? '请先填模型地址' : '请先选择或填写模型名' });
    res.end();
    return;
  }

  let url: string;
  try {
    url = apiUrl(cfg.baseUrl, '/chat/completions');
  } catch (e) {
    send('error', { error: (e as Error).message });
    res.end();
    return;
  }

  const useJson = cfg.jsonMode !== false;
  let upstream: http.IncomingMessage;
  try {
    upstream = await requestStream(url, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: Buffer.from(chatBody(cfg, messages, true, useJson), 'utf8'),
      timeout: 180000
    });
  } catch (e) {
    send('error', { error: '连接模型地址失败：' + (e as Error).message });
    res.end();
    return;
  }

  // jsonMode 不被支持时，读掉错误响应后去掉 response_format 重试
  if (useJson && (upstream.statusCode || 0) !== 200) {
    const errChunks: Buffer[] = [];
    await new Promise<void>(function (resolve) {
      upstream.on('data', function (c: Buffer) { errChunks.push(c); });
      upstream.on('end', function () { resolve(); });
      upstream.on('error', function () { resolve(); });
    });
    const errText = Buffer.concat(errChunks).toString('utf8');
    if (jsonModeUnsupported(upstream.statusCode || 0, errText)) {
      try {
        upstream = await requestStream(url, {
          method: 'POST',
          headers: authHeaders(cfg),
          body: Buffer.from(chatBody(cfg, messages, true, false), 'utf8'),
          timeout: 180000
        });
      } catch (e) {
        send('error', { error: '连接模型地址失败：' + (e as Error).message });
        res.end();
        return;
      }
    }
  }

  if ((upstream.statusCode || 0) !== 200) {
    const chunks: Buffer[] = [];
    upstream.on('data', function (c: Buffer) { chunks.push(c); });
    upstream.on('end', function () {
      send('error', { error: 'HTTP ' + upstream.statusCode + ' · ' + Buffer.concat(chunks).toString('utf8').slice(0, 240) });
      res.end();
    });
    return;
  }

  let buffer = '';
  let full = '';
  let reasoning = '';
  let finished = false;

  const finish = function () {
    if (finished) return;
    finished = true;
    send('done', { text: full, length: full.length, reasoning: reasoning, hasReasoning: reasoning.length > 0 });
    res.end();
  };

  upstream.on('data', function (chunk: Buffer) {
    buffer += chunk.toString('utf8');
    let idx = buffer.indexOf('\n\n');
    while (idx >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf('\n\n');
      rawEvent.split('\n').forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const payload = trimmed.slice(5).trim();
        if (!payload) return;
        if (payload === '[DONE]') {
          finish();
          return;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string; reasoning_content?: string }; message?: { content?: string } }[];
            error?: { message?: string };
          };
          if (parsed.error && parsed.error.message) {
            send('error', { error: parsed.error.message });
            return;
          }
          const choice = parsed.choices && parsed.choices[0];
          const delta = choice && choice.delta ? choice.delta : null;
          const think = delta ? String(delta.reasoning_content || delta.reasoning || '') : '';
          if (think) {
            reasoning += think;
            send('reasoning', { text: think });
          }
          const piece = delta ? (delta.content || '') : '';
          if (piece) {
            full += piece;
            send('delta', { text: piece });
          }
        } catch (e) {
          // 忽略无法解析的行（有些网关会发心跳）
        }
      });
    }
  });

  upstream.on('end', finish);
  upstream.on('error', function (e) {
    send('error', { error: '读取模型响应失败：' + e.message });
    finish();
  });
  res.on('close', function () { finished = true; });
}

export function parseChatBody(raw: string): { cfg: AgentConfig; messages: ChatMessage[] } {
  const data = JSON.parse(raw || '{}') as Record<string, unknown>;
  const cfg = normalizeConfig(data);
  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter(function (m) { return m && typeof m === 'object'; })
    .map(function (m) {
      const item = m as { role?: string; content?: string };
      return { role: str(item.role) || 'user', content: String(item.content || '') };
    });
  return { cfg, messages };
}
