'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { infer } = require('../ai/ollama-agent');

const state = { team: '紅隊', allowedTargets: ['enemy-1'] };
const mock = decision => async () => ({ ok: true, json: async () => ({
  message: { content: JSON.stringify(decision) }
}) });

test('future tactical adapter validates actions and target IDs', async () => {
  const valid = { action: 'attack', target: 'enemy-1', say: '向中央推進' };
  assert.deepEqual(await infer(state, { fetchImpl: mock(valid) }), valid);
  await assert.rejects(infer(state, { fetchImpl: mock({ ...valid, target: 'teammate' }) }), /Invalid/);
  await assert.rejects(infer(state, { fetchImpl: mock({ ...valid, action: 'teleport' }) }), /Invalid/);
  await assert.rejects(infer(state, { fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
});
