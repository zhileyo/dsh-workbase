import { useSyncExternalStore } from 'react';
import { english } from './i18n-en.js';

export type Language = 'follow' | 'zh' | 'en';
/** 与实际宿主 LocaleRuntime 的公开接口对齐；旧 SDK 未包含此包，不运行时导入。 */
export interface HostLocale {
  getSnapshot(): { active: string; revision: number };
  subscribe(listener: () => void): () => void;
  register(namespace: string, language: string, dictionary: Record<string, string>): () => void;
}
const listeners = new Set<() => void>();
let platformLanguage = 'zh', preference: Language = 'follow', revision = 0;
const publish = () => { revision++; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => revision;
export const onWorkbaseLocaleChange = subscribe;
export function useWorkbaseLocale() { return useSyncExternalStore(subscribe, getSnapshot, () => 0); }
export function languageTag() { return (preference === 'follow' ? platformLanguage : preference).toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'; }
export function setLanguage(value: Language) {
  if (value === preference) return;
  preference = value; publish();
}
export function connectLocale(host?: HostLocale) {
  const adopt = () => {
    const next = host?.getSnapshot().active ?? 'zh';
    if (next === platformLanguage) return;
    platformLanguage = next; publish();
  };
  adopt();
  const stop = host?.subscribe(adopt);
  // 注册独立字典，官方语音、模型与命令菜单保持原命名空间。
  const removeZh = host?.register('workbase', 'zh', Object.fromEntries(Object.keys(english).map(key => [key, key])));
  const removeEn = host?.register('workbase', 'en', english);
  return () => { stop?.(); removeEn?.(); removeZh?.(); platformLanguage = 'zh'; publish(); };
}
/** 只用于界面自有文案；用户标题、正文、路径不得传入。缺失翻译保留中文。 */
export function t(text: string, params?: Record<string, unknown>): string {
  const key = text.trim();
  const translated = english[text] ?? (english[key] === undefined ? undefined : text.slice(0, text.indexOf(key)) + english[key] + text.slice(text.indexOf(key) + key.length));
  const template = languageTag() === 'en-US' ? translated ?? text : text;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (token, key: string) => params && Object.hasOwn(params, key) ? String(params[key]) : token);
}
/** 仅翻译服务端确认由工作台补充的官方内置文案，自定义模式保持原值。 */
export function presetText(preset: { name: string; description?: string; builtIn?: boolean }) {
  return {
    name: preset.builtIn ? t(preset.name) : preset.name,
    description: preset.builtIn && preset.description !== undefined ? t(preset.description) : preset.description,
  };
}
/** 构建器仅对工作台自有静态标签表调用；用户数据不经过此视图。 */
export function localized<T extends object>(table: T): T {
  const cache = new WeakMap<object, object>();
  const wrap = <V extends object>(value: V): V => {
    const previous = cache.get(value);
    if (previous) return previous as V;
    const proxy = new Proxy(value, { get(target, key, receiver) {
      const item: unknown = Reflect.get(target, key, receiver);
      return typeof item === 'string' ? t(item) : item && typeof item === 'object' ? wrap(item) : item;
    } });
    cache.set(value, proxy); return proxy;
  };
  return wrap(table);
}
/**
 * 已知错误按完整文案/模板匹配，替换一次且不改写路径、用户内容或宿主未知错误。
 * 匹配用的正则与长度排序在第一次调用时建一次索引：词典是静态的，调用路径只做查表。
 */
interface TextTemplate { regex: RegExp; names: string[]; to: string }
interface TextIndex {
  toEnglish: Map<string, string>; toChinese: Map<string, string>;
  englishTemplates: TextTemplate[]; chineseTemplates: TextTemplate[];
  englishPrefixes: { prefix: string; text: string }[]; chinesePrefixes: { prefix: string; text: string }[];
}
let textIndex: TextIndex | null = null;
const templateOf = (from: string, to: string): TextTemplate => {
  const names: string[] = [];
  const pattern = from.split(/(\{p\d+\})/).map(part => {
    if (/^\{p\d+\}$/.test(part)) { names.push(part.slice(1, -1)); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { regex: new RegExp(`^${pattern}$`), names, to };
};
const indexOf = (): TextIndex => {
  if (textIndex) return textIndex;
  const toEnglish = new Map<string, string>(), toChinese = new Map<string, string>();
  const englishTemplates: TextTemplate[] = [], chineseTemplates: TextTemplate[] = [];
  const englishPrefixes: { prefix: string; text: string }[] = [], chinesePrefixes: { prefix: string; text: string }[] = [];
  for (const [source, translated] of Object.entries(english)) {
    toEnglish.set(source, translated);
    toChinese.set(translated, source);
    if (/\{p\d+\}/.test(source)) englishTemplates.push(templateOf(source, translated));
    if (/\{p\d+\}/.test(translated)) chineseTemplates.push(templateOf(translated, source));
    if (!source.includes('{')) englishPrefixes.push({ prefix: source, text: translated });
    if (!translated.includes('{')) chinesePrefixes.push({ prefix: translated, text: source });
  }
  englishPrefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  chinesePrefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  textIndex = { toEnglish, toChinese, englishTemplates, chineseTemplates, englishPrefixes, chinesePrefixes };
  return textIndex;
};
export function errorText(message: string): string {
  const en = languageTag() === 'en-US';
  const index = indexOf();
  const exact = (en ? index.toEnglish : index.toChinese).get(message);
  if (exact !== undefined) return exact;
  for (const template of en ? index.englishTemplates : index.chineseTemplates) {
    const match = template.regex.exec(message);
    if (match) return template.to.replace(/\{(p\d+)\}/g, (token, name: string) => match[template.names.indexOf(name) + 1] ?? token);
  }
  return message;
}
/** 后台状态可在成功说明后追加清理／持久化结果，仅识别已知的说明前缀。 */
export function statusText(message: string): string {
  const en = languageTag() === 'en-US';
  const whole = errorText(message);
  if (whole !== message) return whole;
  const index = indexOf();
  const separator = en ? '；' : '; ';
  for (const item of en ? index.englishPrefixes : index.chinesePrefixes) {
    if (message.length > item.prefix.length && message.startsWith(item.prefix) && message.slice(item.prefix.length).startsWith(separator)) {
      return item.text + errorText(message.slice(item.prefix.length));
    }
  }
  return message;
}
