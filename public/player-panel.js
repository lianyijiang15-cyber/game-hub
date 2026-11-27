'use strict';

const showPlayerPanel = (() => {
  const panel = $('player-dialog');
  const message = $('player-message');
  let activePanel;
  let activeRead = 0;
  let submitting = false;
  const dateLabel = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

  function rows(id, items, label, createRow) {
    const entries = items.map(createRow);
    if (!entries.length) entries.push(element('li', label));
    $(id).replaceChildren(...entries);
  }

  function renderAchievements({ arena, soup }) {
    const entries = [...arena, ...soup];
    const unlocked = entries.filter(item => item.count >= item.goal).length;
    $('achievement-summary').textContent = `已解鎖 ${unlocked} / ${entries.length}`;
    const card = item => {
      const unlocked = item.count >= item.goal;
      const row = element('li', '');
      row.setAttribute('data-unlocked', String(unlocked));
      const status = unlocked ? '✓ 已解鎖' : '未解鎖';
      row.append(element('strong', item.title), element('span', item.description),
        element('small', `${status} · ${Math.min(item.count, item.goal)} / ${item.goal}`));
      return row;
    };
    rows('arena-achievements', arena, '目前沒有對戰成就。', card);
    rows('soup-achievements', soup, '目前沒有推理成就。', card);
  }

  function historyRow(item, title, summary) {
    const row = element('li', '');
    const button = element('button', '');
    button.className = 'history-entry';
    button.type = 'button';
    button.append(element('strong', title), element('span', summary),
      element('small', dateLabel.format(new Date(item.date))));
    button.onclick = () => openHistory(item.id);
    row.append(button);
    return row;
  }

  function renderHistory({ arena, soup }) {
    const results = { win: '勝利', loss: '敗北', draw: '平手' };
    rows('arena-history', arena, '還沒有對戰紀錄。', item => historyRow(item,
      `${modeNames[item.mode ?? 'deathmatch']} · ${results[item.result]} · ${item.team}`,
      `紅 ${scoreText(item, '紅隊')} / 藍 ${scoreText(item, '藍隊')} · K/D/A ${item.kills}/${item.deaths}/${item.assists}`));
    rows('soup-history', soup, '還沒有推理紀錄。', item => historyRow(item, item.title,
      `${item.result === 'solved' ? '完成推理' : '揭曉答案'} · 使用 ${item.hints} 次提示`));
  }

  function renderHistoryDetail(record) {
    const content = $('history-detail-content');
    const date = dateLabel.format(new Date(record.date));
    if (record.kind === 'soup') {
      content.append(element('h3', record.title), element('p', date),
        element('p', record.result === 'solved' ? '結果：完成推理' : '結果：揭曉答案'),
        element('p', `使用提示 ${record.hints} 次`));
      if (record.clues != null) content.append(element('p', `解鎖線索 ${record.progress}/${record.clues}`));
      if (record.difficulty) content.append(element('p', `難度：${record.difficulty}`));
      return;
    }
    const detail = record.detail;
    const summary = record.result === 'win' ? '勝利' : record.result === 'loss' ? '敗北' : '平手';
    content.append(element('h3', `${modeNames[record.mode ?? 'deathmatch']} · ${summary}`),
      element('p', `${date} · 紅隊 ${scoreText(record, '紅隊')} / 藍隊 ${scoreText(record, '藍隊')}`));
    if (!detail) {
      content.append(element('p', `個人紀錄 · ${jobNames[record.job]} · K/D/A ${record.kills}/${record.deaths}/${record.assists} · 傷害 ${record.damage}`),
        element('small', '這場比賽早於完整對局紀錄功能，僅留存個人統計。'));
      return;
    }
    if (detail.duration != null) content.append(element('p', '對局時長 ' + formatDuration(detail.duration)));
    const reason = detail.objective?.reason;
    if (reason && modeReasons[reason]) content.append(element('p', modeReasons[reason]));
    for (const team of ['紅隊', '藍隊']) {
      content.append(element('h4', team));
      const table = element('table', '');
      const head = element('thead', '');
      const labels = element('tr', '');
      const survival = record.mode === 'survival';
      const columns = ['玩家', '職業／職務', 'K/D/A', '傷害', ...(survival ? ['生存'] : []), '稱號'];
      labels.append(...columns.map(label => element('th', label)));
      head.append(labels);
      const tbody = element('tbody', '');
      for (const p of detail.players.filter(player => player.team === team)) {
        const row = element('tr', '');
        const awards = detail.awards?.[team];
        const badge = [p.id === awards?.mvp && 'MVP', p.id === awards?.lowestKda && '戰犯'].filter(Boolean).join(' / ');
        const values = [p.name + (p.bot ? ' · AI' : ''), [heroName(p), roleNames[p.role]].filter(Boolean).join('／'),
          `${p.kills}/${p.deaths}/${p.assists}`, p.damage, ...(survival ? [formatDuration(p.survival)] : []), badge];
        row.append(...values.map(value => element('td', String(value))));
        tbody.append(row);
      }
      table.append(head, tbody);
      const scroll = element('div', '');
      scroll.className = 'history-table';
      scroll.append(table);
      content.append(scroll);
    }
  }

  async function openHistory(id) {
    const request = ++activeRead;
    $('player-history').hidden = true;
    $('history-detail').hidden = false;
    $('history-back').focus();
    $('history-detail-content').replaceChildren();
    message.textContent = '載入中…';
    try {
      const record = await accountRequest('history/' + encodeURIComponent(id));
      if (!panel.open || request !== activeRead) return;
      renderHistoryDetail(record);
      message.textContent = '';
    } catch (error) {
      if (panel.open && request === activeRead) message.textContent = error.message;
    }
  }

  $('history-back').onclick = () => {
    activeRead++;
    message.textContent = '';
    $('history-detail').hidden = true;
    $('player-history').hidden = false;
  };

  function friendLabel(player) { return player.name + ' · ' + player.id; }

  function renderFriends({ friends, incoming, sent }) {
    rows('friend-list', friends, '還沒有好友。', player => element('li', friendLabel(player)));
    rows('friend-sent', sent, '沒有待回覆的邀請。', player => element('li', friendLabel(player)));
    rows('friend-incoming', incoming, '沒有收到邀請。', player => {
      const row = element('li', friendLabel(player));
      const actions = element('div', '');
      for (const accept of [true, false]) {
        const button = element('button', accept ? '接受' : '拒絕');
        button.type = 'button';
        button.onclick = () => changeFriends('friends/respond', { id: player.id, accept },
          accept ? '已加入好友。' : '已拒絕邀請。');
        actions.append(button);
      }
      row.append(actions);
      return row;
    });
  }

  async function refresh(section, notice = '') {
    const request = ++activeRead;
    message.textContent = '載入中…';
    try {
      const result = await accountRequest(section);
      if (!panel.open || request !== activeRead) return;
      if (section === 'achievements') renderAchievements(result);
      else if (section === 'history') renderHistory(result);
      else renderFriends(result);
      message.textContent = notice;
    } catch (error) {
      if (panel.open && request === activeRead) message.textContent = error.message;
    }
  }

  async function changeFriends(route, body, notice, onSuccess) {
    if (submitting) return;
    submitting = true;
    const request = activeRead;
    try {
      const result = await accountRequest(route, body);
      if (panel.open && request === activeRead) {
        onSuccess?.();
        await refresh('friends', typeof notice === 'string' ? notice : notice(result));
      }
    } catch (error) {
      if (panel.open && request === activeRead) message.textContent = error.message;
    } finally {
      submitting = false;
    }
  }

  $('friend-form').onsubmit = event => {
    event.preventDefault();
    const input = $('friend-query');
    return changeFriends('friends/request', { by: $('friend-by').value, query: input.value.trim() },
      result => '已送出邀請給 ' + result.player.name + '。', () => { input.value = ''; });
  };

  function selectPanel(section) {
    $('player-title').textContent = section === 'friends' ? '好友' : '成就圖鑑';
    $('history-detail').hidden = true;
    for (const name of ['achievements', 'history', 'friends']) $('player-' + name).hidden = section !== name;
  }

  $('achievement-history').onclick = () => {
    selectPanel('history');
    $('history-catalog').focus();
    return refresh('history');
  };
  $('history-catalog').onclick = () => {
    selectPanel('achievements');
    $('achievement-history').focus();
    return refresh('achievements');
  };

  $('player-close').onclick = () => panel.close();
  return section => {
    if (panel.open) return;
    if (section !== activePanel) $('friend-query').value = '';
    activePanel = section;
    selectPanel(section);
    $('achievement-summary').textContent = '';
    for (const id of ['arena-achievements', 'soup-achievements', 'arena-history', 'soup-history',
      'friend-list', 'friend-sent', 'friend-incoming']) $(id).replaceChildren();
    panel.showModal();
    return refresh(section);
  };
})();
