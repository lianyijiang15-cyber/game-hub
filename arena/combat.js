'use strict';

const { generateWorld, solid, impassable, campOffset } = require('./world');
const { terrainBlocked, playerBlocked, movePlayer } = require('./collision');
const map = generateWorld();
const visionRadius = 360;
const grassRevealRadius = 80;
const sightObstacle = tile => solid(tile) || tile === 'b';
const classes = {
  warrior: { hp: 300, speed: 150, range: 52, damage: 24, cooldown: 650 },
  archer: { hp: 100, speed: 185, range: 240, damage: 17, cooldown: 850 },
  mage: { hp: 80, speed: 165, range: 190, damage: 20, cooldown: 950 }
};
const jobs = Object.keys(classes);
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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return !intersectsTiles(world, Math.min(a.x, b.x) - padding, Math.min(a.y, b.y) - padding,
    Math.max(a.x, b.x) + padding, Math.max(a.y, b.y) + padding, (tile, left, top) => {
      if (!obstacle(tile)) return false;
      const xSpan = axisSpan(a.x, dx, left - padding, left + world.tileSize + padding);
      const ySpan = axisSpan(a.y, dy, top - padding, top + world.tileSize + padding);
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
  for (const offset of [0, -28, 28, -56, 56]) {
    const position = { x: width / 2 - side * campOffset, y: height / 2 + side * ((player.slot - 2) * 72 + offset) };
    if (terrainBlocked(room.map, position.x, position.y) ||
        playerBlocked(room.players, player, position.x, position.y)) continue;
    Object.assign(player, position, {
      hp: classes[player.job].hp, alive: true, input: { x: 0, y: 0 }, inputAt: 0,
      angle: side === 1 ? 0 : Math.PI, facing: side === 1 ? 0 : Math.PI, moving: false,
      attackAt: 0, skillAt: 0, respawnAt: 0, spawnedAt: now, hurtAt: 0, action: null
    });
    return;
  }
  player.respawnAt = now + 50;
}

function start(room, now, seed) {
  Object.assign(room, {
    phase: 'playing', map: seed === undefined ? map : generateWorld(seed), score: { [teams[0]]: 0, [teams[1]]: 0 }, effects: [],
    projectiles: [], kills: [], sequence: 0, endsAt: now + 300000, winner: null
  });
  room.roster = [...room.players];
  // Spread humans across both sides, then assign the remaining seats to bots.
  room.roster.sort((a, b) => Number(a.bot) - Number(b.bot));
  room.roster.forEach((player, index) => {
    Object.assign(player, {
      team: teams[index % 2], slot: Math.floor(index / 2), alive: false,
      kills: 0, deaths: 0, damage: 0, route: null, routeAt: 0, lastSeen: null, patrolHome: false
    });
  });
  room.roster.forEach(player => spawn(room, player, now));
}

function finish(room) {
  const [red, blue] = teams.map(team => room.score[team]);
  room.winner = red === blue ? null : teams[red > blue ? 0 : 1];
  room.phase = 'ended';
}

function hit(room, source, target, damage, now) {
  if (room.phase !== 'playing' || !target.alive || source.team === target.team) return;
  const actual = Math.min(target.hp, damage);
  target.hp -= actual;
  source.damage += actual;
  target.hurtAt = now;
  if (target.hp > 0) return;
  target.alive = false;
  target.moving = false;
  target.input = { x: 0, y: 0 };
  target.respawnAt = now + 3000;
  source.kills++;
  target.deaths++;
  room.score[source.team]++;
  room.kills.push({ id: ++room.sequence, attacker: source.name, victim: target.name, team: source.team });
  if (room.kills.length > 5) room.kills.shift();
  if (room.score[source.team] >= 20) finish(room);
}

function effect(room, type, position, angle, range, team, now) {
  room.effects.push({ type, x: position.x, y: position.y, angle, range, team, until: now + 240 });
}

function attack(room, player, x, y, skill, now) {
  if (room.phase !== 'playing' || !player.alive || now >= room.endsAt) return;
  const key = skill ? 'skillAt' : 'attackAt';
  if (now < player[key]) return;
  const job = classes[player.job];
  const angle = Math.atan2(y - player.y, x - player.x);
  player[key] = now + (skill ? 5000 : job.cooldown);
  Object.assign(player, { angle, facing: angle, action: { skill, until: now + 240 } });

  if (skill && player.job !== 'warrior') {
    const arrows = player.job === 'archer';
    for (const spread of arrows ? [-0.18, 0, 0.18] : [0]) {
      room.projectiles.push({
        id: ++room.sequence, source: player, type: arrows ? 'arrow' : 'fireball',
        x: player.x, y: player.y, angle: angle + spread,
        speed: arrows ? 480 : 330, remaining: arrows ? 265 : 225
      });
    }
    return;
  }

  const range = skill ? 90 : job.range;
  const enemies = room.players.filter(other => other.alive && other.team !== player.team &&
    distance(player, other) <= range && clearLine(player, other, 0, room.map) &&
    (skill || Math.cos(Math.atan2(other.y - player.y, other.x - player.x) - angle) >= Math.cos(0.30)));
  enemies.sort((a, b) => distance(player, a) - distance(player, b));
  for (const enemy of skill ? enemies : enemies.slice(0, 1)) hit(room, player, enemy, skill ? 38 : job.damage, now);
  effect(room, skill ? 'spin' : player.job, player, angle, range, player.team, now);
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
    const target = room.players.find(player => player.alive && player.team !== projectile.source.team &&
      distance(player, projectile) <= radius + 2 && clearLine(projectile, player, 0, room.map));
    if (!target) continue;
    if (projectile.type === 'arrow') hit(room, projectile.source, target, 13, now);
    impact = true;
    break;
  }
  projectile.remaining -= travel;
  if (!impact && projectile.remaining > 0) return true;
  if (projectile.type === 'fireball') {
    effect(room, 'blast', projectile, 0, 66, projectile.source.team, now);
    for (const target of room.players) {
      if (distance(target, projectile) <= 66 && clearLine(projectile, target, 0, room.map)) {
        hit(room, projectile.source, target, 34, now);
      }
    }
  }
  return false;
}

function move(room, player, vector, dt) {
  const length = Math.max(1, Math.hypot(vector.x, vector.y));
  const step = classes[player.job].speed * dt / length;
  player.moving = movePlayer(room.map, room.players, player, vector.x * step, vector.y * step);
  if (player.moving) player.facing = Math.atan2(vector.y, vector.x);
}

function tick(room, now, dt, botInput) {
  if (now >= room.endsAt) return finish(room);
  for (const player of room.players) {
    if (room.phase !== 'playing') break;
    if (!player.alive) {
      if (now >= player.respawnAt) spawn(room, player, now);
      continue;
    }
    const vector = player.bot ? botInput(room, player, now) :
      now - player.inputAt < 350 ? player.input : { x: 0, y: 0 };
    move(room, player, vector, dt);
  }
  room.projectiles = room.projectiles.filter(projectile =>
    room.phase === 'playing' && advanceProjectile(room, projectile, dt, now));
  room.effects = room.effects.filter(item => item.until > now);
}

function snapshot(room, now, viewer = null) {
  const local = viewer && room.phase === 'playing';
  const sees = point => !local || canSee(viewer, point, room.map);
  const players = local ? room.players.filter(player => player === viewer ||
    (player.team === viewer.team ? distance(viewer, player) <= visionRadius : sees(player))) : room.players;
  return {
    id: room.id, phase: room.phase, winner: room.winner, score: room.score, now,
    remaining: Math.max(0, room.endsAt - now), effects: room.effects.filter(sees), kills: room.kills,
    visionRadius, concealed: !!local && inTallGrass(viewer, room.map),
    projectiles: room.projectiles.filter(sees).map(({ id, x, y, angle, type }) => ({ id, x, y, angle, type })),
    players: players.map(({ id, x, y, name, team, job, hp, bot, alive, moving, angle, facing,
      action, attackAt, skillAt, respawnAt, hurtAt, spawnedAt }) =>
      ({ id, x, y, name, team, job, hp, maxHp: classes[job].hp, bot, alive, moving, angle, facing,
        action, attackAt, skillAt, respawnAt, hurtAt, spawnedAt })),
    results: room.phase === 'ended' ? room.roster.map(({ id, name, team, bot, job, kills, deaths, damage }) =>
      ({ id, name, team, bot, job, kills, deaths, damage })) : null
  };
}

module.exports = { map, classes, jobs, blocked, clearLine, distance, start, attack, tick, snapshot, canSee };
