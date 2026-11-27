'use strict';

const tileSize = 32;
const defaultSeed = 41729;
const campOffset = 944;
const solid = tile => tile === '#' || tile === 'r' || tile === 't';
const impassable = tile => solid(tile) || tile === 'w';

const scenes = {
  forest: { name: '螢光古林', forest: .37, trees: .48, rock: .75, water: .23, lakeX: 1, lakeY: .9 },
  marsh: { name: '月影濕地', forest: .49, trees: .31, rock: .81, water: .36, lakeX: 1.24, lakeY: 1.25 },
  ruins: { name: '暮岩遺跡', forest: .53, trees: .27, rock: .63, water: .22, lakeX: .78, lakeY: .72 },
  snow: { name: '霜雪松原', forest: .46, trees: .42, rock: .77, water: .28, lakeX: 1.3, lakeY: .8 },
  inferno: { name: '熔火深谷', forest: .56, trees: .18, rock: .64, water: .34, lakeX: .82, lakeY: 1.3 },
  fortress: { name: '灰垣堡壘', forest: .57, trees: .20, rock: .66, water: .25, lakeX: 1.1, lakeY: .78 }
};
const sceneOrder = Object.keys(scenes);
const sceneForSeed = seed => sceneOrder[(seed >>> 0) % sceneOrder.length];

function generateWorld(seed = defaultSeed, scene) {
  const theme = scenes[scene];
  const columns = theme ? 144 : 100;
  const rows = columns;
  const width = columns * tileSize;
  const height = rows * tileSize;
  const middle = (columns - 1) / 2;

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
    const campColumn = (width / 2 - campOffset) / tileSize - 0.5;
    if (Math.abs(y - middle) <= 8 &&
        Math.min(Math.abs(x - campColumn), Math.abs(x - (columns - 1 - campColumn))) <= 2) return 'g';
    const center = Math.abs(x - middle) <= 17.5 && Math.abs(y - middle) <= 10.5;
    const variation = noise(x, y, 9, 113);
    const roadY = middle + 3.5 * Math.sin((x - middle) / 9) + 2 * Math.sin((x - middle) / 3.6);
    const roadX = middle + 7 * Math.sin((y - middle) / 10.5);
    if (Math.abs(y - roadY) < 1.5 + variation || Math.abs(x - roadX) < 1.2 + variation) return 'p';
    const outerTrail = theme && Math.abs(Math.hypot((x - middle) * .85, y - middle) - (40 + variation * 7)) < 1.8;
    if (outerTrail) return 'p';
    if (scene === 'fortress' && Math.abs(x - middle) >= 13 && Math.abs(x - middle) < 16 &&
        Math.abs(y - middle) >= 5 && Math.abs(y - middle) < 24) return '#';
    if (!center && scene === 'inferno' && Math.abs(x - (middle - 27 + Math.sin(y / 8) * 6)) < 2 + variation * 3) return 'w';
    if (!center && scene === 'snow' && Math.abs(y - (middle - 31 + Math.cos(x / 14) * 4)) < 2 + variation * 2) return 'w';
    if (scene === 'ruins' && x > middle - 38 && x < middle - 23 && y > middle - 27 && y < middle - 14 &&
        (x % 7 === 0 || y % 9 === 0) && (x + y) % 6 !== 0) return 'r';
    const wet = field(x, y, 41);
    const lake = Math.hypot((x - columns * .23) / (13 * (theme?.lakeX ?? 1)), (y - rows * .24) / (9 * (theme?.lakeY ?? 1))) + (variation - 0.5) * 0.65;
    if (!center && (lake < 1 || wet < (theme?.water ?? .24))) return 'w';
    if (!center && field(x, y, 73) > (theme?.rock ?? .70)) return 'r';
    // Two rocky outcrops give the central lanes cover without blocking the crossroads.
    if (Math.hypot((x - middle + 4.5) / 2.8, (y - middle + 6.5) / 2) < 1) return 'r';
    if (lake < 1.19 || wet < (theme ? theme.water + .10 : .35)) return 'd';
    if (field(x, y, 131) > (center ? 0.67 : 0.59)) return 'b';
    if (field(x, y, 97) <= (theme?.forest ?? .49)) return 'g';
    return !center && random(x, y, 177) < (theme?.trees ?? .16) ? 't' : 'f';
  }

  const grid = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => y < rows / 2 ? terrain(x, y) : terrain(columns - 1 - x, rows - 1 - y)));
  // Keep only walkable land connected to the crossroads.
  const reachable = new Set([Math.floor(middle) * columns + Math.floor(middle)]);
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

  return { width, height, columns, rows, tileSize, tiles, seed, ...(theme && { scene, name: theme.name }) };
}

module.exports = { generateWorld, solid, impassable, campOffset, sceneForSeed };
