'use strict';

const arenaContext = $('arena').getContext('2d', { alpha: false });
const dungeon = document.createElement('canvas');
let dungeonKey = '';
const colors = {
  '紅隊': { light: '#fb8d74', mid: '#bb453d', dark: '#672939' },
  '藍隊': { light: '#87d4f8', mid: '#3d78ad', dark: '#284669' }
};
const letters = { warrior: '戰', archer: '弓', mage: '法' };

function rect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

function paintDungeon(map) {
  dungeon.width = map.width;
  dungeon.height = map.height;
  const ctx = dungeon.getContext('2d');
  const palettes = ['#30313d', '#333541', '#353643', '#3a3945', '#373944'];
  ctx.fillStyle = '#242630';
  ctx.fillRect(0, 0, map.width, map.height);
  for (let y = 0; y < map.height; y += 24) {
    for (let x = -24; x < map.width; x += 48) {
      const left = x + (y % 48 ? 24 : 0);
      const seed = Math.imul(x + 87, 1759) ^ Math.imul(y + 49, 1171);
      rect(ctx, palettes[Math.abs(seed) % palettes.length], left, y, 46, 22);
      rect(ctx, '#ffffff0b', left + 2, y + 1, 42, 2);
      rect(ctx, '#00000016', left + 2, y + 19, 44, 3);
      if (seed % 7 === 0) {
        rect(ctx, '#20212a', left + 12, y + 11, 12, 2);
        rect(ctx, '#20212a', left + 22, y + 7, 2, 5);
      }
    }
  }
  for (const [x, tint] of [[32, '#953e3940'], [map.width - 144, '#36659650']]) {
    rect(ctx, tint, x, 44, 112, map.height - 88);
    for (let y = 72; y < map.height - 50; y += 104) {
      const accent = x < 100 ? '#a85c54' : '#577caf';
      rect(ctx, accent, x + 24, y + 20, 14, 2);
      rect(ctx, accent, x + 76, y + 20, 14, 2);
    }
  }
  const bounds = [[0, 0, map.width, map.border], [0, map.height - map.border, map.width, map.border],
    [0, map.border, map.border, map.height - map.border * 2],
    [map.width - map.border, map.border, map.border, map.height - map.border * 2]];
  for (const [x, y, w, h] of [...map.walls, ...bounds]) {
    rect(ctx, '#15172088', x + 5, y + 6, w, h);
    if (w === 32 && h === 40) {
      rect(ctx, '#352317', x, y, w, h);
      rect(ctx, '#846045', x + 3, y + 3, w - 6, h - 7);
      rect(ctx, '#ad7b4e', x + 6, y + 5, 5, h - 13);
      rect(ctx, '#4d3427', x + 18, y + 5, 3, h - 13);
      rect(ctx, '#b98c5f', x + 2, y + 9, w - 4, 3);
      rect(ctx, '#b98c5f', x + 2, y + h - 12, w - 4, 3);
      continue;
    }
    rect(ctx, '#22232e', x, y, w, h);
    for (let row = 2; row < h - 3; row += 13) {
      const brickHeight = Math.min(11, h - 3 - row);
      for (let col = 2; col < w - 3; col += 22) {
        const brickWidth = Math.min(20, w - 3 - col);
        rect(ctx, row < h - 16 ? '#5b5967' : '#414050', x + col, y + row, brickWidth, brickHeight);
        rect(ctx, '#ffffff22', x + col, y + row, brickWidth, 2);
      }
    }
    rect(ctx, '#82808d', x, y, w, 3);
    rect(ctx, '#33313e', x, y + h - 4, w, 4);
  }
}

function torches(ctx, map, time) {
  for (const [left, top, width, height] of map.walls) {
    if (width === 32) continue;
    const x = left + width / 2;
    const y = top + height - 10;
    const flicker = Math.floor(time / 110 + x) % 3;
    const glow = ctx.createRadialGradient(x, y - 6, 1, x, y - 6, 41 + flicker * 3);
    glow.addColorStop(0, '#ff9f4b68');
    glow.addColorStop(1, '#ff773000');
    rect(ctx, glow, x - 48, y - 54, 96, 96);
    rect(ctx, '#29232a', x - 4, y - 1, 8, 10);
    rect(ctx, '#d57638', x - 4, y - 9 - flicker, 8, 10 + flicker);
    rect(ctx, '#ffdc85', x - 2, y - 10 + flicker, 4, 9);
  }
}

function armor(ctx, job, color, headX, stride, back) {
  rect(ctx, '#1a1924', -10, -25, 20, 23);
  rect(ctx, '#312a38', -7, -8 + stride, 5, 10);
  rect(ctx, '#312a38', 2, -8 - stride, 5, 10);
  rect(ctx, '#141922', -8, stride, 7, 3);
  rect(ctx, '#141922', 2, -stride, 7, 3);
  rect(ctx, color.dark, -8, -22, 16, 16);
  rect(ctx, color.mid, -7, -22, 14, 12);
  if (job === 'warrior') {
    rect(ctx, '#9aabb5', -10, -22, 5, 8);
    rect(ctx, '#d0d4cd', 5, -22, 5, 8);
    rect(ctx, '#d5c2a1', -4, -21, 8, 2);
    rect(ctx, '#73818e', headX - 7, -34, 14, 13);
    rect(ctx, '#c6cacf', headX - 5, -35, 10, 8);
    rect(ctx, color.light, headX - 2, -39, 4, 5);
    if (!back) rect(ctx, '#272e3c', headX - 5, -28, 10, 3);
    rect(ctx, '#3a252a', -13, -17, 8, 12);
    rect(ctx, color.light, -12, -16, 6, 8);
    rect(ctx, color.mid, -12, -11, 6, 5);
  } else if (job === 'archer') {
    rect(ctx, color.dark, -9, -17, 5, 11);
    rect(ctx, '#b7865d', 4, -25, 4, 17);
    rect(ctx, '#f2d497', 5, -28, 2, 8);
    rect(ctx, color.dark, headX - 8, -32, 16, 12);
    rect(ctx, color.light, headX - 5, -35, 10, 3);
    rect(ctx, color.mid, headX - 6, -33, 12, 5);
    if (!back) {
      rect(ctx, '#e4ab83', headX - 4, -28, 8, 6);
      rect(ctx, '#352636', headX - 3, -27, 2, 2);
    }
  } else {
    rect(ctx, color.dark, -10, -16, 20, 16);
    rect(ctx, color.mid, -8, -17, 16, 13);
    rect(ctx, '#dfaf71', -8, -6, 16, 2);
    if (!back) {
      rect(ctx, '#e4b297', headX - 4, -29, 8, 8);
      rect(ctx, '#e6d6cb', headX - 3, -24, 6, 6);
    }
    rect(ctx, color.light, headX - 10, -32, 20, 3);
    rect(ctx, color.dark, headX - 7, -37, 14, 5);
    rect(ctx, color.mid, headX - 4, -41, 8, 5);
    rect(ctx, color.light, headX + 1, -44, 3, 5);
  }
  rect(ctx, '#edbe77', -2, -12, 4, 2);
}

function weapon(ctx, player, color, time) {
  const swinging = player.action?.until > time;
  const angle = swinging ? player.angle : player.facing;
  const elapsed = swinging ? 1 - (player.action.until - time) / 240 : 0;
  ctx.save();
  ctx.translate(0, -13);
  ctx.rotate(angle + (swinging && player.job === 'warrior' ? 1.5 * (elapsed - 0.5) : 0));
  const reach = swinging ? 5 : 0;
  if (player.job === 'warrior') {
    rect(ctx, '#ba8757', 8 + reach, -2, 7, 4);
    rect(ctx, '#efbc75', 14 + reach, -5, 3, 10);
    rect(ctx, '#d3dfe4', 17 + reach, -2, 13, 4);
    rect(ctx, '#f7ffef', 19 + reach, -2, 9, 1);
  } else if (player.job === 'archer') {
    rect(ctx, '#a16b47', 11 + reach, -8, 3, 16);
    rect(ctx, '#d29562', 14 + reach, -6, 4, 12);
    rect(ctx, '#d8ceb4', 10 + reach, -7, 1, 14);
    if (swinging) rect(ctx, '#ffe5b4', 12, 0, 13, 2);
  } else {
    rect(ctx, '#b98258', 10 + reach, -1, 13, 3);
    rect(ctx, color.light, 22 + reach, -4, 6, 8);
    rect(ctx, '#fff0dd', 23 + reach, -3, 2, 3);
  }
  ctx.restore();
}

function sprite(ctx, p, old, blend, time, localId) {
  const interpolate = old && old.alive === p.alive && old.spawnedAt === p.spawnedAt;
  const x = Math.round(interpolate ? old.x + (p.x - old.x) * blend : p.x);
  const y = Math.round(interpolate ? old.y + (p.y - old.y) * blend : p.y);
  const color = colors[p.team];
  if (!p.alive) {
    const age = time - (p.respawnAt - 3000);
    if (age < 600) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 600);
      rect(ctx, color.dark, x - 13, y - 3, 26, 7);
      for (let i = 0; i < 6; i++) {
        rect(ctx, color.light, x + (i - 3) * (3 + age / 70), y - 7 - (i % 3 + 1) * age / 38, 3, 3);
      }
      ctx.restore();
    }
    return;
  }
  rect(ctx, '#13151fee', x - 13, y + 1, 26, 6);
  rect(ctx, p.id === localId ? '#f9df9b' : color.light, x - 11, y + 4, 22, 2);
  const stride = p.moving ? [2, 0, -2, 0][Math.floor(time / 75) % 4] : 0;
  const bob = p.moving ? Math.abs(stride) / 2 : Math.floor(time / 330) % 2;
  const facing = p.action?.until > time ? p.angle : p.facing;
  const headX = Math.abs(Math.cos(facing)) > 0.7 ? Math.sign(Math.cos(facing)) * 3 : 0;
  ctx.save();
  ctx.translate(x, y - bob);
  armor(ctx, p.job, color, headX, stride, Math.sin(facing) < -0.7);
  weapon(ctx, p, color, time);
  if (time - p.hurtAt < 145 && p.hurtAt > 0) rect(ctx, '#fff1db83', -8, -25, 16, 14);
  ctx.restore();
  if (time - p.spawnedAt < 650) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (time - p.spawnedAt) / 650);
    for (const shift of [-14, 12]) rect(ctx, color.light, x + shift, y - 35, 2, 35);
    ctx.restore();
  }
  const name = `${p.bot ? '[AI] ' : ''}${p.name} · ${letters[p.job]}`;
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#17131d';
  ctx.strokeText(name, x, y - 53, 155);
  ctx.fillStyle = p.id === localId ? '#ffe3a3' : '#faf0df';
  ctx.fillText(name, x, y - 53, 155);
  rect(ctx, '#16151d', x - 20, y - 49, 40, 5);
  rect(ctx, color.light, x - 19, y - 48, Math.ceil(38 * p.hp / p.maxHp), 3);
}

function drawArena(state, old, blend, time, aim, localId) {
  const ctx = arenaContext;
  const key = JSON.stringify(state.map);
  if (dungeonKey !== key) {
    dungeonKey = key;
    paintDungeon(state.map);
  }
  ctx.drawImage(dungeon, 0, 0);
  torches(ctx, state.map, time);
  const older = new Map(old?.players.map(p => [p.id, p]));
  for (const p of [...state.players].sort((a, b) => a.y - b.y)) sprite(ctx, p, older.get(p.id), blend, time, localId);
  for (const effect of state.effects) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (effect.until - time) / 240));
    ctx.strokeStyle = effect.type === 'blast' || effect.type === 'mage' ? '#ffad61' : colors[effect.team].light;
    ctx.lineWidth = effect.type === 'blast' ? 8 : 4;
    ctx.beginPath();
    if (effect.type === 'spin' || effect.type === 'blast') {
      ctx.arc(effect.x, effect.y, effect.range, 0, Math.PI * 2);
    } else if (effect.type === 'warrior') {
      ctx.arc(effect.x, effect.y, effect.range - 12, effect.angle - 0.65, effect.angle + 0.65);
    } else {
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x + 36 * Math.cos(effect.angle), effect.y + 36 * Math.sin(effect.angle));
    }
    ctx.stroke();
    ctx.restore();
  }
  for (const p of state.projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (p.type === 'arrow') {
      rect(ctx, '#ebba7a', -11, -1, 14, 2);
      rect(ctx, '#ffffce', 2, -2, 4, 4);
    } else {
      rect(ctx, '#c74638', -11, -4, 17, 8);
      rect(ctx, '#ff9a44', -5, -6, 12, 12);
      rect(ctx, '#ffe3a0', 0, -3, 6, 6);
    }
    ctx.restore();
  }
  rect(ctx, '#fff0c2', aim.x - 6, aim.y, 4, 1);
  rect(ctx, '#fff0c2', aim.x + 3, aim.y, 4, 1);
  rect(ctx, '#fff0c2', aim.x, aim.y - 6, 1, 4);
  rect(ctx, '#fff0c2', aim.x, aim.y + 3, 1, 4);
}
