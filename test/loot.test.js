'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const loot = require('../arena/loot');
const { terrainBlocked } = require('../arena/collision');

function match() {
  const room = { players: [{ job: 'warrior', id: 'a' }, { job: 'mage', id: 'b' }] };
  combat.start(room, 0);
  Object.assign(room.players[0], { x: 1200, y: 1600 });
  Object.assign(room.players[1], { x: 1240, y: 1600 });
  return room;
}

test('chests are spaced, reachable, outside the camps and use the specified quality thresholds', () => {
  for (const seed of [0, 1, 76, 41729, 4294967295]) {
    const room = match();
    combat.start(room, 0, seed);
    assert.equal(room.chests.length, 48);
    for (const chest of room.chests) {
      assert.equal(terrainBlocked(room.map, chest.x, chest.y), false);
      assert.ok(room.players.every(player => combat.distance(chest, player) >= 170));
      assert.ok(room.chests.every(other => other === chest || combat.distance(chest, other) > 160));
    }
  }
  assert.deepEqual([0, .699, .70, .949, .95, .999].map(loot.quality),
    ['common', 'common', 'rare', 'rare', 'legendary', 'legendary']);
});

test('opening stores one reward and both players see one opened chest', () => {
  const room = match();
  const [first, second] = room.players;
  room.chests = [{ id: 1, x: 1218, y: 1600, quality: 'common', openedAt: null }];
  const reachable = () => true;
  first.hp = 720;
  first.inventory.fill({ label: '舊道具' });
  assert.ok(loot.openChest(room, first, 1, 50, reachable).error);
  assert.equal(room.chests[0].openedAt, null);
  first.inventory[0] = null;
  assert.equal(loot.openChest(room, first, 1, 50, reachable, () => 0).label, '生命藥水');
  assert.ok(loot.openChest(room, second, 1, 50, reachable).error);
  assert.equal(first.hp, 720);
  assert.equal(combat.useItem(room, first, 0, 100).healing, 80);
  assert.equal(first.hp, 800);
  assert.equal(first.inventory[0], null);
  assert.deepEqual(combat.snapshot(room, 100, second).openedChestIds, [1]);
});

test('attack, speed, defense, immunity and one-use rune affect combat and expire', () => {
  const room = match();
  const [attacker, enemy] = room.players;
  room.chests = ['common', 'common', 'rare', 'legendary', 'legendary'].map((quality, index) => ({
    id: index + 1, x: 1218, y: 1600, quality, openedAt: null
  }));
  const reach = () => true;
  loot.openChest(room, attacker, 1, 0, reach, () => .9);
  loot.openChest(room, attacker, 2, 0, reach, () => .5);
  loot.openChest(room, enemy, 3, 0, reach, () => 0);
  loot.openChest(room, enemy, 4, 0, reach, () => 0);
  loot.openChest(room, attacker, 5, 0, reach, () => .9);
  combat.useItem(room, attacker, 0, 100);
  combat.useItem(room, attacker, 1, 100);
  combat.useItem(room, enemy, 0, 100);
  combat.attack(room, attacker, enemy.x, enemy.y, false, 100);
  assert.equal(enemy.hp, 483); // round(90 × 1.18 / 1.38)
  combat.useItem(room, enemy, 1, 200);
  combat.attack(room, attacker, enemy.x, enemy.y, false, 800);
  assert.equal(enemy.hp, 483);
  const y = attacker.y;
  attacker.input = { x: 0, y: 1 };
  attacker.inputAt = 900;
  combat.tick(room, 900, .05, () => ({ x: 0, y: 0 }));
  assert.ok(Math.abs(attacker.y - y - 8.85) < 1e-6);
  assert.deepEqual(loot.modifiers(attacker, 8100), { attack: 1, speed: 1, defense: 0, immune: false });
  combat.useItem(room, attacker, 2, 13000);
  assert.equal(combat.castRune(room, attacker, 13100), true);
  assert.equal(combat.castRune(room, attacker, 13101), false);
  assert.equal(enemy.hp, 379); // round((800 × .05 + 90 × .8) / 1.08)
});


test('hero healing follows the active max HP and cannot overfill or waste a potion at full health', () => {
  const room = match();
  const [player] = room.players;
  room.chests = [
    { id: 1, x: 1200, y: 1600, quality: 'common', openedAt: null },
    { id: 2, x: 1200, y: 1600, quality: 'rare', openedAt: null }
  ];
  Object.assign(player, { hero: 'beta', form: 0, hp: 10000 });
  loot.openChest(room, player, 1, 50, () => true, () => 0);
  assert.match(combat.snapshot(room, 60, player).inventory[0].description, /15%.*1500 HP/);
  assert.ok(combat.useItem(room, player, 0, 60).error);
  player.hp = 5000;
  assert.equal(combat.useItem(room, player, 0, 70).healing, 1500);

  loot.openChest(room, player, 2, 80, () => true, () => .5);
  Object.assign(player, { form: 1, hp: 4000 });
  assert.match(combat.snapshot(room, 90, player).inventory[0].description, /30%.*1500 HP/);
  assert.equal(combat.useItem(room, player, 0, 90).healing, 1000);
  assert.equal(player.hp, 5000);
});
