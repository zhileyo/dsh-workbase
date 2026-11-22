import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';
import type { RssManager } from './rss.js';
import { WorkbaseError } from '../shared/model.js';

const querySchema = z.object({
  feedId: z.string().min(1).max(200).optional(),
  groupId: z.string().max(200).optional(), query: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(2000).optional(),
}).strict();
const queryProperties = {
  feedId: { type: 'string' }, groupId: { type: 'string' }, query: { type: 'string' },
  limit: { type: 'integer', description: '1–100，默认100' }, offset: { type: 'integer' },
};
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
      parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
      async execute(args, execution) {
        scope(execution); z.object({}).strict().parse(args);
        const feeds = await rss.listFeeds();
        return { data: JSON.stringify(feeds.map(({ id, name, url, groupId, enabled, checkedAt, error }) =>
          ({ id, name, url, groupId, enabled, checkedAt, error }))) };
      } },
    { name: 'workbase_search_rss', description: '按标题、摘要及来源搜索已有文章缓存，可限制单源或分组。不会触发抓取或修改阅读状态。',
      parameters: { type: 'object', properties: queryProperties, additionalProperties: false }, output,
      async execute(args, execution) {
        scope(execution);
        const result = await rss.searchArticles(querySchema.parse(args));
        return { data: JSON.stringify({ ...result, articles: result.articles.map(({ body: _body, ...article }) => article) }) };
      } },
    { name: 'workbase_read_rss_article', description: '按缓存文章ID读取已清理正文；仅提供摘要时body为空，原文地址不会回退到RSS地址。',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output,
      async execute(args, execution) {
        scope(execution);
        const { id } = z.object({ id: z.string().min(1).max(200) }).strict().parse(args);
        return { data: JSON.stringify(await rss.readArticle(id)) };
      } },
    { name: 'workbase_read_rss_feed', description: '读取某个已订阅来源的缓存文章，不进行网络请求。',
      parameters: { type: 'object', properties: queryProperties, required: ['feedId'], additionalProperties: false }, output,
      async execute(args, execution) {
        scope(execution);
        return { data: JSON.stringify(await rss.searchArticles(querySchema.extend({ feedId: z.string().min(1).max(200) }).parse(args))) };
      } },
    { name: 'workbase_read_rss_incremental', description: '读取本会话及当前筛选范围尚未通过此工具返回的缓存文章。成功后仅推进本会话增量游标，不修改界面已读状态。',
      parameters: { type: 'object', properties: queryProperties, additionalProperties: false }, output,
      async execute(args, execution) {
        return { data: JSON.stringify(await rss.readIncremental({ ...querySchema.parse(args), scope: scope(execution) }, execution.signal)) };
      } },
  ];
  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition));
}
