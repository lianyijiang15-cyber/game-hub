'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const modes = require('../arena/modes');
const { botInput } = require('../arena/bots');
const { terrainBlocked } = require('../arena/collision');

const minute = 60_000;
const start = 1_000;
function setup(mode, seed = 46) {
  const room = { id: 'test', mode, phase: 'lobby', players: Array.from({ length: 10 }, (_, i) => ({
    id: String(i), name: 'Player ' + i, job: 'warrior', bot: false
  })) };
  combat.start(room, start, seed);
  modes.begin(room, start);
  return room;
}

const idle = () => ({ x: 0, y: 0 });
const place = (player, point) => Object.assign(player, { x: point.x, y: point.y });

test('special modes use traversable balanced spawns and send teammate locations even beyond vision', () => {
  for (const mode of ['flag', 'survival', 'control']) {
    for (const seed of [8, 46, 323]) {
      const room = setup(mode, seed);
      const [player, enemy] = room.players;
      assert.ok(room.players.every(member => member.alive && !terrainBlocked(room.map, member.x, member.y)));
      assert.ok(combat.distance(player, enemy) > 1200);
      const ally = room.players.find(member => member !== player && member.team === player.team);
      place(ally, room.scenario.camps[1]);
      const snapshot = combat.snapshot(room, start, player);
      assert.equal(snapshot.scenario.markers.length, 5);
      assert.ok(snapshot.scenario.markers.every(marker => marker.team === player.team));
      assert.equal(snapshot.players.some(member => member.id === ally.id), false);
      if (mode === 'flag') {
        const { bases, flags } = room.scenario;
        assert.ok(combat.distance(bases[0], bases[1]) > 1200);
        assert.deepEqual(flags.map(flag => flag.team), bases.map(base => base.team));
        assert.ok(flags.every((flag, index) => combat.distance(flag, bases[index]) === 0 &&
          !terrainBlocked(room.map, flag.x, flag.y)));
        assert.ok(bases.some(base => base.team === player.team && combat.distance(base, player) <= base.radius));
      }
    }
  }
});

test('flag capture requires returning to base and a third delivery wins', () => {
  const room = setup('flag');
  const [red, blue] = room.players;
  const [home, flag] = room.scenario.flags;
  assert.ok(modes.respawns(room));
  assert.ok(combat.interact(room, red, flag.id, start).error);
  place(red, home);
  assert.ok(combat.interact(room, red, home.id, start).error);
  for (let capture = 1; capture <= 3; capture++) {
    const time = start + capture * 1000;
    place(red, flag.base);
    assert.match(combat.interact(room, red, flag.id, time).message, /奪取敵旗/);
    assert.ok(combat.interact(room, blue, flag.id, time).error);
    assert.equal(room.score[red.team], capture - 1);
    assert.equal(combat.snapshot(room, time, red).scenario.carrying, true);
    place(red, home.base);
    combat.tick(room, time + 50, 0, idle);
    assert.equal(room.score[red.team], capture);
  }
  assert.equal(room.winner, red.team);
  assert.equal(room.scenario.reason, 'captures');
  const timeout = setup('flag');
  timeout.score[blue.team] = 2;
  combat.tick(timeout, timeout.endsAt, 0, idle);
  assert.equal(timeout.winner, blue.team);
});

test('dropped flags can be returned by defenders or reset by timeout', () => {
  const room = setup('flag');
  const [red, blue] = room.players;
  const flag = room.scenario.flags[1];
  const drop = room.scenario.points.find(point => combat.distance(point, flag.base) > 200 &&
    combat.distance(point, room.scenario.bases[0]) > 200);
  place(red, flag.base);
  assert.ok(combat.interact(room, red, flag.id, start + 1).message);
  place(red, drop);
  red.alive = false;
  red.respawnAt = start + 3000;
  modes.eliminate(room, red, blue, start + 50);
  assert.equal(flag.carrier, null);
  assert.equal(combat.distance(flag, drop), 0);
  assert.equal(combat.snapshot(room, start + 50, blue).scenario.flags[1].status, 'dropped');
  place(blue, drop);
  assert.match(combat.interact(room, blue, flag.id, start + 100).message, /送回/);
  assert.equal(combat.distance(flag, flag.base), 0);
  combat.tick(room, start + 3000, 0, idle);
  assert.ok(red.alive);
  place(red, flag.base);
  combat.interact(room, red, flag.id, start + 3050);
  place(red, drop);
  modes.dropFlag(room, red, start + 3100);
  combat.tick(room, start + 23100, 0, idle);
  assert.equal(combat.distance(flag, flag.base), 0);
});

test('survival has real day supplies, secret night traps, exposure, and early elimination scoring', () => {
  const room = setup('survival');
  const [commander, enemy, support] = room.players;
  const dayGear = room.scenario.supplies.find(pack => pack.kind === 'gear');
  dayGear.trap = true;
  place(commander, dayGear);
  combat.interact(room, commander, dayGear.id, start + 1);
  assert.ok(commander.alive);
  assert.ok(commander.protectedUntil > start + 5 * minute);

  const night = start + 8 * minute;
  for (const player of room.players) player.protectedUntil = night + minute;
  combat.tick(room, night, 0, idle);
  assert.equal(room.scenario.night, true);
  assert.equal(room.scenario.beasts.length, 0);
  const medicine = room.scenario.supplies.find(pack => pack.kind === 'medicine');
  medicine.trap = true;
  place(support, medicine);
  const nearby = combat.snapshot(room, night, support).scenario.supplies.find(pack => pack.id === medicine.id);
  assert.equal(Object.hasOwn(nearby, 'trap'), false);
  combat.interact(room, support, medicine.id, night);
  assert.equal(room.scenario.beasts.length, 1);

  const gear = room.scenario.supplies.filter(pack => pack.kind === 'gear' && !pack.used).slice(0, 2);
  for (const pack of gear) pack.trap = true;
  place(support, gear[0]);
  combat.interact(room, support, gear[0].id, night);
  assert.equal(room.scenario.exposure[support.team], night + minute);
  place(commander, gear[1]);
  combat.interact(room, commander, gear[1].id, night);
  assert.equal(room.scenario.exposure[commander.team], night + 3 * minute);
  assert.equal(room.scenario.penalties[commander.team], 90_000);
  assert.ok(combat.snapshot(room, night, enemy).scenario.markers.some(marker => marker.team === commander.team));

  for (const player of room.players) {
    if (!player.alive || player.team === enemy.team) continue;
    player.alive = false;
    modes.eliminate(room, player, null, night + 30_000);
  }
  assert.ok(room.players.some(player => player.alive && player.team === enemy.team));
  assert.equal(room.phase, 'ended');
  assert.equal(room.scenario.reason, 'eliminated');
  assert.equal(room.winner, enemy.team);
  assert.equal(room.score[commander.team], 8 * minute + 18_000 - 90_000);
});

test('control relocates idle flags, awards each only once and supports all three steal conditions', () => {
  const room = setup('control');
  const [red, blue] = room.players;
  const [kept, idlePoint] = room.scenario.flags;
  const old = { ...idlePoint };
  assert.ok(room.scenario.flags.length >= 5 && room.scenario.flags.length <= 7);
  place(red, kept);
  combat.interact(room, red, kept.id, start + 3 * minute);
  const stationary = { x: kept.x, y: kept.y };
  combat.tick(room, start + 5 * minute, 0, idle);
  assert.deepEqual({ x: kept.x, y: kept.y }, stationary);
  assert.ok(combat.distance(idlePoint, old) >= 290);
  assert.ok(room.chests.every(chest => combat.distance(chest, idlePoint) > 112));
  combat.tick(room, start + 6 * minute, 0, idle);
  assert.equal(kept.owner, red.team);
  assert.equal(room.score[red.team], 1);
  place(blue, kept);
  assert.ok(combat.interact(room, blue, kept.id, start + 6 * minute + 1).error);

  for (const condition of ['all', 'three', 'officer']) {
    const duel = setup('control');
    const attackers = duel.players.filter(player => player.team === '藍隊');
    const defenders = duel.players.filter(player => player.team === '紅隊');
    const flag = duel.scenario.flags[0];
    const fighters = defenders.filter(player => player.role === 'fighter');
    const defendersToDefeat = { all: [fighters[0]], three: fighters, officer: [defenders[0]] }[condition];
    const guards = condition === 'all' ? defendersToDefeat : defenders;
    for (const guard of guards) place(guard, flag);
    const intruder = attackers[0];
    place(intruder, flag);
    combat.interact(duel, guards[0], flag.id, start);
    for (const defender of defendersToDefeat) {
      defender.alive = false;
      modes.eliminate(duel, defender, intruder, start + 1000);
    }
    assert.equal(flag.mark, null, condition);
    combat.interact(duel, intruder, flag.id, start + 2000);
    assert.equal(flag.mark.team, intruder.team);
    assert.equal(flag.mark.ends, start + 2000 + 3 * minute);
  }
});

test('special rooms share usable loot without mixing their objective mechanics', () => {
  for (const mode of ['flag', 'survival', 'control']) {
    const room = setup(mode);
    const state = room.scenario;
    assert.equal(room.chests.length, 48);
    for (const chest of room.chests) {
      assert.ok(state.camps.every(camp => combat.distance(camp, chest) > 320));
      assert.ok([...state.flags, ...state.supplies].every(object => combat.distance(object, chest) > 112));
    }
    const player = room.players[0];
    const chest = room.chests[0];
    place(player, chest);
    player.hp -= 500;
    const reward = combat.openChest(room, player, chest.id, start + 1);
    assert.equal(reward.slot, 0);
    const inventory = combat.snapshot(room, start + 2, player).inventory;
    assert.equal(inventory[0].id, player.inventory[0].id);
    assert.equal(inventory[0].label, reward.label);
    assert.ok(combat.openChest(room, player, chest.id, start + 3).error);
    assert.equal(combat.useItem(room, player, reward.slot, start + 4).label, reward.label);
    assert.equal(player.inventory[0], null);
    assert.equal(state.mode, mode);
    assert.equal(state.supplies.length > 0, mode === 'survival');
    assert.equal(state.beasts.length, 0);
    assert.equal(state.flags.some(flag => flag.id.startsWith('flag-')), mode === 'flag');
    assert.equal(state.flags.some(flag => flag.id.startsWith('point-')), mode === 'control');
  }
  const classic = setup('deathmatch');
  assert.equal(classic.scenario, null);
  assert.ok(classic.chests.length > 0);
});

test('survival airdrops are public, limited and restore proportional health; depletion ramps up', () => {
  const room = setup('survival');
  const player = room.players[0];
  const time = start + 3 * minute;
  combat.tick(room, time, 0, idle);
  const drop = room.scenario.supplies.find(pack => pack.kind === 'drop');
  const other = room.players[1];
  assert.ok(drop);
  assert.ok(combat.snapshot(room, time, other).scenario.supplies.some(pack => pack.id === drop.id));
  assert.ok(combat.interact(room, other, drop.id, time).error);
  place(player, drop);
  player.hp = 200;
  assert.ok(combat.interact(room, player, drop.id, time).message);
  assert.equal(player.hp, 440);
  assert.equal(player.protectedUntil, time + 270_000);
  assert.ok(combat.interact(room, player, drop.id, time).error);
  const expiry = player.protectedUntil;
  combat.tick(room, expiry, 0, idle);
  assert.equal(player.hp, 430);
  combat.tick(room, expiry + 60_000, 0, idle);
  assert.equal(player.hp, 406);
});

test('control pauses while contested, resumes when cleared, and loses progress if abandoned', () => {
  const room = setup('control');
  const [red, blue] = room.players;
  const [point] = room.scenario.flags;
  place(red, point);
  combat.interact(room, red, point.id, start);
  combat.tick(room, start + 10_000, 0, idle);
  assert.equal(point.mark.remaining, 170_000);
  place(blue, point);
  combat.tick(room, start + 20_000, 0, idle);
  assert.equal(point.mark.remaining, 170_000);
  assert.equal(point.mark.status, 'contested');
  place(blue, room.scenario.camps[1]);
  combat.tick(room, start + 25_000, 0, idle);
  assert.equal(point.mark.status, 'holding');
  place(red, room.scenario.camps[0]);
  combat.tick(room, start + 30_000, 0, idle);
  assert.equal(point.mark.status, 'vacant');
  combat.tick(room, start + 42_000, 0, idle);
  assert.equal(point.mark, null);
  assert.equal(room.score[red.team], 0);
});

test('objective bots move toward the flag or point even with an enemy in melee range', () => {
  for (const mode of ['flag', 'control']) {
    const room = setup(mode);
    const [bot, foe] = room.players;
    bot.bot = true;
    const grass = 'g'.repeat(room.map.columns);
    room.map = { ...room.map, tiles: Array(room.map.rows).fill(grass) };
    if (mode === 'flag') bot.slot = 2;
    const goal = combat.scenarioGoal(room, bot, start);
    assert.equal(goal.objectiveFirst, true);
    place(bot, { x: goal.x - 75, y: goal.y });
    place(foe, { x: bot.x, y: bot.y - 35 });
    const vector = botInput(room, bot, start + 50);
    assert.ok(vector.x > .8, mode);
    place(bot, { x: goal.x - 15, y: goal.y });
    botInput(room, bot, start + 100);
    if (mode === 'flag') {
      assert.equal(room.scenario.flags.find(flag => flag.team !== bot.team).carrier, bot);
      const home = room.scenario.bases.find(base => base.team === bot.team);
      const returning = combat.scenarioGoal(room, bot, start + 150);
      assert.deepEqual([returning.x, returning.y], [home.x, home.y]);
    } else {
      assert.ok(room.scenario.flags.some(point => point.mark?.team === bot.team));
    }
  }
});

test('survival bots choose safe night airdrops over fights and risky nearby packs', () => {
  const room = setup('survival');
  const [bot, foe] = room.players;
  const now = start + 9 * minute;
  const grass = 'g'.repeat(room.map.columns);
  room.map = { ...room.map, tiles: Array(room.map.rows).fill(grass) };
  room.scenario.night = true;
  bot.bot = true;
  bot.protectedUntil = now + 70_000;
  place(bot, { x: 1000, y: 1000 });
  place(foe, { x: 1000, y: 965 });
  const hazard = { id: 'test-risk', x: 1015, y: 1000, kind: 'gear', trap: true, used: false };
  const drop = { id: 'test-safe', x: 1120, y: 1000, kind: 'drop', used: false };
  room.scenario.supplies = [hazard, drop];
  assert.ok(botInput(room, bot, now).x > .8);
  assert.equal(hazard.used, false);
  place(bot, drop);
  botInput(room, bot, now + 1000);
  assert.equal(drop.used, true);
  assert.ok(bot.protectedUntil > now + 180_000);
});
