'use strict';

const columns = 100;
const rows = 100;
const tileSize = 32;
const width = columns * tileSize;
const height = rows * tileSize;
const defaultSeed = 41729;
const solid = tile => tile === '#' || tile === 'r';
const impassable = tile => solid(tile) || tile === 'w';

function generateWorld(seed = defaultSeed) {

  function random(x, y, salt) {
    let value = Math.imul(x + salt, 374761393) ^ Math.imul(y + seed, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y, scale, salt) {
    const left = Math.floor(x / scale);
    const top = Math.floor(y / scale);
    const smooth = n => n * n * (3 - 2 * n);
    const u = smooth(x / scale - left);
    const v = smooth(y / scale - top);
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(lerp(random(left, top, salt), random(left + 1, top, salt), u),
      lerp(random(left, top + 1, salt), random(left + 1, top + 1, salt), u), v);
  }

  function field(x, y, salt) {
    return noise(x, y, 18, salt) * 0.72 + noise(x, y, 6, salt + 11) * 0.28;
  }

  function terrain(x, y) {
    if (!x || !y || x === columns - 1 || y === rows - 1) return '#';
    const center = x >= 32 && x <= 67 && y >= 39 && y <= 60;
    const variation = noise(x, y, 9, 113);
    const roadY = 49.5 + 3.5 * Math.sin((x - 49.5) / 9) + 2 * Math.sin((x - 49.5) / 3.6);
    const roadX = 49.5 + 7 * Math.sin((y - 49.5) / 10.5);
    if (Math.abs(y - roadY) < 1.5 + variation || Math.abs(x - roadX) < 1.2 + variation) return 'p';
    const wet = field(x, y, 41);
    const lake = Math.hypot((x - 23) / 13, (y - 24) / 9) + (variation - 0.5) * 0.65;
    if (!center && (lake < 1 || wet < 0.24)) return 'w';
    if (!center && field(x, y, 73) > 0.70) return 'r';
    // Two rocky outcrops give the central lanes cover without blocking the crossroads.
    if (Math.hypot((x - 45) / 2.8, (y - 43) / 2) < 1) return 'r';
    if (lake < 1.19 || wet < 0.35) return 'd';
    return field(x, y, 97) > 0.56 ? 'f' : 'g';
  }

  const grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => y < rows / 2 ? terrain(x, y) : terrain(columns - 1 - x, rows - 1 - y)));
  // Keep only walkable land connected to the crossroads.
  const reachable = new Set([49 * columns + 49]);
  for (const index of reachable) {
    const x = index % columns;
    const y = Math.floor(index / columns);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const tile = grid[ny]?.[nx];
      if (tile && !impassable(tile)) reachable.add(ny * columns + nx);
    }
  }
  const tiles = grid.map((row, y) => row.map((tile, x) =>
    !impassable(tile) && !reachable.has(y * columns + x) ? 'r' : tile).join(''));

  return { width, height, columns, rows, tileSize, tiles, seed };
}

module.exports = { generateWorld, solid, impassable };
