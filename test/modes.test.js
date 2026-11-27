'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const modes = require('../arena/modes');
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
        const flag = room.scenario.flags[0];
        const distances = room.scenario.camps.map(camp => combat.distance(camp, flag));
        assert.ok(Math.min(...distances) > 600);
        assert.ok(Math.abs(distances[0] - distances[1]) <= 64);
      }
    }
  }
});

test('flag interactions validate proximity, stop at first pull, and use proximity at the deadline', () => {
  const room = setup('flag');
  const [red, blue] = room.players;
  const flag = room.scenario.flags[0];
  assert.ok(combat.interact(room, red, flag.id, start).error);
  place(red, flag);
  assert.equal(combat.interact(room, red, flag.id, start + 1).message, '已拔下敵隊旗幟');
  assert.equal(room.winner, red.team);
  place(blue, flag);
  assert.ok(combat.interact(room, blue, flag.id, start + 1).error);

  const timeout = setup('flag');
  const nearest = timeout.players[1];
  place(nearest, timeout.scenario.flags[0]);
  combat.tick(timeout, timeout.endsAt, 0, idle);
  assert.equal(timeout.winner, nearest.team);
  assert.equal(timeout.scenario.reason, 'closest');
});

test('flag beasts yield distinct herbs, antidote is single-player, and gas drains only after immunity expires', () => {
  const room = setup('flag');
  const [player, , ally] = room.players;
  const hp = player.hp;
  combat.tick(room, start + 5 * minute - 1, 0, idle);
  assert.equal(player.hp, hp);
  combat.tick(room, start + 5 * minute, 0, idle);
  assert.equal(player.hp, hp - 24);
  for (let species = 0; species < 3; species++) {
    const beast = room.scenario.beasts.find(entry => entry.species === species);
    beast.hp = 1;
    place(player, beast);
    combat.attack(room, player, beast.x + 1, beast.y, true, start + 5 * minute + species * 6000);
  }
  assert.deepEqual(room.scenario.herbs[player.team], [1, 1, 1]);
  assert.ok(modes.antidote(room, player, start + 5 * minute + 15_000).message);
  assert.deepEqual(room.scenario.herbs[player.team], [0, 0, 0]);
  assert.equal(ally.protectedUntil, start + 5 * minute);
  assert.ok(combat.snapshot(room, start, room.players[1]).scenario.herbs.every(count => count === 0));
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
    if (!player.alive) continue;
    player.alive = false;
    player.eliminatedAt = night + 30_000;
  }
  combat.tick(room, night + 30_000, 0, idle);
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
