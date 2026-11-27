'use strict';

const { randomInt, randomUUID } = require('node:crypto');
const { startSoupGame, playSoup, soupView } = require('../public/soup-bank');

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

function mountPlayerRoutes(router, store, session, setSessionProfile) {
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

  route('post', '/soup/start', (_req, res, user) => {
    user.soup = startSoupGame();
    user.soup.id = randomUUID();
    res.json({ id: user.soup.id, ...soupView(user.soup) });
  });

  route('post', '/soup/action', async (req, res, user) => {
    const game = user.soup;
    const { id, action, question } = req.body ?? {};
    if (!game || game.id !== id || !['ask', 'hint', 'reveal'].includes(action) ||
        (action === 'ask' && (typeof question !== 'string' || !question.trim() || question.length > 300))) {
      return res.status(400).json({ error: '題目已失效或輸入有誤，請重新開始。' });
    }
    playSoup(game, action, question);
    const view = soupView(game);
    if (game.result && !game.recorded) {
      const entry = { id, title: view.title, result: game.result, hints: view.hints, progress: view.progress,
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
        const { team, job, hero, kills, deaths, assists, damage } = player;
        (account.arenaHistory ??= []).unshift({
          id: matchId, date, team, job, hero, kills, deaths, assists, damage, score: result.score, mode: result.mode, detail,
          result: result.winner === null ? 'draw' : team === result.winner ? 'win' : 'loss'
        });
      }
      return { changed: true };
    });
  }

  return { saveArena };
}

module.exports = { mountPlayerRoutes };
