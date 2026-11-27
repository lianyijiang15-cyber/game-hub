'use strict';

const playerAccount = { username: null, profile: null };

async function accountRequest(route, body) {
  const options = { signal: AbortSignal.timeout(8000) };
  if (body) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  let response;
  let result;
  try {
    response = await fetch('/api/account/' + route, options);
    result = await response.json();
  } catch {
    throw new Error('無法連線到帳號服務，請稍後再試。');
  }
  if (!response.ok) throw new Error(result.error || '帳號操作失敗，請稍後再試。');
  return result;
}

{
  const dialog = $('account-dialog');
  const form = $('account-form');
  const username = $('account-username');
  const password = $('account-password');
  const confirmation = $('account-confirm');
  const submit = $('account-submit');
  const message = $('account-message');

  let mode = 'login';
  let busy = false;
  let avatar = null;
  const actionButtons = ['account-close', 'account-login', 'account-register', 'account-submit', 'account-logout', 'account-save-name', 'account-avatar-file', 'account-avatar-reset'];

  function renderAccount() {
    const { username: currentUser, profile } = playerAccount;
    $('profile-name').textContent = profile?.name || (currentUser ? '設定玩家名稱' : '登入／註冊');
    $('profile-status').textContent = currentUser ? '管理登入狀態' : '玩家帳號';
    $('account-current').textContent = profile?.name ?? '';
    $('account-player-id').textContent = profile?.id ?? '';
    $('account-profile-info').hidden = !profile;
    $('account-avatar-actions').hidden = !profile;
    for (const id of ['account-avatar-preview', 'menu-avatar-photo']) {
      const picture = $(id);
      picture.hidden = !avatar;
      if (avatar) picture.src = avatar;
      else picture.removeAttribute('src');
    }
    $('menu-avatar').hidden = Boolean(avatar);
    $('account-avatar-reset').hidden = !avatar;
    $('account-name-form').hidden = !currentUser || Boolean(profile);
    $('account-signed-in').hidden = !currentUser;
    $('account-modes').hidden = Boolean(currentUser);
    form.hidden = Boolean(currentUser);
    const register = mode === 'register';
    $('account-title').textContent = currentUser ? '玩家帳號' : register ? '註冊帳號' : '玩家登入';
    $('account-login').setAttribute('aria-pressed', String(!register));
    $('account-register').setAttribute('aria-pressed', String(register));
    $('account-confirm-label').hidden = confirmation.hidden = confirmation.disabled = !register;
    confirmation.required = register;
    password.autocomplete = register ? 'new-password' : 'current-password';
    password.maxLength = register ? 48 : 128;
    submit.textContent = register ? '建立帳號' : '登入';
  }

  function clearPasswords() {
    password.value = confirmation.value = '';
  }

  function changeMode(nextMode) {
    mode = nextMode;
    clearPasswords();
    message.textContent = '';
    renderAccount();
  }

  async function runAccountAction(action) {
    if (busy) return;
    busy = true;
    for (const id of actionButtons) {
      $(id).disabled = true;
    }
    message.textContent = '處理中…';
    try {
      await action();
    } catch (error) {
      clearPasswords();
      message.textContent = error.message;
    } finally {
      busy = false;
      for (const id of actionButtons) {
        $(id).disabled = false;
      }
    }
  }

  async function loadAvatar() {
    if (!playerAccount.profile) return;
    const id = playerAccount.profile.id;
    try {
      const { photo } = await accountRequest('avatar');
      if (playerAccount.profile?.id === id) {
        avatar = photo;
        renderAccount();
      }
    } catch {
      // The default portrait still works if the saved photo is temporarily unavailable.
    }
  }

  const initialSession = accountRequest('session').then(result => {
    Object.assign(playerAccount, result);
    renderAccount();
    return loadAvatar();
  }).catch(() => {});

  function openAccount() {
    if (dialog.open) return;
    changeMode('login');
    dialog.showModal();
    if (playerAccount.username && !playerAccount.profile) $('account-player-name').focus();
  }

  $('menu-profile').onclick = openAccount;
  for (const [id, open] of [['menu-arena', openModes], ['menu-soup', openSoup]]) {
    $(id).onclick = async () => {
      await initialSession;
      if (playerAccount.username && !playerAccount.profile) return openAccount();
      open();
    };
  }
  $('account-close').onclick = () => dialog.close();
  $('account-login').onclick = () => changeMode('login');
  $('account-register').onclick = () => {
    changeMode('register');
    username.focus();
  };
  dialog.oncancel = event => {
    if (busy) event.preventDefault();
  };
  dialog.onclose = clearPasswords;

  form.onsubmit = event => {
    event.preventDefault();
    if (mode === 'register' && password.value !== confirmation.value) {
      message.textContent = '兩次輸入的密碼不一致。';
      confirmation.focus();
      return;
    }
    const selectedMode = mode;
    const credentials = { username: username.value, password: password.value };
    return runAccountAction(async () => {
      await initialSession;
      const result = await accountRequest(selectedMode, credentials);
      if (selectedMode === 'register') {
        changeMode('login');
        message.textContent = '註冊成功。請輸入密碼完成登入。';
        password.focus();
      } else {
        Object.assign(playerAccount, result);
        clearPasswords();
        renderAccount();
        message.textContent = '';
        socket.disconnect().connect();
        if (playerAccount.profile) {
          dialog.close();
          await loadAvatar();
        }
        else $('account-player-name').focus();
      }
    });
  };

  $('account-logout').onclick = () => runAccountAction(async () => {
    await accountRequest('logout', {});
    avatar = null;
    Object.assign(playerAccount, { username: null, profile: null });
    $('nickname').value = '';
    socket.disconnect().connect();
    username.value = '';
    changeMode('login');
    message.textContent = '已登出。';
    username.focus();
  });

  $('account-name-form').onsubmit = event => {
    event.preventDefault();
    const name = $('account-player-name').value;
    return runAccountAction(async () => {
      const { profile } = await accountRequest('profile', { name });
      playerAccount.profile = profile;
      $('account-player-name').value = '';
      renderAccount();
      message.textContent = '玩家名稱已設定。';
      $('account-logout').focus();
    });
  };

  async function cropAvatar(file) {
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      throw new Error('請選擇 8 MB 以下的圖片。');
    }
    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      if (!size) throw new Error('無法讀取這張圖片。');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#182031';
      ctx.fillRect(0, 0, 128, 128);
      ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
        size, size, 0, 0, 128, 128);
      return canvas.toDataURL('image/jpeg', .75);
    } catch {
      throw new Error('無法讀取這張圖片，請試用 JPEG 或 PNG。');
    } finally {
      URL.revokeObjectURL(source);
    }
  }

  async function saveAvatar(photo) {
    avatar = (await accountRequest('avatar', { photo })).photo;
    renderAccount();
    message.textContent = photo ? '頭像已儲存。' : '已恢復預設頭像。';
  }

  $('account-avatar-file').onchange = event => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) return runAccountAction(async () => saveAvatar(await cropAvatar(file)));
  };
  $('account-avatar-reset').onclick = () => runAccountAction(() => saveAvatar(null));

  $('menu-history').onclick = () => openPlayerPanel('achievements');
  $('menu-friends').onclick = () => openPlayerPanel('friends');
  async function openPlayerPanel(panel) {
    await initialSession;
    if (!playerAccount.profile) {
      openAccount();
      message.textContent = playerAccount.username ? '請先設定玩家名稱。' : '請先登入玩家帳號。';
      return;
    }
    return showPlayerPanel(panel);
  }

}
