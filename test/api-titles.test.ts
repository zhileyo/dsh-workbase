import assert from 'node:assert/strict';
import test from 'node:test';
import { readSnapshot } from '../src/client/api.js';
import { setLanguage } from '../src/client/i18n.js';

const snapshotWith = (projectTitle: string, sessionTitle: string) => ({
  revision: 1,
  projects: [{
    projectId: 'p1', workspaceId: 'w1', title: projectTitle, path: '/projects/p1',
    available: true, archived: false, agentCanChangeStatus: false, updatedAt: 1,
    sessions: [{
      sessionId: 's1', title: sessionTitle, updatedAt: 1, archived: false, running: false,
    }],
    todos: [], mark: {},
  }],
  conflicts: [{ projectId: 'p2', workspaceId: 'w2', path: '/projects/p2', title: projectTitle }],
  preferences: {}, sessionMarks: {}, syncedAt: 1,
});

const port = (snapshot: unknown) => ({ call: async () => snapshot }) as never;

test('宿主给的中文兜底标题按当前界面语言翻译，用户自己的标题原样保留', async () => {
  setLanguage('en');
  try {
    const translated = await readSnapshot(port(snapshotWith('默认工作区', '未命名会话')));
    assert.equal(translated.projects[0]!.title, 'Default workspace');
    assert.equal(translated.projects[0]!.sessions[0]!.title, 'Untitled session');
    assert.equal(translated.conflicts[0]!.title, 'Default workspace');

    const own = await readSnapshot(port(snapshotWith('我的项目', '修右栏标题')));
    assert.equal(own.projects[0]!.title, '我的项目', '项目自己的标题不参与翻译');
    assert.equal(own.projects[0]!.sessions[0]!.title, '修右栏标题', '会话标题同理');
    assert.equal(own.conflicts[0]!.title, '我的项目');
  } finally {
    setLanguage('zh');
  }
  const chinese = await readSnapshot(port(snapshotWith('默认工作区', '新会话')));
  assert.equal(chinese.projects[0]!.title, '默认工作区', '中文界面保持宿主原文');
  assert.equal(chinese.projects[0]!.sessions[0]!.title, '新会话');
});
