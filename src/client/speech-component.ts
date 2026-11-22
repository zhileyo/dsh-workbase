import type { SpeechPlayback } from './speech-playback.js';

/** 组件开关独立于自动播报；停用时卸载会话入口并停止音频，保留凭据配置。 */
export class SpeechComponent {
  private enabled = false;
  private listeners = new Set<() => void>();
  private target?: EventTarget;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly playback: SpeechPlayback) {}
  getSnapshot = () => this.enabled;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  private refresh = () => { if (this.enabled) void this.playback.refresh(); };
  private start() {
    if (!this.target || this.timer) return;
    this.refresh(); this.timer = setInterval(this.refresh, 15000);
  }
  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) this.start();
    else {
      clearInterval(this.timer); this.timer = undefined; this.playback.stop(true);
    }
    for (const listener of this.listeners) listener();
  }
  connect(target: EventTarget) {
    this.target = target; target.addEventListener('focus', this.refresh);
    if (this.enabled) this.start();
    return () => {
      target.removeEventListener('focus', this.refresh);
      this.target = undefined; clearInterval(this.timer); this.timer = undefined;
    };
  }
  dispose() {
    this.target?.removeEventListener('focus', this.refresh); this.target = undefined;
    clearInterval(this.timer); this.timer = undefined; this.setEnabled(false); this.playback.stop(true);
  }
}

export const alwaysSpeechComponent = {
  subscribe: (_listener: () => void) => () => {},
  getSnapshot: () => true,
};
