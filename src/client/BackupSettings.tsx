import { useEffect, useId, useState } from 'react';
import type { Command } from '../shared/commands.js';
import type { BackupPreferences, BackupStatus } from '../shared/backup.js';
import { DirectoryInput } from './DirectoryInput.js';
import type { RestoreStatus } from '../shared/restore.js';
import { RestoreExecutionStatus, RestoreSettings } from './RestoreSettings.js';
import { Picker } from './ui.js';

const labels: Record<string, string> = {
  workbase: '工作台状态', workspace: '项目与会话关联', sessions: '会话事件', 'sessions-history': '会话历史文件',
  'workbench-legacy': '旧工作台数据', 'archive-favorites': '归档收藏', 'archive-settings': '归档设置',
  'projection-cache': '会话缓存', 'projection-cache-legacy': '旧会话缓存', 'context-overview': '上下文概览',
  'image-objects': '图片对象', 'file-objects': '文件对象', 'file-reference-links': '附件路径',
  'attachment-request-cache': '附件请求缓存', 'attachment-references': '附件引用校验',
  profiles: '运行配置与插件', 'market-profile-state': '插件市场状态', 'market-build-markers': '插件构建记录',
  'agent-presets': 'Agent 预设', credentials: '凭据', 'legacy-settings': '旧配置',
  'remote-devices': '远端设备', 'skills-manager': '技能管理', 'dsh-user-skills': '用户技能',
  'shared-agent-skills': '公共技能', 'project-skills': '项目技能',
  'bili-config': 'Billion 配置', 'bili-data': 'Billion 数据', 'bili-sessions': 'Billion 会话库',
  'bili-ca': 'Billion 证书', 'bili-state': 'Billion 状态', 'bili-cache': 'Billion 缓存',
  'tui-state': '终端状态', 'pet-config-assets': '宠物设置与资源', 'pet-legacy': '旧宠物数据',
  'desktop-client': '桌面客户端草稿', 'pet-client': '宠物客户端状态', 'task-board': '任务看板',
  'skin-state': '皮肤状态', 'skin-resources': '皮肤资源', 'voice-models': '语音模型', 'recycle-bin-legacy': '旧回收记录',
};
const coverageLabel = { verified: '已校验', observation: '观察副本', absent: '未发现', unsupported: '未覆盖', error: '导出失败' };
export function BackupSettings({ tab = 'backup', value, onChange, call, pickDirectory, disabled, onPickingChange, onRestoreBusyChange, onRestored }: {
  tab?: 'backup' | 'restore' | 'status';
  value: BackupPreferences; onChange(value: BackupPreferences): void;
  call?(command: Command): Promise<unknown>; pickDirectory(): Promise<string | null>;
  disabled: boolean; onPickingChange?(value: boolean): void;
  onRestoreBusyChange?(value: boolean): void; onRestored?(): void;
}) {
  const [status, setStatus] = useState<BackupStatus>();
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>();
  const [error, setError] = useState('');
  const errorId = useId();
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!call) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await call({ op: 'backup-status' }) as BackupStatus;
        if (!stopped) { setStatus(result); setError(''); }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : '无法读取备份状态'); }
      if (!stopped) timer = setTimeout(() => { void refresh(); }, 2000);
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [call]);
  const running = status && ['waiting', 'exporting', 'encrypting', 'verifying'].includes(status.phase);
  const start = async () => {
    if (!call || starting) return;
    setStarting(true); setError('');
    try {
      await call({ op: 'preferences', patch: { backup: { ...value, directory: value.directory.trim() } } });
      setStatus(await call({ op: 'backup-start' }) as BackupStatus);
    } catch (e) { setError(e instanceof Error ? e.message : '无法开始备份'); }
    finally { setStarting(false); }
  };
  return <div className="wb-backup-settings">
    <div className="settings-subpanel" role="tabpanel" id="wb-settings-backup-panel-backup" aria-labelledby="wb-settings-backup-tab-backup" hidden={tab !== 'backup'}>
    <label className="wb-setting-row setting-row"><div><strong>启动时自动备份</strong>
      <small>保存后下次启动生效；每次宿主启动就绪并空闲后执行一次。</small></div>
      <input type="checkbox" aria-label="启动时自动备份" checked={value.autoOnStartup} disabled={disabled || starting}
        onChange={e => onChange({ ...value, autoOnStartup: e.target.checked })}/></label>
    <DirectoryInput label="备份目录" value={value.directory} onChange={directory => onChange({ ...value, directory })}
      pickDirectory={pickDirectory} disabled={disabled || starting} onPickingChange={onPickingChange} describedBy={error ? `${errorId}-backup` : undefined}/>
    <div className="wb-setting-row setting-row"><div><strong>备份保留期限</strong>
      <small>新备份成功后清理过期备份；回滚副本始终保留。</small></div>
      <Picker label="备份保留期限" value={String(value.retentionDays)} disabled={disabled || starting} describedBy={error ? `${errorId}-backup` : undefined}
        options={[{ value: '7', label: '7 天' }, { value: '14', label: '14 天' }, { value: '30', label: '30 天' }, { value: '0', label: '永久' }]}
        onChange={days => onChange({ ...value, retentionDays: Number(days) as BackupPreferences['retentionDays'] })}/></div>
    <div className="wb-setting-row setting-row"><div><strong>立即备份</strong>
      <small>后台执行，关闭设置后继续。将保存当前备份配置。</small></div>
      <button type="button" className="primary" disabled={disabled || starting || !!running || !value.directory.trim() || !call}
        onClick={() => { void start(); }}>{starting ? '正在启动…' : running ? '备份进行中…' : '立即备份'}</button></div>
    {error && <p id={`${errorId}-backup`} className="wb-warning" role="alert">{error}</p>}
    <div className="settings-inline-note" style={{ overflowWrap: 'anywhere' }}>
      <p>密钥位置：{status?.keyPath ?? 'DSH 数据目录下的 backup/identity.txt（默认 ~/.dsh/backup/identity.txt）'}</p>
      <p>首次备份时生成，恢复自动使用当前宿主密钥。密钥不在备份文件内，请单独妥善保管。</p>
    </div>
    <p className="settings-inline-note">备份会加密保存。运行中文件为观察副本；客户端草稿、自定义附件根等范围尚未覆盖。</p>
    </div>
    <div className="settings-subpanel" role="tabpanel" id="wb-settings-backup-panel-restore" aria-labelledby="wb-settings-backup-tab-restore" hidden={tab !== 'restore'}>
    <RestoreSettings call={call} disabled={disabled || starting || !!running} pickDirectory={pickDirectory}
      onPickingChange={onPickingChange} onBusyChange={onRestoreBusyChange} onRestored={onRestored}
      showStatus={false} onStatusChange={setRestoreStatus}/>
    </div>
    <div className="settings-subpanel" role="tabpanel" id="wb-settings-backup-panel-status" aria-labelledby="wb-settings-backup-tab-status" hidden={tab !== 'status'}>
    <h3>备份状态</h3>
    {error && <p id={`${errorId}-status`} className="wb-warning" role="alert">{error}</p>}
    {!status && <p className="settings-inline-note">{call ? '正在读取备份状态…' : '当前环境无法读取备份状态。'}</p>}
    {status && <div role="status" aria-live="polite" className="settings-inline-note">
      <p>{status.message}</p>
      {status.completedAt && <p>最近执行：{new Date(status.completedAt).toLocaleString()}</p>}
      {status.path && <p style={{ overflowWrap: 'anywhere' }}>保存位置：{status.path}</p>}
    </div>}
    {!!status?.coverage.length && <details><summary>查看覆盖明细（{status.coverage.length} 项）</summary>
      {status.coverage.map(item => <div key={item.id} className="setting-row wb-setting-row"><div>
        <strong>{labels[item.id] ?? (item.id.startsWith('project-skills-') ? `项目技能 ${Number(item.id.slice(15)) + 1}` : item.id)} · {coverageLabel[item.status]}</strong>
        <small>{item.message}</small></div></div>)}</details>}
    <h3>恢复状态</h3>
    {call ? <RestoreExecutionStatus status={restoreStatus}/> : <p className="settings-inline-note">当前环境无法读取恢复状态。</p>}
    </div>
  </div>;
}
