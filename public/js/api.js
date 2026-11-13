// 后端接口封装
async function readJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return {};
  }
}

async function request(url, options) {
  const res = await fetch(url, options);
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data.error || ('HTTP ' + res.status));
    err.status = res.status;
    err.hint = data.hint || '';
    err.attempts = data.attempts || [];
    throw err;
  }
  return data;
}

export const api = {
  health() {
    return request('/api/health');
  },
  capabilities() {
    return request('/api/capabilities');
  },
  regions() {
    return request('/api/regions');
  },
  resolve(region) {
    return request('/api/resolve?region=' + encodeURIComponent(region || ''));
  },
  voices(region, customDomain, key) {
    const query = '/api/voices?region=' + encodeURIComponent(region || '') +
      (customDomain ? '&domain=' + encodeURIComponent(customDomain) : '');
    return request(query, { headers: { 'x-tts-key': key } });
  },
  agentModels(cfg) {
    return request('/api/agent/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: cfg.baseUrl, key: cfg.key, model: cfg.model })
    });
  },
  diagnose(payload) {
    return request('/api/diagnose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  importText(raw) {
    return request('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: raw })
    });
  },
  preview(payload) {
    return request('/api/ssml/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  async tts(payload) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.indexOf('audio') < 0) {
      const data = await readJson(res);
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.hint = data.hint || '';
      err.attempts = data.attempts || [];
      throw err;
    }
    const blob = await res.blob();
    return {
      blob,
      endpoint: decodeURIComponent(res.headers.get('x-tts-endpoint') || ''),
      chunks: Number(res.headers.get('x-tts-chunks') || 1),
      ms: Number(res.headers.get('x-tts-ms') || 0),
      lang: decodeURIComponent(res.headers.get('x-tts-lang') || ''),
      warnings: decodeURIComponent(res.headers.get('x-tts-warnings') || ''),
      voices: decodeURIComponent(res.headers.get('x-tts-voices') || '')
    };
  },
  reload(scope) {
    return request('/api/reload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: scope || 'frontend' })
    });
  },
  eventsStatus() {
    return request('/api/events/status');
  }
};

export function openEventStream(handlers) {
  if (!window.EventSource) return null;
  const source = new EventSource('/api/events');
  source.addEventListener('open', function () { handlers.onOpen && handlers.onOpen(); });
  source.addEventListener('hello', function (evt) {
    handlers.onHello && handlers.onHello(JSON.parse(evt.data || '{}'));
  });
  source.addEventListener('reload', function (evt) {
    handlers.onReload && handlers.onReload(JSON.parse(evt.data || '{}'));
  });
  source.addEventListener('error', function () { handlers.onError && handlers.onError(); });
  return source;
}
