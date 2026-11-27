'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('../arena/combat');
const skills = require('../arena/hero-skills');

const idle = () => ({ x: 0, y: 0 });

function setup(hero, enemy = 'gamma', ally = 'sky') {
  const ids = [hero, enemy, ally, 'sky', 'oshi', 'beta', 'tanjun', 'sain', 'kosain', 'frost'];
  const players = ids.map((id, index) => ({ id: String(index), name: id, hero: id,
    job: combat.playableHeroes[id].job, bot: false }));
  const room = { id: 'TEST', players };
  combat.start(room, 0);
  room.map = { ...room.map, tiles: Array(100).fill('g'.repeat(100)) };
  const [self, foe, friend] = players;
  place(self, 1000, 1000);
  place(foe, 1040, 1000);
  place(friend, 1000, 1050);
  for (const player of players.slice(3)) place(player, 2800, 2800);
  return { room, self, foe, friend };
}
function place(player, x, y) { Object.assign(player, { x, y }); }
function cast(room, player, slot, now, { ally, enemy } = {}) {
  return combat.cast(room, player, { slot, ally: ally?.id, enemy: enemy?.id }, now);
}
function strike(room, attacker, victim, now) {
  combat.attack(room, attacker, victim.x, victim.y, false, now);
}

test('Sky shields, reflects, accelerates and is invisible with five healing pulses', () => {
  const { room, self, foe } = setup('sky');
  const hp = self.hp;
  const enemyHp = foe.hp;
  assert.ok(cast(room, self, 0, 100).ok);
  strike(room, foe, self, 110);
  assert.equal(self.hp, hp - 253);
  assert.equal(foe.hp, enemyHp - 45);
  assert.ok(cast(room, self, 0, 111).error);
  assert.ok(cast(room, self, 1, 120).ok);
  assert.equal(skills.speedMultiplier(self, 130), 1.25);
  self.hp = 4000;
  assert.ok(cast(room, self, 2, 200).ok);
  assert.equal(combat.snapshot(room, 210, foe).players.some(p => p.id === self.id), false);
  assert.equal(combat.canTarget(foe, self, 210), false);
  strike(room, foe, self, 1100);
  assert.equal(self.hp, 4000);
  for (let now = 1200; now <= 5200; now += 1000) combat.tick(room, now, 0, idle);
  assert.equal(self.hp, 5600);
  assert.equal(combat.canTarget(foe, self, 5200), true);
});

test('Oshi rejects invalid targets, roots, accelerates and takes no incoming damage in void', () => {
  const { room, self, foe, friend } = setup('oshi');
  assert.ok(cast(room, self, 0, 100, { enemy: friend }).error);
  assert.ok(cast(room, self, 0, 100, { enemy: foe }).ok);
  assert.equal(skills.active(foe, 'root', 150).until, 2100);
  assert.ok(cast(room, self, 1, 110).ok);
  assert.equal(skills.speedMultiplier(self, 150), 1.3);
  assert.ok(cast(room, self, 2, 120).ok);
  strike(room, foe, self, 150);
  assert.equal(self.hp, 10000);
  assert.equal(self.skillTimes[2], 35120);
});

test('Frost reduces damage, interrupts a channel on knockback, and teleports next to a teammate', () => {
  const { room, self, foe, friend } = setup('frost', 'alpha');
  cast(room, self, 0, 100);
  strike(room, foe, self, 110);
  assert.equal(self.hp, 6518);
  cast(room, foe, 1, 120);
  const before = foe.x;
  assert.ok(cast(room, self, 1, 130, { enemy: foe }).ok);
  assert.ok(foe.x > before);
  assert.equal(skills.active(foe, 'burn', 140), null);
  place(friend, 2000, 2000);
  assert.ok(cast(room, self, 2, 140, { ally: friend }).ok);
  assert.ok(combat.distance(self, friend) <= 58);
});

test('Sain shields both targets and heals an ally, then pulls a foe with damage immunity', () => {
  const { room, self, foe, friend } = setup('sain');
  assert.ok(cast(room, self, 0, 100, { ally: friend }).ok);
  assert.equal(skills.active(self, 'supportShield', 105).reduction, .3);
  assert.equal(skills.active(friend, 'supportShield', 105).reduction, .3);
  friend.hp = 4000;
  assert.ok(cast(room, self, 1, 110, { ally: friend }).ok);
  assert.equal(friend.hp, 5200);
  place(foe, 1120, 1000);
  assert.ok(cast(room, self, 2, 120, { enemy: foe }).ok);
  assert.ok(combat.distance(self, foe) < 50);
  assert.equal(skills.active(foe, 'immune', 125).until, 1120);
});

test('Kosain pulses health, boosts an ally, and only strips buffs granted by support', () => {
  const { room, self, foe, friend } = setup('kosain');
  self.hp = 2000;
  friend.hp = 4000;
  assert.ok(cast(room, self, 0, 100).ok);
  for (const now of [1100, 2100, 3100]) combat.tick(room, now, 0, idle);
  assert.equal(self.hp, 2795);
  assert.equal(friend.hp, 5200);
  assert.ok(cast(room, self, 1, 3200, { ally: friend }).ok);
  assert.equal(skills.attackMultiplier(friend, 3250), 1.11);
  foe.powers.set('supportSpeed', { until: 8000, factor: 1.25, support: true });
  cast(room, foe, 1, 3200);
  assert.ok(cast(room, self, 2, 3300, { enemy: foe }).ok);
  assert.equal(skills.active(foe, 'supportSpeed', 3350), null);
  assert.ok(skills.active(foe, 'surge', 3350));
});

test('Tanjun provides speed, control immunity and a single low-health heal', () => {
  const { room, self, foe, friend } = setup('tanjun', 'oshi');
  assert.ok(cast(room, self, 0, 100).ok);
  assert.equal(skills.speedMultiplier(friend, 110), 1.25);
  friend.hp = 1000;
  assert.ok(cast(room, self, 1, 110, { ally: friend }).ok);
  assert.equal(friend.hp, 1800);
  assert.ok(cast(room, foe, 0, 120, { enemy: friend }).error);
  assert.equal(foe.skillTimes[0], 0);
  assert.ok(cast(room, self, 2, 130, { enemy: foe }).ok);
  assert.equal(skills.active(foe, 'root', 135).until, 830);
});

test('Alpha primes one attack and burns 200 HP per pulse for compounding attack', () => {
  const { room, self, foe } = setup('alpha');
  assert.ok(cast(room, self, 0, 100).ok);
  strike(room, self, foe, 110);
  assert.equal(foe.hp, 7405);
  strike(room, self, foe, 900);
  assert.equal(foe.hp, 7008);
  assert.ok(cast(room, self, 1, 1000).ok);
  for (const [now, damage] of [[2000, 650], [3000, 845], [4000, 1098]]) {
    combat.tick(room, now, 0, idle);
    assert.equal(Math.round(combat.stats(self).damage * skills.attackMultiplier(self, now)), damage);
  }
  assert.equal(self.hp, 5900);
  assert.ok(cast(room, self, 2, 4050).ok);
  assert.equal(skills.speedMultiplier(self, 4100), 1.3);
});

test('Beta splits damage 90/10, reflects 20% of absorption, and remembers form health', () => {
  const { room, self, foe, friend } = setup('beta');
  place(foe, 1040, 1050);
  assert.ok(cast(room, self, 0, 100, { ally: friend, enemy: foe }).ok);
  strike(room, foe, friend, 110);
  assert.equal(self.hp, 9620);
  assert.equal(friend.hp, 7958);
  assert.equal(foe.hp, 7940);
  assert.ok(cast(room, self, 1, 120, { enemy: foe }).ok);
  assert.equal(foe.hp, 7269);
  self.powers.set('root', { until: 500 });
  assert.ok(cast(room, self, 2, 130).ok);
  assert.deepEqual([self.hp, combat.stats(self).speed, combat.stats(self).damage], [5000, 340, 500]);
  assert.equal(skills.active(self, 'root', 131), null);
  self.hp = 3690;
  assert.ok(cast(room, self, 2, 45130).ok);
  assert.equal(self.hp, 9620);
  assert.ok(cast(room, self, 2, 90130).ok);
  assert.equal(self.hp, 3690);
});

test('Gamma swaps, grants a two-second shield and hits only the closest three visible foes', () => {
  const { room, self, foe } = setup('gamma');
  assert.ok(cast(room, self, 0, 100, { enemy: foe }).ok);
  assert.deepEqual([self.x, foe.x], [1040, 1000]);
  assert.equal(skills.active(foe, 'root', 110).until, 1100);
  assert.equal(skills.active(self, 'shield', 110).reduction, .5);
  assert.ok(cast(room, self, 1, 110).ok);
  assert.equal(skills.speedMultiplier(self, 115), 1.12);
  const [second, third, far] = room.players.filter(p => p.team !== self.team && p !== foe);
  place(second, 1100, 1000);
  place(third, 1120, 1000);
  place(far, 1190, 1000);
  const before = [foe, second, third, far].map(p => p.hp);
  assert.ok(cast(room, self, 2, 120).ok);
  assert.deepEqual([foe, second, third, far].map((p, i) => before[i] - p.hp), [253, 236, 222, 0]);
});

test('live armor and rounded speeds are shared and crew health includes distant wiped teammates', () => {
  const speeds = { sky: 300, oshi: 270, frost: 330, sain: 400, kosain: 350, tanjun: 250, alpha: 500, beta: 230, gamma: 330 };
  for (const [hero, speed] of Object.entries(speeds)) {
    assert.equal(combat.stats({ hero }).speed, speed);
    assert.equal(combat.stats({ hero }).defense, combat.playableHeroes[hero].defense);
  }
  assert.equal(combat.stats({ hero: 'beta', form: 1 }).defense, 22);
  const { room, self, foe, friend } = setup('sky');
  place(friend, 2900, 2900);
  friend.alive = false;
  friend.hp = 0;
  assert.equal(combat.snapshot(room, 10, self).players.some(p => p.id === friend.id), false);
  const status = combat.snapshot(room, 10, self).teammates.find(p => p.id === friend.id);
  assert.deepEqual([status.alive, status.hp, status.maxHp], [false, 0, 8000]);
  assert.ok(cast(room, self, 0, 100).ok);
  assert.ok(combat.snapshot(room, 110, foe).effects.some(effect => effect.appearance === 'shield'));
  assert.ok(cast(room, self, 2, 200).ok);
  assert.equal(combat.snapshot(room, 210, foe).effects.some(effect => effect.actor === self.id), false);
  self.alive = false;
  place(foe, 2950, 2950);
  assert.ok(combat.snapshot(room, 220, self).players.some(p => p.id === foe.id));
});
