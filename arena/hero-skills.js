'use strict';

const { playableHeroes } = require('../public/heroes');
const { terrainBlocked, playerBlocked, movePlayer } = require('./collision');

const proximity = 260;
const lockRange = 420;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const failure = error => ({ error });

function active(player, key, now) {
  const effect = player.powers?.get(key);
  return effect?.until > now ? effect : null;
}

function give(target, key, source, now, duration, details = {}) {
  target.powers.set(key, { source, until: now + duration, ...details });
}

function heal(target, amount, stats) {
  if (target.alive) target.hp = Math.min(stats(target).hp, target.hp + Math.round(amount));
}

function attackMultiplier(player, now) {
  return (active(player, 'force', now)?.factor ?? 1) * (active(player, 'surge', now) ? 1.12 : 1) *
    (active(player, 'burn', now)?.factor ?? 1);
}

function speedMultiplier(player, now) {
  return (active(player, 'speed', now)?.factor ?? 1) * (active(player, 'supportSpeed', now)?.factor ?? 1) *
    (active(player, 'surge', now) ? 1.12 : 1);
}

function allies(room, player, limit = Infinity) {
  return room.players.filter(p => p.alive && p !== player && p.team === player.team && distance(p, player) <= limit)
    .sort((a, b) => distance(a, player) - distance(b, player));
}

function enemies(room, player, now, line, limit, count = Infinity) {
  return room.players.filter(p => p.alive && p.team !== player.team && !active(p, 'invisible', now) &&
    distance(p, player) <= limit)
    .sort((a, b) => distance(a, player) - distance(b, player)).slice(0, count)
    .filter(target => line(player, target, 0, room.map));
}

function displace(room, target, opposite, amount) {
  const length = Math.max(1, distance(target, opposite));
  return movePlayer(room.map, room.players, target,
    (target.x - opposite.x) * amount / length, (target.y - opposite.y) * amount / length);
}

function root(target, source, now, duration) {
  give(target, 'root', source, now, duration);
  target.input = { x: 0, y: 0 };
  target.moving = false;
}

function interrupt(room, target) {
  target.action = null;
  for (const player of room.players) {
    for (const [key, effect] of player.powers ?? []) {
      if (effect.source === target && effect.channel) player.powers.delete(key);
    }
  }
}

function teleport(room, actor, ally) {
  for (const offset of [28, 42, 58]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = ally.x + dx * offset;
      const y = ally.y + dy * offset;
      if (terrainBlocked(room.map, x, y) || playerBlocked(room.players, actor, x, y)) continue;
      Object.assign(actor, { x, y, warped: (actor.warped ?? 0) + 1, input: { x: 0, y: 0 } });
      return true;
    }
  }
  return false;
}

const runners = {
  sky: [
    ({ self, grant }) => grant(self, 'shield', 5000, { reduction: .4, reflect: .1 }),
    ({ self, grant }) => grant(self, 'speed', 3000, { factor: 1.25 }),
    ({ self, grant, pulse }) => {
      grant(self, 'invisible', 5000, { channel: true });
      pulse(self, 'regenerate', 5, { fraction: .04 });
    }
  ],
  oshi: [
    ({ enemy, control, self, now }) => control(enemy, target => root(target, self, now, 2000)),
    ({ self, grant }) => grant(self, 'speed', 2000, { factor: 1.3 }),
    ({ self, grant }) => grant(self, 'immune', 2000)
  ],
  frost: [
    ({ self, grant }) => grant(self, 'shield', 4000, { reduction: .3 }),
    ({ enemy, control, self, room }) => control(enemy, target => {
      displace(room, target, self, 108);
      target.input = { x: 0, y: 0 };
      interrupt(room, target);
    }),
    ({ self, ally, room }) => !ally ? failure('請指定隊友') :
      teleport(room, self, ally) ? undefined : failure('隊友身邊沒有可瞬移的空位')
  ],
  sain: [
    ({ self, ally, grant }) => {
      if (!ally) return failure('請指定隊友');
      for (const target of [self, ally]) grant(target, 'supportShield', 3000, { reduction: .3, support: true });
    },
    ({ ally, stats }) => ally ? heal(ally, stats(ally).hp * .15, stats) : failure('請指定隊友'),
    ({ enemy, control, room, self, grant }) => control(enemy, target => {
      displace(room, target, self, -Math.max(0, distance(target, self) - 26));
      target.input = { x: 0, y: 0 };
      grant(target, 'immune', 1000);
    })
  ],
  kosain: [
    ({ self, nearAllies, pulse }) => {
      for (const target of [self, ...nearAllies]) pulse(target, 'teamHeal', 3, { fraction: .05, support: true });
    },
    ({ ally, grant }) => ally ? grant(ally, 'force', 2000, { factor: 1.11, support: true }) : failure('請指定隊友'),
    ({ enemy, now }) => {
      if (!enemy) return failure('請指定附近敵人');
      for (const [key, effect] of enemy.powers) {
        if (effect.support && effect.until > now) enemy.powers.delete(key);
      }
      for (const [key, effect] of enemy.buffs ?? []) {
        if (effect.support) enemy.buffs.delete(key);
      }
    }
  ],
  tanjun: [
    ({ nearAllies, grant }) => {
      if (!nearAllies.length) return failure('附近沒有隊友');
      for (const ally of nearAllies) grant(ally, 'supportSpeed', 3000, { factor: 1.25, support: true });
    },
    ({ ally, grant, stats }) => {
      if (!ally) return failure('請指定隊友');
      ally.powers.delete('root');
      ally.slowUntil = 0;
      grant(ally, 'controlImmune', 2000, { healReady: true, support: true });
      protectLowHealth(ally, stats, ally.powers.get('controlImmune'));
    },
    ({ enemy, control, self, now }) => control(enemy, target => root(target, self, now, 700))
  ],
  alpha: [
    ({ self }) => { self.nextAttack = true; },
    ({ self, pulse }) => pulse(self, 'burn', 3, { factor: 1, tail: 51 }),
    ({ self, grant }) => grant(self, 'speed', 2000, { factor: 1.3 })
  ],
  beta: [
    ({ self, ally, enemy, grant }) => ally && enemy ? grant(ally, 'absorb', 2000, { rebound: enemy, sourceForm: self.form, support: true }) :
      failure('請先指定隊友，再指定附近敵人'),
    ({ self, enemy, stats, now, hit }) => enemy ?
      hit(self, enemy, stats(self).damage * attackMultiplier(self, now) * 1.3) : failure('請指定附近敵人'),
    ({ self }) => {
      self.formHealth[self.form] = self.hp;
      self.formState[self.form] = { powers: self.powers, buffs: self.buffs, slowUntil: self.slowUntil };
      self.form = 1 - self.form;
      self.hp = self.formHealth[self.form];
      const stored = self.formState[self.form];
      self.powers = stored?.powers ?? new Map();
      self.buffs = stored?.buffs ?? new Map();
      self.slowUntil = stored?.slowUntil ?? 0;
    }
  ],
  gamma: [
    ({ self, enemy, control, room, now, grant }) => control(enemy, target => {
      const rest = room.players.filter(other => other !== target && other !== self);
      if (playerBlocked(rest, self, target.x, target.y) || playerBlocked(rest, target, self.x, self.y) ||
          terrainBlocked(room.map, target.x, target.y) || terrainBlocked(room.map, self.x, self.y)) return failure('無法安全換位');
      const { x, y } = self;
      Object.assign(self, { x: target.x, y: target.y, warped: (self.warped ?? 0) + 1, input: { x: 0, y: 0 } });
      Object.assign(target, { x, y, warped: (target.warped ?? 0) + 1 });
      root(target, self, now, 1000);
      grant(self, 'shield', 2000, { reduction: .5 });
    }),
    ({ self, grant }) => grant(self, 'surge', 2000, { reduction: .12 }),
    ({ self, nearEnemies, stats, now, hit }) => {
      if (!nearEnemies.length) return failure('附近沒有敵人');
      for (const enemy of nearEnemies) hit(self, enemy, stats(self).damage * attackMultiplier(self, now) * .5);
    }
  ]
};

const visuals = {
  sky: ['shield', 'speed', 'shift'], oshi: ['bind', 'speed', 'shift'], frost: ['shield', 'strike', 'shift'],
  sain: ['shield', 'heal', 'bind'], kosain: ['heal', 'speed', 'strike'], tanjun: ['speed', 'shield', 'bind'],
  alpha: ['strike', 'strike', 'speed'], beta: ['shield', 'strike', 'shift'], gamma: ['shift', 'speed', 'strike']
};

function cast(room, self, request, now, hooks) {
  const skill = request?.slot;
  const hero = playableHeroes[self.hero];
  if (!hero || !Number.isInteger(skill) || skill < 0 || skill > 2 || !self.alive ||
      room.phase !== 'playing' || now >= room.endsAt) return failure('目前無法施放技能');
  if (now < self.skillTimes[skill]) return failure('技能冷卻中');

  const nearAllies = allies(room, self, proximity).slice(0, 3);
  const friendly = allies(room, self);
  const ally = friendly.find(player => player.id === request.ally &&
    (self.hero === 'frost' && skill === 2 || distance(player, self) <= lockRange));
  const nearEnemies = enemies(room, self, now, hooks.clearLine, proximity, 3);
  const ranged = (self.hero === 'oshi' || self.hero === 'gamma') && skill === 0;
  const candidates = ranged ? enemies(room, self, now, hooks.clearLine, lockRange) : nearEnemies;
  const enemy = candidates.find(player => player.id === request.enemy);
  const origin = { x: self.x, y: self.y };
  const targets = new Set();
  const context = {
    room, self, ally, enemy, now, nearAllies, nearEnemies, ...hooks,
    hit(source, target, damage) {
      targets.add(target);
      hooks.hit(source, target, damage);
    },
    grant(target, key, duration, details) {
      targets.add(target);
      give(target, key, self, now, duration, details);
    },
    pulse(target, key, count, details) {
      targets.add(target);
      give(target, key, self, now, count * 1000 + (details.tail ?? 1), {
        ...details, channel: true, remaining: count, next: now + 1000
      });
    },
    control(target, apply) {
      if (!target) return failure('請指定範圍內的敵人');
      if (active(target, 'controlImmune', now)) return failure('對手目前免疫控制');
      targets.add(target);
      return apply(target);
    }
  };
  const result = runners[self.hero][skill](context);
  if (result?.error) return result;
  self.skillTimes[skill] = now + hero.skills[skill][1] * 1000;
  if (ally) targets.add(ally);
  if (enemy) targets.add(enemy);
  targets.add(self);
  const appearance = visuals[self.hero][skill];
  const emit = (point, target) => room.effects.push({
    type: 'hero-skill', appearance, x: point.x, y: point.y, actor: self.id, target,
    tint: appearance === 'heal' ? '#91ffb2' : hero.color, until: now + 720
  });
  if (distance(origin, self) > 1) emit(origin, self.id);
  for (const target of targets) emit(target, target.id);
  if (self.alive) self.action = { skill: true, until: now + 240 };
  return { ok: true, message: hero.skills[skill][0] };
}

function protectLowHealth(player, stats, ward) {
  const max = stats(player).hp;
  if (player.alive && ward?.healReady && player.hp < max * .15) {
    ward.healReady = false;
    heal(player, max * .1, stats);
  }
}

function tick(player, now, stats, selfDamage) {
  if (!player.alive || !player.powers) return;
  for (const [key, effect] of player.powers) {
    while (player.alive && effect.remaining > 0 && effect.next <= now) {
      effect.remaining--;
      effect.next += 1000;
      if (key === 'burn') {
        const base = stats(player).damage;
        effect.damage = Math.floor((effect.damage ?? base) * 1.3);
        effect.factor = effect.damage / base;
        selfDamage(player, 200);
      } else heal(player, stats(player).hp * effect.fraction, stats);
    }
    if (effect.until <= now) player.powers.delete(key);
  }
  protectLowHealth(player, stats, active(player, 'controlImmune', now));
}

function botCast(room, player, now, hooks) {
  const hero = playableHeroes[player.hero];
  if (!hero || now < (player.nextBotSkill ?? 0)) return;
  player.nextBotSkill = now + 500;
  const nearEnemies = enemies(room, player, now, hooks.clearLine, proximity, 3);
  const opponent = nearEnemies[0];
  const alliesNear = allies(room, player, lockRange);
  const ally = [...alliesNear].sort((a, b) => a.hp / hooks.stats(a).hp - b.hp / hooks.stats(b).hp)[0];
  const low = player.hp < hooks.stats(player).hp * .65;
  const options = {
    sky: [!!opponent, !opponent, low], oshi: [!!opponent, !opponent, low],
    frost: [!!opponent, !!opponent, low && !!ally && hooks.relocate !== false], sain: [!!opponent && !!ally, !!ally && ally.hp < hooks.stats(ally).hp * .8, !!opponent],
    kosain: [low || !!ally && ally.hp < hooks.stats(ally).hp * .75, !!opponent && !!ally, !!opponent && !!opponent.powers?.size],
    tanjun: [alliesNear.length > 0 && !opponent, !!ally && (low || !!opponent), !!opponent],
    alpha: [!!opponent, !!opponent && !low, !opponent], beta: [!!opponent && !!ally, !!opponent, low],
    gamma: [!!opponent && hooks.relocate !== false, !!opponent, !!opponent]
  }[player.hero];
  for (let slot = 0; slot < 3; slot++) {
    if (options[slot] && cast(room, player, { slot, ally: ally?.id, enemy: opponent?.id }, now, hooks).ok) break;
  }
}

module.exports = { active, attackMultiplier, speedMultiplier, cast, tick, protectLowHealth, botCast };
