'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseBotPersona } = require('../arena/bot-personas');

test('bot personas select among all 20 distinct names and portraits without replacing occupied names', () => {
  const chosen = [];
  for (let i = 0; i < 20; i++) chosen.push(chooseBotPersona(chosen, undefined, () => 0));
  assert.equal(new Set(chosen.map(player => player.name)).size, 20);
  assert.deepEqual(chosen.map(player => player.botPersona), Array.from({ length: 20 }, (_, index) => index));
  assert.equal(chooseBotPersona([], undefined, count => count - 1).name, '少年啪');
  assert.equal(chooseBotPersona([{ name: '阿寶' }], '老皮', () => 0).name, '泡泡糖公主');
});
