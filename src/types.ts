// 共享类型定义（纯类型，运行时被擦除）
export interface RegionInfo {
  id: string;
  name: string;
  locale: string;
  apiDomain: string;
  ttsDomain: string;
  endpoint: string;
  ttsEndpoint: string;
  stsEndpoint: string;
  label: string;
}

export interface BlockPayload {
  text?: string;
  voice?: string;
  locale?: string;
  style?: string;
  role?: string;
  styleDegree?: number | string;
  rate?: number | string;
  pitch?: number | string;
  volume?: number | string;
  contour?: string;
  pauseAfter?: number | string;
}

export interface TtsPayload extends BlockPayload {
  key?: string;
  region?: string;
  domain?: string;
  format?: string;
  mode?: string;
  ssml?: string;
  blocks?: BlockPayload[];
}

export interface SynthResult {
  warnings: string[];
  audio: Buffer;
  endpoint: string;
  chunks: number;
  ms: number;
  lang: string;
  voices: string[];
}

export interface VoiceEntry {
  ShortName?: string;
  Name?: string;
  Gender?: string;
  Locale?: string;
  StyleList?: string[];
  RolePlayList?: string[];
  [key: string]: unknown;
}

export interface ChangeEvent {
  type: 'frontend' | 'backend';
  file: string;
  time: string;
  message: string;
  manual?: boolean;
}
