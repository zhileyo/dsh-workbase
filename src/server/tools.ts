import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-workspace';
import { z } from 'zod';
import type { WorkbaseService } from './service.js';
import { WorkbaseError } from '../shared/model.js';
import { prioritySchema, todoFilterSchema, todoImageSchema, todoAttachmentSchema, MAX_TODO_ATTACHMENT_BYTES, type TodoImage, type TodoAttachment } from '../shared/todo.js';
import { SessionId } from '@deepseek-ai/dsh-session';
import { AttachmentId, type ImageAttachmentRef, type FileAttachmentRef } from '@deepseek-ai/dsh-attachment';

const createSchema = z.object({ title: z.string().trim().min(1).max(500), note: z.string().max(10000).optional(), priority: prioritySchema.optional() }).strict();
const updateSchema = z.object({
  id: z.string().min(1), expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(500).optional(), note: z.string().max(10000).optional(), done: z.boolean().optional(),
  priority: prioritySchema.optional(),
}).strict();
const deleteSchema = z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive() }).strict();
const priorityParameter = { oneOf: [
  { type: 'string', enum: ['high', 'medium', 'low'] }, { type: 'null' },
], description: '高／中／低；null表示未设置或清空优先级' };
// 模型只接收宿主支持的JSON Schema子集；完整限制在execute中用Zod校验。
const createParameters = {
  type: 'object', properties: {
    title: { type: 'string', description: '非空标题，最多500字符' },
    note: { type: 'string', description: '备注，最多10000字符' },
    priority: priorityParameter,
  }, required: ['title'], additionalProperties: false,
};
const updateParameters = {
  type: 'object', properties: {
    id: { type: 'string' }, expectedVersion: { type: 'integer', description: '读取到的正整数version' },
    title: { type: 'string', description: '非空标题，最多500字符' },
    note: { type: 'string', description: '备注，最多10000字符' }, done: { type: 'boolean' },
    priority: priorityParameter,
  }, required: ['id', 'expectedVersion'], additionalProperties: false,
};
const output: ToolDefinition['output'] = {
  schema: { type: 'object', properties: { data: { type: 'string' } }, required: ['data'], additionalProperties: false },
  render: (_args, value) => [{ type: 'text', text: (value as { data: string }).data }],
};
export function registerTools(ctx: Context, service: WorkbaseService) {
  const workspaceFor = (exec: ToolRunContext) => {
    exec.signal.throwIfAborted();
    const sessionId = exec.agent?.session.id;
    if (!sessionId) throw new WorkbaseError('forbidden', '工具必须由当前会话的 Agent 调用');
    const workspace = ctx.workspaceRegistry.list().find(w => w.sessionIds.includes(sessionId));
    if (!workspace) throw new WorkbaseError('binding-unavailable', '当前会话未关联已注册项目');
    return workspace.id;
  };
  const definitions: ToolDefinition[] = [
    {
      name: 'workbase_list_todos', description: '读取当前项目待办。summary=true仅返回摘要（不含备注、图片引用），适合先查重和选择任务；需要完整内容时调用 workbase_get_todo。可按status、query（标题和备注）、priority筛选；无参数沿用完整返回。不能跨项目读取。',
      parameters: { type: 'object', properties: {
        summary: { type: 'boolean' }, status: { type: 'string', enum: ['all', 'pending', 'done'] },
        query: { type: 'string' }, priority: priorityParameter,
      }, additionalProperties: false }, output,
      async execute(args, exec) {
        const filter = todoFilterSchema.parse(args);
        return { data: JSON.stringify(await service.listForAgent(workspaceFor(exec), exec.signal, filter)) };
      },
    },
    {
      name: 'workbase_get_todo', description: '读取当前项目单项待办的完整备注、优先级、图片与通用附件引用和最新version；读附件用workbase_read_todo_attachment，旧图片也可用workbase_read_todo_image。',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output,
      async execute(args, exec) {
        const { id } = z.object({ id: z.string().min(1) }).strict().parse(args);
        return { data: JSON.stringify(await service.getForAgent(workspaceFor(exec), id, exec.signal)) };
      },
    },
    {
      name: 'workbase_attach_todo_attachment', description: '将当前会话消息中已有的通用file附件引用附到当前项目待办，不限制文件格式。只接受attachmentId，不接受路径或URL；先读取最新version，需开启Agent管理待办。图片块沿用workbase_attach_todo_image。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, attachmentId: { type: 'string' } },
        required: ['id', 'expectedVersion', 'attachmentId'], additionalProperties: false }, output,
      async execute(args, exec) {
        const input = deleteSchema.extend({ attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec), current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        return { data: JSON.stringify(await service.attachTodoAttachment({ ...input, projectId: current.projectId }, async () => {
          let beforeSeq: number | undefined;
          for (let page = 0; page < 100; page++) {
            exec.signal.throwIfAborted();
            const history = await ctx.sessionController.page({ address: { kind: 'session', sessionId: SessionId(exec.agent!.session.id) },
              maxMessages: 100, ...(beforeSeq === undefined ? {} : { beforeSeq }) }, exec.signal);
            const found = sessionFile(history.records, input.attachmentId);
            if (found) {
              let bytes = 0;
              for await (const chunk of ctx.attachments.readFileStream({
                attachmentId: AttachmentId(found.attachmentId), name: found.name, bytes: found.bytes,
              }, exec.signal)) {
                bytes += chunk.length;
                if (bytes > MAX_TODO_ATTACHMENT_BYTES) throw new WorkbaseError('invalid', '附件不能超过10MiB');
              }
              if (bytes !== found.bytes) throw new WorkbaseError('invalid', '附件长度校验失败');
              return found;
            }
            if (!history.hasMore) break;
            const seqs = history.records.map(r => (r as unknown as { event?: { seq?: number }; seq?: number }).event?.seq
              ?? (r as unknown as { seq?: number }).seq).filter((seq): seq is number => typeof seq === 'number');
            const next = Math.min(...seqs);
            if (!Number.isFinite(next) || beforeSeq !== undefined && next >= beforeSeq) break;
            beforeSeq = next;
          }
          throw new WorkbaseError('forbidden', '当前会话消息中没有此文件引用');
        }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_remove_todo_attachment', description: '移除当前项目待办的附件引用（包括旧图片），不删除共享文件对象。需开启Agent管理待办并传最新version。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, attachmentId: { type: 'string' } },
        required: ['id', 'expectedVersion', 'attachmentId'], additionalProperties: false }, output,
      async execute(args, exec) {
        const input = deleteSchema.extend({ attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec), current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        return { data: JSON.stringify(await service.removeTodoAttachment({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_read_todo_attachment', description: '读取当前项目待办已保存的通用附件或旧图片；先用workbase_get_todo取得attachmentId。文件以宿主只读文件引用返回，由宿主提供读取能力，不允许读取未附到该待办的文件。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, attachmentId: { type: 'string' } },
        required: ['id', 'attachmentId'], additionalProperties: false },
      output: {
        schema: { type: 'object', properties: { attachment: { type: 'object' }, message: { type: 'string' } }, required: ['attachment', 'message'], additionalProperties: false },
        render: (_args, value) => {
          const result = value as unknown as { attachment: TodoAttachment | TodoImage; message: string };
          return [{ type: 'text', text: result.message }, 'width' in result.attachment
            ? { type: 'image', attachment: result.attachment as ImageAttachmentRef }
            : { type: 'file', attachment: { attachmentId: AttachmentId(result.attachment.attachmentId), name: result.attachment.name, bytes: result.attachment.bytes } as FileAttachmentRef }];
        },
      },
      async execute(args, exec) {
        const input = z.object({ id: z.string().min(1), attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec), current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        const { attachment } = await service.readAttachment({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal);
        return { attachment, message: '待办附件' };
      },
    },
    {
      name: 'workbase_attach_todo_image', description: '将当前会话消息中已有的图片引用附到当前项目待办。只接收图片attachmentId，不接受路径、URL或跨会话标识；先读取最新version。需开启Agent管理待办。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, attachmentId: { type: 'string' } },
        required: ['id', 'expectedVersion', 'attachmentId'], additionalProperties: false }, output,
      async execute(args, exec) {
        const input = deleteSchema.extend({ attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        return { data: JSON.stringify(await service.attachTodoImage({ ...input, projectId: current.projectId }, async () => {
          // attachment()只核验存储引用，SDK不会核验它是否属于会话，所以先读本会话消息。
          let beforeSeq: number | undefined;
          for (let page = 0; page < 100; page++) {
            exec.signal.throwIfAborted();
            const history = await ctx.sessionController.page({ address: { kind: 'session', sessionId: SessionId(exec.agent!.session.id) },
              maxMessages: 100, ...(beforeSeq === undefined ? {} : { beforeSeq }) }, exec.signal);
            const found = sessionImage(history.records, input.attachmentId);
            if (found) {
              await ctx.sessionController.attachment({ sessionId: SessionId(exec.agent!.session.id), attachment: found as ImageAttachmentRef });
              return found;
            }
            if (!history.hasMore) break;
            const seqs = history.records.map(r => (r as unknown as { event?: { seq?: number }; seq?: number }).event?.seq
              ?? (r as unknown as { seq?: number }).seq).filter((seq): seq is number => typeof seq === 'number');
            const next = Math.min(...seqs);
            if (!Number.isFinite(next) || beforeSeq !== undefined && next >= beforeSeq) break;
            beforeSeq = next;
          }
          throw new WorkbaseError('forbidden', '当前会话消息中没有此图片引用');
        }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_remove_todo_image', description: '移除当前项目待办的图片引用，不删除共享图片对象。需开启Agent管理待办并传最新version。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, attachmentId: { type: 'string' } },
        required: ['id', 'expectedVersion', 'attachmentId'], additionalProperties: false }, output,
      async execute(args, exec) {
        const input = deleteSchema.extend({ attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec), current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        return { data: JSON.stringify(await service.removeTodoImage({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_read_todo_image', description: '查看当前项目待办已有的图片；先用workbase_get_todo取得attachmentId。不允许读取未附到该待办的图片。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, attachmentId: { type: 'string' } },
        required: ['id', 'attachmentId'], additionalProperties: false },
      output: {
        schema: { type: 'object', properties: { image: { type: 'object' }, message: { type: 'string' } }, required: ['image', 'message'], additionalProperties: false },
        render: (_args, value) => {
          const result = value as unknown as { image: ImageAttachmentRef; message: string };
          return [{ type: 'text', text: result.message }, { type: 'image', attachment: result.image }];
        },
      },
      async execute(args, exec) {
        const input = z.object({ id: z.string().min(1), attachmentId: z.string().min(1).max(200) }).strict().parse(args);
        const workspaceId = workspaceFor(exec), current = await service.listForAgent(workspaceId, exec.signal, { summary: true });
        const result = await service.readImage({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal);
        return { image: result.image, message: '待办图片' };
      },
    },
    {
      name: 'workbase_create_todo', description: '在当前会话所属项目中创建待处理事项，创建者为Agent。处理需要持续跟踪的多步骤任务时，先调用 workbase_list_todos 查询已有待办，避免重复创建，并优先更新已有任务；将尚未完成、可独立交付的步骤逐项记录为待办，在备注中说明背景、实施步骤和验收标准。执行后调用 workbase_update_todo 更新任务内容，验证完成后再标记为已完成；更新前读取最新 version 并传 expectedVersion。创建和更新均需开启全局 Agent 管理待办。',
      parameters: createParameters, output,
      async execute(args, exec) {
        const input = createSchema.parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal);
        return { data: JSON.stringify(await service.createTodo({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_update_todo', description: '编辑当前项目待办。先读取version并传expectedVersion；写入需开启全局 Agent 管理待办，旧项目状态限制仍由服务校验。',
      parameters: updateParameters, output,
      async execute(args, exec) {
        const input = updateSchema.parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal);
        return { data: JSON.stringify(await service.updateTodo({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_delete_todo', description: '删除当前项目待办。需开启全局 Agent 管理待办；先读取version并传expectedVersion，不能跨项目删除。',
      parameters: {
        type: 'object', properties: { id: { type: 'string' }, expectedVersion: { type: 'integer', description: '读取到的正整数version' } },
        required: ['id', 'expectedVersion'], additionalProperties: false,
      }, output,
      async execute(args, exec) {
        const input = deleteSchema.parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal);
        return { data: JSON.stringify(await service.deleteTodo({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
  ];
  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition));
}
/** 只从消息的 image 内容块提取引用，忽略工具参数与任意文本里的伪造引用。 */
export function sessionImage(records: readonly unknown[], id: string): TodoImage | null {
  for (const item of records) {
    const record = item as { type?: string; event?: unknown };
    const event = (record.type === 'event' ? record.event : record) as { type?: string; data?: { message?: { content?: unknown }; content?: unknown } };
    if (!event || !['user/message', 'assistant/message'].includes(event.type ?? '')) continue;
    const content = event.data?.message?.content ?? event.data?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'image' || block.attachment?.attachmentId !== id) continue;
      const ref = block.attachment;
      const parsed = todoImageSchema.safeParse({ attachmentId: ref.attachmentId, mediaType: ref.mediaType,
        bytes: ref.bytes, width: ref.width, height: ref.height });
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}
/** 文件引用只来自真实消息块，不解释文件名为路径，不从工具参数或文本提取。 */
export function sessionFile(records: readonly unknown[], id: string): TodoAttachment | null {
  for (const item of records) {
    const record = item as { type?: string; event?: unknown };
    const event = (record.type === 'event' ? record.event : record) as { type?: string; data?: { message?: { content?: unknown }; content?: unknown } };
    if (!event || !['user/message', 'assistant/message'].includes(event.type ?? '')) continue;
    const content = event.data?.message?.content ?? event.data?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'file' || block.attachment?.attachmentId !== id) continue;
      const parsed = todoAttachmentSchema.safeParse({ ...block.attachment, mediaType: 'application/octet-stream' });
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}
