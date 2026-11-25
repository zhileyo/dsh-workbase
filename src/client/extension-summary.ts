import { useEffect, useState } from 'react';
import { extensionCall, type ClientPort } from './api.js';
import type { ExtensionModule } from '../shared/extensions.js';

export type ExtensionSummary = { count: number | null; detail: string; errors: number };
export type SummaryState = { status: 'loading' } | { status: 'ready'; value: ExtensionSummary } | { status: 'error'; message: string };
// 数字为 null 表示技能生效尚未由宿主确认（见 SkillsManager.summaryNow）。首轮常撞上宿主目录未就绪，
// 等下一次 15 秒轮询会让统计卡长时间留「—」，因此对「未确认」按短退避重试，确认后回到常规轮询。
const RETRY_DELAYS = [400, 800, 1600, 3200, 5000] as const;
// 统计卡挂在首页，每次切回首页都会重新挂载。数字由宿主统计、两次读数之间不会变，
// 所以按连接缓存上一份已确认的读数：重新挂载时先用它填满卡片，再让后台刷新覆盖，
// 不再每次都从「—」重新等一轮 RPC（实测同一数字每次进入要等 0.2–3s）。
const confirmed = new WeakMap<ClientPort, Map<string, ExtensionSummary>>();
const keyOf = (module: ExtensionModule, days: number) => (module === 'rss' ? `rss:${days}` : module);
const cachedSummary = (api: ClientPort, module: ExtensionModule, days: number) => confirmed.get(api)?.get(keyOf(module, days));
const rememberSummary = (api: ClientPort, module: ExtensionModule, days: number, value: ExtensionSummary) => {
  if (value.count === null) return;
  let summaries = confirmed.get(api);
  if (!summaries) { summaries = new Map(); confirmed.set(api, summaries); }
  summaries.set(keyOf(module, days), value);
};
const confirmedCount = (state: SummaryState | undefined) => state?.status === 'ready' && state.value.count !== null ? state.value : undefined;
export function useExtensionSummaries(api: ClientPort, enabled: Record<ExtensionModule, boolean>, days: number) {
  const [values, setValues] = useState<Partial<Record<ExtensionModule, SummaryState>>>(() => {
    const seeded: Partial<Record<ExtensionModule, SummaryState>> = {};
    for (const module of ['skills', 'mcp', 'rss'] as const) {
      const value = enabled[module] ? cachedSummary(api, module, days) : undefined;
      if (value) seeded[module] = { status: 'ready', value };
    }
    return seeded;
  });
  useEffect(() => {
    const controller = new AbortController();
    const generations: Record<ExtensionModule, number> = { skills: 0, mcp: 0, rss: 0 };
    const modules = (['skills', 'mcp', 'rss'] as const).filter(module => enabled[module]);
    setValues(previous => {
      let next = previous;
      for (const module of modules) {
        const cached = cachedSummary(api, module, days);
        if (cached) {
          if (next[module]?.status !== 'ready') next = { ...next, [module]: { status: 'ready', value: cached } };
        } else if (module === 'rss' && next.rss?.status !== 'ready') next = { ...next, rss: { status: 'loading' } };
      }
      return next;
    });
    let retries = 0, retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retryLater = () => {
      if (retryTimer !== undefined || retries >= RETRY_DELAYS.length) return;
      const delay = RETRY_DELAYS[retries]!; retries += 1;
      retryTimer = setTimeout(() => { retryTimer = undefined; refresh(); }, delay);
    };
    const refresh = () => {
      if (retryTimer !== undefined) { clearTimeout(retryTimer); retryTimer = undefined; }
      let waiting = modules.length, unconfirmed = false;
      for (const module of modules) {
        const generation = ++generations[module];
        void extensionCall<ExtensionSummary>(api, module, 'summary', module === 'rss' ? { days } : undefined, controller.signal).then(value => {
          if (value.count === null) unconfirmed = true;
          if (controller.signal.aborted || generations[module] !== generation) return;
          rememberSummary(api, module, days, value);
          setValues(previous => {
            // 这一轮宿主还没确认生效时保留上一次确认的数字，别让卡片在两次读数之间退回「—」。
            if (value.count === null && confirmedCount(previous[module])) return previous;
            return { ...previous, [module]: { status: 'ready', value } };
          });
        }).catch(error => {
          if (controller.signal.aborted || generations[module] !== generation) return;
          setValues(previous => {
            // 读失败同样不撤下已经确认过的数字，保持卡片稳定，等下一次轮询再试。
            if (confirmedCount(previous[module])) return previous;
            return { ...previous, [module]: { status: 'error', message: error instanceof Error ? error.message : '读取失败' } };
          });
        }).finally(() => {
          if (--waiting > 0 || controller.signal.aborted) return;
          if (unconfirmed) retryLater(); else retries = 0;
        });
      }
    };
    refresh();
    const timer = setInterval(() => { retries = 0; refresh(); }, 15000);
    const unsubscribe = api.subscribe(() => { retries = 0; refresh(); });
    return () => {
      controller.abort(); clearInterval(timer); unsubscribe();
      if (retryTimer !== undefined) { clearTimeout(retryTimer); retryTimer = undefined; }
    };
  }, [api, enabled.skills, enabled.mcp, enabled.rss, days]);
  return values;
}
