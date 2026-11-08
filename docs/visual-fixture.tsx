// 仅用于同数据视觉比较；加载实际 React 组件，不调用宿主或模型。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workbase } from '../src/client/Workbase.js';
import { UiMemory } from '../src/client/api.js';
import { initialState, type Snapshot } from '../src/shared/model.js';
import '../src/client/prototype.css';
import '../src/client/styles.css';

const data = (window as any).visualData;
const preferences = initialState().preferences;
const homeDefaults = preferences.home;
Object.assign(preferences, data.preferences);
// fixture 数据可只写差异字段，statCards 等新增键回退到初始默认。
preferences.home = { ...homeDefaults, ...data.preferences.home };
let snapshot: Snapshot = {
  revision: 1, syncedAt: Date.now(), conflicts: [], sessionMarks: {}, preferences,
  projects: data.projects.map((p: any) => ({
    projectId: p.id, workspaceId: p.id, title: p.name, path: p.path, available: !p.missing,
    agentCanChangeStatus: p.allowAgent, updatedAt: p.updatedAt,
    mark: { pinned: !!p.pinned, favorite: !!p.favorite }, sessionIds: p.sessions.map((s: any) => s.id),
    archived: !!p.archived,
    sessions: p.sessions.map((s: any, i: number) => ({
      sessionId: s.id, title: s.title, updatedAt: s.updatedAt,
      archived: !!s.archived, running: !!s.running,
    })),
    todos: p.todos.map((t: any, i: number) => ({
      id: t.id, projectId: p.id, title: t.title, note: t.note ?? '', done: t.status === 2,
      creator: t.by === 'Agent' ? 'agent' : 'user', createdAt: Date.now() - i * 60000,
      updatedAt: Date.now() - i * 60000, completedAt: t.status === 2 ? Date.now() - i * 60000 : null, version: 1,
    })),
  })),
};
const api = {
  async call(command: any) {
    if (command.op === 'snapshot') return structuredClone(snapshot);
    if (command.op === 'launch-catalog') return {
      presets: [{ id: 'standard', name: '标准模式', isDefault: true }, { id: 'ptc', name: 'PTC 模式', isDefault: false }],
      models: [{ provider: 'deepseek', id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', providerName: 'DeepSeek' }],
      defaultModel: { provider: 'deepseek', model: 'deepseek-v4-flash' }, failures: [],
    };
    if (command.op === 'git-branches') return data.git === false
      ? { git: false, current: '', branches: [] }
      : { git: true, current: 'main', branches: ['main', 'feature'] };
    if (command.op === 'search-sessions') return {
      items: Object.entries(data.transcripts as Record<string,{text:string}[]>).flatMap(([sessionId,messages])=>{
        const message = messages.find(m=>m.text.toLowerCase().includes(command.query.toLowerCase()));
        return message ? [{sessionId,snippet:message.text}] : [];
      }), hasMore: false,
    };
    if (command.op === 'preferences') {
      snapshot.preferences = { ...snapshot.preferences, ...command.patch,
        detail: { ...snapshot.preferences.detail, ...command.patch.detail } };
    } else if (command.op === 'settings') {
      snapshot.preferences = { ...snapshot.preferences, theme: command.theme, ...command.options };
    } else if (command.op === 'update') {
      const todo = snapshot.projects.find(p => p.projectId === command.projectId)?.todos.find(t => t.id === command.id);
      if (todo) Object.assign(todo, command, { version: todo.version + 1 });
    }
    snapshot.revision++;
    return {};
  },
  openSession() {}, async newSession() {}, async pickDirectory() { return null; },
  // visualData.forge=false 可模拟 experimental-forge-bundle 未挂载（分支条仅余静态分支）。
  forgeAvailable: () => data.forge !== false, async requestWorktree() { return false; },
  async addProject() { return true; }, async archiveSession() {}, subscribe() { return () => {}; },
};
createRoot(document.getElementById('root')!).render(<Workbase api={api} memory={new UiMemory()}/>);
