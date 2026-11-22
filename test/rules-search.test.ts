import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterProjectRules } from '../src/client/ProjectRulesSettings.js';
import { emptyMark, type Project } from '../src/shared/model.js';

test('规则搜索按名称和项目多关键词匹配，支持大小写全半角和已移除项目', () => {
  const projects: Project[] = [{ projectId: 'p', title: 'Agent CLI', path: '/p', workspaceId: 'w', available: true,
    archived: false, todos: [], sessions: [], sessionIds: [], agentCanChangeStatus: true, mark: emptyMark(), updatedAt: 0 }];
  const rules = [{ id: 'a', name: 'Quality 检查', enabled: false, content: '正文秘密', projectIds: ['p'] },
    { id: 'b', name: '文档', enabled: false, content: '', projectIds: ['removed'] }];
  for (const [query, ids] of [
    ['', ['a', 'b']], ['   ', ['a', 'b']], ['QUALITY', ['a']], ['Ｑｕａｌｉｔｙ', ['a']],
    ['quality cli', ['a']], ['文档 removed', ['b']], ['quality 文档', []], ['正文秘密', []], ['不存在', []],
  ] as const) assert.deepEqual(filterProjectRules(rules, projects, query).map(rule => rule.id), ids);
});
