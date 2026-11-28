import { useEffect } from 'react';

/** 设置与扩展面板共用的少量浏览器侧工具：导出下载、按连接隔离的记忆表、
 *  面板动作包装器、状态轮询骨架。只放真正被多处复用的实现，面板自己的业务逻辑仍留在各自文件里。 */

/** 触发浏览器下载：建立对象 URL → 点击临时链接 → 延迟回收。 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 按 api 连接（对象身份）隔离的 Map：同一连接重新进入面板时复用已记住的键值。 */
export function apiScopedMap<K, V>(store: WeakMap<object, Map<K, V>>, api: object): Map<K, V> {
  const existing = store.get(api);
  if (existing) return existing;
  const created = new Map<K, V>();
  store.set(api, created);
  return created;
}

/** 面板动作收尾的焦点恢复：仅当原焦点元素还在文档里、且此刻焦点已丢失（回到 body）时才归还，
 *  不抢用户主动移动过的焦点。roving tabindex 下标统一用 roving.ts 的 nextTabIndex，不再另写一份。 */
export function restorePanelFocus(alive: { current: boolean }, active: HTMLElement | null) {
  requestAnimationFrame(() => {
    if (alive.current && active?.isConnected && document.activeElement === document.body)
      active.focus({ preventScroll: true });
  });
}

/** 面板动作的公共骨架：重入锁 + busy + 失败回报 + 焦点恢复。
 *  成功路径（RPC 调用、回执消息、刷新快照）仍是各面板自己的 job；
 *  失败如何呈现（Toast 或面板错误区）由 report 决定，这里只保证「解锁、收 busy、按需还焦点」。
 *  RSS 的保存链路依赖 rejection 区分草稿错误，因此保留自己的 perform 结构，只用 restorePanelFocus 对齐收尾。 */
export function usePanelAction(frame: {
  lock: { current: boolean };
  setBusy(value: boolean): void;
  alive: { current: boolean };
}) {
  const { lock, setBusy, alive } = frame;
  return async (job: () => Promise<void>, hooks: {
    /** 作业开跑前的本地清理（清错误区、推进快照版本号等）。 */
    start(): void;
    /** 作业失败后的呈现；只在面板仍然挂载时调用。 */
    report(error: unknown): void;
  }): Promise<void> => {
    if (lock.current) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lock.current = true;
    setBusy(true);
    hooks.start();
    try {
      await job();
    } catch (error) {
      if (alive.current) hooks.report(error);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        restorePanelFocus(alive, active);
      }
    }
  };
}

/** 备份／恢复状态轮询的公共骨架：enabled 关闭或组件卸载后停止；
 *  tick 返回下一次间隔毫秒数（0 或负数表示不再续期），tick 通过 stopped() 感知本轮已过期。 */
export function useStatusPolling(enabled: boolean, tick: (stopped: () => boolean) => Promise<number>, deps: readonly unknown[]) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const delay = await tick(() => stopped);
      if (!stopped && delay > 0) timer = setTimeout(run, delay);
    };
    void run();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
