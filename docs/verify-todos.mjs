// 隔离真实待办组件与服务的浏览器验收；会话和图片存储为内存适配，不读取用户 profile。
// node --import tsx docs/verify-todos.mjs；停止服务即清空测试数据。
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WorkbaseService } from '../src/server/service.ts';
import { dispatch } from '../src/server/rpc.ts';
import { initialState } from '../src/shared/model.ts';
import { handleTodoImage, handleTodoAttachment } from '../src/server/todo-images.ts';
import { randomUUID } from 'node:crypto';

let state = initialState();
const images = new Map();
const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
  workspaces: async () => [{ workspaceId: 'fixture', path: '/example/project', title: '验收项目', available: true, sessionIds: [] }],
  sessions: async () => [], rename: async () => {},
  catalog: async () => ({ presets: [{ id: 'standard', name: '标准模式' }], models: [], failures: [], defaultModel: null }),
  saveTodoImage: async (data, mediaType) => {
    const attachmentId = randomUUID(); images.set(attachmentId, data);
    return { attachmentId, mediaType, bytes: data.length, width: 1, height: 1 };
  },
  readTodoImage: async image => images.get(image.attachmentId),
  saveTodoAttachment: async (data, mediaType, name) => {
    const attachmentId = randomUUID(); images.set(attachmentId, data);
    return { attachmentId, mediaType, name, bytes: data.length };
  },
  readTodoAttachment: async attachment => images.get(attachment.attachmentId),
}, randomUUID);
const result = await build({
  stdin: { contents: `
import React, {useState,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {TodoDetail} from './src/client/TodoDetail.tsx';
import {TodoToolbar} from './src/client/TodoToolbar.tsx';
import {themeStyle} from './src/client/theme.ts';
import css from './src/client/styles.css';
import prototype from './src/client/prototype.css';
const style=document.createElement('style');style.textContent=prototype+'\\n'+css;document.head.append(style);
function Fixture(){
 const params=new URLSearchParams(location.search);
 const [project,setProject]=useState(null),[theme,setTheme]=useState(params.get('theme')||'follow'),[width,setWidth]=useState(Number(params.get('width')||1080)),[dark,setDark]=useState(params.get('dark')==='1'),[message,setMessage]=useState('');
 const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[priority,setPriority]=useState('all');
 const inputRef=React.useRef(null);
 const api=useMemo(()=>({call:async(command)=>{const response=await fetch('/dispatch',{method:'POST',body:JSON.stringify(command)});const result=await response.json();if(!result.ok)throw new Error(result.error.message);return result.value;},
  uploadTodoImage:async(todo,file)=>{const query=new URLSearchParams({projectId:todo.projectId,id:todo.id,expectedVersion:String(todo.version)});const response=await fetch('/api/workbase/todo-image?'+query,{method:'POST',headers:{'Content-Type':file.type},body:file});const result=await response.json();if(!response.ok)throw new Error(result.message);return result;},
  uploadTodoAttachment:async(todo,file)=>{const query=new URLSearchParams({projectId:todo.projectId,id:todo.id,expectedVersion:String(todo.version),name:file.name});const response=await fetch('/api/workbase/todo-attachment?'+query,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.message);return result;},
  readTodoAttachment:async(todo,attachment,signal)=>{const query=new URLSearchParams({projectId:todo.projectId,id:todo.id,attachmentId:attachment.attachmentId});const response=await fetch('/api/workbase/todo-attachment/content?'+query,{signal});if(!response.ok)throw new Error('附件读取失败');return response.blob();},
  readTodoImage:async(todo,image,signal)=>{const query=new URLSearchParams({projectId:todo.projectId,id:todo.id,attachmentId:image.attachmentId});const response=await fetch('/api/workbase/todo-image/content?'+query,{signal});if(!response.ok)throw new Error('图片读取失败');return response.blob();},
  openTodoSession:async(todo)=>setMessage('已准备会话草稿：'+todo.title+'；未发送消息')}),[]);
 const refresh=async()=>{const snapshot=await api.call({op:'snapshot'});setProject(snapshot.projects[0]);};
 React.useEffect(()=>{void refresh();},[]);
 return <><div className="fixture-toolbar"><label>主题<select aria-label="验收主题" value={theme} onChange={e=>setTheme(e.target.value)}><option value="follow">跟随宿主</option><option value="warm">温暖阅读</option><option value="dsh">冷静蓝</option><option value="fresh">清新</option><option value="violet">紫晶</option></select></label>
 <label>面板宽度<select aria-label="验收面板宽度" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value="1080">1080px</option><option value="650">650px</option><option value="360">360px</option></select></label>
 <label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>深色</label><span role="status">{message}</span></div>
 <div className={'wb '+(theme==='warm'?'c':'a')+' '+theme+' '+(dark?'dark':'light')} data-theme={theme} data-dark={dark}
 style={{...themeStyle(theme,dark),...(theme==='follow'?Object.fromEntries(['bg-base','bg-layer-1','label-primary','label-secondary','border-l2','interactive-bg-hover'].map((name,i)=>['--dsw-alias-'+name,Object.values(themeStyle('dsh',dark))[i]])):{}),width,maxWidth:'100%',height:Number(params.get('height')||700),position:'relative',containerType:'inline-size',containerName:'workbase',margin:'0 auto'}}>
 {params.get('toolbar')==='1'?<TodoToolbar draft={draft} query={query} priority={priority} busy={false} archived={false}
 inputRef={inputRef} onDraftChange={setDraft} onQueryChange={setQuery} onPriorityChange={setPriority}
 onCreate={async()=>true} onFullCreate={()=>setMessage('完整新建入口已触发')}/>:
 project&&<TodoDetail api={api} project={project} refresh={refresh} onClose={()=>setMessage(current=>current.startsWith('已准备会话草稿')?current:'已关闭；测试数据保留在内存')}/>}</div></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'tsx',
  }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'text' },
});
const bundle = result.outputFiles[0].text;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8795');
    if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle); return; }
    if (url.pathname === '/dispatch' || ['/api/workbase/todo-image', '/api/workbase/todo-attachment',
      '/api/workbase/todo-image/content', '/api/workbase/todo-attachment/content'].includes(url.pathname)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const response = url.pathname === '/dispatch'
        ? Response.json(await dispatch(service, JSON.parse(body.toString()), true, new AbortController().signal))
        : await (url.pathname.includes('todo-attachment') ? handleTodoAttachment : handleTodoImage)(service, new Request(url, { method: req.method, headers: req.headers,
          ...(req.method === 'POST' ? { body } : {}) }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="UTF-8"><title>待办组件隔离验收</title><style>html,body{margin:0;background:#e7e8ed;font-family:system-ui}.fixture-toolbar{display:flex;gap:16px;padding:12px;flex-wrap:wrap}.fixture-toolbar label{display:flex;gap:8px;align-items:center}</style><div id="root"></div><script src="/fixture.js"></script>');
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
server.listen(8795, '127.0.0.1', () => console.log('待办隔离验收：http://127.0.0.1:8795'));
