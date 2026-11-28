import type { CSSProperties } from 'react';
/** 基底令牌：底色、文字、分隔线等 6 个语义位，键名即 CSS 变量后缀，错位在编译期即报错。 */
interface BaseColors { bg: string; surface: string; text: string; muted: string; line: string; hover: string }
/** 组件令牌：面板、控件与状态色等 13 个语义位。 */
interface ComponentColors {
  panel: string; primary: string; 'on-primary': string; selected: string; 'selected-text': string; danger: string; focus: string;
  checkbox: string; 'control-line': string; 'switch-thumb-off': string; 'switch-thumb-on': string; success: string; warning: string;
}
type ThemeKind = 'dsh' | 'fresh' | 'warm' | 'violet';
const base: Record<ThemeKind, Record<'light' | 'dark', BaseColors>> = {
  dsh: {
    light: { bg: '#fff', surface: '#fff', text: '#0f1115', muted: '#61666b', line: '#0000001a', hover: '#2631480f' },
    dark: { bg: '#151517', surface: '#232324', text: '#f9fafb', muted: '#a8afb9', line: '#ffffff1f', hover: '#ffffff14' },
  },
  fresh: {
    light: { bg: '#f7f9fb', surface: '#fff', text: '#22303c', muted: '#5f6a74', line: '#e0e6eb', hover: '#edf3f0' },
    dark: { bg: '#171f24', surface: '#1d282e', text: '#e3eae9', muted: '#92a3a6', line: '#334248', hover: '#283a38' },
  },
  warm: {
    light: { bg: '#f6f3ed', surface: '#fcfaf6', text: '#393c34', muted: '#6b6659', line: '#dfdccf', hover: '#efeade' },
    dark: { bg: '#242420', surface: '#2c2c27', text: '#eeeadf', muted: '#aaa694', line: '#44433b', hover: '#39382e' },
  },
  violet: {
    light: { bg: '#fff', surface: '#fff', text: '#1f2329', muted: '#636973', line: '#e5e6eb', hover: '#f3f4f6' },
    dark: { bg: '#1b1c1f', surface: '#242528', text: '#e8eaed', muted: '#9099a3', line: '#333539', hover: '#2a2b30' },
  },
};
const components: Record<ThemeKind, Record<'light' | 'dark', ComponentColors>> = {
  dsh: {
    light: { panel: '#f5f7fb', primary: '#3566cf', 'on-primary': '#fff', selected: '#e4edfd', 'selected-text': '#2856b3', danger: '#c62626', focus: '#778493', checkbox: '#61666b', 'control-line': '#808a95', 'switch-thumb-off': '#fff', 'switch-thumb-on': '#151517', success: '#26704b', warning: '#925b1d' },
    dark: { panel: '#202023', primary: '#7aaaff', 'on-primary': '#151517', selected: '#34415b', 'selected-text': '#a9c7ff', danger: '#f25a5a', focus: '#98a6b4', checkbox: '#a8afb9', 'control-line': '#83929e', 'switch-thumb-off': '#151517', 'switch-thumb-on': '#151517', success: '#9dd2ae', warning: '#e4c08a' },
  },
  fresh: {
    light: { panel: '#f0f5f2', primary: '#19654f', 'on-primary': '#fff', selected: '#e8f3ed', 'selected-text': '#19654f', danger: '#b94d44', focus: '#778493', checkbox: '#5f6a74', 'control-line': '#808a95', 'switch-thumb-off': '#fff', 'switch-thumb-on': '#fff', success: '#19654f', warning: '#925b1d' },
    dark: { panel: '#202c32', primary: '#a1d2ba', 'on-primary': '#153326', selected: '#263e35', 'selected-text': '#a1d2ba', danger: '#f79d8e', focus: '#98a6b4', checkbox: '#92a3a6', 'control-line': '#83929e', 'switch-thumb-off': '#153326', 'switch-thumb-on': '#153326', success: '#a1d2ba', warning: '#e4c08a' },
  },
  warm: {
    light: { panel: '#eeeae1', primary: '#785a39', 'on-primary': '#fffdf7', selected: '#eee5d5', 'selected-text': '#785a39', danger: '#ad5340', focus: '#77808a', checkbox: '#6b6659', 'control-line': '#707c88', 'switch-thumb-off': '#fff', 'switch-thumb-on': '#fffdf7', success: '#446a4b', warning: '#8a480c' },
    dark: { panel: '#302f29', primary: '#dcc49e', 'on-primary': '#322717', selected: '#40392c', 'selected-text': '#dcc49e', danger: '#eba48d', focus: '#98a6b4', checkbox: '#aaa694', 'control-line': '#83929e', 'switch-thumb-off': '#322717', 'switch-thumb-on': '#322717', success: '#95c3a3', warning: '#e8c590' },
  },
  violet: {
    light: { panel: '#f5f6f7', primary: '#8046f3', 'on-primary': '#fff', selected: '#f1ebfe', 'selected-text': '#6d35e0', danger: '#c62c25', focus: '#6a7078', checkbox: '#6a7078', 'control-line': '#808791', 'switch-thumb-off': '#fff', 'switch-thumb-on': '#fff', success: '#26704b', warning: '#a45600' },
    dark: { panel: '#242528', primary: '#a688ff', 'on-primary': '#14101f', selected: '#2e2a3d', 'selected-text': '#b99cff', danger: '#ff7a72', focus: '#9099a3', checkbox: '#9099a3', 'control-line': '#7e8792', 'switch-thumb-off': '#14101f', 'switch-thumb-on': '#14101f', success: '#9dd2ae', warning: '#e8a33d' },
  },
};
export function themeStyle(theme: 'follow' | ThemeKind, dark: boolean): CSSProperties {
  const kind = theme === 'follow' ? 'dsh' : theme;
  const mode = dark ? 'dark' : 'light';
  // 按语义名展开，不再依赖位置对齐；键的插入顺序即原先的 names 顺序。
  const colors: BaseColors & ComponentColors = { ...base[kind][mode], ...components[kind][mode] };
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors)) result[`--wb-${name}`] = value;
  if (theme === 'follow') {
    // 引用公开语义令牌，平台换色时由 CSS 实时更新；缺失时沿用当前明暗配色。
    const hostTokens = {
      bg: 'bg-base', surface: 'bg-layer-1', text: 'label-primary', muted: 'label-secondary',
      line: 'border-l2', hover: 'interactive-bg-hover', panel: 'bg-layer-2',
      primary: 'state-business-primary', 'on-primary': 'label-primary-foreground',
      selected: 'state-business-tertiary', 'selected-text': 'label-primary',
      danger: 'state-error-primary', checkbox: 'border-selected', 'control-line': 'border-l4',
      'switch-thumb-off': 'switch-thumb', 'switch-thumb-on': 'label-primary-foreground',
      success: 'state-success-primary',
    };
    for (const [name, token] of Object.entries(hostTokens)) {
      result[`--wb-${name}`] = `var(--dsw-alias-${token},${result[`--wb-${name}`]})`;
    }
    result['--wb-focus'] = `var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,${result['--wb-focus']}))`;
  }
  const aliases = { 'primary-bg': 'primary', 'selected-bg': 'selected', 'danger-text': 'danger', 'focus-tone': 'focus', 'checkbox-border': 'checkbox' };
  for (const name of Object.keys(colors)) result[`--${name}`] = result[`--wb-${name}`]!;
  for (const [name, source] of Object.entries(aliases)) result[`--${name}`] = result[`--wb-${source}`]!;
  result['--accent'] = result['--wb-primary']!;
  // 主按钮与强调文字分开：官方按钮可能采用黑白配色，强调文字仍使用业务色。
  if (theme === 'follow') {
    const primary = components.dsh[mode].primary;
    result['--primary-bg'] = `var(--dsw-alias-button-primary-fill,${primary})`;
    result['--primary-hover'] = `var(--dsw-alias-button-primary-hover,${primary})`;
    result['--switch-bg'] = `var(--dsw-alias-brand-primary,${primary})`;
  }
  result['--on'] = result['--on-primary']!;
  result['--soft'] = result['--selected-bg']!;
  result['--warntext'] = result['--warning']!;
  result['--warn'] = kind === 'violet' ? (dark ? '#35290f' : '#fff4e0') : (dark ? '#27241f' : '#fef5e7');
  return result as CSSProperties;
}
