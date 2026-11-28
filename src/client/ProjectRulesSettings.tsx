import { useId, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../shared/model.js';
import { projectRulesSchema, type ProjectRules } from '../shared/project-rules.js';
import { Icon, IconButton, Picker } from './ui.js';
import { t } from './i18n.js';

export function RulesEditor({ label, value, disabled, onChange, renderMarkdown, maxLength = 20000, showLabel = true, invalid = false, errorId, saveMode = 'auto' }: {
  label: string; value: string; disabled: boolean; onChange(value: string): void; renderMarkdown?(text: string): ReactNode;
  maxLength?: number; showLabel?: boolean; invalid?: boolean; errorId?: string; saveMode?: 'auto' | 'settings';
}) {
  const id = useId(), textarea = useRef<HTMLTextAreaElement>(null), preview = useRef<HTMLDivElement>(null);
  const selection = useRef({ start: 0, end: 0, scroll: 0 });
  const composing = useRef(false);
  const [editing, setEditing] = useState(false);
  const enter = () => {
    if (disabled) return;
    setEditing(true);
    requestAnimationFrame(() => {
      const field = textarea.current;
      if (!field) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange(selection.current.start, selection.current.end);
      field.scrollTop = selection.current.scroll;
    });
  };
  const exit = () => {
    if (composing.current) return;
    const field = textarea.current;
    if (field) selection.current = { start: field.selectionStart, end: field.selectionEnd, scroll: field.scrollTop };
    setEditing(false);
  };
  return <div className="rules-editor">
    {showLabel && <div className="rules-body-label"><span id={id}>{label}</span><small>{value.length} / {maxLength}</small></div>}
    <div className="rules-md-field">
      <div ref={preview} className="rules-md-preview" role="textbox" aria-readonly="true" aria-multiline="true"
        aria-label={label} aria-labelledby={showLabel ? id : undefined} aria-invalid={invalid || undefined} aria-describedby={errorId}
        tabIndex={disabled ? -1 : 0} hidden={editing} title="点击或按 Enter 编辑 Markdown 原文"
        onClick={e => {
          if ((e.target as Element)?.closest('a,button,input,select,textarea,[role="button"]')) return;
          e.preventDefault(); enter();
        }} onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
        }}>
        {value ? renderMarkdown ? renderMarkdown(value) : <pre className="rules-plain-preview">{value}</pre> : <p>点击此处编写规则正文。</p>}
      </div>
      <textarea ref={textarea} aria-label={label} aria-labelledby={showLabel ? id : undefined} value={value} disabled={disabled}
        aria-invalid={invalid || undefined} aria-describedby={errorId}
        maxLength={maxLength} hidden={!editing} onChange={e => onChange(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={e => { composing.current = false; onChange(e.currentTarget.value); if (document.activeElement !== e.currentTarget) exit(); }}
        onBlur={exit} onKeyDown={e => {
          if (e.key === 'Escape' && !e.nativeEvent.isComposing && !composing.current) {
            e.preventDefault(); e.stopPropagation(); exit();
            requestAnimationFrame(() => preview.current?.focus({ preventScroll: true }));
          }
        }}/>
    </div>
    <p className="settings-inline-note">{saveMode === 'settings'
      ? '修改后点击保存设置。'
      : '修改自动保存。'}</p>
  </div>;
}

export function filterProjectRules(rules: ProjectRules['projects'], projects: Project[], query: string) {
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return rules.filter(rule => {
    const text = normalize([rule.name, ...rule.projectIds.map(id => projects.find(project => project.projectId === id)?.title ?? id)].join(' '));
    return terms.every(term => text.includes(term));
  });
}

type RulePatch = Partial<ProjectRules['projects'][number]>;

/** 列表与详情共用的三件小事：按规则 id 合并补丁、项目标题解析、保存状态文案。
 *  两处「保存状态 + 重试保存」整段 JSX 未合并：列表用 role="status" 且允许空文本，
 *  详情用 role="alert" 且仅在保存失败时渲染，合并会把告警语义改成状态语义。 */
function patchRule(value: ProjectRules, id: string, patch: RulePatch): ProjectRules {
  return { ...value, projects: value.projects.map(rule => rule.id === id ? { ...rule, ...patch } : rule) };
}
function projectNames(projects: Project[], ids: string[]) {
  return ids.map(id => projects.find(project => project.projectId === id)?.title ?? id);
}
function saveStateLabel(dirty: boolean, saving: boolean) {
  return dirty ? saving ? t('正在自动保存…') : t('未保存修改') : t('已自动保存');
}

export function ProjectRulesSettings({ scope, value, onChange, projects, disabled, renderMarkdown, saveStatus = '', saveError = '', saving = false, retry, savedValue, select }: {
  scope: 'global' | 'projects'; value: ProjectRules; onChange(value: ProjectRules): void;
  projects: Project[]; disabled: boolean; renderMarkdown?(text: string): ReactNode;
  saveStatus?: string; saveError?: string; saving?: boolean; retry?(): void;
  savedValue?: ProjectRules;
  select?(id: string): void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null), listId = useId();
  const update = (id: string, patch: RulePatch) => onChange(patchRule(value, id, patch));
  const stateLabel = (dirty: boolean) => saveStateLabel(dirty, saving);
  const scopeStatus = scope === 'global' && savedValue
    ? stateLabel(JSON.stringify(value.global) !== JSON.stringify(savedValue.global)) : saveStatus;
  const status = <div className="rules-save-status"><span role="status" className={saveError ? 'wb-warning' : ''}>{saveError || scopeStatus}</span>
    {saveError && retry && <button type="button" disabled={saving || disabled} onClick={retry}>重试保存</button>}</div>;
  if (scope === 'global') return <>
    <label className="wb-setting-row setting-row"><div><strong>全局规则</strong><small>写入 DSH 主目录的 AGENTS.md，全局生效；停用保留草稿。</small></div>
      <input type="checkbox" aria-label="全局规则" checked={value.global.enabled} disabled={disabled}
        onChange={e => onChange({ ...value, global: { ...value.global, enabled: e.target.checked } })}/></label>
    {status}
    {!projectRulesSchema.safeParse({ global: value.global, projects: [] }).success && <p className="wb-warning" role="alert">
      {value.global.enabled && !value.global.content.trim() ? '启用规则前，请填写正文。' : '正文最多20000字符，不能包含工作台区块标记。'}</p>}
    {value.global.enabled && <div className="rules-global-editor"><RulesEditor label="全局规则正文" value={value.global.content} disabled={disabled}
      onChange={content => onChange({ ...value, global: { ...value.global, content } })} renderMarkdown={renderMarkdown}/></div>}
  </>;
  const names = (ids: string[]) => projectNames(projects, ids);
  const visible = filterProjectRules(value.projects, projects, query);
  const clear = () => { setQuery(''); search.current?.focus(); };
  return <>
    <div className="rules-list-tools"><div className="rules-search"><Icon name="search"/>
      <input ref={search} type="search" aria-label="搜索规则名称或应用项目" placeholder="搜索规则名称或应用项目"
        aria-controls={listId} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
          if (e.key === 'Escape' && !e.nativeEvent.isComposing && query) { e.preventDefault(); e.stopPropagation(); clear(); }
        }}/>
      {query && <IconButton name="close" label="清空规则搜索" onClick={clear}/>}
    </div><button type="button" disabled={disabled || value.projects.length >= 50} onClick={() => {
      const id = crypto.randomUUID(); setQuery('');
      onChange({ ...value, projects: [...value.projects, { id, name: t('项目规则'), enabled: false, projectIds: [], content: '' }] });
      select?.(id);
    }}>添加规则</button></div>
    <div className="rules-list-status"><span role="status">{query.trim()
      ? t('找到 {p0} 条 · 共 {p1} 条规则', { p0: visible.length, p1: value.projects.length })
      : t('{p0} 条规则', { p0: value.projects.length })}</span>{status}</div>
    <div className="rules-table" role="table" aria-label="项目规则列表">
      <div className="rules-table-head" role="row">{['规则名称', '应用项目', '项目数', '启用', '操作'].map(label =>
        <span key={label} role="columnheader" aria-label={t(label)}>{label === '操作' ? '' : t(label)}</span>)}</div>
      <div id={listId} role="rowgroup">{visible.map(item => <div className="rules-table-row" role="row" key={item.id}
        onClick={() => select?.(item.id)}>
        <div role="cell"><button type="button" className="rules-name" onClick={() => select?.(item.id)}>{item.name || t('未命名规则')}</button></div>
        <div role="cell" className="rules-project-tags" title={names(item.projectIds).join('、')}>
          {item.projectIds.length ? names(item.projectIds).map((name, i) => <span key={item.projectIds[i]} className="rules-project-tag">{name}</span>) : <span>未选择项目</span>}
        </div>
        <span role="cell" className="rules-count">{t('{p0} 个项目', { p0: item.projectIds.length })}</span>
        <div role="cell" onClick={e => e.stopPropagation()}><input type="checkbox" className="integration-card-switch" aria-label={t('启用规则：{p0}', { p0: item.name })}
          checked={item.enabled} disabled={disabled} onChange={e => update(item.id, { enabled: e.target.checked })}/></div>
        <div role="cell" className="rules-delete" onClick={e => e.stopPropagation()}>
          <IconButton name="trash" label={t('删除规则：{p0}', { p0: item.name })} disabled={disabled}
            onClick={() => onChange({ ...value, projects: value.projects.filter(entry => entry.id !== item.id) })}/></div>
      </div>)}
        {!visible.length && <div className="rules-empty" role="row"><div role="cell" aria-colspan={5}>
          <p>{value.projects.length ? '没有匹配的规则，试试其他名称或项目。' : '暂无规则。点击“添加规则”开始配置。'}</p>
          {value.projects.length > 0 && <button type="button" onClick={clear}>清空搜索</button>}
        </div></div>}
      </div>
    </div>
  </>;
}

/** 规则详情只提供内容，添加及已有规则均由设置的ModalFlow持有外层；
 *  属性显式列出而非继承列表组件的入参表：详情不需要 scope 选择属性。 */
export function ProjectRuleDetail({ rule, value, onChange, projects, disabled, renderMarkdown, saveStatus = '', saveError = '', saving = false, retry, savedValue }: {
  rule: ProjectRules['projects'][number]; value: ProjectRules; onChange(value: ProjectRules): void;
  projects: Project[]; disabled: boolean; renderMarkdown?(text: string): ReactNode;
  saveStatus?: string; saveError?: string; saving?: boolean; retry?(): void; savedValue?: ProjectRules;
}) {
  const update = (id: string, patch: RulePatch) => onChange(patchRule(value, id, patch));
  const names = (ids: string[]) => projectNames(projects, ids);
  const validation = projectRulesSchema.safeParse({ global: { enabled: false, content: '' }, projects: [rule] });
  const dirty = !validation.success || JSON.stringify(validation.data.projects[0]) !== JSON.stringify(savedValue?.projects.find(item => item.id === rule.id));
  const detailStatus = savedValue ? saveStateLabel(dirty, saving) : saveStatus;
  return <>
        <div className="rules-detail-status"><span role="status">{t('应用到 {p0} 个项目 · {p1} · {p2}', { p0: rule.projectIds.length, p1: rule.enabled ? t('启用') : t('停用'), p2: detailStatus })}</span>
          {saveError && <div className="rules-save-status"><span className="wb-warning" role="alert">{saveError}</span>
            {retry && <button type="button" disabled={saving || disabled} onClick={retry}>重试保存</button>}</div>}</div>
        <div className="rules-detail-single">
          <div className="rules-meta"><label className="field rules-name-field">规则名称<input className="settings-text-control" aria-label="规则名称"
            maxLength={100} value={rule.name} disabled={disabled} onChange={e => update(rule.id, { name: e.target.value })}/></label>
            <label className="rules-enable">启用此规则<input type="checkbox" className="integration-card-switch" checked={rule.enabled} disabled={disabled}
              onChange={e => update(rule.id, { enabled: e.target.checked })}/></label></div>
          <div className="field"><span>应用项目</span><div className="rules-binding">
            <Picker label="应用项目" value="" multipleValues={rule.projectIds} disabled={disabled}
              renderValue={() => t('选择项目 · 已选 {p0} 个', { p0: rule.projectIds.length })}
              options={[...projects.map(project => ({ value: project.projectId, label: project.title, description: project.path,
                disabled: !rule.projectIds.includes(project.projectId) && (project.archived || !project.available) })),
                ...rule.projectIds.filter(id => !projects.some(project => project.projectId === id)).map(id => ({ value: id, label: id, description: t('项目已移除，请取消选择') }))]}
              onChange={id => update(rule.id, { projectIds: rule.projectIds.includes(id) ? rule.projectIds.filter(item => item !== id) : [...rule.projectIds, id] })}/>
            <div className="rules-project-tags">{names(rule.projectIds).map((name, i) => <span key={rule.projectIds[i]} className="rules-project-tag">{name}</span>)}</div>
          </div></div>
          {validation && !validation.success && <p className="wb-warning" role="alert">{t('请检查规则名称、正文和适用项目')}</p>}
          <RulesEditor key={rule.id} label="项目规则正文" value={rule.content} disabled={disabled}
            onChange={content => update(rule.id, { content })} renderMarkdown={renderMarkdown}/>
        </div>
  </>;
}
