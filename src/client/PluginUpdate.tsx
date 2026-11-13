import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PluginUpdateController, UpdateItem, UpdateStep } from './plugin-update.js';
import { errorText, useWorkbaseLocale } from './i18n.js';

export interface UpdateVisibility {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
}
type HostUi = typeof import('@deepseek-ai/dsh-client-ui-primitives');
// 官方 primitives 由宿主模块加载器提供；只在真实渲染组件时读取。
const hostUi = (): HostUi => require('@deepseek-ai/dsh-client-ui-primitives');
function registryLabel(registry: string | null) {
  if (registry === null) return '默认安装源';
  try {
    const host = new URL(registry).host;
    return host === 'registry.npmjs.org' ? 'npm 官方源'
      : host === 'registry.npmmirror.com' ? '国内镜像源' : host;
  } catch { return '自定义安装源'; }
}
const labels: Record<UpdateItem['status'], string> = {
  waiting: '等待检查', checking: '正在检查', available: '可更新', current: '已是最新',
  skipped: '已跳过', updating: '正在更新', updated: '更新完成', restart: '需重启',
  failed: '失败', unknown: '结果未确认',
};
const stepLabels: Record<UpdateStep, string> = {
  checking: '检查目标版本', removing: '停止并移除旧版本', installing: '安装新版本', restoring: '恢复旧版本',
};
function tone(status: UpdateItem['status']) {
  return ['checking', 'updating'].includes(status) ? 'ongoing' as const
    : ['failed', 'unknown'].includes(status) ? 'error' as const
    : status === 'restart' ? 'warning' as const
    : ['updated', 'current'].includes(status) ? 'done' as const : 'idle' as const;
}
function stepTone(item: UpdateItem, step: UpdateStep, index: number) {
  if (item.status === 'updating') return index === item.steps.length - 1 ? 'ongoing' as const : 'done' as const;
  if (!item.result) return 'idle' as const;
  const failed = (application: string) => ['failed', 'cancelled'].includes(application);
  const result = item.result;
  const error = step === 'checking' ? result.step === 'check'
    : step === 'removing' ? result.step === 'remove'
    : step === 'installing' ? failed(result.result.application)
    : result.restore !== undefined && failed(result.restore.application);
  return error ? 'error' as const : 'done' as const;
}
/** 不覆盖官方 main 面板；在官方工具栏各测量／绘制副本中插入同宽入口。 */
export function PluginUpdate({ controller, visibility }: { controller: PluginUpdateController; visibility: UpdateVisibility }) {
  useWorkbaseLocale();
  const { Button, Modal, StateDot, IconDownloadOutlineRegular, IconChevronRightOutlineRegular } = hostUi();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const visible = useSyncExternalStore(visibility.subscribe, visibility.getSnapshot, visibility.getSnapshot);
  const [anchors, setAnchors] = useState<{ node: HTMLElement; disabled: boolean; buttonClass: string; labelClass: string }[]>([]);
  const [outputOpen, setOutputOpen] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>('target');
  useEffect(() => {
    if (!visible) return;
    let mounts: { node: HTMLElement; refresh: HTMLButtonElement }[] = [];
    const sync = () => {
      const next: typeof mounts = [];
      for (const toolbar of document.querySelectorAll<HTMLElement>('[data-plugin-toolbar]')) {
        const refresh = toolbar.querySelector<HTMLButtonElement>('button[aria-busy]:not(.wb-plugin-update-trigger)');
        if (!refresh) continue;
        let before: HTMLElement = refresh;
        while (before.parentElement && before.parentElement !== toolbar) before = before.parentElement;
        let mount = mounts.find(mount => mount.refresh === refresh && mount.node.parentElement === toolbar);
        if (!mount) {
          const node = document.createElement('span');
          node.className = 'wb-plugin-update-anchor';
          toolbar.insertBefore(node, before);
          mount = { node, refresh };
        } else if (mount.node.nextElementSibling !== before) toolbar.insertBefore(mount.node, before);
        next.push(mount);
      }
      for (const mount of mounts) if (!next.includes(mount)) mount.node.remove();
      mounts = next;
      setAnchors(previous => previous.length === mounts.length && previous.every((anchor, i) =>
        anchor.node === mounts[i]!.node && anchor.disabled === mounts[i]!.refresh.disabled) ? previous
        : mounts.map(mount => ({ node: mount.node, disabled: mount.refresh.disabled, buttonClass: mount.refresh.className,
          labelClass: mount.refresh.lastElementChild?.tagName === 'SPAN' ? mount.refresh.lastElementChild.className : '' })));
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    sync();
    return () => { observer.disconnect(); for (const mount of mounts) mount.node.remove(); setAnchors([]); };
  }, [visible]);
  const available = state.items.filter(item => item.status === 'available').length;
  const updated = state.items.filter(item => ['updated', 'restart'].includes(item.status)).length;
  const processed = state.items.filter(item => item.to && ['updated', 'restart', 'failed', 'unknown'].includes(item.status)).length;
  const targets = state.items.filter(item => item.to).length;
  const failures = state.items.filter(item => ['failed', 'unknown'].includes(item.status)).length;
  const needsRestart = state.items.some(item => item.status === 'restart');
  const busy = state.phase === 'checking' || state.phase === 'updating';
  const groups = [
    { id: 'target', title: state.phase === 'confirm' ? '可以更新' : state.phase === 'updating' ? '正在更新' : state.phase === 'checking' ? '检查中' : '更新结果',
      items: state.items.filter(item => !!item.to || !['current', 'skipped'].includes(item.status)) },
    { id: 'latest', title: '已是最新', items: state.items.filter(item => item.status === 'current' && !item.to) },
    { id: 'skipped', title: '跳过更新', items: state.items.filter(item => item.status === 'skipped') },
  ];
  const summary = state.phase === 'checking' ? `正在检查插件（${state.items.filter(item => !['waiting', 'checking'].includes(item.status)).length}/${state.items.length}）`
    : state.phase === 'updating' ? `正在更新插件（${processed}/${targets}）`
    : state.phase === 'confirm' ? `检查完成，${available} 个插件可更新`
    : updated ? `更新完成，${updated} 个成功${failures ? `，${failures} 个失败` : ''}`
    : state.error || failures ? '检查或更新未全部完成' : '检查完成，暂无可更新插件';
  return <>
    {visible && anchors.map(({ node, disabled, buttonClass, labelClass }, index) => createPortal(<Button variant="outline" size="sm"
      className={`wb-plugin-update-trigger ${buttonClass}`} disabled={disabled && !busy} aria-label={busy ? '查看插件更新进度' : '一键更新用户安装的插件'} title={busy ? '查看插件更新进度' : '一键更新用户安装的插件'}
aria-busy={busy} icon={busy ? <StateDot state="ongoing" size={13}/> : <IconDownloadOutlineRegular size={13}/>}
      onClick={() => controller.open()}>
      <span className={`wb-plugin-update-label ${labelClass}`}>{busy ? '查看进度' : '一键更新'}</span>
    </Button>, node, String(index)))}
    <Modal open={state.open} title="更新已安装插件" closeLabel="关闭" className="wb-plugin-update-dialog" contentClassName="wb-plugin-update-content"
      onClose={() => controller.close()} footer={<div className="wb-plugin-update-footer">
        <p className="wb-plugin-update-notice">按顺序更新并保留启用状态；期间插件可能短暂停止，安装失败时会保留或恢复原版本。</p>
        <div className="wb-plugin-update-actions">{busy ? <><Button variant="outline" onClick={() => controller.close()}>{state.phase === 'checking' ? '后台检查' : '后台更新'}</Button>
          <Button variant="outline" disabled>{state.phase === 'checking' ? '正在检查…' : '正在更新…'}</Button></>
        : state.phase === 'confirm' ? <><Button variant="outline" onClick={() => controller.close()}>取消</Button>
          <Button variant="primary" onClick={() => { void controller.update(); }}>更新全部（{available}）</Button></>
        : <><Button variant="outline" onClick={() => { setOutputOpen([]); setExpanded('target'); void controller.check(); }}>重新检查</Button>
          <Button variant="primary" onClick={() => controller.close()}>完成</Button></>}</div></div>}>
      <div className="wb-plugin-update-body" data-wb-plugin-update={state.phase} aria-busy={busy}>
        <div className="wb-plugin-update-summary" role="status" aria-live="polite">
          <StateDot state={busy ? 'ongoing' : state.error || failures ? 'error' : needsRestart ? 'warning' : 'done'} size={14}/>
          <div><strong>{summary}</strong><p>{needsRestart ? '请在全部更新结束后重启 Harness，使更新生效。'
            : busy ? '关闭弹窗后继续运行，再次打开可查看进度。'
            : state.phase === 'confirm' ? '仅更新用户安装的插件，沿用各自的安装源及启用状态。'
            : '仅检查用户安装的插件；本地安装包等不支持在线更新的来源会跳过。'}</p></div>
        </div>
        {state.error && <p className="wb-plugin-update-error" role="alert">{errorText(state.error)}</p>}
        <div className="wb-plugin-update-groups">{groups.filter(group => group.items.length).map(group =>
          <section className="wb-plugin-update-group" key={group.id} data-open={expanded === group.id}>
            <button type="button" className="wb-plugin-update-group-heading" aria-expanded={expanded === group.id}
              aria-controls={`wb-plugin-update-group-${group.id}`} onClick={() => setExpanded(previous => previous === group.id ? null : group.id)}>
              <IconChevronRightOutlineRegular size={14}/><strong>{group.title}</strong><span>{group.items.length}</span>
            </button>
            <div className="wb-plugin-update-group-scroll" id={`wb-plugin-update-group-${group.id}`} hidden={expanded !== group.id}
              role="region" aria-label={`${group.title}插件`} tabIndex={0}>
        <ol className="wb-plugin-update-list">{group.items.map(item => <li key={item.name} data-status={item.status}>
          <div className="wb-plugin-update-row"><StateDot state={tone(item.status)} size={12}/>
            <div className="wb-plugin-update-copy"><strong title={item.name}>{item.name}</strong>
            </div>
            <span className="wb-plugin-update-status">{labels[item.status]}</span></div>
          <div className="wb-plugin-update-versions" aria-label={item.to ? '更新版本' : '当前版本'}>
            <span data-old={item.to ? '' : undefined}>{item.from ?? item.version ?? '—'}</span>
            {item.to && <><IconChevronRightOutlineRegular size={14} aria-hidden="true"/><span>{item.to}</span></>}
          </div>
          <dl className="wb-plugin-update-source"><dt>安装来源</dt>
            <dd title={item.registry ?? item.source ?? '默认安装源'}>{item.registry !== undefined ? registryLabel(item.registry) : item.source?.startsWith('file:') ? '本地安装包' : item.source ?? '默认安装源'}</dd>
          </dl>
          {['failed', 'unknown', 'restart'].includes(item.status) && <p className="wb-plugin-update-detail">{errorText(item.detail ?? '')}</p>}
          {item.steps.length > 0 && <ol className="wb-plugin-update-steps">{item.steps.map((step, index) => <li key={step}>
            <StateDot state={stepTone(item, step, index)} appearance="step" size={12}/><span>{stepLabels[step]}</span>
          </li>)}</ol>}
          {item.output && <><button type="button" className="wb-plugin-update-output-toggle" aria-expanded={outputOpen.includes(item.name)}
            onClick={() => setOutputOpen(previous => previous.includes(item.name) ? previous.filter(name => name !== item.name) : [...previous, item.name])}>查看安装输出</button>
            {outputOpen.includes(item.name) && <pre className="wb-plugin-update-output">{item.output}</pre>}</>}
        </li>)}</ol></div></section>)}
          {!state.items.length && <p className="wb-plugin-update-empty">{busy ? '正在读取已安装插件…' : state.error ? '未能读取插件，请重新检查' : '暂无用户安装的插件'}</p>}
        </div>
      </div>
    </Modal>
  </>;
}
