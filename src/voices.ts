// 音色列表代理
import { requestUrl } from './http.ts';
import type { RegionInfo, VoiceEntry } from './types.ts';

export interface VoicesOk { ok: true; voices: VoiceEntry[]; host: string; }
export interface VoicesFail { ok: false; attempts: string[]; }

export async function fetchVoices(region: RegionInfo, customDomainOrigin: string, key: string): Promise<VoicesOk | VoicesFail> {
  const origins: string[] = [];
  if (customDomainOrigin) origins.push(customDomainOrigin);
  origins.push('https://' + region.ttsDomain);
  origins.push('https://' + region.apiDomain);

  const attempts: string[] = [];
  for (const origin of origins) {
    try {
      const res = await requestUrl(origin + '/cognitiveservices/voices/list', {
        method: 'GET',
        headers: { 'ocp-apim-subscription-key': key, 'user-agent': 'ms-tts-web/2.0' },
        timeout: 25000
      });
      if (res.status === 200) {
        let list: VoiceEntry[] = [];
        try {
          const parsed = JSON.parse(res.body.toString('utf8'));
          list = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          list = [];
        }
        return { ok: true, voices: list, host: origin };
      }
      attempts.push(origin + ' HTTP ' + res.status + ' ' + res.body.toString('utf8').slice(0, 160));
    } catch (e) {
      attempts.push(origin + ' ' + (e as Error).message);
    }
  }
  return { ok: false, attempts };
}
