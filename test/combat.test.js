'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const { generateWorld, impassable } = require('../arena/world');
const { botInput, route } = require('../arena/bots');
const idle = () => ({ x: 0, y: 0 });

function match(jobs = ['warrior', 'mage']) {
  const room = { players: Array.from({ length: 10 }, (_, index) => ({
    id: String(index), name: String(index), job: jobs[index % jobs.length], bot: false
  })) };
  combat.start(room, 0);
  return room;
}

test('seeded 100 × 100 worlds contain all terrain, connected land and safe separated spawns', () => {
  for (const seed of [0, 1, 412, 41729, 2147483648, 4294967295]) {
    const map = generateWorld(seed);
    assert.deepEqual(map, generateWorld(seed));
    assert.notDeepEqual(map.tiles, generateWorld(seed + 1).tiles);
    assert.deepEqual([map.width, map.height, map.tileSize, map.tiles.length], [3200, 3200, 32, 100]);
    assert.ok(map.tiles.every(row => row.length === 100 && row[0] === '#' && row[99] === '#'));
    for (const tile of 'gfrwdpbt') assert.ok(map.tiles.some(row => row.includes(tile)), tile);
    assert.equal(map.tiles[0], '#'.repeat(100));
    assert.equal(map.tiles[99], '#'.repeat(100));
    const waterRow = map.tiles.findIndex(row => row.includes('w'));
    const waterCol = map.tiles[waterRow].indexOf('w');
    assert.ok(combat.blocked((waterCol + 0.5) * 32, (waterRow + 0.5) * 32, 12, map));
    for (const [x, y] of [[-1, 1600], [3201, 1600], [1600, -1], [1600, 3201]]) {
      assert.ok(combat.blocked(x, y, 12, map));
    }

    const seen = new Set([4949]);
    for (const index of seen) {
      for (const next of [index - 1, index + 1, index - 100, index + 100]) {
        if (!impassable(map.tiles[Math.floor(next / 100)][next % 100])) seen.add(next);
      }
    }
    assert.equal(seen.size, map.tiles.join('').replace(/[rwt#]/g, '').length);
    const room = match();
    combat.start(room, 0, seed);
    assert.deepEqual(room.map, map);
    for (const player of room.players) {
      assert.ok(player.alive && !combat.blocked(player.x, player.y, 12, map));
      assert.ok(room.players.every(other => other === player || combat.distance(player, other) >= 72));
    }
  }
});

test('team camps are separated and local rendering does not hide opponents in tall grass', () => {
  const room = match();
  const [observer, enemy] = room.players;
  assert.equal(observer.hp, 800);
  for (const ally of room.players.filter(player => player.team === observer.team)) {
    for (const foe of room.players.filter(player => player.team !== observer.team)) {
      assert.ok(combat.distance(ally, foe) >= 1888);
      assert.equal(combat.canSee(ally, foe, room.map), false);
    }
  }
  const tiles = Array(100).fill('g'.repeat(100));
  tiles[20] = tiles[20].slice(0, 24) + 'b' + tiles[20].slice(25);
  room.map = { ...room.map, tiles };
  Object.assign(observer, { x: 640, y: 656 });
  Object.assign(enemy, { x: 784, y: 656 });
  assert.equal(combat.blocked(enemy.x, enemy.y, 12, room.map), false);
  assert.equal(combat.canSee(observer, enemy, room.map), false);
  assert.equal(combat.canSee(enemy, observer, room.map), true);
  assert.ok(combat.snapshot(room, 50, observer).players.some(player => player.id === enemy.id));
  enemy.x = 832;
  assert.equal(combat.canSee(observer, enemy, room.map), false);
  assert.equal(combat.clearLine(observer, enemy, 0, room.map), true);
  observer.x = 716;
  enemy.x = 784;
  assert.equal(combat.canSee(observer, enemy, room.map), true);
  assert.ok(combat.snapshot(room, 50, observer).players.some(player => player.id === enemy.id));
  observer.x = 1200;
  assert.equal(combat.canSee(observer, enemy, room.map), false);
});

test('normalized movement, rock blocking and character collision', () => {
  const room = match();
  assert.ok(room.players.every(p => !combat.blocked(p.x, p.y)));
  const [player, enemy] = room.players;
  const start = { x: player.x, y: player.y };
  player.input = { x: 1, y: 1 };
  combat.tick(room, 50, 0.05, idle);
  assert.ok(Math.abs(combat.distance(player, start) - 7.5) < 0.001);
  Object.assign(player, { x: 1363, y: 1392, input: { x: 1, y: 0 }, inputAt: 50 });
  combat.tick(room, 100, 0.05, idle);
  assert.equal(player.x, 1363);
  Object.assign(player, { x: 1200, y: 1600 });
  Object.assign(enemy, { x: 1226, y: 1600 });
  combat.tick(room, 150, 0.05, idle);
  assert.equal(player.x, 1200);
});

test('ordinary attack, cooldown, whirlwind, death, respawn and 20 kills', () => {
  const room = match();
  const [source, target] = room.players;
  Object.assign(source, { x: 1200, y: 1600 });
  Object.assign(target, { x: 1240, y: 1600, hp: 280 });
  combat.attack(room, source, 1240, 1600, false, 50);
  assert.equal(target.hp, 197);
  combat.attack(room, source, 1240, 1600, false, 200);
  assert.equal(target.hp, 197);
  combat.attack(room, source, 1240, 1600, true, 250);
  assert.equal(target.hp, 72);
  combat.attack(room, source, 1240, 1600, false, 700);
  assert.equal(target.alive, false);
  assert.equal(room.score[source.team], 1);
  combat.tick(room, 3699, 0.05, idle);
  assert.equal(target.alive, false);
  combat.tick(room, 3700, 0.05, idle);
  assert.equal(target.hp, 560);
  room.score[source.team] = 19;
  Object.assign(target, { x: 1240, y: 1600, hp: 1 });
  combat.attack(room, source, 1240, 1600, false, 3750);
  assert.equal(room.winner, source.team);
  assert.equal(room.phase, 'ended');
  assert.deepEqual([source.kills, source.damage, target.deaths], [2, 281, 2]);
});

test('arrows and fireball travel on the server, explode and respect rocks', () => {
  const room = match(['archer', 'mage']);
  const [archer, mage, ally, victim] = room.players;
  Object.assign(archer, { x: 1200, y: 1600 });
  Object.assign(mage, { x: 1290, y: 1600 });
  combat.attack(room, archer, 1290, 1600, true, 50);
  assert.equal(room.projectiles.length, 3);
  for (let time = 100; time <= 650; time += 50) combat.tick(room, time, 0.05, idle);
  assert.ok(mage.hp < 560);
  Object.assign(archer, { x: 1350, y: 1392 });
  Object.assign(ally, { x: 1328, y: 1392 });
  Object.assign(mage, { x: 1462, y: 1392 });
  Object.assign(victim, { x: 1700, y: 1500 });
  combat.attack(room, mage, archer.x, archer.y, false, 700);
  assert.equal(archer.hp, 600);
  combat.attack(room, mage, archer.x, archer.y, true, 750);
  for (let time = 800; time <= 1050; time += 50) combat.tick(room, time, 0.05, idle);
  assert.equal(archer.hp, 600);
  assert.equal(ally.hp, 600);
  assert.equal(victim.hp, 560);
  Object.assign(mage, { x: 1245, y: 1500 });
  Object.assign(archer, { x: 1300, y: 1500 });
  Object.assign(ally, { x: 1300, y: 1535 });
  combat.attack(room, mage, archer.x, archer.y, true, 5750);
  for (let time = 5800; time <= 6150; time += 50) combat.tick(room, time, 0.05, idle);
  assert.equal(archer.hp, 486);
  assert.equal(ally.hp, 486);
  assert.equal(victim.hp, 560);
});

test('AI navigates around the central rocks and completes a match without Ollama', () => {
  const room = match(['warrior', 'mage', 'archer']);
  assert.ok(route({ x: 1328, y: 1392 }, { x: 1456, y: 1392 }).length > 4);
  room.players.forEach(p => { p.bot = true; });
  for (let time = 50; room.phase === 'playing' && time <= 300000; time += 50) {
    combat.tick(room, time, 0.05, botInput);
  }
  assert.equal(room.phase, 'ended');
  assert.ok(Object.values(room.score).includes(20), JSON.stringify(room.score));
  assert.ok(room.players.some(p => p.damage > 0));
});

test('AI patrols past an obstructed waypoint and avoids a teammate blocking its route', () => {
  const room = match();
  const bot = room.players[0];
  const ally = room.players[2];
  const size = 100;
  const open = 'g'.repeat(size - 2);
  room.map = { width: 3200, height: 3200, columns: size, rows: size, tileSize: 32,
    tiles: Array.from({ length: size }, (_, index) => index === 0 || index === size - 1
      ? '#'.repeat(size) : '#' + open + '#') };
  const row = Math.floor(1472 / 32);
  const col = Math.floor((1600 + require('../arena/world').campOffset) / 32);
  const blockedRow = room.map.tiles[row];
  room.map.tiles[row] = blockedRow.slice(0, col) + 'w' + blockedRow.slice(col + 1);
  room.players = [bot, ally];
  Object.assign(bot, { bot: true, x: 1200, y: 1488 });
  Object.assign(ally, { x: 1227, y: 1488 });
  for (let time = 50; time <= 1000; time += 50) {
    combat.tick(room, time, .05, botInput, route);
  }
  assert.ok(bot.x > 1230, 'AI detours around its teammate');
  for (let time = 1050; time <= 21000; time += 50) {
    combat.tick(room, time, .05, botInput, route);
    if (bot.patrolHome) break;
  }
  assert.equal(bot.patrolHome, true, 'AI reaches the walkable waypoint and chooses a new patrol destination');
  const position = { x: bot.x, y: bot.y };
  for (let time = 21050; time <= 22050; time += 50) {
    combat.tick(room, time, .05, botInput, route);
  }
  assert.ok(combat.distance(bot, position) > 30);
});

test('attack range, timely assists and winner MVP are calculated on the server', () => {
  const room = match();
  const [killer, target, helper, other, late] = room.players;
  Object.assign(killer, { x: 1200, y: 1600 });
  Object.assign(helper, { x: 1195, y: 1600 });
  Object.assign(late, { x: 1218, y: 1610 });
  Object.assign(target, { x: 1260, y: 1600 });
  assert.equal(combat.snapshot(room, 0, killer).targetInRange, false);
  Object.assign(target, { x: 1240, y: 1600, hp: 230 });
  assert.equal(combat.snapshot(room, 0, killer).attackRange, 52);
  const hud = combat.snapshot(room, 0, killer);
  assert.equal(hud.targetInRange, true);
  assert.deepEqual(hud.attackTarget, { x: target.x, y: target.y });
  assert.equal(hud.attackCooldown, combat.stats(killer).cooldown);
  combat.attack(room, late, target.x, target.y, false, 100);
  combat.attack(room, helper, target.x, target.y, false, 8200);
  combat.attack(room, killer, target.x, target.y, false, 8300);
  assert.deepEqual([killer.kills, target.deaths, helper.assists, late.assists], [1, 1, 1, 0]);
  assert.equal(target.contributors.size, 0);
  Object.assign(other, { assists: 50, damage: 9999 });
  combat.tick(room, 300000, 0.05, idle);
  const final = combat.snapshot(room, 300000);
  assert.equal(final.mvp, killer.id);
  assert.equal(final.results.find(p => p.id === helper.id).assists, 1);
});

test('both teams award MVP and lowest KDA and the winning MVP is featured', () => {
  const room = match();
  const [redMvp, blueMvp, redLow, blueLow, redTie, blueTie] = room.players;
  Object.assign(redMvp, { kills: 7, assists: 3, deaths: 1, damage: 700 });
  Object.assign(blueMvp, { kills: 9, assists: 0, deaths: 1, damage: 900 });
  Object.assign(redLow, { kills: 0, assists: 0, deaths: 6, damage: 50 });
  Object.assign(blueLow, { kills: 0, assists: 0, deaths: 4, damage: 40 });
  Object.assign(redTie, { kills: 0, assists: 0, deaths: 6, damage: 120 });
  Object.assign(blueTie, { kills: 0, assists: 0, deaths: 3, damage: 12 });
  room.score['紅隊'] = 7;
  room.score['藍隊'] = 5;
  combat.tick(room, 300000, 0.05, idle);
  const final = combat.snapshot(room, 300000);
  assert.deepEqual(final.teamAwards, {
    紅隊: { mvp: redMvp.id, lowestKda: redLow.id },
    藍隊: { mvp: blueMvp.id, lowestKda: blueLow.id }
  });
  assert.equal(final.mvp, redMvp.id);
  room.winner = null;
  assert.equal(combat.snapshot(room, 300000).mvp, blueMvp.id);
});

test('nine heroes apply their server-side traits, including frost slow and storm cooldown', () => {
  const ids = Object.keys(combat.playableHeroes);
  assert.equal(ids.length, 9);
  for (const role of ['commander', 'support', 'fighter']) {
    assert.equal(ids.filter(id => combat.playableHeroes[id].role === role).length, 3);
  }

  const room = match();
  const [frost, opponent, storm] = room.players;
  Object.assign(frost, { hero: 'frostmage', job: 'mage' });
  Object.assign(storm, { hero: 'stormmage', job: 'mage' });
  Object.assign(opponent, { hero: 'frostguard', job: 'warrior' });
  combat.start(room, 0);
  assert.equal(opponent.hp, 980);
  room.map = { ...room.map, tiles: Array(100).fill('g'.repeat(100)) };
  Object.assign(frost, { x: 1200, y: 1500 });
  Object.assign(opponent, { x: 1255, y: 1500 });
  Object.assign(storm, { x: 1200, y: 1800 });
  combat.attack(room, frost, opponent.x, opponent.y, true, 100);
  combat.attack(room, storm, 1400, 1800, true, 100);
  assert.equal(storm.skillAt, 4000);
  assert.equal(room.projectiles.find(projectile => projectile.source === storm).speed, 500);
  for (let now = 150; now <= 350; now += 50) combat.tick(room, now, .05, idle);
  assert.ok(opponent.hp < 980);
  assert.ok(opponent.slowUntil > 350);
  assert.equal(combat.snapshot(room, 350, frost).players.find(player => player.id === opponent.id).hero, 'frostguard');
});

test('random team assignment varies both roster order and starting side while balancing humans', () => {
  for (const humanCount of [1, 2, 3, 5, 10]) {
    const players = Array.from({ length: 10 }, (_, index) => ({ id: index, bot: index >= humanCount }));
    const samples = Array.from({ length: 6 }, (_, sample) => {
      let state = sample + 1;
      combat.assignTeams(players, max => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return Math.floor(state / 2 ** 32 * max);
      });
      const red = players.filter(player => player.team === '紅隊');
      const blue = players.filter(player => player.team === '藍隊');
      assert.equal(red.length, 5);
      assert.equal(blue.length, 5);
      assert.ok(Math.abs(red.filter(player => !player.bot).length - blue.filter(player => !player.bot).length) <= 1);
      assert.equal(new Set(red.map(player => player.slot)).size, 5);
      assert.equal(new Set(blue.map(player => player.slot)).size, 5);
      return players.map(({ team, slot }) => team + slot).join();
    });
    assert.ok(new Set(samples).size > 1);
    assert.deepEqual(players.map(player => player.id), Array.from({ length: 10 }, (_, index) => index));
  }
});
