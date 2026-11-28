/** 技能与连接器的「应用范围」在表单里的两种表示之间的唯一转换处：
 *  存储形态是 { scope, projectIds }，选择器形态是字符串数组（'global' 与项目 id 混排，至少一项）。 */
export type ScopeValue = { scope?: 'global' | 'project'; projectIds?: string[] };

/** 表单 → 选择器：全局只给一项 'global'，项目范围直接列出项目 id。 */
export function toScopeValues(value: ScopeValue): string[] {
  return value.scope === 'global' ? ['global'] : value.projectIds ?? [];
}

/** 选择器 → 表单：只要含 'global' 就是全局，其余按项目 id 收进 projectIds。 */
export function toScope(values: readonly string[]): { scope: 'global' | 'project'; projectIds: string[] } {
  return { scope: values.includes('global') ? 'global' : 'project', projectIds: values.filter(id => id !== 'global') };
}
