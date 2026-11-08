// 验证原型实际脚本的状态和动作；不启动浏览器，不代表视觉验证。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(`${__dirname}/ui-directions.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const key = 'dsh-ui-exploration-v1';
function setup(saved) {
  const storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []);
  const nodes = new Map();
  const listeners = [];
  const keyListeners = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {dataset: {}, style: {}, value: '', scrollTop: 0,
      addEventListener() {}, focus() {}, setAttribute() {}, getBoundingClientRect: () => ({bottom: 100, right: 200, width: 160, height: 100})});
    return nodes.get(id);
  };
  const media = () => ({matches: false, addEventListener() {}});
  const context = vm.createContext({
    console, Date, JSON, URLSearchParams, crypto: require('node:crypto').webcrypto,
    navigator: {platform: 'MacIntel'}, matchMedia: media,
    MutationObserver: class {observe() {}},
    window: {matchMedia: media, addEventListener() {}, scrollY: 0, scrollTo() {}},
    document: {getElementById: node, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: (type, fn) => {if (type === 'click') listeners.push(fn);if(type === 'keydown')keyListeners.push(fn);}},
    localStorage: {getItem: k => storage.get(k) || null, setItem: (k, value) => {storage.set(k, value);}},
    setTimeout: () => 1, clearTimeout() {}, innerWidth: 1000, innerHeight: 800,
    messages: [], renders: 0, menuItems: [], nodes
  });
  vm.runInContext(script.slice(0, script.indexOf('const params=new URLSearchParams')), context);
  const run = code => vm.runInContext(code, context);
  run("render=()=>{captureDetailState();renders++};toast=text=>messages.push(text);closeMenu=()=>{};closeModal=()=>{};closeSearch=()=>{};closeComposerPicker=()=>{};menu=items=>{menuItems=items}");
  function click(action, id, projectId) {
    const button = {dataset: {action, id, projectId}, classList: {contains: () => false}};
    const event = {target: {closest: selector => selector === '[data-action],[data-direction]' ? button : null}};
    for (const fn of listeners) fn(event);
  }
  function filterKey(kind, value, key) {
    const handler = keyListeners.find(fn => fn.toString().includes('.entity-filter-tabs [role="tab"]'));
    const tab = {dataset: {filterKind: kind, filterValue: value}};
    handler({key, target: {closest: () => tab}, preventDefault() {}});
  }
  return {context, storage, nodes, run, click, filterKey, snapshot: code => JSON.parse(run(`JSON.stringify(${code})`))};
}
const checks = [];
function check(label, fn) {fn();checks.push(label);console.log(`通过：${label}`);}
check('旧数据补齐标记，默认选中活跃标签', () => {
  const t = setup();
  assert.ok(t.run('projects.every(p=>[p,...p.sessions].every(e=>e.pinned===false&&e.favorite===false))'));
  assert.equal(t.run('filter'), 'active');
  assert.equal(t.run('sessionFilter'), 'active');
});
check('项目菜单仅保留收藏，置顶图标操作与分组排序在宫格和列表一致', () => {
  const t = setup();
  t.click('project-menu', 'p4');
  assert.deepEqual(Array.from(t.context.menuItems, i => i[1]).slice(0, 2), ['rename', 'project-favorite']);
  t.run("view='detail'");
  t.click('project-menu', 'p4');
  assert.deepEqual(Array.from(t.context.menuItems, i => i[1]).slice(0, 3), ['rename', 'project-favorite', 'copy-project-path']);
  t.click('project-favorite', 'p4');
  t.click('project-menu', 'p4');
  assert.equal(t.context.menuItems[1][0], '取消收藏');
  t.run("view='overview'");
  assert.ok(t.context.menuItems.every(i => i[1] !== 'project-pin'));
  t.click('project-pin', 'p4');
  t.click('project-pin', 'p2');
  assert.deepEqual(t.snapshot('orderedProjects().map(p=>p.id)'), ['p2', 'p4', 'p1', 'p3', 'p5']);
  for (const mode of ['list', 'grid']) {
    t.run(`layout='${mode}'`);
    const output = t.run('overviewResults(orderedProjects())');
    assert.ok(output.indexOf('data-project="p2"') < output.indexOf('data-project="p4"'));
    assert.ok(output.includes('aria-label="取消置顶项目：'));
  }
  t.click('project-pin', 'p4');
  assert.equal(t.run('projects.find(p=>p.id==="p4").pinned'), false);
});
check('收藏包含活跃和归档，标签互斥切换，收藏空态可返回活跃', () => {
  const t = setup();
  t.click('project-favorite', 'p4');
  t.click('filter-project-favorites');
  assert.deepEqual(t.snapshot('orderedProjects().map(p=>p.id)'), ['p4']);
  assert.equal(t.run('projects.find(p=>p.id==="p4").pinned'), false);
  t.click('project-favorite', 'p4');
  assert.ok(t.run('overviewResults(orderedProjects())').includes('查看活跃项目'));
  t.click('project-favorite', 'p6');
  t.click('project-favorite', 'p4');
  assert.deepEqual(t.snapshot('orderedProjects().map(p=>p.id)'), ['p4', 'p6']);
  t.click('filter-archived');
  assert.deepEqual(t.snapshot('orderedProjects().map(p=>p.id)'), ['p6']);
  t.click('filter-active');
  assert.deepEqual(t.snapshot('orderedProjects().map(p=>p.id)'), ['p1', 'p2', 'p3', 'p4', 'p5']);
  t.click('filter-project-favorites');
  for (const mode of ['list', 'grid']) {
    t.run(`layout='${mode}';projectFields[layout].status=false`);
    assert.ok(t.run('projectRow(projects[5])').includes('已归档'));
  }
});
check('会话按所属项目操作，置顶优先再按更新时间，不影响最近会话与统计', () => {
  const t = setup();
  const recent = t.run('recentHTML()'), stats = t.snapshot('statsData()');
  t.click('session-pin', 's4', 'p1');
  t.click('session-favorite', 's4', 'p1');
  assert.equal(t.run('orderedSessions(projects[0])[0].id'), 's4');
  assert.equal(t.run('projects[0].favorite||projects[0].pinned'), false);
  assert.equal(t.run('recentHTML()'), recent);
  assert.deepEqual(t.snapshot('statsData().recent.map(x=>x.s.id)'), stats.recent.map(x=>x.s.id));
  t.click('session-pin', 's4', 'p2');
  assert.equal(t.run('projects[0].sessions.find(s=>s.id==="s4").pinned'), true);
  t.click('session-menu', 's4', 'p1');
  assert.equal(t.context.menuItems[0][0], '取消收藏');
  assert.ok(t.context.menuItems.every(i => i[1] !== 'session-pin'));
  assert.ok(t.context.menuItems.every(i => i[4] === 'p1'));
});
check('归档只读菜单允许个人标记，过滤归档会话保留状态', () => {
  const t = setup();
  t.click('session-menu', 's9', 'p6');
  assert.deepEqual(Array.from(t.context.menuItems, i => i[1]), ['session-favorite', 'session-details']);
  t.click('session-favorite', 's9', 'p6');
  t.click('session-pin', 's9', 'p6');
  assert.ok(t.run('projects[5].sessions[0].favorite&&projects[5].archived'));
  t.click('session-favorite', 's5', 'p1');
  t.run("sessionFilter='favorites'");
  assert.deepEqual(t.snapshot('orderedSessions(projects[0]).map(s=>s.id)'), ['s5']);
});
check('标记和筛选重载恢复，会话收藏筛选按项目保存，保留草稿与滚动', () => {
  const t = setup();
  t.run("view='detail';selected='p1';app.dataset.project='p1';showDone=true");
  t.nodes.get('todo-title') || t.context.document.getElementById('todo-title');
  t.nodes.get('todo-title').value = '未提交草稿';
  t.context.document.getElementById('session-results').scrollTop = 42;
  t.context.document.getElementById('todo-results').scrollTop = 58;
  t.click('filter-session-favorites');
  t.click('project-favorite', 'p1');
  t.click('session-pin', 's2', 'p1');
  t.click('filter-project-favorites');
  t.run('remember()');
  const saved = JSON.parse(t.storage.get(key));
  assert.equal(saved.viewStates.detailp1.todoDraft, '未提交草稿');
  assert.equal(saved.viewStates.detailp1.sessionScroll, 42);
  assert.equal(saved.viewStates.detailp1.todoScroll, 58);
  assert.equal(saved.viewStates.detailp1.showDone, true);
  const restored = setup(saved);
  assert.ok(restored.run('filter==="favorites"&&sessionFilter==="favorites"&&projects[0].favorite&&projects[0].sessions[1].pinned'));
  restored.run("go('detail','p2')");
  assert.equal(restored.run('sessionFilter'), 'active');
  restored.run("go('detail','p1')");
  assert.equal(restored.run('sessionFilter'), 'favorites');
});
check('保存失败回滚标记与筛选，重试成功，不误报成功', () => {
  const t = setup();
  t.run("view='detail';selected='p1';app.dataset.project='p1';originalSetItem=localStorage.setItem;localStorage.setItem=()=>{throw Error('模拟失败')}");
  t.click('project-pin', 'p1');
  t.click('session-favorite', 's1', 'p1');
  t.click('filter-project-favorites');
  t.click('filter-session-favorites');
  assert.equal(t.run('projects[0].pinned||projects[0].sessions[0].favorite'), false);
  assert.equal(t.run('filter'), 'active');
  assert.equal(t.run('sessionFilter'), 'active');
  assert.equal(t.run('viewStates.detailp1.sessionFilter'), 'active');
  assert.equal(t.context.renders, 0);
  assert.ok(t.context.messages.every(m => m.includes('失败')));
  t.run('localStorage.setItem=originalSetItem');
  t.filterKey('project', 'favorites', 'Home');
  assert.equal(t.run('filter'), 'active');
  t.filterKey('project', 'active', 'ArrowLeft');
  assert.equal(t.run('filter'), 'favorites');
  t.filterKey('session', 'favorites', 'ArrowRight');
  assert.equal(t.run('sessionFilter'), 'active');
  t.filterKey('session', 'active', 'End');
  assert.equal(t.run('sessionFilter'), 'favorites');
  t.click('session-favorite', 's1', 'p1');
  assert.equal(t.run('projects[0].sessions[0].favorite'), true);
});
check('删除、移除、迁出及过期所属项目标识不能误操作', () => {
  const t = setup();
  t.run("projects[1].removed=true;projects[2].merged='p1'");
  t.click('project-pin', 'p2');
  t.click('project-favorite', 'p3');
  t.click('session-pin', 's7', 'p3');
  t.click('session-pin', '不存在', 'p1');
  assert.equal(t.context.renders, 0);
});
check('实际迁移及撤销保留会话标记，项目标记各自保留', () => {
  const t = setup();
  t.run("projects[0].sessions.forEach(s=>s.running=false);projects[0].pinned=true;projects[0].sessions[1].favorite=true;projects[0].sessions[1].pinned=true;projects[1].favorite=true;migrationDraft={sourceId:'p1',path:projects[1].path,sourcePath:projects[0].path,kind:'merge',targetId:'p2',fingerprint:JSON.stringify([projects[0],projects[1]])};commitMigration()");
  assert.ok(t.run('projects[1].sessions.find(s=>s.id==="s2").pinned&&projects[1].sessions.find(s=>s.id==="s2").favorite'));
  assert.ok(t.run('projects[0].pinned&&projects[1].favorite&&!projects[1].pinned'));
  t.run('commitUndoMigration(migrations[0].id)');
  assert.ok(t.run('projects[0].sessions.find(s=>s.id==="s2").pinned&&projects[0].sessions.find(s=>s.id==="s2").favorite'));
});
check('三种条目仅渲染悬停置顶图标，收藏仅在更多菜单，直接切换不打开实体', () => {
  const t = setup();
  for (const mode of ['grid', 'list']) {
    t.run(`layout='${mode}'`);
    const output = t.run('projectRow(projects[0])');
    const buttons = [...output.matchAll(/<button class="entity-mark-button[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
    assert.equal(buttons.length, 1);
    assert.ok(buttons.every(match => /^<svg[\s\S]*<\/svg>$/.test(match[1])));
    assert.ok(buttons.every(match => match[0].includes('aria-pressed="false"')));
    assert.ok(!output.includes('data-action="project-favorite"'));
  }
  const output = t.run('sessionsHTML(projects[0])');
  assert.equal((output.match(/class="entity-mark-button/g) || []).length, 4);
  assert.ok(!output.includes('data-action="session-favorite"'));
  assert.ok(output.includes('data-action="session-pin" data-id="s1" data-project-id="p1"'));
  t.click('project-pin', 'p1');
  t.click('session-favorite', 's1', 'p1');
  assert.equal(t.run('view'), 'overview');
  assert.ok(t.run('projects[0].pinned&&projects[0].sessions[0].favorite'));
  assert.ok(t.run('entityMarks(projects[0])').includes('aria-pressed="true"'));
  assert.ok(html.includes('gap:0;opacity:0;pointer-events:none'));
  for (const parent of ['project', 'session-row']) {
    assert.ok(html.includes(`.${parent}:hover .entity-mark-button`));
    assert.ok(html.includes(`.${parent}:has(:focus-visible) .entity-mark-button`));
  }
});
check('项目和会话每次仅选中一个标签，重复点击保持，切换失败回滚', () => {
  const t = setup();
  t.run("view='detail';selected='p1';app.dataset.project='p1'");
  for (const kind of ['project', 'session']) {
    const state = kind === 'project' ? 'filter' : 'sessionFilter';
    for (const value of ['archived', 'favorites', 'active', 'favorites']) {
      const action = value === 'favorites' ? `filter-${kind}-favorites` : kind === 'project' ? `filter-${value}` : `sessions-${value}`;
      t.click(action);
      assert.equal(t.run(state), value);
      const tabs = t.run(`entityFilterTabs('${kind}',${state})`);
      assert.equal((tabs.match(/role="tab"/g) || []).length, 3);
      assert.equal((tabs.match(/aria-selected="true"/g) || []).length, 1);
      assert.ok(tabs.includes(`data-filter-value="${value}" aria-controls="${kind === 'project' ? 'project-results' : 'session-results'}" aria-selected="true"`));
    }
    const before = t.context.renders;
    t.click(`filter-${kind}-favorites`);
    assert.equal(t.run(state), 'favorites');
    assert.equal(t.context.renders, before);
  }
  t.run("originalSetItem=localStorage.setItem;localStorage.setItem=()=>{throw Error('模拟失败')}");
  t.click('filter-active');
  t.click('sessions-archived');
  assert.equal(t.run('filter'), 'favorites');
  assert.equal(t.run('sessionFilter'), 'favorites');
  assert.equal(t.run('viewStates.detailp1.sessionFilter'), 'favorites');
  t.run('localStorage.setItem=originalSetItem');
  t.click('session-favorite', 's1', 'p1');
  t.click('session-favorite', 's5', 'p1');
  assert.deepEqual(t.snapshot('orderedSessions(projects[0]).map(s=>s.id)'), ['s1', 's5']);
  assert.ok(t.run('sessionsHTML(projects[0])').includes('已归档'));
});
check('旧组合筛选迁移为收藏标签，无效值回退，重新保存后恢复单一状态', () => {
  const seed = setup();
  const t = setup({projects: seed.snapshot('projects'), filter: 'archived', projectFavoritesOnly: true,
    last: {view: 'detail', selected: 'p1'},
    viewStates: {detailp1: {sessionFilter: 'archived', sessionFavoritesOnly: true, todoDraft: '旧草稿'}, detailp2: {sessionFilter: '无效'}}});
  assert.equal(t.run('filter'), 'favorites');
  assert.equal(t.run('sessionFilter'), 'favorites');
  assert.equal(t.run('viewStates.detailp2.sessionFilter'), 'active');
  assert.equal(t.run('viewStates.detailp1.todoDraft'), '旧草稿');
  t.run('save()');
  const saved = JSON.parse(t.storage.get(key));
  assert.ok(!Object.hasOwn(saved, 'projectFavoritesOnly'));
  assert.ok(!Object.hasOwn(saved.viewStates.detailp1, 'sessionFavoritesOnly'));
  const restored = setup(saved);
  assert.equal(restored.run('filter'), 'favorites');
  assert.equal(restored.run('sessionFilter'), 'favorites');
});
console.log(`脚本语法及 ${checks.length} 项隔离检查通过；未进行浏览器视觉验证。`);
