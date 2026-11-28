import { useId, useState } from 'react';
import type { Command } from '../shared/commands.js';
import type { BackupPreferences, BackupStatus } from '../shared/backup.js';
import { DirectoryInput } from './DirectoryInput.js';
import type { RestoreStatus } from '../shared/restore.js';
import { RestoreExecutionStatus, RestoreSettings } from './RestoreSettings.js';
import { Picker } from './ui.js';
import { errorText, languageTag, statusText } from './i18n.js';
import { coverageItemLabel, coverageLabel } from './backup-labels.js';
import { useStatusPolling } from './panel-utils.js';
// 覆盖项中文标签已抽到 backup-labels.ts 与 RestoreSettings 共用；测试仍从本文件导入 coverageLabel。
export { coverageLabel };

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
  useStatusPolling(!!call && tab !== 'restore', async stopped => {
    // 恢复分类下由 RestoreSettings 自己轮询，两条常驻轮询不该同时跑。
    try {
      const result = await call!({ op: 'backup-status' }) as BackupStatus;
      const active = ['waiting', 'exporting', 'encrypting', 'verifying'].includes(result.phase);
      if (!stopped()) { setStatus(result); setError(''); }
      // 空闲期没有进度可追，长间隔待命即可；进行中才需要短间隔。
      return active ? 2000 : 15000;
    } catch (e) {
      if (!stopped()) setError(e instanceof Error ? e.message : '无法读取备份状态');
      return 15000;
    }
  }, [call, tab]);
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
      <small>下次启动生效；宿主就绪且空闲后备份一次。</small></div>
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
      <small>保存当前备份配置并开始备份，关闭设置后继续。</small></div>
      <button type="button" className="primary" disabled={disabled || starting || !!running || !value.directory.trim() || !call}
        onClick={() => { void start(); }}>{starting ? '正在启动…' : running ? '备份进行中…' : '立即备份'}</button></div>
    {error && <p id={`${errorId}-backup`} className="wb-warning" role="alert">{errorText(error)}</p>}
    <div className="settings-inline-note" style={{ overflowWrap: 'anywhere' }}>
      <p>密钥位置：{status?.keyPath ?? 'DSH 数据目录下的 backup/identity.txt（默认 ~/.dsh/backup/identity.txt）'}</p>
      <p>备份加密，密钥不在备份文件内，请单独保管。</p>
    </div>
    <p className="settings-inline-note">运行中文件不保证一致性；暂不含客户端草稿、自定义附件目录等。</p>
    </div>
    <div className="settings-subpanel" role="tabpanel" id="wb-settings-backup-panel-restore" aria-labelledby="wb-settings-backup-tab-restore" hidden={tab !== 'restore'}>
    <RestoreSettings call={call} disabled={disabled || starting || !!running} pickDirectory={pickDirectory}
      onPickingChange={onPickingChange} onBusyChange={onRestoreBusyChange} onRestored={onRestored}
      showStatus={false} onStatusChange={setRestoreStatus} paused={tab !== 'restore'}/>
    </div>
    <div className="settings-subpanel" role="tabpanel" id="wb-settings-backup-panel-status" aria-labelledby="wb-settings-backup-tab-status" hidden={tab !== 'status'}>
    <h3>备份状态</h3>
    {error && <p id={`${errorId}-status`} className="wb-warning" role="alert">{errorText(error)}</p>}
    {!status && <p className="settings-inline-note">{call ? '正在读取备份状态…' : '当前环境无法读取备份状态。'}</p>}
    {status && <div role="status" aria-live="polite" className="settings-inline-note">
      <p>{statusText(status.message)}</p>
      {status.completedAt && <p>最近执行：{new Date(status.completedAt).toLocaleString(languageTag())}</p>}
      {status.path && <p style={{ overflowWrap: 'anywhere' }}>保存位置：{status.path}</p>}
    </div>}
    {!!status?.coverage.length && <details><summary>查看覆盖明细（{status.coverage.length} 项）</summary>
      {status.coverage.map(item => <div key={item.id} className="setting-row wb-setting-row"><div>
        <strong>{coverageItemLabel(item.id)} · {coverageLabel[item.status]}</strong>
        <small>{errorText(item.message)}</small></div></div>)}</details>}
    <h3>恢复状态</h3>
    {call ? <RestoreExecutionStatus status={restoreStatus}/> : <p className="settings-inline-note">当前环境无法读取恢复状态。</p>}
    </div>
  </div>;
}
