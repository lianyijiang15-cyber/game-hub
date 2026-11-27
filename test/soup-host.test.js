'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startSoupGame, soupCase, soupView, playSoup, judgeSoupQuestion } = require('../public/soup-bank');
const { createSoupHost } = require('../ai/soup-host');

test('four illustrated mystery cases replace the removed key case and stay in their difficulties', () => {
  const ids = ['hotel-call', 'theater-shadow', 'blackout-window', 'laundry-knock'];
  assert.equal(soupCase('key'), undefined);
  for (const id of ids) assert.equal(soupCase(id).category, '懸疑');
  assert.equal(soupCase('blackout-window').difficulty, '困難');
  assert.equal(soupCase('laundry-knock').difficulty, '簡單');
  assert.equal(soupView(startSoupGame(() => 0.999, '簡單')).storyId, 'laundry-knock');
  assert.equal(soupView(startSoupGame(() => 0.999, '困難')).storyId, 'blackout-window');
});

test('soup matching distinguishes paraphrase, state denial, topic and uncertainty', () => {
  assert.deepEqual(judgeSoupQuestion('clock', '他是透過鏡面看到的嗎？'), { verdict: 'yes', group: 0 });
  assert.equal(judgeSoupQuestion('clock', '他沒有使用鏡子嗎？').verdict, 'no');
  assert.equal(judgeSoupQuestion('clock', '他是不是用鏡子？').verdict, 'yes');
  assert.equal(judgeSoupQuestion('clock', '他有沒有用鏡子？').verdict, 'yes');
  assert.equal(judgeSoupQuestion('clock', '這跟鏡面沒關係嗎？').verdict, 'no');
  assert.equal(judgeSoupQuestion('clock', '跟時間長短有關嗎？').verdict, 'related');
  assert.equal(judgeSoupQuestion('clock', '是工作的原因嗎？').verdict, 'unclear');
  const game = startSoupGame(() => 0, '簡單');
  playSoup(game, 'ask', '他沒有使用鏡子嗎？');
  assert.equal(game.progress, 0);
  playSoup(game, 'ask', '他是不是靠鏡面看到的嗎？');
  playSoup(game, 'ask', '他是用鏡子嗎？');
  assert.equal(game.progress, 1);
});

test('Ollama judges ambiguous wording, protects known relevance and falls back on failure', async () => {
  const calls = [];
  const host = createSoupHost({
    enabled: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ message: { content: '{"verdict":"unrelated"}' } }) };
    }
  });
  assert.equal(await host('clock', '跟時間有關嗎？'), 'related');
  assert.equal(await host('clock', '他今天叫了外賣嗎？'), 'unrelated');
  assert.match(calls[0].url, /\/api\/chat$/);
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.format.properties.verdict.type, 'string');

  let failures = 0;
  const unavailable = createSoupHost({ enabled: true, fetchImpl: async () => { failures++; throw Error('offline'); } });
  assert.equal(await unavailable('clock', '他從鏡面看到了什麼？'), 'yes');
  assert.equal(await unavailable('clock', '他的工作是什麼？'), 'unclear');
  assert.equal(failures, 1);
});
