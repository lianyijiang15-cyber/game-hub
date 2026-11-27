'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const { botInput, route } = require('../arena/bots');
const idle = () => ({ x: 0, y: 0 });

function match(jobs = ['warrior', 'mage']) {
  const room = { players: Array.from({ length: 10 }, (_, index) => ({
    id: String(index), name: String(index), job: jobs[index % jobs.length], bot: false
  })) };
  combat.start(room, 0);
  return room;
}

test('map, normalized movement, wall blocking and character collision', () => {
  const room = match();
  assert.ok(room.players.every(p => !combat.blocked(p.x, p.y)));
  const [player, enemy] = room.players;
  const start = { x: player.x, y: player.y };
  player.input = { x: 1, y: 1 };
  combat.tick(room, 50, 0.05, idle);
  assert.ok(Math.abs(combat.distance(player, start) - 7.5) < 0.001);
  Object.assign(player, { x: 268, y: 140, input: { x: 1, y: 0 }, inputAt: 50 });
  combat.tick(room, 100, 0.05, idle);
  assert.equal(player.x, 268);
  Object.assign(player, { x: 100, y: 80 });
  Object.assign(enemy, { x: 126, y: 80 });
  combat.tick(room, 150, 0.05, idle);
  assert.equal(player.x, 100);
});

test('ordinary attack, cooldown, whirlwind, death, respawn and 20 kills', () => {
  const room = match();
  const [source, target] = room.players;
  Object.assign(target, { x: 120, y: 80 });
  combat.attack(room, source, 120, 80, false, 50);
  assert.equal(target.hp, 56);
  combat.attack(room, source, 120, 80, false, 200);
  assert.equal(target.hp, 56);
  combat.attack(room, source, 120, 80, true, 250);
  assert.equal(target.hp, 18);
  combat.attack(room, source, 120, 80, false, 700);
  assert.equal(target.alive, false);
  assert.equal(room.score[source.team], 1);
  combat.tick(room, 3699, 0.05, idle);
  assert.equal(target.alive, false);
  combat.tick(room, 3700, 0.05, idle);
  assert.equal(target.hp, 80);
  room.score[source.team] = 19;
  Object.assign(target, { x: 120, y: 80, hp: 1 });
  combat.attack(room, source, 120, 80, false, 3750);
  assert.equal(room.winner, source.team);
  assert.equal(room.phase, 'ended');
  assert.deepEqual([source.kills, source.damage, target.deaths], [2, 81, 2]);
});

test('arrows and fireball travel on the server, explode and respect walls', () => {
  const room = match(['archer', 'mage']);
  const [archer, mage, ally, victim] = room.players;
  Object.assign(archer, { x: 160, y: 120 });
  Object.assign(mage, { x: 250, y: 120 });
  combat.attack(room, archer, 250, 120, true, 50);
  assert.equal(room.projectiles.length, 3);
  for (let time = 100; time <= 650; time += 50) combat.tick(room, time, 0.05, idle);
  assert.ok(mage.hp < 80);
  Object.assign(archer, { x: 260, y: 140 });
  Object.assign(ally, { x: 250, y: 170 });
  Object.assign(mage, { x: 346, y: 140 });
  Object.assign(victim, { x: 365, y: 177 });
  combat.attack(room, mage, archer.x, archer.y, false, 700);
  assert.equal(archer.hp, 100);
  combat.attack(room, mage, archer.x, archer.y, true, 750);
  for (let time = 800; time <= 1050; time += 50) combat.tick(room, time, 0.05, idle);
  assert.equal(archer.hp, 100);
  assert.equal(ally.hp, 100);
  assert.equal(victim.hp, 80);
  Object.assign(archer, { x: 427, y: 138 });
  Object.assign(ally, { x: 430, y: 172 });
  combat.attack(room, mage, archer.x, archer.y, true, 5750);
  for (let time = 5800; time <= 6150; time += 50) combat.tick(room, time, 0.05, idle);
  assert.equal(archer.hp, 66);
  assert.equal(ally.hp, 66);
  assert.equal(victim.hp, 80);
});

test('AI navigates around the central wall and completes a match without Ollama', () => {
  const room = match(['warrior', 'mage', 'archer']);
  assert.ok(route({ x: 400, y: 290 }, { x: 560, y: 290 }).length > 4);
  room.players.forEach(p => { p.bot = true; });
  for (let time = 50; room.phase === 'playing' && time <= 300000; time += 50) {
    combat.tick(room, time, 0.05, botInput);
  }
  assert.equal(room.phase, 'ended');
  assert.ok(Object.values(room.score).includes(20), JSON.stringify(room.score));
  assert.ok(room.players.some(p => p.damage > 0));
});
