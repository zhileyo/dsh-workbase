import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateText } from '../src/client/ui.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

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
