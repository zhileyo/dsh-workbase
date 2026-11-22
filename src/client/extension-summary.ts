import { useEffect, useState } from 'react';
import { extensionCall, type ClientPort } from './api.js';
import type { ExtensionModule } from '../shared/extensions.js';

export type ExtensionSummary = { count: number | null; detail: string; errors: number };
export type SummaryState = { status: 'loading' } | { status: 'ready'; value: ExtensionSummary } | { status: 'error'; message: string };
export function useExtensionSummaries(api: ClientPort, enabled: Record<ExtensionModule, boolean>, days: number) {
  const [values, setValues] = useState<Partial<Record<ExtensionModule, SummaryState>>>({});
  useEffect(() => {
    const controller = new AbortController();
    const generations: Record<ExtensionModule, number> = { skills: 0, mcp: 0, rss: 0 };
    const modules = (['skills', 'mcp', 'rss'] as const).filter(module => enabled[module]);
    if (enabled.rss) setValues(previous => ({ ...previous, rss: { status: 'loading' } }));
    const refresh = () => {
      for (const module of modules) {
        const generation = ++generations[module];
        void extensionCall<ExtensionSummary>(api, module, 'summary', module === 'rss' ? { days } : undefined, controller.signal).then(value => {
          if (!controller.signal.aborted && generations[module] === generation) setValues(previous => ({ ...previous, [module]: { status: 'ready', value } }));
        }).catch(error => {
          if (!controller.signal.aborted && generations[module] === generation) setValues(previous => ({ ...previous, [module]: {
            status: 'error', message: error instanceof Error ? error.message : '读取失败',
          } }));
        });
      }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    const unsubscribe = api.subscribe(refresh);
    return () => { controller.abort(); clearInterval(timer); unsubscribe(); };
  }, [api, enabled.skills, enabled.mcp, enabled.rss, days]);
  return values;
}
