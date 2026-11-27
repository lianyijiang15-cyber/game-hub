'use strict';

const secretTitles = {
  'forest-secret': '森林的秘密', 'marsh-secret': '濕地的低語',
  'ruins-secret': '石牆背後', 'snow-secret': '雪封來信', 'inferno-secret': '火中餘燼',
  'fortress-secret': '牆下密語', visitor: '神秘訪客'
};

function achievementProgress(account) {
  const arena = account.arenaHistory ?? [];
  const wins = arena.filter(record => record.result === 'win');
  const solved = (account.soupHistory ?? []).filter(record => record.result === 'solved');
  const sum = key => arena.reduce((total, record) => total + (record[key] ?? 0), 0);
  const achievement = (id, title, description, reward, count, goal = 1, hint = '', rarity = 'standard') =>
    ({ id, title, description, reward, count, goal, hint, rarity });
  const secret = (id, description, reward, hint) =>
    achievement(id, secretTitles[id], description, reward, Number(Boolean(account.secrets?.[id])), 1, hint, 'hidden');
  return {
    arena: [
      achievement('first-match', '初入戰場', '完成一場像素衝突對局。', '新兵徽章', arena.length),
      achievement('first-win', '旗開得勝', '贏得一場像素衝突對局。', '凱旋徽章', wins.length),
      achievement('flag-win', '拔旗先鋒', '在拔旗戰中獲勝。', '先鋒徽章', wins.filter(record => record.mode === 'flag').length),
      achievement('survival-win', '生存專家', '在生存戰中獲勝。', '求生徽章', wins.filter(record => record.mode === 'survival').length),
      achievement('control-win', '據點守衛', '在據點戰中獲勝。', '守衛徽章', wins.filter(record => record.mode === 'control').length),
      achievement('assists', '並肩作戰', '累計取得 20 次助攻。', '戰友徽章', sum('assists'), 20),
      achievement('first-kill', '初次狩獵', '首次擊殺敵方對戰成員。', '狩獵者稱號', sum('kills')),
      achievement('five-chests', '貪婪的探險家', '單場開啟 5 個寶箱。', '100 金幣', arena.some(record => record.chestsOpened >= 5) ? 1 : 0),
      achievement('low-hp', '絕境反擊', '自己低於最大生命值 10% 時完成擊殺。', '反擊者頭像', sum('clutchKills')),
      achievement('undying', '不死傳說', '以零死亡拿下一場勝利。', '不死者稱號', wins.filter(record => record.finished && record.deaths === 0).length),
      achievement('chest-hunter', '寶箱獵人', '累計開啟 100 個寶箱。', '金光開箱特效', sum('chestsOpened'), 100),
      achievement('finisher', '一擊制勝', '在團隊死鬥取得直接結束對局的擊殺。', '終結者擊殺特效', wins.filter(record => record.finisher).length, 1, '', 'legendary'),
      achievement('lone', '獨行者', '獲勝時是隊上唯一的存活成員。', '獨行者稱號', wins.filter(record => record.loneSurvivor).length),
      achievement('survivor', '極限生存', '在生存戰存活到比賽結束。', '生存者稱號', arena.filter(record => record.mode === 'survival' && record.survived).length),
      achievement('versatile', '全能戰士', '使用 5 位不同英雄，各贏得至少一場對局。', '全能武器外觀', new Set(wins.filter(record => record.hero).map(record => record.hero)).size, 5)
    ],
    soup: [
      secret('forest-secret', '在螢光古林找到自然景物間的隱藏區域。', '古林造型', '樹根旁偶爾會長出一朵不一樣的菇。'),
      secret('marsh-secret', '找到月影濕地的隱藏信物。', '月影徽章', '在深水旁，留意岸上微弱的冷光。'),
      secret('ruins-secret', '找到暮岩遺跡的隱藏信物。', '遺跡徽章', '石塊邊偶爾會亮起溫暖的光。'),
      secret('snow-secret', '找到霜雪松原的隱藏信物。', '雪原徽章', '再冷的天，松根邊也有不會凍住的光。'),
      secret('inferno-secret', '找到熔火深谷的隱藏信物。', '餘燼徽章', '熔岩照不到的角落，偶爾還有一縷餘燼。'),
      secret('fortress-secret', '找到灰垣堡壘的隱藏信物。', '密牆徽章', '石牆會沉默，但它的腳下可能留著信。'),
      secret('visitor', '遇見地圖上的隱藏旅人。', '旅人頭像', '藏在荒野的人影，有時會換地方。'),
      achievement('first-case', '初露鋒芒', '找齊任一題的全部線索。', '入門偵探徽章', solved.length),
      achievement('three-cases', '連環解謎', '完成 3 次推理。', '解謎者徽章', solved.length, 3),
      achievement('hard-case', '疑案剋星', '完成一題困難推理。', '名偵探徽章', solved.filter(record => record.difficulty === '困難').length),
      achievement('no-hints', '獨立推理', '完成推理且沒有使用提示。', '獨立偵探徽章', solved.filter(record => record.hints === 0).length),
      achievement('unknown', '未知的存在', '解開「停電後亮起的窗」的所有線索，且未使用提示。', '夜巡者造型',
        solved.filter(record => (record.storyId === 'blackout-window' || record.title === '停電後亮起的窗') && record.hints === 0).length, 1, '', 'legendary')
    ],
    coins: arena.some(record => record.chestsOpened >= 5) ? 100 : 0
  };
}

function achievementCatalog(account) {
  const { arena, soup, coins } = achievementProgress(account);
  const redact = items => items.flatMap(item => {
    if (item.count >= item.goal) return [item];
    if (item.rarity === 'legendary') return [];
    if (item.rarity === 'hidden') return [{ rarity: item.rarity, hint: item.hint, count: 0, goal: 1 }];
    return [{ id: item.id, rarity: item.rarity, count: item.count, goal: item.goal }];
  });
  return { arena: redact(arena), soup: redact(soup), coins };
}

module.exports = { achievementCatalog, secretTitles };
