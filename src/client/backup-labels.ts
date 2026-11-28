/** 备份覆盖项的中文名与状态标签：BackupSettings（状态页明细）与 RestoreSettings（预览明细）共用，
 *  避免同表两处维护。新增覆盖项时在此补一行。 */
export const coverageLabels: Record<string, string> = {
  workbase: '工作台状态', workspace: '项目与会话关联', sessions: '会话事件', 'sessions-history': '会话历史文件',
  'workbench-legacy': '旧工作台数据', 'archive-favorites': '归档收藏', 'archive-settings': '归档设置',
  'projection-cache': '会话缓存', 'projection-cache-legacy': '旧会话缓存', 'context-overview': '上下文概览',
  'image-objects': '图片对象', 'file-objects': '文件对象', 'file-reference-links': '附件路径',
  'attachment-request-cache': '附件请求缓存', 'attachment-references': '附件引用校验',
  profiles: '运行配置与插件', 'market-profile-state': '插件市场状态', 'market-build-markers': '插件构建记录',
  'agent-presets': 'Agent 预设', credentials: '凭据', 'legacy-settings': '旧配置',
  'remote-devices': '远端设备', 'skills-manager': '技能管理', 'dsh-user-skills': '用户技能',
  'shared-agent-skills': '公共技能', 'project-skills': '项目技能',
  'bili-config': 'Billion 配置', 'bili-data': 'Billion 数据', 'bili-sessions': 'Billion 会话库',
  'bili-ca': 'Billion 证书', 'bili-state': 'Billion 状态', 'bili-cache': 'Billion 缓存',
  'tui-state': '终端状态', 'pet-config-assets': '宠物设置与资源', 'pet-legacy': '旧宠物数据',
  'desktop-client': '桌面客户端草稿', 'pet-client': '宠物客户端状态', 'task-board': '任务看板',
  'skin-state': '皮肤状态', 'skin-resources': '皮肤资源', 'voice-models': '语音模型', 'recycle-bin-legacy': '旧回收记录',
};
export const coverageLabel = { verified: '已校验', observation: '运行中读取', absent: '未发现', unsupported: '未覆盖', error: '导出失败' };
/** project-skills-N 是按项目展开的动态覆盖项，按前缀生成名称；其余未知 id 回退显示原始标识。 */
export function coverageItemLabel(id: string) {
  return coverageLabels[id] ?? (id.startsWith('project-skills-') ? `项目技能 ${Number(id.slice(15)) + 1}` : id);
}
