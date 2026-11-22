import { useEffect, useState } from 'react';
import type { ExtensionConfig } from '../shared/extensions.js';
import type { Command } from '../shared/commands.js';
import { Picker } from './ui.js';
import { t } from './i18n.js';

interface Source { id: string; path: string; writable?: boolean; readonly?: boolean; scope?: string }
export type ExtensionTab = 'skills' | 'mcp' | 'rss';
export function ExtensionSettings({ value, onChange, disabled, call, tab, onTabChange: setTab }: {
  value: ExtensionConfig; onChange(value: ExtensionConfig): void; disabled: boolean;
  tab: ExtensionTab; onTabChange(value: ExtensionTab): void;
  call?: (command: Command) => Promise<unknown>;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState('');
  const [sessionSupported, setSessionSupported] = useState(false);
  useEffect(() => {
    let active = true;
    if (call) {
      void call({ op: 'extensions', module: 'skills', method: 'snapshot' }).then(result => {
        if (!active) return;
        const state = result as { sources?: Source[] };
        setSources(Array.isArray(state.sources) ? state.sources : []);
      }).catch(err => { if (active) setError(err instanceof Error ? err.message : '无法读取安装位置'); });
      void call({ op: 'extensions', module: 'mcp', method: 'snapshot' }).then(result => {
        if (active) setSessionSupported((result as { capabilities?: { sessionIsolation?: boolean } }).capabilities?.sessionIsolation === true);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [call]);
  const writable = sources.filter(source => source.writable !== false && !source.readonly && source.scope !== 'project');
  const timeoutInvalid = !Number.isInteger(value.mcp.timeoutSeconds) || value.mcp.timeoutSeconds < 1 || value.mcp.timeoutSeconds > 300;
  const injectionHelp = `${t('仅用于新增连接，详情中可调整。')}${sessionSupported ? '' : ` ${t('宿主不支持会话隔离，暂不能按会话启用。')}`}`;
  useEffect(() => { if (timeoutInvalid) setTab('mcp'); }, [timeoutInvalid, setTab]);
  return <>
    <h3>扩展配置</h3><p className="dialog-description">设置新技能、连接器的默认值及订阅刷新频率。</p>
    <div className="settings-subtabs" role="tablist" aria-label="扩展配置分类">
      {(['skills', 'mcp', 'rss'] as const).map((key, i) => <button key={key} type="button" role="tab"
        id={`wb-extension-tab-${key}`} aria-controls={`wb-extension-panel-${key}`} aria-selected={tab === key}
        tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const options = ['skills', 'mcp', 'rss'] as const;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
          setTab(options[next]!);
          (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
        }}>{key === 'skills' ? '技能' : key === 'mcp' ? '连接器' : '订阅'}</button>)}
    </div>
    {error && <p role="alert" className="wb-warning">{error}</p>}
    <div className="settings-subpanel" id="wb-extension-panel-skills" role="tabpanel" aria-labelledby="wb-extension-tab-skills" hidden={tab !== 'skills'}>
      <div className="setting-row"><div><strong>默认安装位置</strong><small>仅用于新增全局技能；项目技能装入对应项目目录。</small></div>
        <Picker label="默认安装位置" value={value.skills.defaultSourceId} disabled={disabled || !writable.length}
          options={[{ value: '', label: '自动选择可写来源' }, ...writable.map(source => ({ value: source.id, label: source.path }))]}
          onChange={defaultSourceId => onChange({ ...value, skills: { ...value.skills, defaultSourceId } })}/></div>
      <label className="setting-row"><div><strong>新增技能默认启用</strong><small>适用于创建、安装和上传；优先采用 JSON 中的启用状态。</small></div>
        <input type="checkbox" checked={value.skills.defaultEnabled} disabled={disabled}
          onChange={event => onChange({ ...value, skills: { ...value.skills, defaultEnabled: event.target.checked } })}/></label>
    </div>
    <div className="settings-subpanel" id="wb-extension-panel-mcp" role="tabpanel" aria-labelledby="wb-extension-tab-mcp" hidden={tab !== 'mcp'}>
      <div className="setting-row"><div><strong>默认注入方式</strong><small className="settings-single-line" title={injectionHelp}>{injectionHelp}</small></div>
        <Picker label="默认注入方式" value={value.mcp.injection} disabled={disabled}
          options={[{ value: 'always', label: '始终注入' }, { value: 'session', label: '按会话启用', disabled: !sessionSupported }]}
          onChange={injection => onChange({ ...value, mcp: { ...value.mcp, injection: injection as 'always' | 'session' } })}/></div>
      <label className="setting-row"><div><strong>连接超时（秒）</strong><small>整数，范围1–300秒。</small></div>
        <input className="settings-text-control" aria-label="连接超时（秒）" name="extension-mcp-timeout" type="number" min={1} max={300} step={1} required
          aria-invalid={timeoutInvalid} value={Number.isFinite(value.mcp.timeoutSeconds) ? value.mcp.timeoutSeconds : ''}
          disabled={disabled} onChange={event => onChange({ ...value, mcp: { ...value.mcp, timeoutSeconds: event.target.valueAsNumber } })}/></label>
      {timeoutInvalid && <p className="wb-warning" role="alert">连接超时须为1–300秒整数。</p>}
      <label className="setting-row"><div><strong>断线自动重连</strong><small>仅用于新增连接，详情中可调整。</small></div>
        <input type="checkbox" checked={value.mcp.autoReconnect} disabled={disabled}
          onChange={event => onChange({ ...value, mcp: { ...value.mcp, autoReconnect: event.target.checked } })}/></label>
    </div>
    <div className="settings-subpanel" id="wb-extension-panel-rss" role="tabpanel" aria-labelledby="wb-extension-tab-rss" hidden={tab !== 'rss'}>
      <div className="setting-row"><div><strong>自动刷新频率</strong><small>后台仅刷新已启用订阅，暂停来源保留缓存。</small></div>
        <Picker label="自动刷新频率" value={String(value.rss.refreshMinutes)} disabled={disabled}
          options={[{ value: '0', label: '仅手动' }, { value: '15', label: '每15分钟' }, { value: '30', label: '每30分钟' }, { value: '60', label: '每小时' }]}
          onChange={refreshMinutes => onChange({ ...value, rss: { refreshMinutes: Number(refreshMinutes) as 0 | 15 | 30 | 60 } })}/></div>
    </div>
  </>;
}
