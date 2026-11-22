import type { Command } from '../shared/commands.js';
import { defaultSpeech, speechConfigSchema, speechCredentialScope, type SpeechStatus } from '../shared/speech.js';

export class SpeechSave {
  status?: SpeechStatus;
  private currentConfig = defaultSpeech();
  get config() { return this.currentConfig; }
  set config(value) {
    if (speechCredentialScope(value) !== speechCredentialScope(this.currentConfig)) {
      this.key = ''; this.clearKey = false;
    }
    this.currentConfig = value;
  }
  get hasSavedKey() {
    return !!this.status?.hasKey && speechCredentialScope(this.config) === speechCredentialScope(this.status.config);
  }
  key = '';
  clearKey = false;
  busy = false;
  error = '';
  constructor(private readonly send: (command: Command) => Promise<unknown>, readonly changed: () => void) {}
  get dirty() {
    return !!this.status && (JSON.stringify(this.config) !== JSON.stringify(this.status.config) || !!this.key || this.clearKey);
  }
  async load() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.changed();
    try {
      const status = await this.send({ op: 'speech-status' }) as SpeechStatus;
      this.status = status; this.config = { ...status.config }; this.key = ''; this.clearKey = false;
    } catch (error) { this.error = error instanceof Error ? error.message : '播报配置读取失败'; }
    finally { this.busy = false; this.changed(); }
  }
  async flush() {
    if (this.busy) return false;
    if (!this.dirty) return true;
    if (!speechConfigSchema.safeParse(this.config).success) { this.error = '请检查播报地址、模型、音色与语速'; this.changed(); return false; }
    if (this.config.enabled && this.config.provider === 'deepseek' &&
      (this.clearKey || !(this.key.trim() || this.hasSavedKey))) {
      this.error = '请配置 DeepSeek API Key 后启用官方播报'; this.changed(); return false;
    }
    this.busy = true; this.error = ''; this.changed();
    try {
      this.status = await this.send({ op: 'speech-save', version: this.status!.version,
        config: this.config, key: this.key || undefined, clearKey: this.clearKey }) as SpeechStatus;
      this.config = { ...this.status.config }; this.key = ''; this.clearKey = false; return true;
    } catch (error) { this.error = error instanceof Error ? error.message : '播报配置保存失败'; return false; }
    finally { this.busy = false; this.changed(); }
  }
}
