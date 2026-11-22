import type { CSSProperties } from 'react';
const base = {
  dsh: { light: ['#fff','#fff','#0f1115','#61666b','#0000001a','#2631480f'], dark: ['#151517','#232324','#f9fafb','#a8afb9','#ffffff1f','#ffffff14'] },
  fresh: { light: ['#f7f9fb','#fff','#22303c','#5f6a74','#e0e6eb','#edf3f0'], dark: ['#171f24','#1d282e','#e3eae9','#92a3a6','#334248','#283a38'] },
  warm: { light: ['#f6f3ed','#fcfaf6','#393c34','#6b6659','#dfdccf','#efeade'], dark: ['#242420','#2c2c27','#eeeadf','#aaa694','#44433b','#39382e'] },
  violet: { light: ['#fff','#fff','#1f2329','#636973','#e5e6eb','#f3f4f6'], dark: ['#1b1c1f','#242528','#e8eaed','#9099a3','#333539','#2a2b30'] },
};
const components = {
  dsh: { light: ['#f5f7fb','#3566cf','#fff','#e4edfd','#2856b3','#c62626','#778493','#61666b','#808a95','#fff','#151517','#26704b','#925b1d'], dark: ['#202023','#7aaaff','#151517','#34415b','#a9c7ff','#f25a5a','#98a6b4','#a8afb9','#83929e','#151517','#151517','#9dd2ae','#e4c08a'] },
  fresh: { light: ['#f0f5f2','#19654f','#fff','#e8f3ed','#19654f','#b94d44','#778493','#5f6a74','#808a95','#fff','#fff','#19654f','#925b1d'], dark: ['#202c32','#a1d2ba','#153326','#263e35','#a1d2ba','#f79d8e','#98a6b4','#92a3a6','#83929e','#153326','#153326','#a1d2ba','#e4c08a'] },
  warm: { light: ['#eeeae1','#785a39','#fffdf7','#eee5d5','#785a39','#ad5340','#77808a','#6b6659','#707c88','#fff','#fffdf7','#446a4b','#8a480c'], dark: ['#302f29','#dcc49e','#322717','#40392c','#dcc49e','#eba48d','#98a6b4','#aaa694','#83929e','#322717','#322717','#95c3a3','#e8c590'] },
  violet: { light: ['#f5f6f7','#8046f3','#fff','#f1ebfe','#6d35e0','#c62c25','#6a7078','#6a7078','#808791','#fff','#fff','#26704b','#a45600'], dark: ['#242528','#a688ff','#14101f','#2e2a3d','#b99cff','#ff7a72','#9099a3','#9099a3','#7e8792','#14101f','#14101f','#9dd2ae','#e8a33d'] },
};
export function themeStyle(theme: 'follow' | keyof typeof base, dark: boolean): CSSProperties {
  const kind = theme === 'follow' ? 'dsh' : theme;
  const mode = dark ? 'dark' : 'light';
  const names = ['bg','surface','text','muted','line','hover','panel','primary','on-primary','selected','selected-text','danger','focus','checkbox','control-line','switch-thumb-off','switch-thumb-on','success','warning'];
  const values = [...base[kind][mode], ...components[kind][mode]];
  const result = Object.fromEntries(names.map((name, i) => [`--wb-${name}`, values[i]]));
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
  for (const name of names) result[`--${name}`] = result[`--wb-${name}`]!;
  for (const [name, source] of Object.entries(aliases)) result[`--${name}`] = result[`--wb-${source}`]!;
  result['--accent'] = result['--wb-primary']!;
  // 主按钮与强调文字分开：官方按钮可能采用黑白配色，强调文字仍使用业务色。
  if (theme === 'follow') {
    const primary = components.dsh[mode][1]!;
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
