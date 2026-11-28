'use strict';

const captureGoal = 3;
const baseRadius = 142;
const resetDelay = 20_000;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function setupFlags(state, teams) {
  state.deliveries = 0;
  state.bases = state.camps.map((camp, index) => ({ ...camp, team: teams[index], radius: baseRadius }));
  state.flags = state.bases.map((base, index) => ({
    id: 'flag-' + index, team: base.team, base, x: base.x, y: base.y,
    carrier: null, resetAt: null
  }));
}

function restore(flag) {
  Object.assign(flag, { x: flag.base.x, y: flag.base.y, carrier: null, resetAt: null });
}

function dropFlag(room, player, now) {
  const flag = room.scenario?.mode === 'flag' && room.scenario.flags.find(item => item.carrier === player);
  if (flag) Object.assign(flag, { x: player.x, y: player.y, carrier: null, resetAt: now + resetDelay });
}

function available(flag, player) {
  return !flag.carrier && (flag.team !== player.team || flag.resetAt !== null);
}

function takeFlag(flag, player) {
  if (flag.team === player.team) {
    restore(flag);
    return { message: '已將己方旗幟送回基地' };
  }
  flag.carrier = player;
  flag.resetAt = null;
  return { message: '已奪取敵旗，帶回己方領地即可得分' };
}

function updateFlags(room, now, end) {
  for (const flag of room.scenario.flags) {
    if (!flag.carrier) {
      if (flag.resetAt !== null && now >= flag.resetAt) restore(flag);
      continue;
    }
    const player = flag.carrier;
    if (!player.alive || !room.players.includes(player)) {
      dropFlag(room, player, now);
      continue;
    }
    flag.x = player.x;
    flag.y = player.y;
    const home = room.scenario.bases.find(base => base.team === player.team);
    if (gap(player, home) > home.radius) continue;
    restore(flag);
    room.score[player.team]++;
    room.scenario.deliveries++;
    if (room.score[player.team] >= captureGoal) {
      end(room, player.team, 'captures');
      return;
    }
  }
}

function flagBotGoal(state, bot) {
  const own = state.flags.find(item => item.team === bot.team);
  const enemy = state.flags.find(item => item.team !== bot.team);
  // Rotate the home guard after each capture, so the same slot doesn't always defend.
  const assignment = (bot.slot + state.deliveries) % 5;
  if (enemy.carrier === bot) return { ...own.base, holdWithin: own.base.radius - 16, objectiveFirst: true };
  if (own.carrier && assignment < 2) return { x: own.carrier.x, y: own.carrier.y, objectiveFirst: true };
  if (own.resetAt !== null && assignment < 2) return { x: own.x, y: own.y, objectiveFirst: true };
  if (assignment === 0) return { ...own.base, holdWithin: 76, engageWithin: 190, objectiveFirst: true };
  if (enemy.carrier) {
    return { x: enemy.carrier.x, y: enemy.carrier.y, holdWithin: 70, engageWithin: 135, objectiveFirst: true };
  }
  return { x: enemy.x, y: enemy.y, objectiveFirst: true };
}

function viewFlags(state, viewer, now, sees, canTarget) {
  if (state.mode !== 'flag') return [];
  return state.flags.map(flag => {
    const carrier = flag.carrier;
    const visible = !viewer || !carrier || (sees(carrier) && canTarget(viewer, carrier, now));
    return {
      id: flag.id, team: flag.team, status: carrier ? 'carried' : flag.resetAt !== null ? 'dropped' : 'base',
      ...(visible && { x: carrier?.x ?? flag.x, y: carrier?.y ?? flag.y, carrierId: carrier?.id ?? null }),
      resetAt: flag.resetAt
    };
  });
}

module.exports = { setupFlags, dropFlag, available, takeFlag, updateFlags, flagBotGoal, viewFlags, captureGoal };
