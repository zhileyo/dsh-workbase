import { z } from 'zod';
import { parseSkillUpload, type SkillContent } from '../shared/skills.js';
import { MAX_SKILL_BYTES, MAX_SKILL_FILES, SKILL_IMPORT_LIMIT_MESSAGE, type SkillBundle } from './skills-files.js';
import { fetchSkillResource } from './skills-network.js';

type FetchResource = typeof fetchSkillResource;
export interface RepositorySkill { content: SkillContent; bundle: SkillBundle; commit: string; path: string }
/** 公开 GitHub 仓库固定到提交后只下载技能目录，不执行 Git、脚本或仓库配置。 */
export async function readSkillRepository(value: string, signal: AbortSignal, fetchResource: FetchResource = fetchSkillResource): Promise<RepositorySkill[]> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash)
    throw new Error('仓库导入支持无凭据的公开 GitHub HTTPS 仓库地址');
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean).map(part => decodeURIComponent(part));
  const owner = parts[0], repo = parts[1]?.replace(/\.git$/, '');
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)
    || (parts.length > 2 && parts[2] !== 'tree')) throw new Error('仓库地址格式无效');
  const prefix = parts.slice(4).join('/');
  const safe = (path: string) => path && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..');
  if (prefix && !safe(prefix)) throw new Error('仓库子目录越界');
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const json = async (address: string) => JSON.parse((await fetchResource(address, signal)).toString('utf8')) as unknown;
  const ref = parts[3] ?? z.object({ default_branch: z.string().min(1) }).parse(await json(api)).default_branch;
  const commit = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).parse(await json(`${api}/commits/${encodeURIComponent(ref)}`)).sha;
  const tree = z.object({
    truncated: z.boolean(),
    tree: z.array(z.object({ path: z.string(), mode: z.string(), type: z.string(), size: z.number().optional() })),
  }).parse(await json(`${api}/git/trees/${commit}?recursive=1`));
  if (tree.truncated) throw new Error('仓库目录索引不完整，不能可靠导入');
  const selected = tree.tree.filter(file => (!prefix || file.path.startsWith(`${prefix}/`)) && file.path.endsWith('SKILL.md')
    && (file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md')));
  if (!selected.length) throw new Error('仓库指定范围没有 SKILL.md');
  let count = 0, bytes = 0;
  const result: RepositorySkill[] = [];
  for (const instruction of selected) {
    const directory = instruction.path.slice(0, -'SKILL.md'.length);
    const files = tree.tree.filter(file => file.type !== 'tree' && file.path.startsWith(directory)
      && !selected.some(other => other !== instruction && other.path.startsWith(directory)
        && file.path.startsWith(other.path.slice(0, -'SKILL.md'.length))));
    const bundle: SkillBundle = new Map();
    for (const file of files) {
      signal.throwIfAborted();
      const relative = file.path.slice(directory.length);
      if (!safe(file.path) || !safe(relative) || !['100644', '100755'].includes(file.mode) || file.type !== 'blob')
        throw new Error('仓库技能拒绝越界路径、符号链接或子模块');
      if (++count > MAX_SKILL_FILES || bytes + (file.size ?? 0) > MAX_SKILL_BYTES)
        throw new Error(SKILL_IMPORT_LIMIT_MESSAGE);
      const data = await fetchResource(`https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`,
        signal, 0, MAX_SKILL_BYTES - bytes);
      bytes += data.length;
      if (bytes > MAX_SKILL_BYTES) throw new Error(SKILL_IMPORT_LIMIT_MESSAGE);
      bundle.set(relative, data);
    }
    const contents = parseSkillUpload(bundle.get('SKILL.md')!.toString('utf8'));
    if (contents.length !== 1) throw new Error('仓库 SKILL.md 必须只定义一个技能');
    result.push({ content: contents[0]!, bundle, commit, path: instruction.path });
  }
  return result;
}
