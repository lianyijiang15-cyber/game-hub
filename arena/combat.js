'use strict';

const { generateWorld, solid, impassable, campOffset } = require('./world');
const { halfWidth, halfHeight, terrainBlocked, playerBlocked, movePlayer } = require('./collision');
const loot = require('./loot');
const modes = require('./modes');
const skill = require('./hero-skills');
const { heroes, playableHeroes, adjustedSpeed } = require('../public/heroes');
const map = generateWorld();
const visionRadius = 360;
const grassRevealRadius = 80;
const sightObstacle = tile => solid(tile) || tile === 'b';
const classes = {
  warrior: { hp: 800, defense: 35, speed: 150, range: 52, damage: 90, skillDamage: 135, cooldown: 650 },
  archer: { hp: 600, defense: 12, speed: 185, range: 240, damage: 72, skillDamage: 47, cooldown: 850 },
  mage: { hp: 560, defense: 8, speed: 165, range: 190, damage: 86, skillDamage: 128, cooldown: 950 }
};
const jobs = Object.keys(classes);
const heroStats = Object.fromEntries(Object.entries(heroes).map(([id, hero]) =>
  [id, playableHeroes[id] ? { ...classes[hero.job], hp: hero.hp, speed: adjustedSpeed(hero.speed), damage: hero.damage, defense: hero.defense } :
    { ...classes[hero.job], ...hero.stats }]));
function stats(player) {
  const base = heroStats[player.hero] ?? classes[player.job];
  return player.hero === 'beta' && player.form === 1 ? { ...base, hp: 5000, speed: adjustedSpeed(670), damage: 500, defense: 22 } : base;
}
const teams = ['紅隊', '藍隊'];
const radius = 12;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function intersectsTiles({ tiles, tileSize }, left, top, right, bottom, matches) {
  for (let row = Math.floor(top / tileSize); row <= Math.floor(bottom / tileSize); row++) {
    for (let col = Math.floor(left / tileSize); col <= Math.floor(right / tileSize); col++) {
      const tile = tiles[row]?.[col];
      if (tile && matches(tile, col * tileSize, row * tileSize)) return true;
    }
  }
  return false;
}

function blocked(x, y, padding = radius, world = map, obstacle = impassable) {
  const { width, height } = world;
  if (x - padding < 0 || y - padding < 0 || x + padding >= width || y + padding >= height) return true;
  return intersectsTiles(world, x - padding, y - padding, x + padding, y + padding, obstacle);
}

function axisSpan(origin, delta, low, high) {
  if (!delta) return origin > low && origin < high ? [-Infinity, Infinity] : null;
  const start = (low - origin) / delta;
  const end = (high - origin) / delta;
  return [Math.min(start, end), Math.max(start, end)];
}

function clearLine(a, b, padding = 0, world = map, obstacle = padding ? impassable : solid) {
  if (blocked(a.x, a.y, padding, world, obstacle) || blocked(b.x, b.y, padding, world, obstacle)) return false;
  return lineBetween(a, b, padding, padding, world, obstacle);
}

function walkLine(a, b, world) {
  return !terrainBlocked(world, a.x, a.y) && !terrainBlocked(world, b.x, b.y) &&
    lineBetween(a, b, halfWidth, halfHeight, world, impassable);
}

function lineBetween(a, b, padX, padY, world, obstacle) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return !intersectsTiles(world, Math.min(a.x, b.x) - padX, Math.min(a.y, b.y) - padY,
    Math.max(a.x, b.x) + padX, Math.max(a.y, b.y) + padY, (tile, left, top) => {
      if (!obstacle(tile)) return false;
      const xSpan = axisSpan(a.x, dx, left - padX, left + world.tileSize + padX);
      const ySpan = axisSpan(a.y, dy, top - padY, top + world.tileSize + padY);
      return xSpan && ySpan && Math.max(0, xSpan[0], ySpan[0]) < Math.min(1, xSpan[1], ySpan[1]);
    });
}

function inTallGrass(point, world) {
  return world.tiles[Math.floor(point.y / world.tileSize)]?.[Math.floor(point.x / world.tileSize)] === 'b';
}

function canSee(observer, target, world) {
  const gap = distance(observer, target);
  if (gap > visionRadius) return false;
  if (gap <= grassRevealRadius) return clearLine(observer, target, 0, world);
  // A player in cover can look out, while targets in tall grass stay concealed.
  if (inTallGrass(target, world)) return false;
  if (!inTallGrass(observer, world)) return clearLine(observer, target, 0, world, sightObstacle);
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  for (let step = 4; step < gap; step += 4) {
    const point = { x: observer.x + dx * step / gap, y: observer.y + dy * step / gap };
    if (!inTallGrass(point, world)) {
      return clearLine(observer, point, 0, world) && clearLine(point, target, 0, world, sightObstacle);
    }
  }
  return false;
}

function spawn(room, player, now) {
  const { width, height } = room.map;
  const side = player.team === teams[0] ? 1 : -1;
  const positions = room.scenario ? room.scenario.spawns[teams.indexOf(player.team)] :
    [0, -28, 28, -56, 56].map(offset => ({
      x: width / 2 - side * campOffset, y: height / 2 + side * ((player.slot - 2) * 72 + offset)
    }));
  for (const position of positions) {
    if (terrainBlocked(room.map, position.x, position.y) ||
        playerBlocked(room.players, player, position.x, position.y)) continue;
    player.form = 0;
    player.formHealth = player.hero === 'beta' ? [10000, 5000] : null;
    player.formState = player.hero === 'beta' ? [null, null] : null;
    Object.assign(player, position, {
      hp: stats(player).hp, alive: true, input: { x: 0, y: 0 }, inputAt: 0,
      angle: side === 1 ? 0 : Math.PI, facing: side === 1 ? 0 : Math.PI, moving: false,
      contributors: new Map(), buffs: new Map(), powers: new Map(), skillTimes: [0, 0, 0], nextAttack: false,
      route: null, routeAt: 0, routeTarget: null, lastSeen: null, botProgress: null, botDetour: null, patrolHome: false,
      nextBotSkill: 0, warped: 0, attackAt: 0, skillAt: 0, slowUntil: 0, respawnAt: 0, spawnedAt: now, hurtAt: 0, action: null
    });
    return;
  }
  player.respawnAt = now + 50;
}

function assignTeams(players) {
  const order = [...players].sort((a, b) => Number(a.bot) - Number(b.bot));
  order.forEach((player, index) => {
    player.team = teams[index % 2];
    player.slot = Math.floor(index / 2);
  });
}

function start(room, now, seed) {
  if (room.phase !== 'selection') assignTeams(room.players);
  Object.assign(room, {
    phase: 'playing', map: seed === undefined ? map : generateWorld(seed), score: { [teams[0]]: 0, [teams[1]]: 0 }, effects: [],
    projectiles: [], kills: [], sequence: 0, endsAt: now + modes.durations[modes.modeOf(room)], winner: null
  });
  modes.setup(room, room.map.seed);
  const scenario = room.scenario;
  room.chests = loot.generateChests(room.map, Math.random, scenario ? {
    camps: scenario.camps, objectives: [...scenario.flags, ...scenario.supplies]
  } : undefined);
  room.roster = [...room.players];
  room.roster.forEach(player => {
    Object.assign(player, {
      alive: false,
      inventory: Array(loot.inventorySize).fill(null),
      kills: 0, deaths: 0, assists: 0, damage: 0, drainAt: 0, role: null
    });
  });
  room.roster.forEach(player => spawn(room, player, now));
}

function defeat(room, target, source, now, attackerName) {
  target.alive = false;
  target.buffs.clear();
  target.powers?.clear();
  target.moving = false;
  target.input = { x: 0, y: 0 };
  target.respawnAt = now + 3000;
  target.deaths++;
  if (source) {
    source.kills++;
    for (const [teammate, hitAt] of target.contributors) {
      if (teammate !== source && teammate.team === source.team && now - hitAt <= 8000) teammate.assists++;
    }
    if (modes.modeOf(room) === 'deathmatch') room.score[source.team]++;
  }
  target.contributors.clear();
  modes.eliminate(room, target, source, now);
  room.kills.push({ id: ++room.sequence, attacker: attackerName, victim: target.name, team: source?.team ?? null });
  if (room.kills.length > 5) room.kills.shift();
  if (source && modes.modeOf(room) === 'deathmatch' && room.score[source.team] >= 20) modes.finish(room, now);
}

function attackTargets(room) { return room.players.concat(room.scenario?.beasts ?? []); }

function damagePlayer(room, source, target, raw, now, options = {}) {
  if (room.phase !== 'playing' || !target.alive || raw <= 0) return;
  const lootBonus = loot.modifiers(target, now);
  if (!options.direct && (lootBonus.immune || skill.active(target, 'immune', now))) return;
  const shield = skill.active(target, 'shield', now);
  const support = skill.active(target, 'supportShield', now);
  const surge = skill.active(target, 'surge', now);
  const absorb = !options.secondary && skill.active(target, 'absorb', now);
  let incoming = options.direct ? raw : raw * (1 - (shield?.reduction ?? 0)) *
    (1 - (support?.reduction ?? 0)) * (1 - (surge?.reduction ?? 0)) *
    (source ? 100 / (100 + stats(target).defense + lootBonus.defense) : 1);

  let diverted = 0;
  if (absorb?.source?.alive && absorb.source.form === absorb.sourceForm) {
    diverted = incoming * .9;
    incoming -= diverted;
  }
  const actual = Math.min(target.hp, Math.round(incoming));
  if (source && source !== target && actual > 0) {
    target.contributors.set(source, now);
    source.damage += actual;
  }
  target.hp -= actual;
  if (actual) target.hurtAt = now;
  if (target.hp <= 0) defeat(room, target, source, now, source?.name ?? options.cause);
  else skill.protectLowHealth(target, stats, skill.active(target, 'controlImmune', now));

  if (diverted) {
    damagePlayer(room, source, absorb.source, diverted, now, { direct: true, secondary: true, cause: options.cause });
    if (absorb.rebound.alive) {
      damagePlayer(room, absorb.source, absorb.rebound, diverted * .2, now, { secondary: true });
    }
  }
  if (!options.secondary && source?.alive && source.team !== target.team && shield?.reflect) {
    damagePlayer(room, target, source, raw * shield.reflect, now, { secondary: true });
  }
}

function environmentHit(room, player, damage, now, cause) {
  const direct = cause === '炸彈' || cause === '生命燃燒';
  damagePlayer(room, null, player, damage, now, { cause, direct, secondary: direct });
}

function hit(room, source, target, damage, now) {
  if (room.phase !== 'playing' || !target.alive || source.team === target.team) return;
  if (!target.team) return modes.hitBeast(room, source, target, damage);
  damagePlayer(room, source, target, damage, now);
}

function canTarget(player, target, now) {
  return target.team === player.team || !skill.active(target, 'invisible', now);
}

function cast(room, player, request, now) {
  return skill.cast(room, player, request, now, { clearLine, stats,
    hit: (source, target, damage) => hit(room, source, target, damage, now) });
}

const scenarioHooks = { clearLine, stats, environmentHit, movePlayer };

function effect(room, type, position, angle, range, team, now) {
  room.effects.push({ actor: position.id, type, x: position.x, y: position.y, angle, range, team, until: now + 240 });
}

function attack(room, player, x, y, useSkill, now) {
  if (room.phase !== 'playing' || !player.alive || now >= room.endsAt) return;
  if (useSkill && playableHeroes[player.hero]) return;
  const key = useSkill ? 'skillAt' : 'attackAt';
  if (now < player[key]) return;
  const job = stats(player);
  const attackBoost = loot.modifiers(player, now).attack * skill.attackMultiplier(player, now) *
    (!useSkill && player.nextAttack ? 1.5 : 1);
  if (!useSkill) player.nextAttack = false;
  const angle = Math.atan2(y - player.y, x - player.x);
  player[key] = now + (useSkill ? job.skillCooldown ?? 5000 : job.cooldown);
  Object.assign(player, { angle, facing: angle, action: { skill: useSkill, until: now + 240 } });

  if (useSkill && player.job !== 'warrior') {
    const arrows = player.job === 'archer';
    for (const spread of arrows ? [-0.18, 0, 0.18] : [0]) {
      room.projectiles.push({
        id: ++room.sequence, source: player, type: arrows ? 'arrow' : 'fireball',
        x: player.x, y: player.y, angle: angle + spread,
        damage: job.skillDamage * attackBoost, speed: job.projectileSpeed ?? (arrows ? 480 : 330),
        remaining: arrows ? 265 : 225, blast: job.blast ?? 66, slow: job.slow, tint: heroes[player.hero]?.color
      });
    }
    return;
  }

  const range = useSkill ? 90 : job.range;
  const enemies = attackTargets(room).filter(other => other.alive && other.team !== player.team && canTarget(player, other, now) &&
    distance(player, other) <= range && clearLine(player, other, 0, room.map) &&
    (useSkill || Math.cos(Math.atan2(other.y - player.y, other.x - player.x) - angle) >= Math.cos(0.30)));
  enemies.sort((a, b) => distance(player, a) - distance(player, b));
  for (const enemy of useSkill ? enemies : enemies.slice(0, 1)) hit(room, player, enemy, (useSkill ? job.skillDamage : job.damage) * attackBoost, now);
  effect(room, useSkill ? 'spin' : player.job, player, angle, range, player.team, now);
}

function advanceProjectile(room, projectile, dt, now) {
  const travel = Math.min(projectile.speed * dt, projectile.remaining);
  const steps = Math.ceil(travel / 3);
  const step = travel / steps;
  let impact;
  for (let i = 0; i < steps; i++) {
    const x = projectile.x + Math.cos(projectile.angle) * step;
    const y = projectile.y + Math.sin(projectile.angle) * step;
    if (blocked(x, y, 2, room.map, solid)) {
      impact = true;
      break;
    }
    Object.assign(projectile, { x, y });
    const target = attackTargets(room).find(player => player.alive && player.team !== projectile.source.team && canTarget(projectile.source, player, now) &&
      distance(player, projectile) <= radius + 2 && clearLine(projectile, player, 0, room.map));
    if (!target) continue;
    if (projectile.type === 'arrow') hit(room, projectile.source, target, projectile.damage, now);
    impact = true;
    break;
  }
  projectile.remaining -= travel;
  if (!impact && projectile.remaining > 0) return true;
  if (projectile.type === 'fireball') {
    const blast = projectile.blast ?? 66;
    effect(room, 'blast', projectile, 0, blast, projectile.source.team, now);
    for (const target of attackTargets(room)) {
      if (distance(target, projectile) <= blast && clearLine(projectile, target, 0, room.map)) {
        const hp = target.hp;
        hit(room, projectile.source, target, projectile.damage, now);
        if (projectile.slow && target.team && target.alive && target.hp < hp && !skill.active(target, 'controlImmune', now)) target.slowUntil = now + 1800;
      }
    }
  }
  return false;
}

function move(room, player, vector, dt, now) {
  const length = Math.max(1, Math.hypot(vector.x, vector.y));
  const step = stats(player).speed * skill.speedMultiplier(player, now) * (player.slowUntil > now ? .72 : 1) * loot.modifiers(player, now).speed * dt / length;
  player.moving = movePlayer(room.map, room.players, player, vector.x * step, vector.y * step);
  if (player.moving) player.facing = Math.atan2(vector.y, vector.x);
}

function tick(room, now, dt, botInput, route) {
  modes.begin(room, now);
  if (now >= room.endsAt) return modes.finish(room, room.endsAt);
  const hooks = { ...scenarioHooks, route };
  if (room.scenario?.mode !== 'control') modes.tick(room, now, dt, hooks);
  for (const player of room.players) {
    if (room.phase !== 'playing') break;
    if (!player.alive) {
      if (modes.respawns(room) && now >= player.respawnAt) spawn(room, player, now);
      continue;
    }
    skill.tick(player, now, stats, (target, amount) => environmentHit(room, target, amount, now, '生命燃燒'));
    if (!player.alive || room.phase !== 'playing') continue;
    if (player.bot) skill.botCast(room, player, now, { clearLine, stats,
      hit: (source, target, damage) => hit(room, source, target, damage, now) });
    if (!player.alive || room.phase !== 'playing') continue;
    if (skill.active(player, 'root', now)) {
      player.moving = false;
      continue;
    }
    const vector = player.bot ? botInput(room, player, now) :
      now - player.inputAt < 350 ? player.input : { x: 0, y: 0 };
    move(room, player, vector, dt, now);
  }
  room.projectiles = room.projectiles.filter(projectile =>
    room.phase === 'playing' && advanceProjectile(room, projectile, dt, now));
  room.effects = room.effects.filter(item => item.until > now);
  if (room.phase === 'playing' && room.scenario?.mode === 'control') modes.tick(room, now, dt, hooks);
}

function openChest(room, player, id, now) {
  return loot.openChest(room, player, id, now,
    (from, to) => clearLine(from, to, 2, room.map));
}

function useItem(room, player, slot, now) {
  if (room.phase !== 'playing' || !player.alive || now >= room.endsAt) return { error: '目前無法使用道具' };
  return loot.useItem(player, slot, stats(player).hp, now);
}

function chestLayout(room) {
  return room.chests.map(({ id, x, y, quality }) => ({ id, x, y, quality }));
}

function castRune(room, player, now) {
  if (room.phase !== 'playing' || !player.alive || now >= room.endsAt ||
      !loot.consumeRune(player, now)) return false;
  const damage = loot.shockwave.damage * loot.modifiers(player, now).attack;
  for (const enemy of attackTargets(room)) {
    if (canTarget(player, enemy, now) && loot.inRange(player, enemy, loot.shockwave.range) && clearLine(player, enemy, 0, room.map)) {
      hit(room, player, enemy, damage, now);
    }
  }
  effect(room, 'rune', player, 0, loot.shockwave.range, player.team, now);
  return true;
}

function rankMvp(a, b) {
  const score = player => 2 * player.kills + player.assists - player.deaths;
  return score(b) - score(a) || b.damage - a.damage ||
    b.kills - a.kills || a.deaths - b.deaths;
}

function teamAwards(results) {
  const kda = player => (player.kills + player.assists) / Math.max(1, player.deaths);
  return Object.fromEntries(teams.map(team => {
    const members = results.filter(player => player.team === team);
    const mvp = [...members].sort(rankMvp)[0]?.id ?? null;
    const lowestKda = members.sort((a, b) => kda(a) - kda(b) || b.deaths - a.deaths ||
      a.damage - b.damage || Number(a.id === mvp) - Number(b.id === mvp))[0]?.id ?? null;
    return [team, { mvp, lowestKda }];
  }));
}

function snapshot(room, now, viewer = null) {
  const local = viewer && room.phase === 'playing';
  // The client draws the visible camera rectangle. Keep distant opponents out of its feed.
  const sees = point => !local || !viewer.alive || Math.abs(viewer.x - point.x) <= 1010 && Math.abs(viewer.y - point.y) <= 730;
  const players = local ? room.players.filter(player => player === viewer ||
    canTarget(viewer, player, now) && sees(player)) : room.players;
  const results = room.phase === 'ended' ? room.roster.map(player => {
    const { id, name, team, bot, job, hero, kills, deaths, assists, damage, role, eliminatedAt } = player;
    return { id, name, team, bot, job, hero, kills, deaths, assists, damage, role,
      survival: room.scenario?.mode === 'survival' ? Math.max(0, (eliminatedAt ?? room.scenario.finishedAt ?? Math.min(now, room.endsAt)) - room.scenario.startedAt) : null };
  }) : null;
  const awards = results ? teamAwards(results) : null;
  const mvp = room.winner ? awards?.[room.winner]?.mvp ?? null :
    results ? [...results].sort(rankMvp)[0]?.id ?? null : null;
  const attackRange = local && viewer.alive ? stats(viewer).range : 0;
  const targetInRange = attackRange > 0 && players.concat(room.scenario?.beasts.filter(sees) ?? []).some(player => player.alive && player.team !== viewer.team &&
    distance(viewer, player) <= attackRange && clearLine(viewer, player, 0, room.map));
  const chests = room.chests.filter(chest => sees(chest) ||
    (local && loot.inRange(viewer, chest, loot.interactRange) && clearLine(viewer, chest, 2, room.map)));
  const nearbyChest = local && viewer.alive ? chests.filter(chest => chest.openedAt === null &&
    loot.inRange(viewer, chest, loot.interactRange) && clearLine(viewer, chest, 2, room.map))
    .sort((a, b) => distance(viewer, a) - distance(viewer, b))[0]?.id ?? null : null;
  return {
    id: room.id, mode: modes.modeOf(room), scenario: modes.view(room, local ? viewer : null, now, sees, clearLine, canTarget), phase: room.phase, winner: room.winner, score: room.score, now,
    remaining: Math.max(0, room.endsAt - now), effects: room.effects.filter(item => sees(item) &&
      (!local || !room.players.some(player => (player.id === item.actor || player.id === item.target) &&
        !canTarget(viewer, player, now)))), kills: room.kills,
    chests, nearbyChest, openedChestIds: room.chests.filter(chest => chest.openedAt !== null).map(chest => chest.id),
    inventory: local ? viewer.inventory.map(item => item && { id: item.id, label: item.label, quality: item.quality }) : [],
    buffs: local ? loot.activeBuffs(viewer, now).map(({ label, until }) => ({ label, until })) : [],
    attackRange, targetInRange,
    teammates: local ? room.roster.filter(player => player !== viewer && player.team === viewer.team)
      .map(player => ({ id: player.id, slot: player.slot, name: player.name, hero: player.hero, job: player.job,
        hp: player.hp, maxHp: stats(player).hp, alive: player.alive, respawnAt: player.respawnAt })) : [],
    skillAllies: local ? room.players.filter(player => player !== viewer && player.alive && player.team === viewer.team)
      .map(({ id, name, x, y }) => ({ id, name, x, y })) : [],
    skillTimes: local ? viewer.skillTimes : [],
    heroEffects: local ? [...(viewer.powers ?? [])].filter(([, power]) => power.until > now)
      .map(([key, power]) => ({ key, until: power.until })) : [],
    projectiles: room.projectiles.filter(sees).map(({ id, x, y, angle, type, tint }) => ({ id, x, y, angle, type, tint })),
    players: players.map(({ id, x, y, name, team, job, hero, role, hp, bot, alive, moving, angle, facing,
      action, attackAt, skillAt, respawnAt, hurtAt, spawnedAt, form, warped }) =>
      ({ id, x, y, name, team, job, hero, role, hp, maxHp: stats({ hero, job, form }).hp, bot, alive, moving, angle, facing,
        action, attackAt, skillAt, respawnAt, hurtAt, spawnedAt, form, warped })),
    results, mvp, teamAwards: awards
  };
}

function interact(room, player, id, now) { return modes.interact(room, player, id, now, scenarioHooks); }
function scenarioGoal(room, player, now) { return modes.botGoal(room, player, now, scenarioHooks); }

module.exports = { heroes, playableHeroes, cast, canTarget, stats, interact, scenarioGoal, map, classes, jobs, blocked, clearLine, walkLine, distance, start, attack, tick, snapshot, canSee, assignTeams, openChest, castRune, useItem, chestLayout };
