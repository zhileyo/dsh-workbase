import type { ClientPort, ComposerBridge, UiMemory } from './api.js';

/** 官方选择器已配置当前会话；发送时不再调用 selectModel 覆盖推理强度。 */
export async function submitNativeMessage(api: ClientPort, memory: UiMemory, bridge: Pick<ComposerBridge, 'sessionId' | 'submit'>, baseBranch?: string) {
  if (baseBranch && !await api.requestWorktree(bridge.sessionId, baseBranch)) throw new Error('工作树请求失败，请重试');
  if (!await bridge.submit()) return false;
  Object.assign(memory.composer, { nativeSessionId: '', nativeDraft: null, draft: '' });
  memory.save();
  return true;
}

/** 保存宿主返回的会话后再提交；失败重试保持同一消息的完整参数。 */
export async function launchMessage(api: ClientPort, memory: UiMemory, input: {
  projectId: string; preset: string; provider: string; model: string; text: string;
  baseBranch?: string; worktree?: boolean;
}, newId = () => crypto.randomUUID()) {
  if (!memory.composer.pending) {
    const requestId = newId();
    const created = await api.call({ op: 'begin-session', projectId: input.projectId, preset: input.preset }) as { sessionId: string };
    if (typeof created?.sessionId !== 'string' || !created.sessionId) throw new Error('宿主没有返回有效会话，请重试');
    // 勾选工作树：经官方 forgePanel 登记请求（基准分支），消息入队后由宿主在回合开始前创建工作树。
    if (input.worktree && input.baseBranch) {
      const ok = await api.requestWorktree(created.sessionId, input.baseBranch);
      if (!ok) throw new Error('当前宿主未启用工作树能力（experimental-forge-bundle），请检查插件设置后重试');
    }
    memory.composer.pending = {
      projectId: input.projectId, sessionId: created.sessionId, provider: input.provider,
      model: input.model, text: input.text, requestId,
    };
    memory.save();
  }
  const submission = memory.composer.pending!;
  await api.call({ op: 'submit-message', ...submission });
  memory.composer.pending = null;
  memory.composer.draft = '';
  memory.save();
  return submission.sessionId;
}
