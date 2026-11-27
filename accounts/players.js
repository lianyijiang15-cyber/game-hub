'use strict';

const { randomInt, randomUUID } = require('node:crypto');
const { startSoupGame, playSoup, soupView, soupDifficulties, soupCase } = require('../public/soup-bank');

const { achievementCatalog, secretTitles } = require('./achievements');
const { checkSoup } = require('../ai/soup-host');

const idPattern = /^[A-Z]{2}\d{6}$/;
const normalizeName = name => name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
const nameKey = name => normalizeName(name).toLowerCase();

function playerId(accounts) {
  let id;
  do {
    const letters = String.fromCharCode(65 + randomInt(26), 65 + randomInt(26));
    id = letters + String(randomInt(1_000_000)).padStart(6, '0');
  } while (Object.values(accounts).some(account => account.profile?.id === id));
  return id;
}

function validAvatar(photo) {
  if (typeof photo !== 'string' || photo.length > 24000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) return false;
  const jpeg = Buffer.from(photo.slice('data:image/jpeg;base64,'.length), 'base64');
  if (jpeg.length < 12 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) return false;
  for (let offset = 2; offset + 4 <= jpeg.length && jpeg[offset] === 0xff;) {
    const marker = jpeg[offset + 1];
    const size = jpeg.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > jpeg.length || marker === 0xda) return false;
    if (marker === 0xc0 || marker === 0xc2) {
      if (size < 8) return false;
      const height = jpeg.readUInt16BE(offset + 5);
      const width = jpeg.readUInt16BE(offset + 7);
      return width > 0 && width <= 128 && height > 0 && height <= 128;
    }
    offset += size + 2;
  }
  return false;
}

function mountPlayerRoutes(router, store, session, setSessionProfile, setSessionAvatar) {
  function route(method, path, action, needsProfile = true) {
    router[method](path, (req, res, next) => {
      const user = session(req);
      if (!user) return res.status(401).json({ error: '請先登入。' });
      if (needsProfile && !user.profile) return res.status(403).json({ error: '請先設定玩家名稱。' });
      Promise.resolve().then(() => action(req, res, user)).catch(next);
    });
  }

  route('post', '/profile', async (req, res, user) => {
    const name = typeof req.body?.name === 'string' && req.body.name.length <= 100
      ? normalizeName(req.body.name) : '';
    if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(name)) {
      return res.status(400).json({ error: '玩家名稱須為 2–20 個字元，可用文字、數字、空格、底線及連字號。' });
    }
    const result = await store.update(accounts => {
      const account = accounts[user.key];
      if (account.profile) return { value: { profile: account.profile } };
      if (Object.values(accounts).some(entry => entry.profile && nameKey(entry.profile.name) === nameKey(name))) {
        return { value: { error: '這個玩家名稱已被使用。' } };
      }
      account.profile = { id: playerId(accounts), name };
      return { changed: true, value: { profile: account.profile } };
    });
    if (result.error) return res.status(409).json(result);
    setSessionProfile(user.key, result.profile);
    return res.json(result);
  }, false);

  route('get', '/avatar', async (_req, res, user) => {
    const account = (await store.read())[user.key];
    res.set('Cache-Control', 'private, no-store').json({ photo: account.avatar ?? null });
  });

  route('post', '/avatar', async (req, res, user) => {
    const photo = req.body?.photo;
    if (photo !== null && !validAvatar(photo)) return res.status(400).json({ error: '這張圖片格式不正確或檔案過大。' });
    await store.update(accounts => {
      const account = accounts[user.key];
      if (photo === null) delete account.avatar;
      else account.avatar = photo;
      return { changed: true };
    });
    setSessionAvatar(user.key, photo);
    res.json({ photo });
  });

  route('get', '/achievements', async (_req, res, user) => {
    const account = (await store.read())[user.key];
    res.json(achievementCatalog(account));
  });

  route('get', '/history', async (_req, res, user) => {
    const account = (await store.read())[user.key];
    res.json({ arena: (account.arenaHistory ?? []).map(({ detail, ...record }) => record), soup: account.soupHistory ?? [] });
  });

  route('get', '/history/:id', async (req, res, user) => {
    const account = (await store.read())[user.key];
    const arena = account.arenaHistory?.find(record => record.id === req.params.id);
    if (arena) return res.json({ kind: 'arena', ...arena });
    const soup = account.soupHistory?.find(record => record.id === req.params.id);
    if (soup) return res.json({ kind: 'soup', ...soup });
    res.status(404).json({ error: '找不到這場紀錄。' });
  });

  route('post', '/soup/start', (req, res, user) => {
    const difficulty = req.body?.difficulty;
    if (difficulty !== undefined && !soupDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: '請選擇簡單、中等或困難。' });
    }
    user.soup = startSoupGame(Math.random, difficulty, user.soup?.comic?.[0]);
    user.soup.id = randomUUID();
    res.json({ id: user.soup.id, ...soupView(user.soup) });
  });

  router.post('/soup/judge-guest', async (req, res, next) => {
    const { storyId, question } = req.body ?? {};
    if (typeof storyId !== 'string' || !soupCase(storyId) ||
        typeof question !== 'string' || !question.trim() || question.length > 300) {
      return res.status(400).json({ error: '找不到題目或問題格式不正確。' });
    }
    try {
      res.json({ verdict: await checkSoup(storyId, question) });
    } catch (error) { next(error); }
  });

  route('post', '/soup/action', async (req, res, user) => {
    const game = user.soup;
    const { id, action, question } = req.body ?? {};
    if (!game || game.id !== id || !['ask', 'hint', 'reveal'].includes(action) ||
        (action === 'ask' && (typeof question !== 'string' || !question.trim() || question.length > 300))) {
      return res.status(400).json({ error: '題目已失效或輸入有誤，請重新開始。' });
    }
    const verdict = action === 'ask' ? await checkSoup(game.comic[0], question) : undefined;
    if (user.soup !== game) return res.status(409).json({ error: '題目已更新，請重新提問。' });
    playSoup(game, action, question, verdict);
    const view = soupView(game);
    if (game.result && !game.recorded) {
      const entry = { id, storyId: view.storyId, title: view.title, result: game.result, hints: view.hints, progress: view.progress,
        clues: view.clues, difficulty: game.story.difficulty, date: new Date().toISOString() };
      await store.update(accounts => {
        const account = accounts[user.key];
        if (account.soupHistory?.some(record => record.id === id)) return {};
        (account.soupHistory ??= []).unshift(entry);
        return { changed: true };
      });
      game.recorded = true;
    }
    res.json(view);
  });

  route('get', '/friends', async (_req, res, user) => {
    const accounts = await store.read();
    const me = accounts[user.key];
    const profiles = keys => (keys ?? []).map(key => accounts[key]?.profile).filter(Boolean);
    res.json({ friends: profiles(me.friends), incoming: profiles(me.incoming), sent: profiles(me.sent) });
  });

  route('post', '/friends/request', async (req, res, user) => {
    const { by, query } = req.body ?? {};
    if (!['id', 'name'].includes(by) || typeof query !== 'string' || !query.trim() || query.length > 50) {
      return res.status(400).json({ error: '請輸入完整的玩家名稱或 ID。' });
    }
    const value = by === 'id' ? query.trim().toUpperCase() : nameKey(query);
    if (by === 'id' && !idPattern.test(value)) {
      return res.status(400).json({ error: '玩家 ID 由 2 個英文字母和 6 個數字組成。' });
    }
    const result = await store.update(accounts => {
      const target = Object.entries(accounts).find(([, account]) =>
        account.profile && (by === 'id' ? account.profile.id : nameKey(account.profile.name)) === value);
      if (!target) return { value: { status: 404, error: '找不到這位玩家。' } };
      const [key, account] = target;
      const me = accounts[user.key];
      if (key === user.key) return { value: { status: 400, error: '無法加入自己。' } };
      if (me.friends?.includes(key)) return { value: { status: 409, error: '你們已經是好友。' } };
      if (me.incoming?.includes(key)) return { value: { status: 409, error: '對方已送出邀請，可在收到的邀請中接受。' } };
      if (me.sent?.includes(key)) return { value: { status: 409, error: '已送出邀請，請等待對方回覆。' } };
      if ((me.sent?.length ?? 0) >= 50 || (account.incoming?.length ?? 0) >= 200) {
        return { value: { status: 429, error: '待回覆的邀請已達上限。' } };
      }
      (me.sent ??= []).push(key);
      (account.incoming ??= []).push(user.key);
      return { changed: true, value: { status: 201, player: account.profile } };
    });
    const { status, ...body } = result;
    res.status(status).json(body);
  });

  route('post', '/friends/respond', async (req, res, user) => {
    const { id, accept } = req.body ?? {};
    if (typeof id !== 'string' || !idPattern.test(id) || typeof accept !== 'boolean') {
      return res.status(400).json({ error: '無效的邀請回覆。' });
    }
    const responded = await store.update(accounts => {
      const me = accounts[user.key];
      const key = (me.incoming ?? []).find(from => accounts[from]?.profile?.id === id);
      if (!key) return { value: false };
      const sender = accounts[key];
      me.incoming = me.incoming.filter(from => from !== key);
      sender.sent = (sender.sent ?? []).filter(to => to !== user.key);
      if (accept) {
        (me.friends ??= []).push(key);
        (sender.friends ??= []).push(user.key);
      }
      return { changed: true, value: true };
    });
    if (!responded) return res.status(404).json({ error: '找不到這筆邀請。' });
    return res.json({ ok: true });
  });

  function saveArena(matchId, participants, result) {
    if (!participants.size) return Promise.resolve();
    const date = new Date().toISOString();
    const detail = {
      players: result.results, duration: result.duration, awards: result.teamAwards, mvp: result.mvp, winner: result.winner,
      objective: result.scenario ? { reason: result.scenario.reason, points: result.scenario.points,
        flag: result.scenario.flag } : null
    };
    return store.update(accounts => {
      for (const [key, player] of participants) {
        const account = accounts[key];
        if (!account || account.arenaHistory?.some(record => record.id === matchId)) continue;
        const { team, job, hero, kills, deaths, assists, damage, chestsOpened, clutchKills,
          finished, finisher, survived, loneSurvivor } = player;
        (account.arenaHistory ??= []).unshift({
          id: matchId, date, team, job, hero, kills, deaths, assists, damage, chestsOpened, clutchKills,
          finished, finisher, survived, loneSurvivor, score: result.score, mode: result.mode, detail,
          result: result.winner === null ? 'draw' : team === result.winner ? 'win' : 'loss'
        });
      }
      return { changed: true };
    });
  }

  function recordSecret(key, id) {
    if (!Object.hasOwn(secretTitles, id)) return Promise.resolve();
    return store.update(accounts => {
      const account = accounts[key];
      if (!account || account.secrets?.[id]) return {};
      (account.secrets ??= {})[id] = new Date().toISOString();
      return { changed: true, value: secretTitles[id] };
    });
  }

  async function friendAccount(key, id) {
    if (typeof id !== 'string' || !idPattern.test(id)) return null;
    const accounts = await store.read();
    return accounts[key]?.friends?.find(friend => accounts[friend]?.profile?.id === id &&
      accounts[friend].friends?.includes(key)) ?? null;
  }

  return { saveArena, recordSecret, friendAccount };
}

module.exports = { mountPlayerRoutes };
