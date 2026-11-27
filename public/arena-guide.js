'use strict';

const arenaGuides = {
  flag: {
    caption: '畫面示意｜兩隊的旗在中央旗區。靠近後按 E 拔下敵旗。',
    objective: 'E  拔下敵旗',
    clock: '20:00',
    steps: [
      ['搶旗獲勝', '兩隊從不同區域出發。靠近中央旗區，按 E 拔下敵隊旗幟就獲勝。'],
      ['草藥與解藥', '擊敗妖獸可取得草藥。輔助按 G 將三種草藥各一份融合成解藥，隊員按 F 消耗一顆解藥，為自己延長 5 分鐘毒氣免疫。'],
      ['時間與淘汰', '初始毒氣免疫為 5 分鐘，耗盡後會扣血。淘汰後無法復活。20 分鐘內無人拔旗，則比較各隊最靠近旗區的存活隊員。']
    ]
  },
  survival: {
    caption: '畫面示意｜夜晚仍可搜尋補給，但部分補給包會變成陷阱。',
    objective: 'E  開啟補給包',
    clock: '14:32',
    steps: [
      ['維持生存資源', '開局有 5 分鐘的生存資源。靠近藥材包或道具包，按 E 開啟。資源耗盡會持續扣血，倒下後無法復活。'],
      ['留意晝夜變化', '每 8 分鐘切換晝夜。白天補給可正常使用，妖獸不定時加入。夜晚部分藥材包藏有妖獸，部分道具包會立即淘汰開啟者。'],
      ['保護關鍵隊員', '指揮淘汰，全隊位置暴露 3 分鐘，並扣除平均生存時間 1 分 30 秒。輔助淘汰則暴露全隊位置 1 分鐘。'],
      ['計算勝負', '24 分鐘到時或任一隊全員淘汰便結算。平均生存時間較長的隊伍獲勝。']
    ]
  },
  control: {
    caption: '畫面示意｜靠近據點旗幟可開始標記。旗上方的進度條表示標記進度。',
    objective: 'E  開始標記',
    clock: '16:48',
    steps: [
      ['搜尋旗形據點', '每局隨機生成 5–7 個據點。未開始標記的據點每 5 分鐘換位。'],
      ['標記 3 分鐘', '靠近旗幟按 E 開始標記。倒數結束時，若標記沒有被中斷，據點便永久歸該隊。'],
      ['搶奪進行中的據點', '在據點附近淘汰敵隊 3 名打手、全部守點隊員，或 1 名指揮／輔助，即可中斷對手標記並重新開始。'],
      ['計算勝負', '全部據點標記成功或 20 分鐘結束時，標記較多的隊伍獲勝。倒下的玩家可在 3 秒後復活。']
    ]
  }
};

function paintGuideScene(mode, map) {
  const canvas = $('guide-scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const x = map.width / 2;
  const y = map.height / 2;
  const camera = { x: x - canvas.width / 2, y: y - canvas.height / 2 };
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  paintWorld(ctx, map, canvas.width, canvas.height, camera);
  if (mode === 'survival') {
    drawChest(ctx, { x, y, quality: 'rare', openedAt: null }, 0);
    drawChest(ctx, { x: x - 115, y: y + 70, quality: 'common', openedAt: null }, 0);
    drawBeast(ctx, { x: x + 108, y: y - 12, species: 1, hp: 80, maxHp: 100 }, 0);
  } else {
    drawObjective(ctx, { x, y, marking: '紅隊', ends: 100_000 }, 0, mode === 'flag');
    if (mode === 'flag') drawBeast(ctx, { x: x + 120, y: y + 54, species: 0, hp: 65, maxHp: 100 }, 0);
    else drawObjective(ctx, { x: x - 142, y: y + 56, owner: '藍隊' }, 0, false);
  }
  for (const [hero, offset, team] of [['sky', -48, '紅隊'], ['sain', -96, '紅隊'], ['gamma', 70, '藍隊']]) {
    const job = heroes[hero].job;
    sprite(ctx, { id: hero, name: heroes[hero].name, hero, job, team, x: x + offset, y: y + 24,
      alive: true, hp: 80, maxHp: 100, facing: offset < 0 ? 0 : Math.PI }, null, 0, 0, 'sky');
  }
  ctx.restore();
  if (mode === 'survival') rect(ctx, '#5e7ac033', 0, 0, canvas.width, canvas.height);
  const guide = arenaGuides[mode];
  rect(ctx, '#17232df2', canvas.width / 2 - 85, 12, 170, 41);
  rect(ctx, '#d6c39b', canvas.width / 2 - 85, 12, 170, 2);
  ctx.fillStyle = '#fff4d4';
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(guide.clock, canvas.width / 2, 40);
  rect(ctx, '#17232df2', canvas.width / 2 - 98, canvas.height - 65, 196, 36);
  ctx.fillText(guide.objective, canvas.width / 2, canvas.height - 40);
}

$('room-guide').onclick = () => {
  const mode = selectedMode;
  const guide = arenaGuides[mode];
  const dialog = $('mode-guide');
  if (!guide || dialog.open) return;
  $('guide-title').textContent = modeNames[mode] + '玩法介紹';
  $('guide-caption').textContent = guide.caption;
  $('guide-steps').replaceChildren(...guide.steps.map(([heading, text]) => {
    const item = element('li', '');
    item.append(element('strong', heading), element('p', text));
    return item;
  }));
  dialog.showModal();
  previewMap.then(map => {
    if (map && dialog.open && selectedMode === mode) paintGuideScene(mode, map);
  });
};
$('guide-close').onclick = () => $('mode-guide').close();
