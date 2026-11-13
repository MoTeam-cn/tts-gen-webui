// 区域 -> 域名 映射（唯一权威来源）
import type { RegionInfo } from './types.ts';

const API_SUFFIX = 'api.cognitive.microsoft.com';
const TTS_SUFFIX = 'tts.speech.microsoft.com';
const CN_API_SUFFIX = 'api.cognitive.azure.cn';
const CN_TTS_SUFFIX = 'tts.speech.azure.cn';

const CN_REGIONS = ['chinaeast2', 'chinanorth3'];

interface RawRegion { id: string; name: string; locale: string; }

const LIST: RawRegion[] = [
  { id: 'japaneast', name: '日本东部（东京）', locale: 'ja-JP' },
  { id: 'japanwest', name: '日本西部（大阪）', locale: 'ja-JP' },
  { id: 'eastasia', name: '东亚（香港）', locale: 'zh-CN' },
  { id: 'southeastasia', name: '东南亚（新加坡）', locale: 'en-US' },
  { id: 'koreacentral', name: '韩国中部（首尔）', locale: 'ko-KR' },
  { id: 'australiaeast', name: '澳大利亚东部（悉尼）', locale: 'en-US' },
  { id: 'centralindia', name: '印度中部（浦那）', locale: 'en-US' },
  { id: 'northeurope', name: '北欧（爱尔兰）', locale: 'en-US' },
  { id: 'westeurope', name: '西欧（荷兰）', locale: 'en-US' },
  { id: 'uksouth', name: '英国南部（伦敦）', locale: 'en-GB' },
  { id: 'francecentral', name: '法国中部（巴黎）', locale: 'fr-FR' },
  { id: 'germanywestcentral', name: '德国中西部（法兰克福）', locale: 'de-DE' },
  { id: 'switzerlandnorth', name: '瑞士北部（苏黎世）', locale: 'de-DE' },
  { id: 'norwayeast', name: '挪威东部（奥斯陆）', locale: 'en-US' },
  { id: 'swedencentral', name: '瑞典中部（桑德维肯）', locale: 'en-US' },
  { id: 'eastus', name: '美国东部（弗吉尼亚）', locale: 'en-US' },
  { id: 'eastus2', name: '美国东部 2（弗吉尼亚）', locale: 'en-US' },
  { id: 'centralus', name: '美国中部（爱荷华）', locale: 'en-US' },
  { id: 'northcentralus', name: '美国中北部（伊利诺伊）', locale: 'en-US' },
  { id: 'southcentralus', name: '美国中南部（得州）', locale: 'en-US' },
  { id: 'westus', name: '美国西部（加州）', locale: 'en-US' },
  { id: 'westus2', name: '美国西部 2（华盛顿）', locale: 'en-US' },
  { id: 'westus3', name: '美国西部 3（亚利桑那）', locale: 'en-US' },
  { id: 'canadacentral', name: '加拿大中部（多伦多）', locale: 'en-US' },
  { id: 'brazilsouth', name: '巴西南部（圣保罗）', locale: 'pt-BR' },
  { id: 'southafricanorth', name: '南非北部（约翰内斯堡）', locale: 'en-US' },
  { id: 'uaenorth', name: '阿联酋北部（迪拜）', locale: 'en-US' },
  { id: 'chinaeast2', name: '中国东部 2（上海）', locale: 'zh-CN' },
  { id: 'chinanorth3', name: '中国北部 3（北京）', locale: 'zh-CN' }
];

function decorate(item: RawRegion): RegionInfo {
  const cn = CN_REGIONS.indexOf(item.id) >= 0;
  const apiSuffix = cn ? CN_API_SUFFIX : API_SUFFIX;
  const ttsSuffix = cn ? CN_TTS_SUFFIX : TTS_SUFFIX;
  const apiDomain = item.id + '.' + apiSuffix;
  const ttsDomain = item.id + '.' + ttsSuffix;
  return {
    id: item.id,
    name: item.name,
    locale: item.locale,
    apiDomain,
    ttsDomain,
    endpoint: 'https://' + apiDomain,
    ttsEndpoint: 'https://' + ttsDomain + '/cognitiveservices/v1',
    stsEndpoint: 'https://' + apiDomain + '/sts/v1.0/issueToken',
    label: item.name + ' · ' + item.id
  };
}

export const REGIONS: RegionInfo[] = LIST.map(decorate);

const BY_ID: Record<string, RegionInfo> = {};
REGIONS.forEach(function (r) { BY_ID[r.id] = r; });

export function resolveRegion(id: string): RegionInfo {
  const key = String(id || '').trim().toLowerCase();
  if (BY_ID[key]) return BY_ID[key];
  const guess = key || 'japaneast';
  const region = decorate({ id: guess, name: '未收录区域 ' + guess, locale: 'zh-CN' });
  region.label = '未收录区域 ' + guess + ' · ' + guess;
  return region;
}
