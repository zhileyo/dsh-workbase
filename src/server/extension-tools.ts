import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import type { RssManager } from './rss.js';
import { WorkbaseError } from '../shared/model.js';

/** 长度与数值边界进不了宿主声明（子集只收 type／description 等），边界随 description 一起写在校验处，避免两份声明漂移。 */
const boundedId = z.string().min(1).max(200).describe('ID，最长 200 字符');
const querySchema = z.object({
  feedId: boundedId.optional(),
  groupId: z.string().max(200).describe('分组，最长 200 字符').optional(),
  query: z.string().max(500).describe('关键词，最长 500 字符').optional(),
  limit: z.number().int().min(1).max(100).describe('1–100，默认100').optional(),
  offset: z.number().int().min(0).max(2000).describe('0–2000').optional(),
}).strict();
const emptySchema = z.object({}).strict();
const articleSchema = z.object({ id: boundedId }).strict();
const feedQuerySchema = querySchema.extend({ feedId: boundedId });
/** 宿主只接受 JsonSchemaNode 的关键字子集，多余关键字会让注册被拒；因此声明由唯一真源 zod 收窄生成，不再手写第二份。 */
const supportedKeys = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items',
  'enum', 'const', 'description', 'title', 'default', 'examples']);
function hostSchema(schema: z.ZodObject<z.ZodRawShape>): ToolDefinition['parameters'] {
  const { $schema: _schema, ...generated } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  const narrow = (node: unknown): Record<string, unknown> => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return {};
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => supportedKeys.has(key)
      ? [[key, key === 'properties' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, narrow(child)]))
        : key === 'items' ? narrow(value) : value]]
      : []));
  };
  return narrow(generated) as ToolDefinition['parameters'];
}
const output: ToolDefinition['output'] = {
  schema: { type: 'object', properties: { data: { type: 'string' } }, required: ['data'], additionalProperties: false },
  render: (_args, value) => [{ type: 'text', text: (value as { data: string }).data }],
};
/** 仅注册缓存读取工具；待办授权不扩展为订阅修改、文件导出或网络抓取授权。 */
export function registerExtensionTools(ctx: Context, rss: Pick<RssManager, 'listFeeds' | 'searchArticles' | 'readArticle' | 'readIncremental'>) {
  const scope = (execution: ToolRunContext) => {
    execution.signal.throwIfAborted();
    const id = execution.agent?.session.id;
    if (!id) throw new WorkbaseError('forbidden', '工具必须由当前会话的 Agent 调用');
    return `session:${String(id)}`;
  };
  const definitions: ToolDefinition[] = [
    { name: 'workbase_list_rss', description: '读取工作台自有RSS订阅配置及状态，不抓取、不修改订阅。',
      parameters: hostSchema(emptySchema), output,
      async execute(args, execution) {
        scope(execution); emptySchema.parse(args);
        const feeds = await rss.listFeeds();
        return { data: JSON.stringify(feeds.map(({ id, name, url, groupId, enabled, checkedAt, error }) =>
          ({ id, name, url, groupId, enabled, checkedAt, error }))) };
      } },
    { name: 'workbase_search_rss', description: '按标题、摘要及来源搜索已有文章缓存，可限制单源或分组。不会触发抓取或修改阅读状态。',
      parameters: hostSchema(querySchema), output,
      async execute(args, execution) {
        scope(execution);
        const result = await rss.searchArticles(querySchema.parse(args));
        return { data: JSON.stringify({ ...result, articles: result.articles.map(({ body: _body, ...article }) => article) }) };
      } },
    { name: 'workbase_read_rss_article', description: '按缓存文章ID读取已清理正文；仅提供摘要时body为空，原文地址不会回退到RSS地址。',
      parameters: hostSchema(articleSchema), output,
      async execute(args, execution) {
        scope(execution);
        const { id } = articleSchema.parse(args);
        return { data: JSON.stringify(await rss.readArticle(id)) };
      } },
    { name: 'workbase_read_rss_feed', description: '读取某个已订阅来源的缓存文章，不进行网络请求。',
      parameters: hostSchema(feedQuerySchema), output,
      async execute(args, execution) {
        scope(execution);
        return { data: JSON.stringify(await rss.searchArticles(feedQuerySchema.parse(args))) };
      } },
    { name: 'workbase_read_rss_incremental', description: '读取本会话及当前筛选范围尚未通过此工具返回的缓存文章。成功后仅推进本会话增量游标，不修改界面已读状态。',
      parameters: hostSchema(querySchema), output,
      async execute(args, execution) {
        return { data: JSON.stringify(await rss.readIncremental({ ...querySchema.parse(args), scope: scope(execution) }, execution.signal)) };
      } },
  ];
  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition));
}
