import { useEffect, useSyncExternalStore } from 'react';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { SpeechSessionWatch } from './speech-session.js';
import type { SpeechPlayback } from './speech-playback.js';
import { t } from './i18n.js';
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon } from './ui.js';
import { alwaysSpeechComponent } from './speech-component.js';

export function SpeechControl({ sessionId, sessions, playback, component = alwaysSpeechComponent }: {
  sessionId: SessionId; sessions: ISessions; playback: SpeechPlayback; component?: typeof alwaysSpeechComponent;
}) {
  const componentEnabled = useSyncExternalStore(component.subscribe, component.getSnapshot, component.getSnapshot);
  useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
  const enabled = playback.status.config.enabled;
  const playing = playback.isSessionPlaying(sessionId);
  useEffect(() => {
    if (!componentEnabled) return;
    let closed = false, unsubscribe: (() => void) | undefined;
    const watch = new SpeechSessionWatch(playback, sessionId);
    const reference = sessions.retain(sessionId, { source: 'workbaseSpeech' });
    void reference.ready.then(binding => {
      if (closed) return;
      watch.seed(binding.eventSource.getSnapshot().entries);
      let revision = binding.eventSource.getSnapshot().revision;
      unsubscribe = binding.eventSource.subscribe(() => {
        const window = binding.eventSource.getSnapshot();
        if (window.revision === revision) return;
        revision = window.revision;
        watch.change(window.change);
      });
    }).catch(() => { if (!closed) watch.dispose(); });
    return () => { closed = true; unsubscribe?.(); reference.release(); watch.dispose(); };
  }, [sessionId, sessions, playback, componentEnabled, enabled, playback.status.version]);
  if (!componentEnabled) return null;
  const label = enabled ? t('关闭自动播报') : t('启用自动播报');
  const reason = playback.error || playback.unavailableReason;
  return <Tooltip label={reason ? t(reason) : label} side="bottom" openOnClick={!!reason}>
    <Button variant="toolbar" size="sm" aria-label={label} aria-pressed={enabled}
      aria-busy={playback.saving} disabled={playback.saving}
      data-workbase-speech-auto data-enabled={enabled || undefined} data-playing={playing || undefined}
      style={enabled ? { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-interactive-bg-hover)' } : undefined}
      onClick={() => { void playback.toggleAutomatic(); }}><Icon name={enabled || playing ? 'speaker' : 'speaker-off'} size={16}/></Button>
  </Tooltip>;
}
