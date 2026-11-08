import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-workspace';
import { z } from 'zod';
import type { WorkbaseService } from './service.js';
import { WorkbaseError } from '../shared/model.js';

const createSchema = z.object({ title: z.string().trim().min(1).max(500), note: z.string().max(10000).optional() }).strict();
const updateSchema = z.object({
  id: z.string().min(1), expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(500).optional(), note: z.string().max(10000).optional(), done: z.boolean().optional(),
}).strict();
// 模型只接收宿主支持的JSON Schema子集；完整限制在execute中用Zod校验。
const createParameters = {
  type: 'object', properties: {
    title: { type: 'string', description: '非空标题，最多500字符' },
    note: { type: 'string', description: '备注，最多10000字符' },
  }, required: ['title'], additionalProperties: false,
};
const updateParameters = {
  type: 'object', properties: {
    id: { type: 'string' }, expectedVersion: { type: 'integer', description: '读取到的正整数version' },
    title: { type: 'string', description: '非空标题，最多500字符' },
    note: { type: 'string', description: '备注，最多10000字符' }, done: { type: 'boolean' },
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
      name: 'workbase_list_todos', description: '读取当前会话所属项目的待办，返回 projectId、任务ID及version。不能跨项目读取。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      async execute(args, exec) {
        z.object({}).strict().parse(args);
        return { data: JSON.stringify(await service.listForAgent(workspaceFor(exec), exec.signal)) };
      },
    },
    {
      name: 'workbase_create_todo', description: '在当前会话所属项目中创建待处理事项，创建者为Agent。',
      parameters: createParameters, output,
      async execute(args, exec) {
        const input = createSchema.parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal);
        return { data: JSON.stringify(await service.createTodo({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
    {
      name: 'workbase_update_todo', description: '编辑当前项目待办。先读取version并传expectedVersion；状态修改需项目授权，不提供删除。',
      parameters: updateParameters, output,
      async execute(args, exec) {
        const input = updateSchema.parse(args);
        const workspaceId = workspaceFor(exec);
        const current = await service.listForAgent(workspaceId, exec.signal);
        return { data: JSON.stringify(await service.updateTodo({ ...input, projectId: current.projectId }, { kind: 'agent', workspaceId }, exec.signal)) };
      },
    },
  ];
  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition));
}
