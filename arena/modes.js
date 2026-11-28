'use strict';

const { playableHeroes } = require('../public/heroes');
const { terrainBlocked } = require('./collision');
const { objectiveClearance } = require('./loot');
const capture = require('./flags');

const minute = 60_000;
const teams = ['紅隊', '藍隊'];
const durations = { deathmatch: 5 * minute, flag: 20 * minute, survival: 24 * minute, control: 20 * minute };
const holdTime = 3 * minute;
const unguardedLimit = 12_000;
const resourceCap = 7 * minute;
const dropInterval = 3 * minute;
const beastNames = ['苔牙狼', '棘背獸', '幽光靈'];
const radius = 48;
const guardRadius = 155;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const comparison = scores => scores[teams[0]] === scores[teams[1]] ? null :
  scores[teams[0]] > scores[teams[1]] ? teams[0] : teams[1];

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function modeOf(room) { return room.mode ?? 'deathmatch'; }
function roleFor(slot, hero) { return playableHeroes[hero]?.role ?? ['commander', 'support'][slot] ?? 'fighter'; }

function pointPool(map) {
  const points = [];
  for (let row = 2; row < map.rows - 2; row++) {
    for (let col = 2; col < map.columns - 2; col++) {
      const point = { x: (col + 0.5) * map.tileSize, y: (row + 0.5) * map.tileSize };
      if (!terrainBlocked(map, point.x, point.y)) points.push(point);
    }
  }
  return points;
}

function choosePoint(state, eligible, fallback = () => true) {
  const points = state.points.filter(eligible);
  const pool = points.length ? points : state.points.filter(fallback);
  return pool[Math.floor(state.random() * pool.length)];
}

function newBeast(state, point, species) {
  const monster = {
    id: 'beast-' + ++state.sequence, ...point, species, hp: [530, 870, 660][species],
    maxHp: [530, 870, 660][species], alive: true, attackAt: 0, routeAt: 0, route: []
  };
  state.beasts.push(monster);
  return monster;
}

function randomBeast(state, species, players) {
  const safe = p => state.camps.every(camp => distance(p, camp) > 250) &&
    state.beasts.every(beast => distance(p, beast) > 75) &&
    players.every(player => !player.alive || distance(p, player) > 180);
  const point = choosePoint(state, p => safe(p) && players.some(player => player.alive && distance(p, player) < 385), safe);
  if (point) return newBeast(state, point, species);
}

function setup(room, seed) {
  const mode = modeOf(room);
  if (mode === 'deathmatch') {
    room.scenario = null;
    return;
  }
  const map = room.map;
  const state = room.scenario = {
    mode, random: seededRandom(seed), points: pointPool(map), sequence: 0, beasts: [],
    supplies: [], flags: [], exposure: {}, penalties: {}, startedAt: null, night: false, reason: null
  };
  const center = { x: map.width / 2, y: map.height / 2 };
  const reflects = point => ({ x: map.width - point.x, y: map.height - point.y });
  const nearbyCount = point => {
    let count = 0;
    for (let y = -3; y <= 3; y++) {
      for (let x = -3; x <= 3; x++) {
        if (!terrainBlocked(map, point.x + x * map.tileSize, point.y + y * map.tileSize)) count++;
      }
    }
    return count;
  };
  const east = state.points.filter(point => point.x > center.x + 640 && distance(point, center) < 1130 &&
    nearbyCount(point) >= 25 && nearbyCount(reflects(point)) >= 25);
  const camp = east[Math.floor(state.random() * east.length)] ?? { x: center.x + 944, y: center.y };
  const opposite = reflects(camp);
  state.camps = state.random() < .5 ? [camp, opposite] : [opposite, camp];
  state.spawns = state.camps.map(campPoint => state.points.filter(point => distance(point, campPoint) <= 142)
    .sort((a, b) => distance(a, campPoint) - distance(b, campPoint)));

  if (mode === 'flag') capture.setupFlags(state, teams);
  if (mode === 'survival') {
    for (let i = 0; i < 54; i++) {
      const point = choosePoint(state, p => state.camps.every(camp => distance(camp, p) > 130) &&
        state.supplies.every(pack => distance(pack, p) > 100));
      state.supplies.push({ id: 'pack-' + i, ...point, kind: i % 3 ? 'medicine' : 'gear',
        trap: state.random() < .25, used: false });
    }
  }
  if (mode === 'control') {
    const count = 5 + Math.floor(state.random() * 3);
    for (let i = 0; i < count; i++) {
      const flag = { id: 'point-' + i, owner: null, mark: null };
      state.flags.push(flag);
      movePoint(state, flag);
    }
  }
}

function movePoint(state, flag, chests = []) {
  Object.assign(flag, choosePoint(state, point => state.camps.every(camp => distance(point, camp) > 310) &&
    state.flags.every(other => !Number.isFinite(other.x) || distance(point, other) >= 290) &&
    chests.every(chest => distance(point, chest) > objectiveClearance)));
}

function begin(room, now) {
  const state = room.scenario;
  if (!state || state.startedAt !== null) return;
  state.startedAt = now;
  state.nextChange = now + 5 * minute;
  state.nextDrop = now + dropInterval;
  state.nextBeast = now + 12_000 + state.random() * 12_000;
  for (const player of room.roster) {
    player.protectedUntil = now + 5 * minute;
    player.eliminatedAt = null;
    player.role = roleFor(player.slot, player.hero);
  }
}

function respawns(room) { return modeOf(room) !== 'survival'; }

function eliminate(room, target, source, now) {
  const state = room.scenario;
  if (!state) return;
  target.eliminatedAt = now;
  if (state.mode === 'flag') return capture.dropFlag(room, target, now);
  if (state.mode === 'survival' && target.role !== 'fighter') {
    const commander = target.role === 'commander';
    state.exposure[target.team] = Math.max(state.exposure[target.team] ?? 0, now + (commander ? 3 : 1) * minute);
    if (commander) state.penalties[target.team] = 90_000;
  }
  if (state.mode === 'survival') return checkWipe(room, now);
  if (state.mode !== 'control' || !source?.team || source.team === target.team) return;
  for (const flag of state.flags) {
    const mark = flag.mark;
    if (!mark || mark.team !== target.team || distance(flag, target) > guardRadius) continue;
    mark.defeated.add(target);
    const fighters = [...mark.defeated].filter(player => player.role === 'fighter').length;
    const cleared = mark.guards.size > 0 && [...mark.guards].every(player => mark.defeated.has(player));
    if (fighters >= 3 || cleared || target.role !== 'fighter') {
      flag.mark = null;
    }
  }
}

function end(room, winner, reason) {
  room.winner = winner;
  room.phase = 'ended';
  if (room.scenario) room.scenario.reason = reason;
}

function survivalScore(room, now) {
  const state = room.scenario;
  for (const team of teams) {
    const players = room.roster.filter(player => player.team === team);
    const total = players.reduce((sum, player) => sum + Math.max(0, (player.eliminatedAt ?? now) - state.startedAt), 0);
    room.score[team] = Math.max(0, Math.round(total / players.length - (state.penalties[team] ?? 0)));
  }
}

function checkWipe(room, now) {
  if (room.phase !== 'playing' || !teams.some(team => room.players.every(p => !p.alive || p.team !== team))) return false;
  room.scenario.finishedAt = now;
  survivalScore(room, now);
  end(room, comparison(room.score), 'eliminated');
  return true;
}

function finish(room, now) {
  const state = room.scenario;
  if (state?.mode === 'survival') {
    state.finishedAt = now;
    survivalScore(room, now);
  }
  end(room, comparison(room.score), 'time');
}

function hitBeast(room, source, target, damage, now) {
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - Math.round(damage));
  if (target.hp > 0) return;
  target.alive = false;
  if (room.scenario.mode === 'survival') refill(source, 45_000, now);
}

function refill(player, duration, now) {
  player.protectedUntil = Math.min(now + resourceCap, Math.max(player.protectedUntil, now) + duration);
}

function canInteract(state, object, player) {
  if (state.mode === 'flag') return capture.available(object, player);
  if (state.mode === 'control') return !object.owner && !object.mark;
  return !object.used;
}

function objectsNear(room, player, clearLine) {
  const state = room.scenario;
  if (!state || !player.alive) return [];
  return [...state.flags, ...state.supplies.filter(pack => !pack.used)].filter(object =>
    distance(player, object) <= radius && clearLine(player, object, 0, room.map));
}

function interact(room, player, id, now, hooks) {
  if (room.phase !== 'playing' || now >= room.endsAt) return { error: '目前無法互動' };
  const state = room.scenario;
  const object = objectsNear(room, player, hooks.clearLine).find(target => target.id === id);
  if (!object) return { error: '請靠近目標後再互動' };
  if (state.mode === 'flag') {
    if (!capture.available(object, player)) return { error: '這面旗目前無法拾取' };
    return capture.takeFlag(object, player);
  }
  if (state.mode === 'control') {
    if (object.owner || object.mark) {
      return { error: '此據點目前無法開始標記' };
    }
    object.mark = { team: player.team, ends: now + holdTime, remaining: holdTime, updatedAt: now,
      status: 'holding', vacantAt: null,
      guards: new Set(room.players.filter(guard => guard.alive && guard.team === player.team &&
        distance(guard, object) <= guardRadius)), defeated: new Set() };
    return { message: '已開始標記，守住據點 3 分鐘' };
  }
  object.used = true;
  if (nightAt(state, now) && object.trap) {
    if (object.kind === 'medicine') newBeast(state, object, Math.floor(state.random() * beastNames.length));
    else hooks.environmentHit(room, player, player.hp, now, '炸彈');
    return { message: object.kind === 'medicine' ? '藥材包是妖獸' : '你打開了炸彈' };
  }
  const maxHp = hooks.stats(player).hp;
  const drops = object.kind === 'drop';
  refill(player, drops ? 150_000 : object.kind === 'medicine' ? 110_000 : 55_000, now);
  player.hp = Math.min(maxHp, player.hp + Math.round(maxHp * (drops ? .30 : object.kind === 'medicine' ? .22 : .10)));
  return { message: '已補充生存資源' };
}

function hunt(room, state, dt, now, hooks) {
  for (const beast of state.beasts) {
    if (room.phase !== 'playing') break;
    if (!beast.alive) continue;
    const target = room.players.filter(player => player.alive && distance(player, beast) <= 245)
      .sort((a, b) => distance(a, beast) - distance(b, beast))[0];
    if (!target) continue;
    if (distance(beast, target) < 30 && hooks.clearLine(beast, target, 0, room.map)) {
      if (now >= beast.attackAt) {
        beast.attackAt = now + 1000;
        hooks.environmentHit(room, target, Math.round(hooks.stats(target).hp * [.035, .055, .045][beast.species]), now, beastNames[beast.species]);
      }
      continue;
    }
    let goal = target;
    if (!hooks.clearLine(beast, target, 12, room.map) && hooks.route) {
      if (now >= beast.routeAt) {
        beast.routeAt = now + 850;
        beast.route = hooks.route(beast, target, room.map);
      }
      while (beast.route.length && distance(beast, beast.route[0]) < 10) beast.route.shift();
      goal = beast.route[0] ?? target;
    }
    const step = [126, 89, 108][beast.species] * dt / Math.max(1, distance(beast, goal));
    hooks.movePlayer(room.map, [], beast, (goal.x - beast.x) * step, (goal.y - beast.y) * step);
  }
  state.beasts = state.beasts.filter(beast => beast.alive);
}

const nightAt = (state, now) => Math.floor((now - state.startedAt) / (8 * minute)) % 2 === 1;

function tick(room, now, dt, hooks) {
  const state = room.scenario;
  if (!state) return;
  begin(room, now);
  if (state.mode === 'flag') return;
  if (state.mode === 'survival') {
    if (checkWipe(room, now)) return;
    state.night = nightAt(state, now);
    if (!state.night && now >= state.nextBeast) {
      if (state.beasts.length < 36) randomBeast(state, Math.floor(state.random() * beastNames.length), room.players);
      state.nextBeast = now + 16_000 + state.random() * 29_000;
    }
    if (now >= state.nextDrop) {
      state.nextDrop = now + dropInterval;
      if (!state.supplies.some(pack => pack.kind === 'drop' && !pack.used)) {
        const eligible = point => state.camps.every(camp => distance(camp, point) > 380) &&
          state.supplies.every(pack => pack.used || distance(pack, point) > 110) &&
          room.chests.every(chest => distance(chest, point) > objectiveClearance) &&
          room.players.every(player => !player.alive || distance(player, point) > 160);
        const point = choosePoint(state, eligible, eligible);
        if (point) state.supplies.push({ id: 'drop-' + ++state.sequence, ...point, kind: 'drop', used: false });
      }
    }
    for (const player of room.players) {
      if (room.phase !== 'playing') return;
      if (!player.alive || now < player.protectedUntil || now < (player.drainAt ?? 0)) continue;
      player.drainAt = now + 1000;
      const stages = Math.floor((now - player.protectedUntil) / 20_000);
      const damage = Math.ceil(hooks.stats(player).hp * Math.min(40, 12 + stages * 6) / 1000);
      hooks.environmentHit(room, player, damage, now, '資源耗盡');
    }
    hunt(room, state, dt, now, hooks);
    if (room.phase === 'playing') survivalScore(room, now);
    return;
  }
  for (const flag of state.flags) {
    const mark = flag.mark;
    if (!mark) continue;
    const area = room.players.filter(player => player.alive && distance(player, flag) <= guardRadius);
    const guards = area.filter(player => player.team === mark.team);
    for (const guard of mark.guards) if (guard.alive && !guards.includes(guard)) mark.guards.delete(guard);
    for (const guard of guards) mark.guards.add(guard);
    const elapsed = Math.max(0, now - mark.updatedAt);
    mark.updatedAt = now;
    if (!guards.length) {
      mark.status = 'vacant';
      mark.vacantAt ??= now;
      if (now - mark.vacantAt >= unguardedLimit) flag.mark = null;
      continue;
    }
    mark.vacantAt = null;
    if (area.length > guards.length) {
      mark.status = 'contested';
      continue;
    }
    mark.status = 'holding';
    mark.remaining = Math.max(0, mark.remaining - elapsed);
    mark.ends = now + mark.remaining;
    if (mark.remaining === 0) {
      flag.owner = mark.team;
      flag.mark = null;
      room.score[flag.owner]++;
    }
  }
  if (now >= state.nextChange) {
    state.nextChange += 5 * minute;
    for (const flag of state.flags) {
      if (!flag.owner && !flag.mark) {
        movePoint(state, flag, room.chests);
      }
    }
  }
  if (state.flags.every(flag => flag.owner)) end(room, comparison(room.score), 'all-marked');
}

function controlGoal(room, state, bot) {
  const camp = state.camps[teams.indexOf(bot.team)];
  const active = state.flags.filter(flag => !flag.owner)
    .sort((a, b) => distance(camp, a) - distance(camp, b));
  const guarded = active.find(flag => flag.mark?.team === bot.team && distance(bot, flag) <= guardRadius);
  const assigned = active[bot.slot % Math.max(1, active.length)];
  // One guard stays even when the rest of the squad can advance to another point.
  const nearbyGuards = guarded ? room.players.filter(player => player.alive && player.team === bot.team &&
    distance(player, guarded) <= guardRadius) : [];
  nearbyGuards.sort((a, b) => Number(!a.bot) - Number(!b.bot) || a.slot - b.slot);
  const target = nearbyGuards[0] === bot ? guarded : assigned;
  if (!target) return null;
  return { x: target.x, y: target.y, holdWithin: target.mark ? 50 : 0,
    engageWithin: target.mark ? guardRadius : 0, objectiveFirst: true };
}

function survivalGoal(room, state, bot, now, hooks) {
  const remaining = bot.protectedUntil - now;
  const health = bot.hp / hooks.stats(bot).hp;
  const needsSupplies = remaining < 180_000 || health < .7;
  const emergency = remaining < 50_000 || health < .28;
  if (needsSupplies) {
    const supplies = state.supplies.filter(pack => !pack.used &&
      (!state.night || emergency || pack.kind === 'drop'));
    const score = pack => distance(bot, pack) - (pack.kind === 'drop' ? 180 : pack.kind === 'medicine' ? 55 : 0);
    supplies.sort((a, b) => score(a) - score(b));
    if (supplies.length) return { ...supplies[0], objectiveFirst: true };
  }
  const allies = room.players.filter(player => player !== bot && player.alive && player.team === bot.team &&
    (!player.bot || player.slot < bot.slot));
  const ally = allies.sort((a, b) => distance(bot, a) - distance(bot, b))[0];
  if (ally && (!needsSupplies || state.night || distance(bot, ally) < 390)) {
    return { x: ally.x, y: ally.y, holdWithin: 125, objectiveFirst: true };
  }
  if (needsSupplies && health >= .45) {
    const beast = state.beasts.find(item => item.alive && distance(bot, item) < 420);
    if (beast) return beast;
  }
  return null;
}

function botGoal(room, bot, now, hooks) {
  const state = room.scenario;
  if (!state || !bot.alive) return null;
  const object = objectsNear(room, bot, hooks.clearLine).find(item => canInteract(state, item, bot));
  const remaining = bot.protectedUntil - now;
  const health = bot.hp / hooks.stats(bot).hp;
  const needsSupplies = remaining < 180_000 || health < .7;
  const willing = !state.night || object?.kind === 'drop' || remaining < 50_000 || health < .28;
  const assigned = state.mode === 'control' ? controlGoal(room, state, bot) : null;
  if (object && (state.mode === 'flag' || state.mode === 'control' && object.x === assigned?.x && object.y === assigned?.y ||
      state.mode === 'survival' && needsSupplies && willing)) interact(room, bot, object.id, now, hooks);
  if (!bot.alive || room.phase !== 'playing') return null;
  if (state.mode === 'flag') return capture.flagBotGoal(state, bot);
  if (state.mode === 'control') return controlGoal(room, state, bot);
  return survivalGoal(room, state, bot, now, hooks);
}

function afterMovement(room, now) {
  if (room.phase === 'playing' && room.scenario?.mode === 'flag') capture.updateFlags(room, now, end);
}

function view(room, viewer, now, sees, clearLine, canTarget) {
  const state = room.scenario;
  if (!state) return null;
  const revealed = viewer && state.mode === 'survival';
  return {
    mode: state.mode, night: state.night, reason: state.reason,
    flags: capture.viewFlags(state, viewer, now, sees, canTarget),
    bases: state.bases ?? [],
    carrying: Boolean(viewer && state.mode === 'flag' && state.flags.some(flag => flag.carrier === viewer)),
    captureGoal: state.mode === 'flag' ? capture.captureGoal : null,
    nextChange: state.mode === 'control' ? state.nextChange : null,
    guardRadius,
    points: state.mode === 'control' ? state.flags.filter(flag => !viewer || sees(flag)).map(({ id, x, y, owner, mark }) =>
      ({ id, x, y, owner, marking: mark?.team ?? null, ends: mark?.status === 'holding' ? mark.ends : null, remaining: mark?.remaining ?? null, status: mark?.status ?? null })) : [],
    nextDrop: state.mode === 'survival' ? state.nextDrop : null,
    nextLight: state.mode === 'survival' ? state.startedAt + (Math.floor((now - state.startedAt) / (8 * minute)) + 1) * 8 * minute : null,
    aliveTeams: state.mode === 'survival' ? Object.fromEntries(teams.map(team => [team, room.players.filter(player => player.alive && player.team === team).length])) : null,
    supplies: state.supplies.filter(pack => !pack.used && (pack.kind === 'drop' || sees(pack))).map(({ id, x, y, kind }) => ({ id, x, y, kind })),
    beasts: state.beasts.filter(beast => beast.alive && sees(beast)).map(({ id, x, y, species, hp, maxHp }) =>
      ({ id, x, y, species, hp, maxHp })),
    nearby: viewer ? objectsNear(room, viewer, clearLine).find(item => canInteract(state, item, viewer))?.id ?? null : null,
    markers: viewer ? room.players.filter(player => player.alive && (player.team === viewer.team ||
      (revealed && state.exposure[player.team] > now && canTarget(viewer, player, now)))).map(({ id, x, y, team }) => ({ id, x, y, team })) : [],
    protectedUntil: viewer?.protectedUntil ?? null,
    exposureUntil: revealed ? state.exposure[viewer.team] ?? 0 : 0,
    role: viewer?.role ?? null, pointCount: state.mode === 'control' ? state.flags.length : 0
  };
}

module.exports = { durations, modeOf, roleFor, setup, begin, respawns, eliminate, finish, hitBeast,
  interact, tick, afterMovement, botGoal, view, dropFlag: capture.dropFlag };
