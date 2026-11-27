'use strict';

const { impassable } = require('./world');

// A 5:2 ground footprint, independent of the sprite and weapon hit detection.
const halfWidth = 12.5;
const halfHeight = 5;

function terrainBlocked(world, x, y) {
  const { width, height, tileSize, tiles } = world;
  const left = x - halfWidth;
  const top = y - halfHeight;
  const right = x + halfWidth;
  const bottom = y + halfHeight;
  if (left < 0 || top < 0 || right > width || bottom > height) return true;

  for (let row = Math.floor(top / tileSize); row < Math.ceil(bottom / tileSize); row++) {
    for (let col = Math.floor(left / tileSize); col < Math.ceil(right / tileSize); col++) {
      if (impassable(tiles[row][col])) return true;
    }
  }
  return false;
}

function playerBlocked(players, actor, x, y) {
  return players.some(other => other !== actor && other.alive &&
    Math.abs(x - other.x) < halfWidth * 2 && Math.abs(y - other.y) < halfHeight * 2);
}

function movePlayer(world, players, actor, dx, dy) {
  // Increments shorter than the footprint prevent skipping across narrow gaps between players.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const stepX = dx / steps;
  const stepY = dy / steps;
  const originX = actor.x;
  const originY = actor.y;
  for (let i = 0; i < steps; i++) {
    const x = actor.x + stepX;
    if (stepX && !terrainBlocked(world, x, actor.y) && !playerBlocked(players, actor, x, actor.y)) actor.x = x;
    const y = actor.y + stepY;
    if (stepY && !terrainBlocked(world, actor.x, y) && !playerBlocked(players, actor, actor.x, y)) actor.y = y;
  }
  return actor.x !== originX || actor.y !== originY;
}

module.exports = { terrainBlocked, playerBlocked, movePlayer };
