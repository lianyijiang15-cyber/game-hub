'use strict';

(() => {
  const dialog = $('invite-dialog');
  const message = $('invite-message');
  const inboxButton = $('invite-inbox');
  const friendList = $('invite-friends');
  let invites = [];
  let expiry;
  let busy = false;
  let view = 0;

  function request(event, ...args) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('尚未連線，請稍後再試。'));
      socket.timeout(4000).emit(event, ...args, (error, result) => {
        if (error || !result || result.error) reject(new Error(result?.error || '伺服器未回應，請稍後再試。'));
        else resolve(result);
      });
    });
  }

  function renderInbox() {
    clearTimeout(expiry);
    const time = Date.now();
    invites = invites.filter(invite => invite.expiresAt > time);
    if (invites.length) expiry = setTimeout(renderInbox, Math.min(...invites.map(invite => invite.expiresAt)) - time);
    inboxButton.hidden = !invites.length;
    inboxButton.textContent = `對戰邀請（${invites.length}）`;
    const list = $('invite-received');
    list.replaceChildren();
    if (!invites.length) list.append(element('li', '目前沒有對戰邀請。'));
    for (const invite of invites) {
      const item = element('li', '');
      item.append(element('span', `${invite.name} · ${modeNames[invite.mode]}`));
      const actions = element('div', '');
      const accept = element('button', '加入');
      const decline = element('button', '婉拒');
      decline.className = 'ghost';
      accept.onclick = () => {
        if (busy) return;
        if (room) { message.textContent = '請先離開目前房間，再接受邀請。'; return; }
        busy = true;
        accept.disabled = true;
        const current = view;
        enter('replyRoomInvite', { id: invite.id, accept: true }, error => {
          busy = false;
          accept.disabled = false;
          if (!dialog.open || current !== view) return;
          if (error) message.textContent = error;
          else dialog.close();
        });
      };
      decline.onclick = async () => {
        if (busy) return;
        decline.disabled = true;
        try { await request('replyRoomInvite', { id: invite.id, accept: false }); }
        catch (error) { message.textContent = error.message; }
        finally { decline.disabled = false; }
      };
      actions.append(accept, decline);
      item.append(actions);
      list.append(item);
    }
  }

  function updateInbox(items) {
    invites = items;
    renderInbox();
  }

  async function refreshInbox() {
    try { updateInbox((await request('listRoomInvites')).invites); }
    catch { /* The live notification or next open will retry. */ }
  }

  async function openInvites(outgoing) {
    if (dialog.open || busy) return;
    const current = ++view;
    const lobby = room;
    message.textContent = '';
    $('invite-title').textContent = outgoing ? '邀請好友' : '對戰邀請';
    $('invite-outgoing').hidden = !outgoing;
    friendList.replaceChildren();
    renderInbox();
    dialog.showModal();
    void refreshInbox();
    if (!outgoing) return;
    try {
      const { friends } = await accountRequest('friends');
      if (!dialog.open || current !== view || room !== lobby) return;
      if (!friends.length) friendList.append(element('li', '好友名單目前是空的。'));
      for (const friend of friends) {
        const row = element('li', '');
        const send = element('button', '邀請');
        send.onclick = async () => {
          if (room !== lobby || phase !== 'lobby') { message.textContent = '等待大廳已關閉。'; return; }
          send.disabled = true;
          try {
            await request('inviteFriend', friend.id);
            send.textContent = '已送出';
            if (dialog.open && current === view) message.textContent = `已邀請 ${friend.name}，邀請有效 3 分鐘。`;
          } catch (error) {
            send.disabled = false;
            if (dialog.open && current === view) message.textContent = error.message;
          }
        };
        row.append(element('span', friend.name), send);
        friendList.append(row);
      }
    } catch (error) {
      if (dialog.open && current === view) message.textContent = error.message;
    }
  }

  inboxButton.onclick = () => openInvites(false);
  $('lobby-invite').onclick = () => openInvites(true);
  $('invite-close').onclick = () => { if (!busy) dialog.close(); };
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  socket.on('roomInvites', updateInbox);
  socket.on('connect', refreshInbox);
  socket.on('disconnect', () => updateInbox([]));
  if (socket.connected) void refreshInbox();
})();
