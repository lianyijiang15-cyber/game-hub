'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateWorld, sceneForSeed, impassable } = require('../arena/world');
const { terrainBlocked } = require('../arena/collision');
const combat = require('../arena/combat');
const { createSecrets, tickSecrets, lookForSecret } = require('../arena/secrets');
const { achievementCatalog } = require('../accounts/achievements');

test('six seeded scenes have large bounded maps and contiguous passable land', () => {
  const drawings = new Set();
  for (let seed = 0; seed < 6; seed++) {
    const scene = sceneForSeed(seed);
    const map = generateWorld(seed, scene);
    drawings.add(scene);
    assert.deepEqual(map, generateWorld(seed, scene));
    assert.deepEqual([map.columns, map.rows, map.width, map.height], [144, 144, 4608, 4608]);
    assert.ok(map.tiles.every(row => row.startsWith('#') && row.endsWith('#')));
    const found = new Set([71 * map.columns + 71]);
    for (const cell of found) {
      const x = cell % map.columns;
      const y = Math.floor(cell / map.columns);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const tile = map.tiles[ny]?.[nx];
        if (tile && !impassable(tile)) found.add(ny * map.columns + nx);
      }
    }
    const open = map.tiles.reduce((count, row) => count + [...row].filter(tile => !impassable(tile)).length, 0);
    assert.equal(found.size, open);
  }
  assert.deepEqual([...drawings], ['forest', 'marsh', 'ruins', 'snow', 'inferno', 'fortress']);
});

test('scenic secrets rotate on delayed timers and discovery is nearby, personal and human only', () => {
  const room = { players: [{ id: 'a', accountKey: 'a', job: 'warrior' }, { id: 'b', accountKey: 'b', job: 'mage', bot: true }] };
  combat.start(room, 0, 45, 'snow');
  const state = room.secrets = createSecrets(room.map, () => 0);
  const [a, b] = room.players;
  tickSecrets(room, 0, combat.clearLine);
  tickSecrets(room, 17999, combat.clearLine);
  assert.equal(state.active, null);
  tickSecrets(room, 18000, combat.clearLine);
  assert.equal(state.active.kind, 'snow-secret');
  assert.equal(terrainBlocked(room.map, state.active.x, state.active.y), false);
  assert.equal(lookForSecret(room, a, combat.clearLine), null);
  assert.equal(combat.snapshot(room, 18000, a).fieldDetail, null);
  for (const player of [a, b]) Object.assign(player, { x: state.active.x, y: state.active.y });
  assert.equal(lookForSecret(room, a, combat.clearLine).visitor, false);
  tickSecrets(room, 18050, combat.clearLine);
  tickSecrets(room, 18100, combat.clearLine);
  assert.deepEqual(state.discoveries, [{ accountKey: 'a', playerId: 'a', kind: 'snow-secret' }]);
  assert.equal(lookForSecret(room, a, combat.clearLine), null);
  tickSecrets(room, 66000, combat.clearLine);
  assert.equal(state.active.kind, 'visitor');
});

test('achievement catalog redacts unknown entries and derives unlocks and coin rewards once per achievement', () => {
  const unknown = achievementCatalog({});
  assert.ok(unknown.arena.every(item => !item.title));
  assert.ok(unknown.soup.every(item => !item.reward));
  assert.ok(!unknown.arena.some(item => item.id === 'finisher'));
  const record = { result: 'win', mode: 'deathmatch', kills: 5, deaths: 0, chestsOpened: 50, finisher: true, finished: true };
  const value = achievementCatalog({ arenaHistory: [record, record], secrets: { 'snow-secret': 'found' } });
  assert.equal(value.coins, 100);
  assert.equal(value.arena.find(item => item.id === 'chest-hunter').count, 100);
  assert.equal(value.arena.find(item => item.id === 'finisher').rarity, 'legendary');
  assert.equal(value.soup.find(item => item.id === 'snow-secret').title, '雪封來信');
});
