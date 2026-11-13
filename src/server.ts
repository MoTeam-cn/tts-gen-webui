// 入口：路由 + 启动（node src/server.ts 直接运行，依赖 Node 原生 TypeScript 支持）
import http from 'node:http';
import { CAPABILITIES } from './capabilities.ts';
import { AUDIO_TYPE, DEFAULT_FORMAT, HOST, MAX_SSML_BYTES, PORT } from './config.ts';
import { handleEvents, handleReload, sseStats, startWatch } from './events.ts';
import { json, parseDomain, readBody, readJson, str } from './http.ts';
import { chatOnce, chatStream, listModels, parseChatBody, type ChatMessage } from './agent.ts';
import { parseImport } from './importer.ts';
import { REGIONS, resolveRegion } from './regions.ts';
import { diagnose, prepareParts, RequestError, synthesize } from './tts.ts';
import { serveStatic } from './static.ts';
import { fetchVoices } from './voices.ts';
import { rememberVoices } from './voiceCache.ts';
import type { TtsPayload } from './types.ts';

function parseConfigOf(data: Record<string, unknown>) {
  return {
    baseUrl: str(data.baseUrl),
    key: str(data.key),
    model: str(data.model)
  };
}

const server = http.createServer(async function (req: http.IncomingMessage, res: http.ServerResponse) {
  const urlObj = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'));
  const pathname = urlObj.pathname;

  try {
    if (pathname === '/api/health') {
      const stats = sseStats();
      json(res, 200, {
        ok: true,
        version: CAPABILITIES.version,
        port: PORT,
        regions: REGIONS.length,
        clients: stats.clients,
        watch: stats.watch,
        lastChange: stats.lastChange,
        time: new Date().toISOString()
      });
      return;
    }

    if (pathname === '/api/capabilities') {
      json(res, 200, CAPABILITIES);
      return;
    }

    if (pathname === '/api/regions') {
      json(res, 200, { regions: REGIONS, count: REGIONS.length });
      return;
    }

    if (pathname === '/api/resolve') {
      json(res, 200, resolveRegion(str(urlObj.searchParams.get('region'))));
      return;
    }

    if (pathname === '/api/voices') {
      const key = str(req.headers['x-tts-key']) || str(urlObj.searchParams.get('key'));
      if (!key) {
        json(res, 400, { error: '缺少订阅密钥 key（放在 x-tts-key 请求头）' });
        return;
      }
      const region = resolveRegion(str(urlObj.searchParams.get('region')) || 'japaneast');
      const custom = parseDomain(urlObj.searchParams.get('domain'));
      const result = await fetchVoices(region, custom ? custom.origin : '', key);
      if (!result.ok) {
        json(res, 502, { error: '拉取音色列表失败', attempts: result.attempts });
        return;
      }
      rememberVoices(key, region, custom ? custom.origin : '', result.voices, result.host);
      json(res, 200, { voices: result.voices, host: result.host, region: region.id, count: result.voices.length });
      return;
    }

    if (pathname === '/api/diagnose') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const payload = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
      const result = await diagnose(payload as never);
      json(res, 200, result);
      return;
    }

    if (pathname === '/api/agent/models') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const raw = await readBody(req);
      const data = JSON.parse(raw || '{}') as Record<string, unknown>;
      const result = await listModels(parseConfigOf(data));
      json(res, result.ok ? 200 : 502, result);
      return;
    }

    if (pathname === '/api/agent/chat') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const raw = await readBody(req);
      const data = JSON.parse(raw || '{}') as Record<string, unknown>;
      const { cfg, messages } = parseChatBody(raw);
      if (!messages.length) {
        json(res, 400, { error: '缺少 messages' });
        return;
      }
      if (messages.length > 40) {
        json(res, 400, { error: '消息太多（上限 40 条），请精简对话历史' });
        return;
      }
      if (data.stream === true) {
        await chatStream(res, cfg, messages as ChatMessage[]);
        return;
      }
      const result = await chatOnce(cfg, messages);
      json(res, result.ok ? 200 : 502, result);
      return;
    }

    if (pathname === '/api/import') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const raw = await readBody(req);
      let textPayload = raw;
      if (raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as { raw?: unknown };
          // 前端统一用 { raw: "..." } 包装；其余一律当原文解析
          if (typeof parsed.raw === 'string') textPayload = parsed.raw;
        } catch (e) { /* 当作原文处理 */ }
      }
      json(res, 200, parseImport(textPayload));
      return;
    }

    if (pathname === '/api/ssml/preview') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const payload = await readJson<TtsPayload>(req);
      const prepared = await prepareParts(payload);
      json(res, 200, {
        ok: true,
        mode: prepared.mode,
        warnings: prepared.warnings,
        lang: prepared.lang,
        voices: prepared.voices,
        parts: prepared.parts.length,
        ssml: prepared.ssml,
        partsList: prepared.parts
      });
      return;
    }

    if (pathname === '/api/tts') {
      if (req.method !== 'POST') {
        json(res, 405, { error: '只支持 POST' });
        return;
      }
      const payload = await readJson<TtsPayload>(req);
      const result = await synthesize(payload);
      const format = str(payload.format, DEFAULT_FORMAT);
      res.writeHead(200, {
        'content-type': AUDIO_TYPE[format] || 'audio/mpeg',
        'cache-control': 'no-store',
        'content-length': String(result.audio.length),
        'x-tts-endpoint': encodeURIComponent(result.endpoint),
        'x-tts-chunks': String(result.chunks),
        'x-tts-ms': String(result.ms),
        'x-tts-warnings': encodeURIComponent(result.warnings.join(' | ')),
        'x-tts-lang': encodeURIComponent(result.lang || ''),
        'x-tts-voices': encodeURIComponent(result.voices.join(',')),
        'access-control-expose-headers': 'x-tts-endpoint,x-tts-chunks,x-tts-ms,x-tts-lang,x-tts-voices,x-tts-warnings,content-type'
      });
      res.end(result.audio);
      return;
    }

    if (pathname === '/api/events') {
      handleEvents(req, res);
      return;
    }

    if (pathname === '/api/events/status') {
      json(res, 200, sseStats());
      return;
    }

    if (pathname === '/api/reload') {
      handleReload(req, res, urlObj);
      return;
    }

    if (pathname.indexOf('/api/') === 0) {
      json(res, 404, { error: '未知接口 ' + pathname });
      return;
    }

    serveStatic(req, res, urlObj);
  } catch (e) {
    if (e instanceof RequestError) {
      json(res, e.status, { error: e.message, hint: e.hint, attempts: e.attempts });
      return;
    }
    json(res, 500, { error: (e as Error).message });
  }
});

startWatch();

server.on('error', function (e: { code?: string; message: string }) {
  if (e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，可能上一次的服务还开着。');
    console.error('处理办法：1) 关掉旧窗口/结束旧 node 进程（taskkill /F /IM node.exe）；2) 换端口启动：set PORT=8900 后再 node src/server.ts');
    process.exit(1);
    return;
  }
  console.error('服务启动失败：' + e.message);
  process.exit(1);
});

server.listen(PORT, HOST, function () {
  console.log('Azure 语音合成控制台已启动： http://' + HOST + ':' + PORT);
  console.log('区域映射示例： japaneast -> https://japaneast.api.cognitive.microsoft.com');
  console.log('热更新通道： http://' + HOST + ':' + PORT + '/api/events （改 public/ 与 src/ 下的文件都会推送事件）');
  console.log('能力清单： http://' + HOST + ':' + PORT + '/api/capabilities （SSML 上限 ' + Math.round(MAX_SSML_BYTES / 1024) + 'KB）');
});
