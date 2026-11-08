import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeStyle } from '../src/client/theme.js';

function luminance(hex: string) {
  if (hex.length === 4) hex = `#${hex.slice(1).split('').map(c => c + c).join('')}`;
  const rgb = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
test('四个主题的明暗外观满足正文、辅助文字、选中和主要按钮的对比度', () => {
  for (const theme of ['dsh', 'fresh', 'warm', 'violet'] as const) {
    for (const dark of [false, true]) {
      const style = themeStyle(theme, dark) as Record<string, string>;
      const pairs = [
        ['text', 'bg', 4.5], ['muted', 'bg', 4.5], ['muted', 'surface', 4.5],
        ['selected-text', 'selected', 4.5], ['on-primary', 'primary', 4.5],
        ['checkbox', 'surface', 3], ['focus', 'surface', 3],
      ] as const;
      for (const [foreground, background, minimum] of pairs) {
        const value = contrast(style[`--wb-${foreground}`]!, style[`--wb-${background}`]!);
        assert.ok(value >= minimum, `${theme}/${dark ? 'dark' : 'light'} ${foreground}/${background}: ${value.toFixed(2)}`);
      }
    }
  }
});

test('紫晶主题的面板、悬停与语义状态保持可读', () => {
  for (const dark of [false, true]) {
    const style = themeStyle('violet', dark) as Record<string, string>;
    for (const background of ['bg', 'surface', 'panel', 'hover', 'selected']) {
      for (const foreground of ['text', 'muted', 'danger', 'success', 'warning']) {
        const value = contrast(style[`--wb-${foreground}`]!, style[`--wb-${background}`]!);
        assert.ok(value >= 4.5, `violet/${dark ? 'dark' : 'light'} ${foreground}/${background}: ${value.toFixed(2)}`);
      }
    }
  }
});
