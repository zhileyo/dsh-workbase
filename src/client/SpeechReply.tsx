import { useSyncExternalStore } from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon } from './ui.js';
import type { SpeechPlayback } from './speech-playback.js';
import { t } from './i18n.js';
import { alwaysSpeechComponent } from './speech-component.js';

export function SpeechReply({ sessionId, messageId, playback, component = alwaysSpeechComponent }: {
  sessionId: string; messageId: string; playback: SpeechPlayback; component?: typeof alwaysSpeechComponent;
}) {
  const componentEnabled = useSyncExternalStore(component.subscribe, component.getSnapshot, component.getSnapshot);
  useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
  if (!componentEnabled || !playback.reply(sessionId, messageId)) return null;
  const playing = playback.isReplyPlaying(sessionId, messageId);
  const label = t(playing ? '停止播报' : '重播回复');
  const reason = playback.error || playback.unavailableReason;
  return <Tooltip label={reason ? t(reason) : label} side="bottom" openOnClick={!!playback.unavailableReason}>
    <button type="button" className="wb-speech-reply" aria-label={label} aria-pressed={playing}
      aria-disabled={!!playback.unavailableReason || undefined}
      data-unavailable={!!playback.unavailableReason || undefined}
      onClick={() => {
        if (playing) playback.stop();
        else if (!playback.unavailableReason) playback.replayReply(sessionId, messageId);
      }}><Icon name="speaker"/></button>
  </Tooltip>;
}
