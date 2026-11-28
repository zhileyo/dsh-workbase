import { randomUUID } from 'node:crypto';
import { RSS_LIMITS, rssGroupNameReserved } from '../shared/rss.js';
import { previewOpml } from './rss-parser.js';
import { createFeed, uniqueName } from './rss-feeds.js';
import type { RssStoredState } from './rss-store.js';

export interface OpmlImportInput {
  text: string; defaultGroup: string;
  selected: number[]; trusted: boolean;
}

/** OPML 导入算法：保留名（默认分组／未分组／全部订阅）不新建分组，直接归入未分组。 */
export function importOpmlFeeds(state: RssStoredState, data: OpmlImportInput) {
  const preview = previewOpml(data.text, state.config.feeds, data.defaultGroup), selected = new Set(data.selected);
  if ([...selected].some(index => !preview.candidates.some(c => c.index === index))) throw new Error('OPML 候选已变化，请重新预览');
  let imported = 0, skipped = 0;
  for (const candidate of preview.candidates.filter(c => selected.has(c.index))) {
    if (candidate.error) throw new Error(candidate.error);
    if (candidate.duplicate) { skipped++; continue; }
    let groupId = '';
    // 不能因为 OPML 里出现系统分组名就让整批导入回滚。
    if (candidate.groupName && !rssGroupNameReserved(candidate.groupName)) {
      let group = state.config.groups.find(g => g.name === candidate.groupName);
      if (!group) {
        uniqueName(state, candidate.groupName);
        if (state.config.groups.length >= RSS_LIMITS.groups) throw new Error('分组数量超过上限');
        group = { id: randomUUID(), name: candidate.groupName, collapsed: false }; state.config.groups.push(group);
      }
      groupId = group.id;
    }
    createFeed(state, { name: candidate.name, url: candidate.url, groupId, enabled: true, trusted: data.trusted }); imported++;
  }
  return { imported, skipped };
}
