'use strict';

const { map, stats, walkLine, clearLine, distance, attack, canSee, canTarget, scenarioGoal } = require('./combat');
const { terrainBlocked, playerBlocked } = require('./collision');
const { campOffset } = require('./world');
const graphs = new WeakMap();
function navigation(world) {
  if (graphs.has(world)) return graphs.get(world);
  const { columns, rows, tileSize: spacing } = world;
  const grid = Array.from({ length: columns * rows }, (_, index) => {
    const x = ((index % columns) + 0.5) * spacing;
    const y = (Math.floor(index / columns) + 0.5) * spacing;
    return terrainBlocked(world, x, y) ? null : { x, y };
  });
  const edges = grid.map((node, index) => {
    if (!node) return [];
    const col = index % columns;
    return [col > 0 ? index - 1 : -1, col + 1 < columns ? index + 1 : -1,
      index - columns, index + columns].filter(next => grid[next]);
  });
  const graph = { grid, edges, columns, rows, spacing, world, patrolPoints: new Map() };
  graphs.set(world, graph);
  return graph;
}

function nearest(point, { grid, columns, rows, spacing, world }) {
  const col = Math.floor(point.x / spacing);
  const row = Math.floor(point.y / spacing);
  const candidates = [];
  for (let y = Math.max(0, row - 1); y <= Math.min(rows - 1, row + 1); y++) {
    for (let x = Math.max(0, col - 1); x <= Math.min(columns - 1, col + 1); x++) {
      const index = y * columns + x;
      if (grid[index] && walkLine(point, grid[index], world)) candidates.push(index);
    }
  }
  candidates.sort((a, b) => distance(point, grid[a]) - distance(point, grid[b]));
  return candidates[0] ?? -1;
}

function route(from, to, world = map) {
  const graph = navigation(world);
  const { grid, edges, spacing } = graph;
  const start = nearest(from, graph);
  const goal = nearest(to, graph);
  if (start < 0 || goal < 0) return [];
  const open = new Set([start]);
  const previous = new Map();
  const cost = new Map([[start, 0]]);
  while (open.size) {
    let current;
    let best = Infinity;
    for (const index of open) {
      const node = grid[index];
      const target = grid[goal];
      const estimate = cost.get(index) + 1.001 * (Math.abs(node.x - target.x) + Math.abs(node.y - target.y));
      if (estimate < best) {
        best = estimate;
        current = index;
      }
    }
    if (current === goal) {
      const path = [grid[goal]];
      while (previous.has(current)) {
        current = previous.get(current);
        path.push(grid[current]);
      }
      return path.reverse();
    }
    open.delete(current);
    for (const next of edges[current]) {
      const steps = cost.get(current) + spacing;
      if (steps >= (cost.get(next) ?? Infinity)) continue;
      previous.set(next, current);
      cost.set(next, steps);
      open.add(next);
    }
  }
  return [];
}

const idle = { x: 0, y: 0 };
function steer(player, target) {
  const gap = distance(player, target);
  return gap < 1 ? idle : { x: (target.x - player.x) / gap, y: (target.y - player.y) / gap };
}

function patrolPoint(world, bot, across) {
  const { grid, patrolPoints } = navigation(world);
  const key = `${bot.team}:${bot.slot}:${across}`;
  if (!patrolPoints.has(key)) {
    const side = bot.team === '紅隊' ? 1 : -1;
    const point = {
      x: world.width / 2 + side * campOffset * (across ? -1 : 1),
      y: world.height / 2 + side * (bot.slot - 2) * 64
    };
    let closest;
    let gap = Infinity;
    for (const node of grid) {
      if (!node) continue;
      const distanceToPoint = distance(point, node);
      if (distanceToPoint >= gap) continue;
      closest = node;
      gap = distanceToPoint;
    }
    patrolPoints.set(key, closest ?? point);
  }
  return patrolPoints.get(key);
}

function roomToMove(room, bot, vector, gap = 20) {
  const point = { x: bot.x + vector.x * gap, y: bot.y + vector.y * gap };
  return walkLine(bot, point, room.map) && !playerBlocked(room.players, bot, point.x, point.y);
}

function sidestep(room, bot, vector, reversing) {
  const side = bot.slot % 2 ? 1 : -1;
  const left = { x: -vector.y * side, y: vector.x * side };
  const right = { x: -left.x, y: -left.y };
  const back = { x: -vector.x, y: -vector.y };
  const candidates = reversing ? [left, right, back] : [left, right];
  return candidates.find(direction => roomToMove(room, bot, direction));
}

function walkToward(room, bot, target, now) {
  const detour = bot.botDetour;
  if (detour?.until > now && roomToMove(room, bot, detour.vector, 8)) return detour.vector;

  const gap = distance(bot, target);
  let waypoint = target;
  if (gap >= 520 || !walkLine(bot, target, room.map)) {
    if (now >= bot.routeAt || !bot.routeTarget || distance(bot.routeTarget, target) >= 64) {
      bot.routeAt = now + 550 + bot.slot * 25;
      bot.routeTarget = { x: target.x, y: target.y };
      bot.route = route(bot, target, room.map);
    }
    const path = bot.route || [];
    while (path.length && distance(bot, path[0]) < 9) path.shift();
    while (path.length > 1 && walkLine(bot, path[1], room.map)) path.shift();
    waypoint = path[0];
    if (!waypoint) return null;
  }

  const vector = steer(bot, waypoint);
  if (vector === idle) return idle;
  const progress = bot.botProgress;
  const stuck = progress && now - progress.since >= 500 && distance(bot, progress) < 8;
  if (!progress || now - progress.since >= 500) bot.botProgress = { x: bot.x, y: bot.y, since: now };
  if (stuck || !roomToMove(room, bot, vector, Math.min(distance(bot, waypoint), 18))) {
    const alternate = sidestep(room, bot, vector, stuck);
    if (alternate) {
      bot.botDetour = { vector: alternate, until: now + (stuck ? 350 : 180) };
      bot.routeAt = 0;
      return alternate;
    }
  }
  return vector;
}

function botInput(room, bot, now) {
  const objective = scenarioGoal(room, bot, now);
  if (objective?.objectiveFirst) {
    const movement = walkToward(room, bot, objective, now);
    if (movement) return movement;
  }
  const enemies = room.players.concat(room.scenario?.beasts ?? []).filter(player => player.alive && player.team !== bot.team &&
    canTarget(bot, player, now) && canSee(bot, player, room.map));
  enemies.sort((a, b) => distance(bot, a) - distance(bot, b) ||
    ((a.slot + bot.slot) % 5) - ((b.slot + bot.slot) % 5));
  const enemy = enemies[0];
  if (enemy) bot.lastSeen = { x: enemy.x, y: enemy.y, until: now + 2000 };

  const job = stats(bot);
  const gap = enemy ? distance(bot, enemy) : Infinity;
  if (gap <= job.range && clearLine(bot, enemy, 0, room.map)) {
    bot.botProgress = null;
    bot.botDetour = null;
    attack(room, bot, enemy.x, enemy.y, false, now);
    if (now >= bot.skillAt) attack(room, bot, enemy.x, enemy.y, true, now);
    if (bot.job !== 'warrior' && gap < job.range * 0.44) {
      const retreat = steer(bot, { x: 2 * bot.x - enemy.x, y: 2 * bot.y - enemy.y });
      if (retreat !== idle && roomToMove(room, bot, retreat)) return retreat;
    }
    return idle;
  }

  const lastSeen = bot.lastSeen?.until > now && distance(bot, bot.lastSeen) > 24 ? bot.lastSeen : null;
  const target = enemy ?? lastSeen ?? objective;
  if (target) {
    const vector = walkToward(room, bot, target, now);
    if (vector) return vector;
  }

  let patrol = patrolPoint(room.map, bot, bot.patrolHome);
  if (distance(bot, patrol) < 24) {
    bot.patrolHome = !bot.patrolHome;
    bot.routeAt = 0;
    patrol = patrolPoint(room.map, bot, bot.patrolHome);
  }
  return walkToward(room, bot, patrol, now) ?? idle;
}

module.exports = { botInput, route };
