// 音色能力缓存：拿 voices/list 里的 RolePlayList / StyleList 做提前校验
import { fetchVoices } from './voices.ts';
import type { RegionInfo, VoiceEntry } from './types.ts';

interface CacheEntry { at: number; voices: VoiceEntry[]; host: string; }

const TTL = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();

function cacheKey(key: string, region: RegionInfo, customOrigin: string): string {
  return region.id + '|' + (customOrigin || region.ttsDomain) + '|' + key.slice(-8);
}

export function rememberVoices(key: string, region: RegionInfo, customOrigin: string, voices: VoiceEntry[], host: string): void {
  cache.set(cacheKey(key, region, customOrigin), { at: Date.now(), voices: voices, host: host });
}

export async function getVoiceList(key: string, region: RegionInfo, customOrigin: string): Promise<VoiceEntry[] | null> {
  const id = cacheKey(key, region, customOrigin);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.voices;
  const running = inflight.get(id);
  if (running) {
    const value = await running;
    return value ? value.voices : null;
  }
  const task = (async function (): Promise<CacheEntry | null> {
    const result = await fetchVoices(region, customOrigin, key);
    if (!result.ok) return null;
    const entry = { at: Date.now(), voices: result.voices, host: result.host };
    cache.set(id, entry);
    return entry;
  })();
  inflight.set(id, task);
  try {
    const entry = await task;
    return entry ? entry.voices : null;
  } catch (e) {
    return null;
  } finally {
    inflight.delete(id);
  }
}

export interface VoiceCapability {
  voice: string;
  styles: string[];
  roles: string[];
  found: boolean;
}

// 按音色名取能力；拿不到（网络/密钥问题）时 found=false，调用方跳过校验
export async function lookupCapability(
  voice: string,
  key: string,
  region: RegionInfo,
  customOrigin: string
): Promise<VoiceCapability> {
  const list = await getVoiceList(key, region, customOrigin);
  if (!list) {
    return { voice: voice, styles: [], roles: [], found: false };
  }
  const entry = list.find(function (item) {
    const name = String(item.ShortName || item.Name || '');
    return name.toLowerCase() === voice.toLowerCase();
  });
  if (!entry) {
    return { voice: voice, styles: [], roles: [], found: false };
  }
  return {
    voice: voice,
    styles: Array.isArray(entry.StyleList) ? entry.StyleList.map(String) : [],
    roles: Array.isArray(entry.RolePlayList) ? entry.RolePlayList.map(String) : [],
    found: true
  };
}
