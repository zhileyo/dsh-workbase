import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorMutationRelevant } from '../src/client/PluginUpdate.js';

const outside = { closest: () => null, querySelector: () => null };
const inside = { closest: (selector: string) => (selector === '[data-plugin-toolbar]' ? {} : null), querySelector: () => null };
const wrapper = (hasToolbar: boolean) => ({ closest: () => null, querySelector: () => (hasToolbar ? {} : null) });

test('插件更新入口只对工具栏范围内的 DOM 变更重新定位', () => {
  assert.equal(anchorMutationRelevant({ type: 'childList', target: outside, addedNodes: [outside], removedNodes: [] }), false,
    '会话流式输出等工具栏之外的节点变化不触发全文档重扫');
  assert.equal(anchorMutationRelevant({ type: 'attributes', target: outside }), false, '工具栏之外的 disabled 变化不触发');
  assert.equal(anchorMutationRelevant({ type: 'attributes', target: inside }), true, '工具栏内部的按钮状态变化仍要触发');
  assert.equal(anchorMutationRelevant({ type: 'childList', target: outside, addedNodes: [inside], removedNodes: [] }), true,
    '新出现的工具栏节点要触发');
  assert.equal(anchorMutationRelevant({ type: 'childList', target: outside, addedNodes: [wrapper(true)], removedNodes: [] }), true,
    '包着工具栏的容器插入也要触发');
  assert.equal(anchorMutationRelevant({ type: 'childList', target: outside, addedNodes: [{ closest: () => null, querySelector: () => null, parentElement: inside }], removedNodes: [] }), true,
    '工具栏内插入子节点要触发');
});
