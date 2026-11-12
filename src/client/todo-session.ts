import type { Todo } from '../shared/model.js';
import { todoAttachments, type TodoImage, type TodoAttachment } from '../shared/todo.js';

export interface TodoSessionPort {
  read(image: TodoImage | TodoAttachment): Promise<Blob>;
  begin(): Promise<string>;
  draft(sessionId: string, text: string, files: readonly Blob[]): Promise<void>;
  open(sessionId: string): void;
}
/** 不提交消息；附件全部可读取后才创建会话，交接成功后才导航。 */
export async function prepareTodoSession(todo: Todo, port: TodoSessionPort) {
  const images = await Promise.all(todoAttachments(todo).map(async (attachment, index) => {
    const blob = await port.read(attachment);
    return new File([blob], 'name' in attachment ? attachment.name : `todo-${index + 1}`, { type: attachment.mediaType });
  }));
  const sessionId = await port.begin();
  const text = `待办任务：${todo.title}\n待办 ID：${todo.id}\n任务描述：\n${todo.note}\n\n请按上述要求处理此待办，并在验证完成后更新待办状态。`;
  await port.draft(sessionId, text, images);
  port.open(sessionId);
  return sessionId;
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
