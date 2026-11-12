import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateText, positionPopup, pickerWidth, popupIndex, preventImeSubmit } from '../src/client/ui.js';
import type { KeyboardEvent } from 'react';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

test('菜单无焦点时向上从末项开始，首尾循环与空列表安全', () => {
  assert.equal(popupIndex('ArrowUp', -1, 3), 2);
  assert.equal(popupIndex('ArrowDown', -1, 3), 0);
  assert.equal(popupIndex('ArrowUp', 0, 3), 2);
  assert.equal(popupIndex('ArrowDown', 2, 3), 0);
  assert.equal(popupIndex('Home', 1, 3), 0);
  assert.equal(popupIndex('End', 1, 3), 2);
  assert.equal(popupIndex('ArrowDown', -1, 0), -1);
});

test('单行表单输入法确认不提交，普通 Enter 保留提交行为', () => {
  for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }, { isComposing: false }]) {
    let prevented = false;
    preventImeSubmit({ key: 'Enter', nativeEvent, preventDefault() { prevented = true; } } as unknown as KeyboardEvent);
    assert.equal(prevented, !!(nativeEvent.isComposing || nativeEvent.keyCode === 229));
  }
});

test('简短选择菜单跟随控件宽度，说明菜单统一360px并设上限', () => {
  assert.equal(pickerWidth(140, false), 140);
  assert.equal(pickerWidth(180, false), 180);
  assert.equal(pickerWidth(450, false), 360);
  assert.equal(pickerWidth(80, false), 140);
  assert.equal(pickerWidth(140, true), 360);
  assert.equal(pickerWidth(450, true), 360);
});

test('最近活动时间按刚刚、分钟、小时、天前递进，超过一周仍显示天数', () => {
  const now = Date.now();
  assert.equal(dateText(0), '暂无活动');
  assert.equal(dateText(now - 10 * 1000), '刚刚');
  assert.equal(dateText(now - MIN), '1 分钟前');
  assert.equal(dateText(now - 32 * MIN), '32 分钟前');
  assert.equal(dateText(now - HOUR), '1 小时前');
  assert.equal(dateText(now - 5 * HOUR), '5 小时前');
  assert.equal(dateText(now - 24 * HOUR), '1 天前');
  assert.equal(dateText(now - 3 * DAY), '3 天前');
  assert.equal(dateText(now - 7 * DAY), '7 天前');
  assert.equal(dateText(now - 40 * DAY), '40 天前');
});

test('添加浮层在面板顶部向下展开，底部向上展开且宽度不超出面板', () => {
  const area = { getBoundingClientRect: () => ({ left: 20, top: 0, right: 720, bottom: 600, width: 700 }) };
  let top = 50;
  const trigger = { closest: () => area, getBoundingClientRect: () => ({ left: 40, right: 72, top, bottom: top + 32 }) } as unknown as HTMLElement;
  const popup = { style: {} as CSSStyleDeclaration, getBoundingClientRect: () => ({ width: 640, height: 360 }) } as unknown as HTMLElement;
  positionPopup(popup, trigger, 'left', 640);
  assert.equal(popup.style.top, '90px');
  assert.equal(popup.style.left, '40px');
  assert.equal(popup.style.width, '640px');
  top = 500;
  positionPopup(popup, trigger, 'left', 640);
  assert.equal(popup.style.top, '132px');
});

test('设置下拉浮层限制在弹窗内部，靠右或靠底时自动调整位置', () => {
  const area = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 900, bottom: 650, width: 900 }) };
  const dialog = { getBoundingClientRect: () => ({ left: 45, top: 50, right: 855, bottom: 650, width: 810 }) };
  let top = 240;
  const trigger = {
    closest: (selector: string) => selector === '.wb' ? area : dialog,
    getBoundingClientRect: () => ({ left: 620, right: 800, top, bottom: top + 40 }),
  } as unknown as HTMLElement;
  const popup = {
    style: {} as CSSStyleDeclaration,
    getBoundingClientRect: () => ({ width: 360, height: 180 }),
  } as unknown as HTMLElement;
  positionPopup(popup, trigger, 'left', 360);
  assert.equal(popup.style.left, '487px');
  assert.equal(popup.style.maxWidth, '794px');
  assert.equal(popup.style.top, '288px');
  top = 580;
  positionPopup(popup, trigger, 'left', 360);
  assert.equal(popup.style.top, '392px');
});

test('弹窗小于下拉菜单时限制宽度与滚动高度', () => {
  const area = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 900, bottom: 650, width: 900 }) };
  const dialog = { getBoundingClientRect: () => ({ left: 600, top: 100, right: 850, bottom: 350, width: 250 }) };
  const trigger = {
    closest: (selector: string) => selector === '.wb' ? area : dialog,
    getBoundingClientRect: () => ({ left: 650, right: 800, top: 280, bottom: 320 }),
  } as unknown as HTMLElement;
  const style = {} as CSSStyleDeclaration;
  const popup = {
    style,
    getBoundingClientRect: () => ({ width: Number.parseFloat(style.width), height: Number.parseFloat(style.maxHeight) }),
  } as unknown as HTMLElement;
  positionPopup(popup, trigger, 'left', 360);
  assert.equal(popup.style.width, '234px');
  assert.equal(popup.style.maxHeight, '164px');
  assert.equal(popup.style.left, '608px');
  assert.equal(popup.style.top, '108px');
  positionPopup(popup, trigger, 'left', 360, 320);
  assert.equal(popup.style.maxHeight, '164px', '小窗口仍按可用空间缩小');
});

test('备份下拉在大面板中保持320px上限，按实际高度定位', () => {
  const area = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 900, bottom: 1000 }) };
  const trigger = {
    closest: () => area,
    getBoundingClientRect: () => ({ left: 100, right: 600, top: 100, bottom: 140 }),
  } as unknown as HTMLElement;
  const style = {} as CSSStyleDeclaration;
  const popup = { style, getBoundingClientRect: () => ({
    width: Number.parseFloat(style.width), height: Number.parseFloat(style.maxHeight),
  }) } as unknown as HTMLElement;
  positionPopup(popup, trigger, 'left', 500, 320);
  assert.equal(style.maxHeight, '320px');
  assert.equal(style.top, '148px');
});
