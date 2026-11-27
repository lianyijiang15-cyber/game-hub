'use strict';

const { map, classes, blocked, clearLine, distance, attack } = require('./combat');
const spacing = 24;
const columns = Math.floor((map.width - 64) / spacing) + 1;
const rows = Math.floor((map.height - 64) / spacing) + 1;
const grid = Array.from({ length: columns * rows }, (_, index) => {
  const x = 32 + (index % columns) * spacing;
  const y = 32 + Math.floor(index / columns) * spacing;
  return blocked(x, y, 14) ? null : { x, y };
});
const edges = grid.map((node, index) => {
  if (!node) return [];
  const col = index % columns;
  return [col > 0 ? index - 1 : -1, col + 1 < columns ? index + 1 : -1,
    index - columns, index + columns].filter(next => grid[next] && clearLine(node, grid[next], 14));
});

function nearest(point) {
  let best = -1;
  let cost = Infinity;
  grid.forEach((node, index) => {
    if (!node) return;
    const gap = distance(node, point);
    if (gap < cost && clearLine(point, node, 12)) {
      best = index;
      cost = gap;
    }
  });
  return best;
}

function route(from, to) {
  const start = nearest(from);
  const goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const open = new Set([start]);
  const previous = new Map();
  const cost = new Map([[start, 0]]);
  while (open.size) {
    let current;
    let best = Infinity;
    for (const index of open) {
      const estimate = cost.get(index) + distance(grid[index], grid[goal]);
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

function botInput(room, bot, now) {
  const enemies = room.players.filter(player => player.alive && player.team !== bot.team);
  enemies.sort((a, b) => distance(bot, a) - distance(bot, b) ||
    ((a.slot + bot.slot) % 5) - ((b.slot + bot.slot) % 5));
  const target = enemies[0];
  if (!target) return idle;

  const job = classes[bot.job];
  const gap = distance(bot, target);
  const visible = clearLine(bot, target);
  if (visible && gap <= job.range) {
    attack(room, bot, target.x, target.y, false, now);
    if (now >= bot.skillAt) attack(room, bot, target.x, target.y, true, now);
    if (bot.job !== 'warrior' && gap < job.range * 0.44) {
      const retreat = { x: 2 * bot.x - target.x, y: 2 * bot.y - target.y };
      const vector = steer(bot, retreat);
      if (!blocked(bot.x + vector.x * 20, bot.y + vector.y * 20)) return vector;
    }
    return idle;
  }

  if (clearLine(bot, target, 13)) {
    const vector = steer(bot, target);
    const ally = room.players.find(p => p !== bot && p.alive && p.team === bot.team &&
      Math.hypot(p.x - bot.x - vector.x * 18, p.y - bot.y - vector.y * 18) < 25);
    if (!ally) return vector;
    for (const side of [bot.slot % 2 ? 1 : -1, bot.slot % 2 ? -1 : 1]) {
      const x = -vector.y * side;
      const y = vector.x * side;
      if (!blocked(bot.x + x * 22, bot.y + y * 22)) return { x, y };
    }
    return vector;
  }

  if (now >= bot.routeAt) {
    bot.routeAt = now + 550 + bot.slot * 25;
    bot.route = route(bot, target);
  }
  const path = bot.route || [];
  while (path.length && distance(bot, path[0]) < 9) path.shift();
  while (path.length > 1 && clearLine(bot, path[1], 14)) path.shift();
  return path.length ? steer(bot, path[0]) : idle;
}

module.exports = { botInput, route };
