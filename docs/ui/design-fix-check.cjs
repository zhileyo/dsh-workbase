// 三主题修复的实际脚本隔离验证；不启动浏览器，不替代视觉验收。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const helper = fs.readFileSync(`${__dirname}/pin-favorite-check.cjs`, 'utf8').split('const checks = [];')[0];
const host = {require, console, URLSearchParams, __dirname};
vm.runInNewContext(helper + '\nglobalThis.setupHarness=setup;', host);
const html = fs.readFileSync(`${__dirname}/ui-directions.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const checks = [];
function check(name, fn) {fn();checks.push(name);console.log('通过：' + name)}
function restore(t, start, end) {t.run(script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start))))}
function failingStorage() {
  const t=host.setupHarness();
  t.run("confirm=(title,desc,fn)=>fn();Object.defineProperty(document.getElementById('dialog-error'),'textContent',{set(v){messages.push(v)}});document.createElement=()=>({set textContent(v){messages.push(v)}});document.querySelector=s=>s==='.overlay'?{}:s==='.dialog-footer'?{before(){}}:null;localStorage.setItem=()=>{throw Error('模拟存储失败')}");
  return t;
}
const writes=[
 ['编辑待办','save-todo','t1',null,t=>{t.context.document.getElementById('edit-title').value='修改标题';t.context.document.getElementById('edit-note').value='修改备注'}],
 ['删除待办','delete-todo','t1'],['归档项目','archive-project','p2'],['恢复项目','restore','p6'],['移除项目','remove-project','p2'],
 ['归档会话','archive-session','s2','p1'],['恢复会话','archive-session','s5','p1'],['删除会话','delete-session','s2','p1'],
 ['创建会话','submit-session',null,null,t=>{t.context.document.getElementById('new-session-title').value='新对话'}],
 ['Agent 创建待办','agent-add'],
 ['添加项目','submit-project',null,null,t=>{t.context.document.getElementById('add-path').value='/Users/new-example';t.context.document.getElementById('add-name').value='新项目'}]
];
for(const [name,action,id,owner,prepare] of writes)check(name+'保存失败回滚且不误报成功',()=>{
 const t=failingStorage();prepare?.(t);
 const before=t.snapshot('projects'),view=t.run('view'),selected=t.run('selected'),opened=t.run('openedSession'),transcripts=t.snapshot('transcripts');
 t.click(action,id,owner);
 assert.deepEqual(t.snapshot('projects'),before);assert.deepEqual(t.snapshot('transcripts'),transcripts);
 assert.equal(t.run('view'),view);assert.equal(t.run('selected'),selected);assert.equal(t.run('openedSession'),opened);
 assert.ok(t.context.messages.some(m=>m.includes('失败')));
 assert.ok(t.context.messages.every(m=>!m.includes('已保存')&&!m.includes('已删除')&&!m.includes('已归档')));
 assert.equal(t.context.renders,0);
});
check('宫格列表切换失败保留原布局',()=>{
 const t=failingStorage();t.click('layout-list');assert.equal(t.run('layout'),'grid');assert.ok(t.context.messages.some(m=>m.includes('失败')));
});
check('统计待办跳转展开待处理，不沿用已完成分组状态',()=>{
 const t=host.setupHarness();
 t.run("showDone=true;viewStates.detailp1={showDone:true};go=(next,id)=>{view=next;selected=id;showDone=true};remember=()=>{};openStatsTarget({dataset:{projectId:'p1',id:'t1',targetType:'todo'}})");
 assert.equal(t.run('detailPanel'),'todos');assert.equal(t.run('showDone'),false);
});
check('成功删除会话清除转录，刷新后不恢复孤立转录', () => {
  const t = host.setupHarness();
  t.run('confirm=(title,desc,fn)=>fn()');
  t.click('delete-session', 's2', 'p1');
  assert.equal(t.run('Object.hasOwn(transcripts,"s2")'), false);
  const saved = JSON.parse(t.storage.get('dsh-ui-exploration-v1'));
  const reloaded = host.setupHarness(saved);
  assert.equal(reloaded.run('projects[0].sessions.some(s=>s.id==="s2")'), false);
  assert.equal(reloaded.run('Object.hasOwn(transcripts,"s2")'), false);
});
check('成功编辑待办、新建会话与布局在刷新后恢复', () => {
  const t = host.setupHarness();
  t.context.document.getElementById('edit-title').value = '保存后的完整标题';
  t.context.document.getElementById('edit-note').value = '多行备注\n第二行';
  t.click('save-todo', 't1');
  t.context.document.getElementById('new-session-title').value = '新增会话';
  t.click('submit-session');
  t.click('layout-list');
  const reloaded = host.setupHarness(JSON.parse(t.storage.get('dsh-ui-exploration-v1')));
  assert.equal(reloaded.run('projects[0].todos[0].title'), '保存后的完整标题');
  assert.equal(reloaded.run('projects[0].sessions[0].title'), '新增会话');
  assert.equal(reloaded.run('layout'), 'list');
});
check('菜单首项聚焦、方向键循环、首尾跳转、Esc及Tab回焦', () => {
  const t = host.setupHarness(), nodes = [], listeners = [];
  const document = t.context.document;
  document.addEventListener = (type, fn) => {if (type === 'keydown') listeners.push(fn)};
  document.createElement = () => {
    const n = {dataset:{},style:{},setAttribute(k,v){this[k]=v},getBoundingClientRect:()=>({width:180,height:120}),remove(){this.removed=true}};
    Object.defineProperty(n, 'innerHTML', {set(value){
      this.markup=value;
      this.options=[0,1,2].map(i=>({focus(){document.activeElement=this},closest:()=>n}));
    }});
    n.querySelector = () => n.options?.[0];
    n.querySelectorAll = () => n.options;
    return n;
  };
  t.run('app.append=(...items)=>nodesForMenu.push(...items)');
  t.context.nodesForMenu=nodes;
  document.querySelector=s=>s==='.menu'?nodes.find(n=>n.className==='menu'&&!n.removed):s==='.menu-backdrop'?nodes.find(n=>n.className==='menu-backdrop'&&!n.removed):null;
  restore(t,'function menu(items,target)','const fieldEye=');
  const trigger={setAttribute(k,v){this[k]=v},getBoundingClientRect:()=>({bottom:100,right:200}),focus(){document.activeElement=this}};
  t.context.trigger=trigger;
  for(const closeKey of ['Escape','Tab']){
    t.run('menu([["一","one"],["二","two"],["三","three"]],trigger)');
    const menu=nodes.filter(n=>n.className==='menu'&&!n.removed).at(-1), options=menu.options;
    assert.equal(document.activeElement,options[0]);
    assert.ok(menu.markup.includes('role="menuitem"'));
    const key=k=>listeners.at(-1)({target:document.activeElement,key:k,preventDefault(){},stopPropagation(){}});
    key('ArrowUp');assert.equal(document.activeElement,options[2]);
    key('Home');assert.equal(document.activeElement,options[0]);
    key('ArrowDown');assert.equal(document.activeElement,options[1]);
    key('End');assert.equal(document.activeElement,options[2]);
    key(closeKey);assert.equal(document.activeElement,trigger);assert.equal(trigger['aria-expanded'],'false');
  }
});
check('完成任务保持待处理分组并聚焦邻近任务，撤销入口不依赖提示', () => {
  const t=host.setupHarness(), focused=[];
  t.context.document.querySelector=s=>({focus(){focused.push(s)}});
  t.run("view='detail';selected='p1';showDone=false;app.dataset.project='p1'");
  const expected=t.run('projects[0].todos.filter(t=>t.status!==2)[1].id');
  t.run("updateTodoStatus('t1',2)");
  assert.equal(t.run('showDone'),false);
  assert.equal(focused.at(-1),`[data-todo="${expected}"] .todo-complete`);
  assert.equal(t.run('undoAvailable(projects[0])'),true);
  assert.ok(t.run('todosHTML(projects[0])').includes('todo-undo-entry'));
  t.run('undoTodoStatus()');
  assert.equal(t.run('projects[0].todos[0].status'),0);
  assert.equal(t.run('undoAvailable(projects[0])'),false);
});
check('搜索定位完成任务与归档任务展开正确分组且聚焦可用入口', () => {
  const t=host.setupHarness(), focused=[];
  t.run("go=(next,id)=>{view=next;selected=id};remember=()=>{}");
  t.context.document.querySelector=()=>({classList:{add(){}},scrollIntoView(){},querySelector:s=>({focus(){focused.push(s)}})});
  t.run("projects[0].todos[0].status=2;searchHits=[{type:'todo',project:'p1',id:'t1'}];openSearchHit(0)");
  assert.equal(t.run('showDone'),true);assert.equal(focused.at(-1),'.todo-complete');
  t.run("projects[0].archived=true;openSearchHit(0)");
  assert.equal(focused.at(-1),'.todo-details');
});
check('归档待办与会话详情显示完整文本，文本转义且无写操作', () => {
  const t=host.setupHarness();
  t.run("modal=(title,body,footer)=>{globalThis.detailOutput=body+footer};projects[0].archived=true;projects[0].todos[0].title='完整标题 <img>';projects[0].todos[0].note='第一行\\n第二行';openReadDetails('todo','t1','p1')");
  assert.ok(t.context.detailOutput.includes('完整标题 &lt;img&gt;'));
  assert.ok(t.context.detailOutput.includes('第一行\n第二行'));
  assert.ok(!t.context.detailOutput.includes('save-todo'));
  t.run("openReadDetails('session','s1','p1')");
  assert.ok(t.context.detailOutput.includes('已归档 · 只读'));
  assert.ok(t.context.detailOutput.includes(t.run('projects[0].path')));
});
check('低高度与软键盘降级滚动，恢复高度后回到局部滚动', () => {
  const t=host.setupHarness(), props={};
  const main={children:[{classList:{contains:()=>false},getBoundingClientRect:()=>({height:160})}],style:{setProperty(k,v){props[k]=v}},getBoundingClientRect:()=>({top:120})};
  t.context.getComputedStyle=()=>({marginBottom:'12px'});
  t.context.document.querySelector=s=>s==='.detail-main'?main:null;
  t.context.window.visualViewport={height:360,offsetTop:0};
  t.run('fitDetailHeight()');assert.equal(t.run('app.dataset.heightMode'),'scroll');
  t.context.window.visualViewport.height=900;
  t.run('fitDetailHeight()');assert.equal(t.run('app.dataset.heightMode'),'fixed');assert.equal(props['--detail-main-height'],'780px');
  t.context.window.visualViewport.height=250;
  t.run('fitDetailHeight()');assert.equal(t.run('app.dataset.heightMode'),'scroll');
});
check('三个主题与follow在浅深色使用相同组件角色映射', () => {
  const t=host.setupHarness(), props={};
  t.context.document.documentElement={style:{setProperty(){}}};
  t.run('app.style.setProperty=(key,value)=>themeProps[key]=value;bindThemeSelects=()=>{}');
  t.context.themeProps=props;
  for(const theme of ['dsh','fresh','warm'])for(const mode of ['light','dark']){
    t.run(`settingsThemePreview=null;hostTheme='${theme}';hostAppearance='${mode}';workbaseTheme='follow';applyWorkbaseTheme()`);
    const inherited={...props};
    assert.equal(t.run('app.dataset.style'),theme);
    t.run(`workbaseTheme='${theme}';applyWorkbaseTheme()`);
    assert.deepEqual(props,inherited);
  }
});
check('总览、详情与会话各场景模板无重复ID，布局与响应式规则保留', () => {
  const t=host.setupHarness();
  for(const view of ['overview','detail','chat'])for(const scene of ['normal','empty','loading','error','sync','path'])for(const layout of ['list','grid']){
    t.run(`view='${view}';scene='${scene}';layout='${layout}';selected='p1';openedSession='s1'`);
    const output=t.run(`header()+${view==='overview'?'overview()':view==='detail'?'detail()':'chat()'}`);
    const ids=[...output.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,`${view}/${scene}/${layout} 存在重复ID`);
  }
  assert.ok(html.includes("window.matchMedia('(max-width:850px)')"));
  assert.ok(html.includes('grid-template-columns:minmax(280px,var(--session-share,65fr)) 24px minmax(240px,var(--todo-share,35fr))'));
  assert.ok(html.includes('body:has(.app[data-height-mode="scroll"] .detail-main){overflow-y:auto}'));
});
console.log(`脚本语法及 ${checks.length} 项修复隔离检查通过；未进行浏览器视觉验证。`);
