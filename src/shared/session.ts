// 会话历史记录的纯函数提取；与 dsh-archive-manager 的正文识别规则一致：
// 只保留用户与助手的文本消息，工具输出、推理与插件注入不算正文。
export interface SessionExtractedMessage {
  seq: number; role: 'user' | 'assistant'; text: string; time: number;
}
export interface ConversationExtraction {
  messages: SessionExtractedMessage[];
}
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};
export const extractConversation = (records: readonly unknown[]): ConversationExtraction => {
  const messages: SessionExtractedMessage[] = [];
  for (const entry of records) {
    const record = asRecord(entry);
    const event = asRecord(record.type === 'event' ? record.event : record);
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue;
    const data = asRecord(event.data);
    const message = asRecord(data.message && typeof data.message === 'object' ? data.message : data);
    const role = event.type === 'user/message' ? 'user' : 'assistant';
    const source = asRecord(message.source);
    // 用户消息里来自插件或系统的注入不算用户正文。
    if (role === 'user' && source.kind && source.kind !== 'user') continue;
    const content = message.content;
    const text = typeof content === 'string' ? content
      : Array.isArray(content) ? content
        .filter(block => asRecord(block).type === 'text' && typeof asRecord(block).text === 'string')
        .map(block => asRecord(block).text as string).join('\n')
      : '';
    if (text.trim()) messages.push({
      seq: typeof event.seq === 'number' ? event.seq : messages.length,
      role, text: text.slice(0, 6000), time: typeof event.time === 'number' ? event.time : 0,
    });
  }
  return { messages };
};
