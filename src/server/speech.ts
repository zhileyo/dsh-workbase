import { createHash } from 'node:crypto';
import { z } from 'zod';
import { speechConfigSchema, defaultSpeech, speechTextError, speechCredentialScope, type SpeechConfig, type SpeechStatus, type SpeechAudio } from '../shared/speech.js';
import { WorkbaseError } from '../shared/model.js';
import { SpeechStream, type SpeechSocketFactory } from './speech-stream.js';

const KEY = 'dsh-workbase/speech';
const MAX_AUDIO = 8 * 1024 * 1024;
const storedSchema = z.object({ kind: z.literal('grant'), payload: z.object({
  config: speechConfigSchema, key: z.string().max(4000), credentialScope: z.string().max(2200).optional(),
}).strict() }).strict();
export interface SpeechVault {
  readRecord(key: string): Promise<unknown>;
  modifyRecord(key: string, update: (current: unknown) => Promise<unknown>): Promise<unknown>;
}
const versionOf = (record: unknown) => record === undefined || record === null ? null
  : createHash('sha256').update(JSON.stringify(record)).digest('hex');
/**
 * 供应商策略表：是否支持流式通道、是否必须带密钥、请求体字段与字节上限都从这里取。
 * 两条链路（openStream／synthesize）只查表，不再各自判断 provider；新增供应商只加一行。
 */
interface SpeechStrategy {
  /** 是否支持官方流式播报通道。 */
  stream: boolean;
  /** 没有密钥时这条链路是否不可用。 */
  requiresKey: boolean;
  body(config: SpeechConfig, text: string): Record<string, unknown>;
  /** 请求体字节上限；超出时用 message 报错，没有上限的供应商不写这项。 */
  bodyLimit?: { bytes: number; message: string };
}
const strategies: Record<SpeechConfig['provider'], SpeechStrategy> = {
  deepseek: {
    stream: true,
    requiresKey: true,
    body: (config, text) => ({ text, voice_id: config.voice, format: 'wav', filter_markdown: config.filterMarkdown }),
    bodyLimit: { bytes: 64 * 1024, message: '官方播报请求超过 64KiB 限制' },
  },
  compatible: {
    stream: false,
    requiresKey: false,
    body: (config, text) => ({ model: config.model, voice: config.voice, speed: config.speed, input: text, response_format: 'mp3' }),
  },
};

/** 官方凭据记录事务保存配置及密钥；密钥不进入工作台快照或导出。 */
export class Speech {
  private pending = false;
  private stream?: SpeechStream;
  private disposed = false;
  private configEpoch = 0;
  private synthesis?: AbortController;
  constructor(private readonly vault: () => SpeechVault | undefined, private readonly request: typeof fetch = fetch,
    private readonly socketFactory?: SpeechSocketFactory) {}
  async openStream(version: string | null, signal: AbortSignal, manual = false): Promise<Response> {
    if (this.disposed || this.pending || this.stream) throw new WorkbaseError('conflict', '正在合成语音，请稍后重试');
    this.pending = true;
    const epoch = this.configEpoch;
    try {
      const vault = this.vault(), raw = vault ? await vault.readRecord(KEY) : undefined;
      signal.throwIfAborted();
      if (epoch !== this.configEpoch) throw new WorkbaseError('conflict', '播报配置已在外部修改，请重新读取后保存');
      if (this.disposed) throw new WorkbaseError('unavailable', '语音播报尚未就绪');
      if (versionOf(raw) !== version) throw new WorkbaseError('conflict', '播报配置已在外部修改，请重新读取后保存');
      const record = raw == null ? undefined : storedSchema.parse(raw);
      const config = record?.payload.config, strategy = config ? strategies[config.provider] : undefined;
      if (!record || !config || !strategy || (!config.enabled && !manual) || !strategy.stream)
        throw new WorkbaseError('unavailable', '官方流式播报未启用');
      const key = this.boundKey(record);
      if (strategy.requiresKey && !key.trim()) throw new WorkbaseError('invalid', '请配置 DeepSeek API Key 后启用官方播报');
      const stream = new SpeechStream(config.voice, config.filterMarkdown, key, signal, this.socketFactory,
        () => { if (this.stream === stream) this.stream = undefined; });
      this.stream = stream;
      return new Response(stream.body, { headers: { 'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } finally { this.pending = false; }
  }
  pushStream(id: string, seq: number, text: string, finish: boolean) {
    if (!this.stream || this.stream.id !== id) throw new WorkbaseError('unavailable', '流式播报连接不可用');
    this.stream.push(seq, text, finish);
  }
  cancelStream(id: string) { if (this.stream?.id === id) this.stream.cancel(); }
  dispose() { this.disposed = true; this.synthesis?.abort(); this.stream?.cancel(); }
  private boundKey(record: z.infer<typeof storedSchema>): string {
    const { config, key, credentialScope } = record.payload;
    // 旧版本可能已把密钥关联到错误服务；无归属证据时需显式重新填写。
    return credentialScope === speechCredentialScope(config) ? key : '';
  }
  private view(record: unknown, available: boolean): SpeechStatus {
    const stored = record == null ? undefined : storedSchema.parse(record);
    return { config: stored?.payload.config ?? defaultSpeech(), hasKey: !!stored && !!this.boundKey(stored),
      version: versionOf(record), available };
  }
  async status(): Promise<SpeechStatus> {
    const vault = this.vault();
    return this.view(vault ? await vault.readRecord(KEY) : undefined, !!vault);
  }
  async save(expected: string | null, config: SpeechConfig, key?: string, clearKey = false): Promise<SpeechStatus> {
    const vault = this.vault();
    if (!vault) throw new WorkbaseError('unavailable', '官方凭据存储不可用，暂不能保存播报配置');
    const checked = speechConfigSchema.parse(config);
    if (key !== undefined) z.string().max(4000).refine(value => !/[\r\n]/.test(value)).parse(key);
    let saved: unknown;
    await vault.modifyRecord(KEY, async current => {
      if (versionOf(current) !== expected) throw new WorkbaseError('conflict', '播报配置已在外部修改，请重新读取后保存');
      const before = current == null ? undefined : storedSchema.parse(current);
      const credentialScope = speechCredentialScope(checked);
      const retained = before && speechCredentialScope(before.payload.config) === credentialScope ? this.boundKey(before) : '';
      const next = { kind: 'grant', payload: { config: checked, credentialScope, key: clearKey ? '' : key || retained } };
      if (checked.enabled && strategies[checked.provider].requiresKey && !next.payload.key.trim())
        throw new WorkbaseError('invalid', '请配置 DeepSeek API Key 后启用官方播报');
      saved = next;
      return saved;
    });
    this.configEpoch++; this.synthesis?.abort(); this.stream?.cancel();
    return this.view(saved, true);
  }
  async synthesize(text: string, signal: AbortSignal, manual = false): Promise<SpeechAudio> {
    z.string().min(1).max(12000).parse(text);
    signal.throwIfAborted();
    if (this.disposed) throw new WorkbaseError('unavailable', '语音播报尚未就绪');
    if (this.pending || this.stream) throw new WorkbaseError('conflict', '正在合成语音，请稍后重试');
    const controller = this.synthesis = new AbortController(), epoch = this.configEpoch;
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(45000)]);
    this.pending = true;
    try {
      const vault = this.vault();
      const raw = vault ? await vault.readRecord(KEY) : undefined;
      combined.throwIfAborted();
      if (this.disposed || epoch !== this.configEpoch) throw new WorkbaseError('cancelled', '播报已停止');
      const record = raw == null ? undefined : storedSchema.parse(raw);
      if (!record || (!record.payload.config.enabled && !manual)) throw new WorkbaseError('unavailable', '语音播报未启用');
      if (!record.payload.config.endpoint) throw new WorkbaseError('invalid', '请填写播报服务地址');
      const invalidText = speechTextError(record.payload.config, text);
      if (invalidText) throw new WorkbaseError('invalid', invalidText);
      const { config } = record.payload, key = this.boundKey(record), strategy = strategies[config.provider];
      if (strategy.requiresKey && !key.trim())
        throw new WorkbaseError('invalid', '请配置 DeepSeek API Key 后启用官方播报');
      const body = JSON.stringify(strategy.body(config, text));
      if (strategy.bodyLimit && Buffer.byteLength(body) > strategy.bodyLimit.bytes)
        throw new WorkbaseError('invalid', strategy.bodyLimit.message);
      const response = await this.request(config.endpoint, { method: 'POST', redirect: 'error',
        signal: combined,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body,
      });
      if (combined.aborted) { await response.body?.cancel().catch(() => {}); combined.throwIfAborted(); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new WorkbaseError('unavailable', `播报服务请求失败（HTTP ${response.status}）`);
      }
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'].includes(mime)
        || Number(response.headers.get('content-length')) > MAX_AUDIO) {
        await response.body?.cancel();
        throw new WorkbaseError('invalid', '播报服务返回的音频格式或大小不受支持');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new WorkbaseError('invalid', '播报服务返回空音频');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          combined.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_AUDIO) { await reader.cancel(); throw new WorkbaseError('invalid', '播报音频超过大小上限'); }
          chunks.push(part.value);
        }
      } finally { if (combined.aborted) await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!size) throw new WorkbaseError('invalid', '播报服务返回空音频');
      return { mime, data: Buffer.concat(chunks).toString('base64') };
    } catch (error) {
      if (error instanceof WorkbaseError) throw error;
      if (signal.aborted || controller.signal.aborted) throw new WorkbaseError('cancelled', '播报已停止');
      // 不返回含URL、请求头或供应商响应的网络异常。
      throw new WorkbaseError('unavailable', '语音合成失败或超时，请检查播报服务配置');
    } finally { if (this.synthesis === controller) { this.synthesis = undefined; this.pending = false; } }
  }
}
