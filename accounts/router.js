'use strict';

const { Router, json } = require('express');
const { randomBytes, randomUUID, scrypt, timingSafeEqual } = require('node:crypto');
const { mkdir, readFile, writeFile, rename, rm } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { mountPlayerRoutes } = require('./players');

const deriveKey = promisify(scrypt);
const cookieName = 'pixel_clash_session';
const lifetime = 24 * 60 * 60 * 1000;
const minute = 60_000;
const usernamePattern = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{3,24}$/;
const cookiePattern = /(?:^|;\s*)pixel_clash_session=([0-9a-f]{64})(?=;|$)/;
const dummySalt = randomBytes(16);
const dummyHash = randomBytes(64);

async function hashPassword(password, salt) {
  return deriveKey(password, salt, 64, { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

function accountStore(file) {
  let pending = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }
  function update(callback) {
    // Publish a complete snapshot after each serialized change.
    const result = pending.then(async () => {
      const accounts = await read();
      const { value, changed } = callback(accounts);
      if (!changed) return value;
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(accounts), { flag: 'wx', mode: 0o600 });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      return value;
    });
    pending = result.catch(() => {});
    return result;
  }
  return { read: () => pending.then(read), update };
}

function requestOrigin(req) {
  try {
    const host = new URL('http://' + req.get('host'));
    const origin = req.get('origin') ? new URL(req.get('origin')) : null;
    if (origin && !['http:', 'https:'].includes(origin.protocol)) return null;
    if (origin && origin.origin !== new URL(origin.protocol + '//' + req.get('host')).origin) return null;
    const secure = req.secure || origin?.protocol === 'https:';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname);
    if (secure || (local && (!origin || origin.protocol === 'http:'))) {
      return { httpOnly: true, sameSite: 'strict', secure: Boolean(secure), path: '/' };
    }
  } catch {
    return null;
  }
  return null;
}

function createAccountRouter(file, onAvatarChange = () => {}) {
  const router = Router();
  const store = accountStore(file);
  const sessions = new Map();
  let windowEnds = 0;
  let requests = 0;
  let registrations = 0;
  let activeHashes = 0;
  const attempts = new Map();

  function sessionToken(req) {
    return cookiePattern.exec(req.headers.cookie ?? '')?.[1];
  }

  function session(req) {
    const token = sessionToken(req);
    const result = sessions.get(token);
    if (result?.ends > Date.now()) return result;
    sessions.delete(token);
    return null;
  }

  function credentials(route) {
    return async (req, res) => {
      const register = route === 'register';
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || !usernamePattern.test(username)) {
        return res.status(400).json({ error: '帳號須為 3 至 24 個英數字元，且至少各含一個英文字母與數字。' });
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > (register ? 48 : 128)) {
        return res.status(400).json({ error: '密碼須為 8 至 48 個字元。' });
      }

      const key = username.toLowerCase();
      const time = Date.now();
      if (time >= windowEnds) {
        windowEnds = time + minute;
        requests = registrations = 0;
        attempts.clear();
      }
      const count = attempts.get(key) ?? 0;
      if (requests >= 90 || count >= 8 || (register && registrations >= 20) || activeHashes >= 2) {
        const wait = activeHashes >= 2 ? 1 : Math.max(1, Math.ceil((windowEnds - time) / 1000));
        return res.set('Retry-After', String(wait)).status(429).json({ error: '操作太頻繁，請稍後再試。' });
      }
      requests++;
      if (register) registrations++;
      attempts.set(key, count + 1);
      activeHashes++;

      try {
        const account = (await store.read())[key];
        if (register) {
          if (account) return res.status(409).json({ error: '這個帳號已被使用。' });
          const salt = randomBytes(16);
          const hash = await hashPassword(password, salt);
          const created = await store.update(accounts => {
            if (accounts[key]) return { value: false };
            accounts[key] = { username, salt: salt.toString('hex'), hash: hash.toString('hex') };
            return { changed: true, value: true };
          });
          if (!created) return res.status(409).json({ error: '這個帳號已被使用。' });
          return res.status(201).json({ ok: true });
        }

        const salt = account ? Buffer.from(account.salt, 'hex') : dummySalt;
        const expected = account ? Buffer.from(account.hash, 'hex') : dummyHash;
        const actual = await hashPassword(password, salt);
        if (!timingSafeEqual(actual, expected) || !account) {
          return res.status(401).json({ error: '帳號或密碼不正確。請先註冊帳號。' });
        }

        sessions.delete(sessionToken(req));
        const now = Date.now();
        for (const [token, data] of sessions) {
          if (data.ends > now) break;
          sessions.delete(token);
        }
        if (sessions.size >= 10_000) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('hex');
        const profile = account.profile ?? null;
        const loggedIn = { key, username: account.username, profile, ends: now + lifetime };
        sessions.set(token, loggedIn);
        // A profile may have been saved while this login was computing its hash.
        const latest = (await store.read())[key];
        loggedIn.profile = latest?.profile ?? loggedIn.profile;
        loggedIn.avatar = latest?.avatar ?? null;
        return res.cookie(cookieName, token, { ...res.locals.cookieOptions, maxAge: lifetime })
          .json({ username: account.username, profile: loggedIn.profile });
      } catch (error) {
        console.error('Account storage or authentication error:', error.code ?? error.name);
        return res.status(500).json({ error: '帳號服務暫時無法使用。' });
      } finally {
        activeHashes--;
      }
    };
  }

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const cookieOptions = requestOrigin(req);
      if (!cookieOptions || ['cross-site', 'same-site'].includes(req.get('sec-fetch-site'))) {
        return res.status(403).json({ error: '請從遊戲網站直接操作，公開連線須使用 HTTPS。' });
      }
      if (!req.is('application/json')) return res.status(415).json({ error: '請以 JSON 提交資料。' });
      res.locals.cookieOptions = cookieOptions;
    }
    next();
  });
  router.use('/avatar', json({ limit: '26kb' }));
  router.use(json({ limit: '4kb' }));
  router.get('/session', (req, res) => {
    const loggedIn = session(req);
    res.json({ username: loggedIn?.username ?? null, profile: loggedIn?.profile ?? null });
  });
  router.post('/register', credentials('register'));
  router.post('/login', credentials('login'));
  router.post('/logout', (req, res) => {
    sessions.delete(sessionToken(req));
    res.clearCookie(cookieName, res.locals.cookieOptions).json({ ok: true });
  });
  const playerService = mountPlayerRoutes(router, store, session, (key, profile) => {
    for (const loggedIn of sessions.values()) {
      if (loggedIn.key === key) loggedIn.profile = profile;
    }
  }, (key, photo) => {
    for (const loggedIn of sessions.values()) {
      if (loggedIn.key === key) loggedIn.avatar = photo;
    }
    onAvatarChange(key, photo);
  });
  router.use((error, _req, res, _next) => {
    if (error.status === 400 || error.status === 413 || error.status === 415) {
      return res.status(error.status).json({ error: '帳號請求格式不正確。' });
    }
    console.error('Account request error:', error.code ?? error.name);
    return res.status(500).json({ error: '帳號服務暫時無法使用。' });
  });

  return { router, session, ...playerService };
}

module.exports = { createAccountRouter };
