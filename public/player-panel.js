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

  function renderHistory({ arena, soup }) {
    const results = { win: '勝利', loss: '敗北', draw: '平手' };
    rows('arena-history', arena, '還沒有對戰紀錄。', item => {
      const row = element('li', '');
      row.append(element('strong', results[item.result] + ' · ' + item.team + ' · ' + jobNames[item.job]),
        element('span', `紅 ${item.score['紅隊']} / 藍 ${item.score['藍隊']} · K/D/A ${item.kills}/${item.deaths}/${item.assists} · 傷害 ${item.damage}`),
        element('small', dateLabel.format(new Date(item.date))));
      return row;
    });
    rows('soup-history', soup, '還沒有推理紀錄。', item => {
      const row = element('li', '');
      row.append(element('strong', item.title), element('span',
        `${item.result === 'solved' ? '完成推理' : '揭曉答案'} · 使用 ${item.hints} 次提示`),
        element('small', dateLabel.format(new Date(item.date))));
      return row;
    });
  }

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
      if (section === 'history') renderHistory(result);
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

  $('player-close').onclick = () => panel.close();
  return section => {
    if (panel.open) return;
    if (section !== activePanel) $('friend-query').value = '';
    activePanel = section;
    $('player-title').textContent = section === 'history' ? '歷史戰績' : '好友';
    $('player-history').hidden = section !== 'history';
    $('player-friends').hidden = section !== 'friends';
    for (const id of ['arena-history', 'soup-history', 'friend-list', 'friend-sent', 'friend-incoming']) {
      $(id).replaceChildren();
    }
    panel.showModal();
    return refresh(section);
  };
})();
