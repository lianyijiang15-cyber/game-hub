'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { terrainBlocked, movePlayer } = require('../arena/collision');

const world = {
  width: 256, height: 256, tileSize: 32,
  tiles: [
    '########',
    '#p.....#',
    '#..t...#',
    '#..rw..#',
    '#..bp..#',
    '#......#',
    '#......#',
    '########'
  ]
};

test('tree, rock, water and four world boundaries block the rectangular footprint', () => {
  for (const [x, y] of [[112, 80], [112, 112], [144, 112], [31, 144], [225, 144], [144, 30], [144, 225]]) {
    assert.ok(terrainBlocked(world, x, y), `${x},${y}`);
  }
  for (const [x, y] of [[112, 144], [144, 144], [82, 80], [112, 58]]) {
    assert.equal(terrainBlocked(world, x, y), false, `${x},${y}`);
  }
  assert.equal(terrainBlocked(world, 84, 80), true); // Only the edge of the footprint overlaps.
});

test('diagonal movement slides along the blocked axis and large steps cannot tunnel', () => {
  const player = { x: 82, y: 76 };
  movePlayer(world, [player], player, 18, 12);
  assert.equal(player.x, 82);
  assert.ok(Math.abs(player.y - 88) < 1e-9);
  movePlayer(world, [player], player, 96, 0);
  assert.equal(player.x, 82);
  assert.ok(!terrainBlocked(world, player.x, player.y));
  movePlayer(world, [player], player, 0, 60);
  movePlayer(world, [player], player, 60, 0);
  assert.equal(player.x, 142);
  assert.ok(Math.abs(player.y - 148) < 1e-9);
});

test('player footprints block each other independently from terrain and attack radius', () => {
  const a = { x: 60, y: 48, alive: true };
  const b = { x: 90, y: 48, alive: true };
  movePlayer(world, [a, b], a, 60, 0);
  assert.ok(a.x > 60 && a.x <= 65);
  movePlayer(world, [a, b], a, 0, 10);
  movePlayer(world, [a, b], a, 40, 0);
  assert.ok(a.x > b.x);
});
