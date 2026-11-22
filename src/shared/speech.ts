import { z } from 'zod';

export const DEEPSEEK_TTS_ENDPOINT = 'https://api.deepseek.com/v1/tools/tts';
export const speechConfigSchema = z.object({
  // 没有provider的既存记录按旧协议解析；仅新建配置默认官方。
  provider: z.enum(['deepseek', 'compatible']).default('compatible'),
  filterMarkdown: z.boolean().default(true),
  enabled: z.boolean(),
  endpoint: z.string().max(2000).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search;
    } catch { return false; }
  }, '播报地址必须为不含凭据和查询参数的 HTTPS 地址'),
  model: z.string().trim().min(1).max(200),
  voice: z.string().trim().min(1).max(200),
  speed: z.number().min(0.25).max(4),
}).strict().refine(value => !value.enabled || !!value.endpoint, '请填写播报服务地址')
  .refine(value => value.provider !== 'deepseek' || value.endpoint === DEEPSEEK_TTS_ENDPOINT,
    '官方语音服务地址必须为 DeepSeek TTS 接口')
  .refine(value => value.provider !== 'deepseek' || ['stella', 'tide'].includes(value.voice),
    '官方音色仅支持 stella 或 tide');
export type SpeechConfig = z.infer<typeof speechConfigSchema>;
/** 凭据授权范围为协议供应商与服务源；不将旧凭据隐式授权给新源。 */
export function speechCredentialScope(config: SpeechConfig): string {
  try { return `${config.provider}:${new URL(config.endpoint).origin}`; }
  catch { return `${config.provider}:`; }
}
export const defaultSpeech = (): SpeechConfig => ({
  enabled: false, provider: 'deepseek', endpoint: DEEPSEEK_TTS_ENDPOINT,
  model: 'tts-1', voice: 'stella', speed: 1, filterMarkdown: true,
});
export function speechTextError(config: SpeechConfig, text: string): string | undefined {
  if (!text.trim()) return '回复没有可朗读内容';
  if (text.length > 12000) return '回复过长，未自动播报';
  if (config.provider === 'deepseek') {
    // 官方计费字符：汉字2，其他Unicode字符1；不截断用户正文。
    let count = 0;
    for (const char of text) count += /\p{Script=Han}/u.test(char) ? 2 : 1;
    if (count > 10000) return '回复超过官方 10000 计费字符限制，未自动播报';
  }
  return undefined;
}
export interface SpeechStatus {
  config: SpeechConfig;
  version: string | null;
  hasKey: boolean;
  available: boolean;
}
export interface SpeechAudio { mime: string; data: string; }
