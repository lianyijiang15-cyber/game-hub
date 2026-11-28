'use strict';

const { randomInt } = require('node:crypto');

// The order matches the 5 × 4 portrait atlas.
const names = [
  '阿寶', '老皮', '泡泡糖公主', '艾薇爾', '嗶莫',
  '冰霸王', '火焰公主', '腫泡泡公主', '彩虹姊姊', '薄荷管家',
  '樹鼻妹', '肉桂麵包', '檸檬公爵', '阿鵝', '陰魔王',
  '寶妹', '皮姊', '巨人蘇珊', '魔法哥', '少年啪'
];

function chooseBotPersona(players, reservedName, randomIndex = randomInt) {
  const occupied = new Set(players.map(player => player.name.toLowerCase()));
  if (reservedName) occupied.add(reservedName.toLowerCase());
  const available = names.map((name, botPersona) => ({ name, botPersona }))
    .filter(player => !occupied.has(player.name.toLowerCase()));
  return available[randomIndex(available.length)];
}

module.exports = { chooseBotPersona };
