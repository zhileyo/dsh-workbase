import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../shared/model.js';
import { diagnosticRepairResult, type Diagnosis, type DiagnosticCandidate, type DiagnosticRepairKind, type DiagnosticRepairResult } from '../shared/diagnostics.js';
import type { ClientPort } from './api.js';
import { StatsProjectPanel, type StatEntry } from './StatsProjectPanel.js';
import { Icon, Modal } from './ui.js';

export function fallbackDiagnosis(snapshot: Snapshot): Diagnosis {
  return {
    checkedAt: snapshot.syncedAt, repair: { cache: false, orphan: false, empty: false },
    checks: [{ kind: 'directory', status: 'ok' },
      { kind: 'cache', status: 'unsupported', message: '会话缓存尚未检查，请重新检查' },
      { kind: 'orphan', status: 'unsupported', message: '孤儿子代理尚未检查，请重新检查' },
      { kind: 'empty', status: 'unsupported', message: '空会话尚未检查，请重新检查' }],
    issues: snapshot.projects.filter(p => !p.available).map(p => ({
      id: `directory:${p.projectId}`, kind: 'directory', title: '目录不可用', detail: p.path,
      projectId: p.projectId, projectTitle: p.title, path: p.path,
    })),
  };
}
export function diagnosticSummary(report: Diagnosis) {
  const count = report.issues.length;
  const incomplete = (['directory', 'cache', 'orphan', 'empty'] as const)
    .some(kind => report.checks.find(c => c.kind === kind)?.status !== 'ok');
  const counts = (kind: string) => report.issues.filter(i => i.kind === kind).length;
  const detail = ([['directory', '目录'], ['cache', '缓存'], ['orphan', '孤儿'], ['empty', '空会话']] as const)
    .flatMap(([kind, label]) => counts(kind) ? [`${label} ${counts(kind)}`] : []).join('／');
  return {
    count, state: count ? 'error' : incomplete ? 'unknown' : 'normal',
    detail: count ? `${detail}${incomplete ? ' · 检查未完成' : ''}`
      : incomplete ? '检查未完成' : '检查正常',
  };
}
/** 分批保留成功、跳过和失败，避免一条异常导致整批反馈消失。 */
export async function runDiagnosticRepair(api: Pick<ClientPort, 'call'>, kind: DiagnosticRepairKind, items: DiagnosticCandidate[],
  progress: (done: number, total: number) => void = () => {}, active: () => boolean = () => true): Promise<DiagnosticRepairResult> {
  const result: DiagnosticRepairResult = { succeeded: [], skipped: [], failures: [] };
  for (let index = 0; index < items.length && active();) {
    const batch: DiagnosticCandidate[] = [];
    while (index + batch.length < items.length && batch.length < 20) {
      const next = items[index + batch.length]!;
      const bytes = new TextEncoder().encode(JSON.stringify({ op: 'repair-diagnostics', kind, items: [...batch, next] })).length;
      // HTTP总上限32KiB，给宿主RPC封装留2KiB；合法单条候选不会超过30KiB。
      if (batch.length && bytes > 30 * 1024) break;
      batch.push(next);
    }
    try {
      // 不取消已经发到服务端的物理操作；关闭面板只停止后续批次。
      const value = diagnosticRepairResult.parse(await api.call({ op: 'repair-diagnostics', kind, items: batch }));
      result.succeeded.push(...value.succeeded);
      result.skipped.push(...value.skipped);
      result.failures.push(...value.failures);
    } catch (error) {
      const message = error instanceof Error ? error.message : '修复失败，请重新检查';
      result.failures.push(...batch.map(item => ({ sessionId: item.sessionId, message })));
    }
    index += batch.length;
    progress(index, items.length);
  }
  return result;
}
const checkNames = { directory: '目录检查', cache: '列表缓存', orphan: '孤儿子代理', empty: '空会话' };
export function diagnosticEmptyState(report: Diagnosis, kind?: keyof typeof checkNames) {
  const kinds = kind ? [kind] : (['directory', 'cache', 'orphan', 'empty'] as const);
  const incomplete = kinds.flatMap(key => {
    const check = report.checks.find(check => check.kind === key);
    return check?.status === 'ok' ? [] : [`${checkNames[key]}：${check?.status === 'error' ? '检查失败'
      : check?.status === 'unsupported' ? '能力不可用' : '尚未检查'}${check?.message ? `（${check.message}）` : ''}`];
  });
  if (incomplete.length) return { title: '检查未完成', detail: incomplete.join('；') };
  return kind ? {
    directory: { title: '目录正常', detail: '所有项目目录均可访问' },
    cache: { title: '列表缓存正常', detail: '未发现普通冷会话列表缓存异常' },
    orphan: { title: '无孤儿子代理', detail: '未发现母会话已缺失的子代理残留' },
    empty: { title: '无空会话', detail: '未发现可清理的空会话' },
  }[kind] : { title: '未发现异常', detail: '目录、列表缓存、孤儿子代理及空会话检查均已完成' };
}
const candidate = (report: Diagnosis, kind: DiagnosticRepairKind, ids?: string[]) => report.issues
  .filter(i => i.kind === kind && !i.readOnly && i.sessionId && i.identity && (!ids || ids.includes(i.sessionId)))
  .map(i => ({ sessionId: i.sessionId!, identity: i.identity! }));

export function DiagnosticsPanel({ report, api, busy, onReport, openProject }: {
  report: Diagnosis; api: ClientPort; busy: boolean; onReport(report: Diagnosis): void; openProject(id: string): void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ kind: DiagnosticRepairKind; result: DiagnosticRepairResult } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: 'orphan' | 'empty'; items: DiagnosticCandidate[] } | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const refreshRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; refreshRequest.current?.abort(); };
  }, []);
  const refresh = async () => {
    const controller = new AbortController();
    refreshRequest.current?.abort();
    refreshRequest.current = controller;
    const value = await api.call({ op: 'diagnose' }, controller.signal) as Diagnosis;
    if (mounted.current && !controller.signal.aborted) onReport(value);
  };
  const reload = async () => {
    if (lock.current || busy) return;
    lock.current = true; setWorking(true); setError('');
    try { await refresh(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '重新检查失败'); }
    finally { lock.current = false; if (mounted.current) setWorking(false); }
  };
  const repair = async (kind: DiagnosticRepairKind, items: DiagnosticCandidate[]) => {
    if (lock.current || busy || !items.length) return;
    lock.current = true; setWorking(true); setError(''); setConfirmation(null); setProgress({ done: 0, total: items.length });
    try {
      const result = await runDiagnosticRepair(api, kind, items,
        (done, total) => { if (mounted.current) setProgress({ done, total }); }, () => mounted.current);
      if (!mounted.current) return;
      setFeedback({ kind, result });
      try { await refresh(); }
      catch (reason) { if (mounted.current) setError(`操作结果已保留，重新检查失败：${reason instanceof Error ? reason.message : '读取失败'}`); }
    } finally {
      lock.current = false;
      if (mounted.current) { setWorking(false); setProgress(null); }
    }
  };
  const requestRepair = (kind: DiagnosticRepairKind, items: DiagnosticCandidate[]) => {
    if (working || busy || !items.length) return;
    if (kind !== 'cache') setConfirmation({ kind, items });
    else void repair(kind, items);
  };
  const unsupported = '请安装并启用 dsh-archive-manager 归档管理插件以执行修复';
  const entries: StatEntry[] = report.issues.map(issue => {
    const groupId = issue.projectId ?? `unbound:${issue.path}`;
    return {
      id: issue.id, title: `${issue.projectTitle} · ${issue.title}`,
      detail: issue.kind === 'directory' ? '目录无法访问'
        : issue.kind === 'cache' ? '列表缓存不可用'
        : issue.kind === 'empty' ? '尚未开始对话'
        : `母会话缺失 · ${issue.sizeBytes === undefined ? '大小未知' : `${(issue.sizeBytes / 1024).toFixed(1)} KB`}`,
      sessionId: issue.sessionId,
      detailHint: [issue.detail, issue.path, issue.sessionId ? `会话 ${issue.sessionId}` : '',
        issue.parentSessionId ? `母会话 ${issue.parentSessionId}` : ''].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' · '),
      project: { projectId: groupId, title: issue.projectTitle, path: issue.path },
      actions: issue.kind === 'directory'
        ? issue.projectId ? [{ label: '查看项目', disabled: working || busy, run: () => openProject(issue.projectId!) }] : []
        : [{ label: issue.kind === 'cache' ? '重建列表缓存' : issue.kind === 'empty' ? '删除空会话' : '清理残留', danger: issue.kind !== 'cache',
          disabled: working || busy || issue.readOnly || !report.repair[issue.kind],
          hint: issue.readOnly ? '项目已归档，恢复后可修复' : report.repair[issue.kind] ? undefined : unsupported,
          run: () => requestRepair(issue.kind as DiagnosticRepairKind, [{ sessionId: issue.sessionId!, identity: issue.identity! }]) }],
    };
  });
  const caches = candidate(report, 'cache'), orphans = candidate(report, 'orphan'), empties = candidate(report, 'empty');
  const orphanIssues = report.issues.filter(i => i.kind === 'orphan');
  const knownSize = orphanIssues.reduce((sum, issue) => sum + (issue.sizeBytes ?? 0), 0);
  const unknownSize = orphanIssues.filter(i => i.sizeBytes === undefined).length;
  const retryItems = feedback ? candidate(report, feedback.kind, feedback.result.failures.map(f => f.sessionId)) : [];
  const emptyState = diagnosticEmptyState(report);
  const incomplete = emptyState.title === '检查未完成';
  return <>
    <div className="stats-page-header">
      <h3 className="stats-page-heading">项目诊断</h3>
      <button type="button" className="diagnostic-refresh" disabled={working || busy} onClick={() => void reload()}>
        <Icon name="refresh"/>{working ? progress ? '处理中…' : '检查中…' : '重新检查'}
      </button>
    </div>
    <p className="dialog-description stats-page-description">检查目录、普通冷会话列表缓存、孤儿子代理及空会话；检查不读取正文。</p>
    {incomplete && <p className="diagnostic-message">{emptyState.detail}</p>}
    {(!!caches.length || !!orphans.length) && <div className="diagnostic-toolbar">
      {!!caches.length && <button type="button" disabled={working || busy || !report.repair.cache}
        title={report.repair.cache ? undefined : unsupported} onClick={() => requestRepair('cache', caches)}>重建缓存（{caches.length}）</button>}
      {!!orphans.length && <button type="button" className="danger" disabled={working || busy || !report.repair.orphan}
        title={report.repair.orphan ? undefined : unsupported} onClick={() => requestRepair('orphan', orphans)}>清理残留（{orphans.length}）</button>}
    </div>}
    {!!orphanIssues.length && <p className="diagnostic-message">残留日志已知大小约 {(knownSize / 1024).toFixed(1)} KB{unknownSize ? `，另有 ${unknownSize} 项大小未知` : ''}；不包含附件及其他目录占用。</p>}
    {error && <p className="diagnostic-message" role="alert">{error}</p>}
    {progress && <p className="diagnostic-message" role="status">已处理 {progress.done} / {progress.total}</p>}
    {feedback && <div className="diagnostic-feedback" role="status">
      <p>{feedback.kind === 'cache' ? '缓存重建' : feedback.kind === 'empty' ? '空会话删除' : '残留清理'}：成功 {feedback.result.succeeded.length} · 跳过 {feedback.result.skipped.length} · 失败 {feedback.result.failures.length}</p>
      {!!feedback.result.failures.length && <details><summary>失败详情</summary>
        {feedback.result.failures.map(f => <p key={f.sessionId}>{f.sessionId}：{f.message}</p>)}</details>}
      {!!retryItems.length && <button type="button" disabled={working || busy}
        onClick={() => requestRepair(feedback.kind, retryItems)}>重试失败项（{retryItems.length}）</button>}
    </div>}
    <StatsProjectPanel entries={entries} empty={working ? progress ? '正在处理…' : '正在检查…' : error ? '最近操作失败' : emptyState.title}
      emptyDetail={working ? '完成后将更新检查结果' : error ? '当前保留上次检查结果，请重新检查' : emptyState.detail}
      resultHeader={(category, count) => <div className="diagnostic-list-header">
        <strong>{category ? { directory: '目录异常', cache: '列表缓存', orphan: '孤儿子代理', empty: '空会话' }[category] : '全部异常'} · {count}</strong>
        {(category === null || category === 'empty') && !!empties.length && <button type="button" className="danger"
          disabled={working || busy || !report.repair.empty}
          title={report.repair.empty ? '删除所有项目中的可清理空会话，不受搜索条件影响' : unsupported}
          onClick={() => requestRepair('empty', empties)}>{category === 'empty' ? '删除全部' : '删除全部空会话'}（{empties.length}）</button>}
      </div>}
      categories={(['directory', 'cache', 'orphan', 'empty'] as const).map(kind => {
        const state = diagnosticEmptyState(report, kind);
        return { id: kind, title: { directory: '目录异常', cache: '列表缓存', orphan: '孤儿子代理', empty: '空会话' }[kind],
          entries: entries.filter((_, index) => report.issues[index]?.kind === kind),
          empty: working ? progress ? '正在处理…' : '正在检查…' : error ? '最近操作失败' : state.title,
          emptyDetail: working ? '完成后将更新检查结果' : error ? '当前保留上次检查结果，请重新检查' : state.detail,
        };
      })}/>
    {confirmation && <Modal title={confirmation.kind === 'empty' ? '删除空会话' : '清理孤儿子代理'} onClose={() => setConfirmation(null)}>
      <p className="dialog-description">{confirmation.kind === 'empty'
        ? `将永久删除 ${confirmation.items.length} 个空会话的日志、索引和缓存，无法撤销。批量删除覆盖所有项目的可清理空会话，不受搜索条件影响。执行前逐项复查；已开始对话、正在使用或状态变化的会话会跳过。`
        : `将永久清理 ${confirmation.items.length} 个子代理的日志、索引和缓存，无法撤销。执行前会再次检查母会话是否仍然缺失、子代理是否活跃。`}</p>
      <div className="diagnostic-confirm-list">{confirmation.items.map(i => <p key={i.sessionId}>{i.sessionId}</p>)}</div>
      <footer className="dialog-footer"><button type="button" onClick={() => setConfirmation(null)}>取消</button>
        <button type="button" className="danger" disabled={working || busy}
          onClick={() => void repair(confirmation.kind, confirmation.items)}>{confirmation.kind === 'empty' ? '永久删除' : '永久清理'}</button></footer>
    </Modal>}
  </>;
}
