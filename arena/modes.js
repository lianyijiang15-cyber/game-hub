'use strict';

const { playableHeroes } = require('../public/heroes');
const { terrainBlocked } = require('./collision');
const { objectiveClearance } = require('./loot');

const minute = 60_000;
const teams = ['紅隊', '藍隊'];
const durations = { deathmatch: 5 * minute, flag: 20 * minute, survival: 24 * minute, control: 20 * minute };
const herbs = ['月露草', '赤蕊花', '星脈菇'];
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
    id: 'beast-' + ++state.sequence, ...point, species, hp: [155, 225, 185][species],
    maxHp: [155, 225, 185][species], alive: true, attackAt: 0, routeAt: 0, route: []
  };
  state.beasts.push(monster);
  return monster;
}

function randomBeast(state, species) {
  const point = choosePoint(state, p => state.camps.every(camp => distance(p, camp) > 290) &&
    state.beasts.every(beast => distance(p, beast) > 75));
  return newBeast(state, point, species);
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
    supplies: [], flags: [], herbs: Object.fromEntries(teams.map(team => [team, [0, 0, 0]])),
    antidotes: {}, exposure: {}, penalties: {}, startedAt: null, night: false, reason: null
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

  if (mode === 'flag') {
    state.flags.push({ id: 'flag', ...choosePoint(state, point => distance(point, center) <= 78 &&
      Math.abs(distance(point, camp) - distance(point, opposite)) <= 64,
      point => distance(point, center) <= 64), flagTeams: teams });
    for (let i = 0; i < 30; i++) randomBeast(state, i % herbs.length);
  }
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
  state.nextBeast = now + 12_000 + state.random() * 12_000;
  for (const player of room.roster) {
    player.protectedUntil = now + 5 * minute;
    player.eliminatedAt = null;
    player.role = roleFor(player.slot, player.hero);
  }
}

function respawns(room) { return modeOf(room) === 'deathmatch' || modeOf(room) === 'control'; }

function eliminate(room, target, source, now) {
  const state = room.scenario;
  if (!state) return;
  target.eliminatedAt = now;
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
  if (state?.mode === 'flag') {
    const nearest = team => Math.min(...room.players.filter(player => player.alive && player.team === team)
      .map(player => distance(player, state.flags[0])));
    const [red, blue] = teams.map(nearest);
    return end(room, red === blue ? null : teams[red < blue ? 0 : 1], 'closest');
  }
  if (state?.mode === 'survival') {
    state.finishedAt = now;
    survivalScore(room, now);
  }
  end(room, comparison(room.score), 'time');
}

function hitBeast(room, source, target, damage) {
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - Math.round(damage));
  if (target.hp > 0) return;
  target.alive = false;
  if (room.scenario.mode === 'flag') room.scenario.herbs[source.team][target.species]++;
  if (room.scenario.mode === 'survival') source.protectedUntil += 35_000;
}

function craftAntidote(room, player) {
  if (room.phase !== 'playing' || !player.alive || room.scenario?.mode !== 'flag' || player.role !== 'support') {
    return { error: '只有仍在場的輔助能融合草藥製作解藥' };
  }
  const state = room.scenario;
  const stock = state.herbs[player.team];
  if (stock.some(amount => amount < 1)) return { error: '需要各 1 份月露草、赤蕊花與星脈菇' };
  for (let i = 0; i < stock.length; i++) stock[i]--;
  state.antidotes[player.team] = (state.antidotes[player.team] ?? 0) + 1;
  return { message: '已將解藥放入隊伍補給' };
}

function antidote(room, player, now) {
  if (room.phase !== 'playing' || !player.alive || room.scenario?.mode !== 'flag') return { error: '目前無法使用解藥' };
  const state = room.scenario;
  if (!(state.antidotes[player.team] > 0)) return { error: '隊伍沒有解藥，請由輔助融合草藥' };
  state.antidotes[player.team]--;
  player.protectedUntil = Math.max(player.protectedUntil, now) + 5 * minute;
  return { message: '已使用解藥，延長 5 分鐘毒氣免疫' };
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
    object.takenBy = player.team;
    room.score[player.team] = 1;
    end(room, player.team, 'flag');
    return { message: '已拔下敵隊旗幟' };
  }
  if (state.mode === 'control') {
    if (object.owner || object.mark) {
      return { error: '此據點目前無法開始標記' };
    }
    object.mark = { team: player.team, ends: now + 3 * minute,
      guards: new Set(room.players.filter(guard => guard.alive && guard.team === player.team &&
        distance(guard, object) <= guardRadius)), defeated: new Set() };
    return { message: '已開始標記，守住據點 3 分鐘' };
  }
  object.used = true;
  if (nightAt(state, now) && object.trap) {
    if (object.kind === 'medicine') newBeast(state, object, Math.floor(state.random() * herbs.length));
    else hooks.environmentHit(room, player, player.hp, now, '炸彈');
    return { message: object.kind === 'medicine' ? '藥材包是妖獸' : '你打開了炸彈' };
  }
  player.protectedUntil = Math.max(now, player.protectedUntil) + (object.kind === 'medicine' ? 110_000 : 55_000);
  player.hp = Math.min(hooks.stats(player).hp, player.hp + (object.kind === 'medicine' ? 150 : 75));
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
        hooks.environmentHit(room, target, [30, 44, 38][beast.species], now, beastNames[beast.species]);
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
  if (state.mode === 'flag' || state.mode === 'survival') {
    if (state.mode === 'survival' && checkWipe(room, now)) return;
    if (state.mode === 'survival') state.night = nightAt(state, now);
    if (state.mode === 'survival' && !state.night && now >= state.nextBeast) {
      if (state.beasts.length < 36) randomBeast(state, Math.floor(state.random() * herbs.length));
      state.nextBeast = now + 16_000 + state.random() * 29_000;
    }
    for (const player of room.players) {
      if (room.phase !== 'playing') return;
      if (!player.alive || now < player.protectedUntil || now < (player.drainAt ?? 0)) continue;
      player.drainAt = now + 1000;
      hooks.environmentHit(room, player, state.mode === 'flag' ? 24 : 20, now,
        state.mode === 'flag' ? '毒氣' : '資源耗盡');
    }
    hunt(room, state, dt, now, hooks);
    if (state.mode === 'survival' && room.phase === 'playing') survivalScore(room, now);
    return;
  }
  for (const flag of state.flags) {
    const mark = flag.mark;
    if (!mark) continue;
    for (const guard of mark.guards) {
      if (guard.alive && distance(guard, flag) > guardRadius) mark.guards.delete(guard);
    }
    for (const player of room.players) {
      if (player.alive && player.team === mark.team && distance(player, flag) <= guardRadius) mark.guards.add(player);
    }
    if (now >= mark.ends) {
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

function botGoal(room, bot, now, hooks) {
  const state = room.scenario;
  if (!state || !bot.alive) return null;
  if (state.mode === 'flag') {
    if (bot.role === 'support' && state.herbs[bot.team].every(count => count > 0)) craftAntidote(room, bot);
    if (bot.protectedUntil - now < minute && state.antidotes[bot.team] > 0) antidote(room, bot, now);
  }
  const object = objectsNear(room, bot, hooks.clearLine).find(item =>
    !item.owner && !item.mark);
  if (object) interact(room, bot, object.id, now, hooks);
  if (state.mode === 'flag' && bot.slot === 0) return state.flags[0];
  if (state.mode === 'control') {
    return state.flags.filter(flag => !flag.owner)
      .sort((a, b) => distance(bot, a) - distance(bot, b))[bot.slot % Math.max(1, state.flags.filter(flag => !flag.owner).length)];
  }
  const candidates = state.mode === 'flag' ? state.beasts : state.supplies.filter(pack => !pack.used);
  return [...candidates].sort((a, b) => distance(bot, a) - distance(bot, b))[0];
}

function view(room, viewer, now, sees, clearLine, canTarget) {
  const state = room.scenario;
  if (!state) return null;
  const revealed = viewer && state.mode === 'survival';
  return {
    mode: state.mode, night: state.night, reason: state.reason,
    flag: state.mode === 'flag' ? state.flags[0] : null,
    points: state.mode === 'control' ? state.flags.filter(flag => !viewer || sees(flag)).map(({ id, x, y, owner, mark }) =>
      ({ id, x, y, owner, marking: mark?.team ?? null, ends: mark?.ends ?? null })) : [],
    supplies: state.supplies.filter(pack => !pack.used && sees(pack)).map(({ id, x, y, kind }) => ({ id, x, y, kind })),
    beasts: state.beasts.filter(beast => beast.alive && sees(beast)).map(({ id, x, y, species, hp, maxHp }) =>
      ({ id, x, y, species, hp, maxHp })),
    nearby: viewer ? objectsNear(room, viewer, clearLine).find(item => !item.owner && !item.mark)?.id ?? null : null,
    markers: viewer ? room.players.filter(player => player.alive && (player.team === viewer.team ||
      (revealed && state.exposure[player.team] > now && canTarget(viewer, player, now)))).map(({ id, x, y, team }) => ({ id, x, y, team })) : [],
    antidotes: viewer ? state.antidotes[viewer.team] ?? 0 : 0,
    herbs: viewer && state.mode === 'flag' ? state.herbs[viewer.team] : null,
    protectedUntil: viewer?.protectedUntil ?? null,
    exposureUntil: revealed ? state.exposure[viewer.team] ?? 0 : 0,
    role: viewer?.role ?? null, pointCount: state.mode === 'control' ? state.flags.length : 0
  };
}

module.exports = { durations, modeOf, roleFor, setup, begin, respawns, eliminate, finish, hitBeast,
  craftAntidote, antidote, interact, tick, botGoal, view };
