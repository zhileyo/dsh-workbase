import type { Todo } from '../shared/model.js';
import { todoAttachments, type TodoImage, type TodoAttachment } from '../shared/todo.js';

export interface TodoSessionPort {
  read(image: TodoImage | TodoAttachment): Promise<Blob>;
  begin(): Promise<string>;
  draft(sessionId: string, text: string, files: readonly Blob[]): Promise<void>;
  open(sessionId: string): void;
  validate?(sessionId: string): Promise<void>;
  signal?: AbortSignal;
}
export interface TodoSessionHandoff {
  sessionId?: string;
  drafted?: boolean;
  running?: Promise<string>;
}
const handoffs = new WeakMap<TodoSessionPort, Map<string, TodoSessionHandoff>>();
/** 不提交消息；附件全部可读取后才创建会话，交接成功后才导航。 */
export function prepareTodoSession(todo: Todo, port: TodoSessionPort, retained?: TodoSessionHandoff): Promise<string> {
  const tasks = handoffs.get(port) ?? new Map<string, TodoSessionHandoff>();
  handoffs.set(port, tasks);
  const key = JSON.stringify([todo.projectId, todo.id, todo.version]);
  const pending = retained ?? tasks.get(key) ?? {};
  if (!retained) tasks.set(key, pending);
  if (pending.running) return pending.running;
  const run = async () => {
  port.signal?.throwIfAborted();
  if (!pending.drafted) {
  const images = await Promise.all(todoAttachments(todo).map(async (attachment, index) => {
    const blob = await port.read(attachment);
    return new File([blob], 'name' in attachment ? attachment.name : `todo-${index + 1}`, { type: attachment.mediaType });
  }));
  port.signal?.throwIfAborted();
  pending.sessionId ??= await port.begin();
  port.signal?.throwIfAborted();
  await port.validate?.(pending.sessionId);
  port.signal?.throwIfAborted();
  const text = `待办任务：${todo.title}\n待办 ID：${todo.id}\n任务描述：\n${todo.note}\n\n请按上述要求处理此待办，并在验证完成后更新待办状态。`;
  await port.draft(pending.sessionId, text, images);
  pending.drafted = true;
  }
  const sessionId = pending.sessionId!;
  port.signal?.throwIfAborted();
  await port.validate?.(sessionId);
  port.signal?.throwIfAborted();
  port.open(sessionId);
  if (!retained) tasks.delete(key);
  return sessionId;
  };
  pending.running = run().finally(() => { pending.running = undefined; });
  return pending.running;
}
/** 等真实界面持有同一会话后释放临时引用，避免未挂载的输入壳被回收。 */
export function releaseAfterAdoption(reference: { release(): void }, info: {
  getSnapshot(): { referenceCount: number }; subscribe(listener: () => void): () => void;
}, onRelease: () => void = () => {}) {
  let released = false, unsubscribe: (() => void) | undefined;
  const release = () => {
    if (released) return;
    released = true; unsubscribe?.(); reference.release(); onRelease();
  };
  const check = () => { if (info.getSnapshot().referenceCount > 1) release(); };
  unsubscribe = info.subscribe(check);
  if (released) unsubscribe();
  else check();
  return release;
}
