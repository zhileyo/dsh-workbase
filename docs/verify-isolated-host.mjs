// 只读验收隔离宿主；不输出启动令牌或 Cookie，不创建会话或调用模型。
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const log = await readFile('/tmp/dsh-workbase-host-022rc1/host.log', 'utf8');
const login = log.match(/http:\/\/127\.0\.0\.1:8791\/\?token=[A-Za-z0-9._~%-]+/)?.[0];
assert.ok(login, '隔离实例尚未输出登录地址');
const authorization = await fetch(login, { redirect: 'manual' });
assert.ok([302, 303].includes(authorization.status), '隔离实例登录失败');
const cookie = authorization.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookie, '隔离实例未返回认证 Cookie');

async function read(command) {
  const response = await fetch('http://127.0.0.1:8791/api/workbase/dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: `acceptance-${command.op}`, method: 'workbase/dispatch', payload: command }),
  });
  assert.equal(response.status, 200, `只读接口失败：${command.op}`);
  const body = await response.json();
  assert.equal(body.result?.ok, true, `宿主操作失败：${command.op}`);
  return body.result.value;
}
const snapshot = await read({ op: 'snapshot' });
assert.ok(snapshot.projects.length > 0, '项目尚未恢复');
const project = snapshot.projects.find(p => p.projectId === snapshot.preferences.selectedProject);
assert.ok(project, '选中项目未恢复');
const todo = project.todos.find(t => t.title === '完整功能验收：搜索定位与重启恢复');
assert.equal(todo?.done, true, '验收待办完成状态未恢复');
const catalog = await read({ op: 'launch-catalog' });
assert.ok(catalog.presets.length > 0 && catalog.models.length > 0, '真实模式或模型列表不可用');
const search = await read({ op: 'search-sessions', query: '完整功能验收' });
assert.ok(Array.isArray(search.items) && typeof search.hasMore === 'boolean', '正文搜索响应异常');
console.log(JSON.stringify({
  projects: snapshot.projects.length, selectedProjectRestored: true, completedTodoRestored: true,
  presets: catalog.presets.length, models: catalog.models.length,
  bodySearchAvailable: true, bodyMatches: search.items.length, hasMore: search.hasMore,
  modelInvocations: 0,
}));
