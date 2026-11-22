import type { SpeechSave } from './speech-save.js';
import { errorText } from './i18n.js';
import { Picker } from './ui.js';
import { DEEPSEEK_TTS_ENDPOINT } from '../shared/speech.js';

export function SpeechSettings({ draft, disabled }: { draft: SpeechSave; disabled: boolean }) {
  const locked = disabled || draft.busy || !draft.status?.available;
  const official = draft.config.provider === 'deepseek';
  return <>
    {!draft.status && !draft.error && <p role="status">正在读取播报配置…</p>}
    {draft.status && !draft.status.available && <p className="wb-warning">官方凭据存储不可用，暂不能保存播报配置</p>}
    {draft.error && <p role="alert" className="wb-warning">{errorText(draft.error)}</p>}
    {draft.error && <button type="button" disabled={disabled || draft.busy} onClick={() => { void draft.load(); }}>放弃草稿并重新读取播报配置</button>}
    <label className="wb-setting-row setting-row"><div><strong>自动播报回复</strong><small>默认关闭；会话顶部喇叭切换自动播报，回复下方喇叭可手动重播。</small></div>
      <input type="checkbox" checked={draft.config.enabled} disabled={locked} onChange={e => { draft.config = { ...draft.config, enabled: e.target.checked }; draft.changed(); }}/></label>
    <label className="wb-setting-row setting-row"><div><strong>播报服务</strong></div>
      <Picker label="播报服务" value={draft.config.provider} disabled={locked} onChange={provider => {
        if (provider !== 'deepseek' && provider !== 'compatible') return;
        draft.config = { ...draft.config, provider, endpoint: provider === 'deepseek' ? DEEPSEEK_TTS_ENDPOINT
          : 'https://api.openai.com/v1/audio/speech', voice: provider === 'deepseek' ? 'stella' : 'alloy', model: 'tts-1', speed: 1 };
        draft.changed();
      }} options={[{ value: 'deepseek', label: 'DeepSeek TTS' }, { value: 'compatible', label: 'OpenAI TTS' }]}/></label>
    {official ? <>
      <label className="wb-setting-row setting-row"><div><strong>音色</strong></div>
        <Picker label="音色" value={draft.config.voice} disabled={locked}
          options={[{ value: 'stella', label: 'stella' }, { value: 'tide', label: 'tide' }]}
          onChange={voice => { draft.config = { ...draft.config, voice }; draft.changed(); }}/></label>
      <label className="wb-setting-row setting-row"><div><strong>过滤 Markdown</strong><small>过滤标记、链接和代码块，保留可朗读正文。</small></div>
        <input type="checkbox" checked={draft.config.filterMarkdown} disabled={locked}
          onChange={e => { draft.config = { ...draft.config, filterMarkdown: e.target.checked }; draft.changed(); }}/></label>
    </> : <>
    {(['endpoint', 'model', 'voice'] as const).map((field, i) => <label className="field" key={field}>
      <span>{['服务地址（完整 HTTPS 接口）', '语音模型', '音色'][i]}</span>
      <input type="text" disabled={locked} value={draft.config[field]} maxLength={field === 'endpoint' ? 2000 : 200}
        placeholder={field === 'endpoint' ? 'https://api.openai.com/v1/audio/speech' : undefined}
        onChange={e => { draft.config = { ...draft.config, [field]: e.target.value }; draft.changed(); }}/></label>)}
    <label className="field"><span>语速（0.25–4）</span><input type="number" min="0.25" max="4" step="0.25"
      disabled={locked} value={Number.isFinite(draft.config.speed) ? draft.config.speed : ''}
      onChange={e => { draft.config = { ...draft.config, speed: e.target.valueAsNumber }; draft.changed(); }}/></label>
    </>}
    <label className="field"><span>服务密钥</span><input type="password" autoComplete="new-password" value={draft.key} disabled={locked}
      maxLength={4000} placeholder={draft.hasSavedKey ? '已保存密钥；留空保留' : official ? '填写 DeepSeek API Key' : '未配置密钥；无认证服务可留空'}
      onChange={e => { draft.key = e.target.value; draft.changed(); }}/></label>
  </>;
}
