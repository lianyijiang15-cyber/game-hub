'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const express = require('express');
const { createAccountRouter } = require('../accounts/router');

async function start(t, file) {
  const app = express();
  app.use('/api/account', createAccountRouter(file).router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  return (route, data, headers = {}) => new Promise((resolve, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const request = http.request(base + '/api/account/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, async response => {
      const chunks = [];
      try {
        for await (const chunk of response) chunks.push(chunk);
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers }));
      } catch (error) { reject(error); }
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('account validation, persistence, login, cookie and revocation', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pixel-clash-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'accounts.json');
  const request = await start(t, file);
  const credentials = { username: 'Clash17', password: 'A castle with 7 rooms!' };

  assert.equal((await request('login', credentials)).status, 401);
  for (const username of ['abc', '123', 'abc 123', '像素9', 'A1', 'Player7\n']) {
    assert.equal((await request('register', { ...credentials, username })).status, 400);
  }
  assert.equal((await request('register', { ...credentials, password: 'short7' })).status, 400);
  assert.equal((await request('register', credentials, { Origin: 'https://example.test' })).status, 403);

  const registered = await Promise.all([
    request('register', credentials),
    request('register', { ...credentials, username: 'clash17' })
  ]);
  assert.deepEqual(registered.map(response => response.status).sort(), [201, 409]);
  assert.ok(registered.every(response => response.headers.get('set-cookie') === null));
  assert.deepEqual(await (await request('session')).json(), { username: null, profile: null });
  const stored = await readFile(file, 'utf8');
  assert.ok(!stored.includes(credentials.password));
  const account = JSON.parse(stored).clash17;
  assert.match(account.salt, /^[a-f0-9]{32}$/);
  assert.match(account.hash, /^[a-f0-9]{128}$/);

  assert.equal((await request('login', { ...credentials, password: 'correct format, wrong password' })).status, 401);
  const signedIn = await request('login', { ...credentials, username: 'CLASH17' });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await signedIn.json(), { username: account.username, profile: null });
  const cookie = signedIn.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.deepEqual(await (await request('session', undefined, headers)).json(), { username: account.username, profile: null });

  const restarted = await start(t, file);
  assert.deepEqual(await (await restarted('session', undefined, headers)).json(), { username: null, profile: null });
  const publicLogin = await restarted('login', credentials, {
    Host: 'clash.example.test', Origin: 'https://clash.example.test', 'Sec-Fetch-Site': 'same-origin'
  });
  assert.equal(publicLogin.status, 200);
  assert.match(publicLogin.headers.get('set-cookie'), /; Secure(?:;|$)/);



  assert.equal((await restarted('profile', { name: '月光戰士' })).status, 401);
  assert.equal((await request('history', undefined, headers)).status, 403);
  const firstResponse = await request('profile', { name: '  Moon  Hero  ' }, headers);
  assert.equal(firstResponse.status, 200);
  const { profile: first } = await firstResponse.json();
  assert.equal(first.name, 'Moon Hero');
  assert.match(first.id, /^[A-Z]{2}\d{6}$/);

  const secondCredentials = { ...credentials, username: 'Clash18' };
  assert.equal((await request('register', secondCredentials)).status, 201);
  const secondLogin = await request('login', secondCredentials);
  const secondHeaders = { Cookie: secondLogin.headers.get('set-cookie').split(';')[0] };
  assert.equal((await request('profile', { name: 'Ｍｏｏｎ Hero' }, secondHeaders)).status, 409);
  const { profile: second } = await (await request('profile', { name: '月光弓手' }, secondHeaders)).json();
  assert.match(second.id, /^[A-Z]{2}\d{6}$/);
  assert.notEqual(second.id, first.id);

  const sent = await request('friends/request', { by: 'name', query: second.name }, headers);
  assert.equal(sent.status, 201);
  assert.deepEqual((await sent.json()).player, second);
  assert.equal((await request('friends/respond', { id: second.id, accept: true }, headers)).status, 404);
  assert.deepEqual((await (await request('friends', undefined, secondHeaders)).json()).incoming, [first]);
  assert.equal((await request('friends/respond', { id: first.id, accept: false }, secondHeaders)).status, 200);
  assert.equal((await request('friends/request', { by: 'id', query: first.id.toLowerCase() }, secondHeaders)).status, 201);
  assert.equal((await request('friends/respond', { id: second.id, accept: true }, headers)).status, 200);
  assert.deepEqual((await (await request('friends', undefined, headers)).json()).friends, [second]);
  assert.deepEqual((await (await request('friends', undefined, secondHeaders)).json()).friends, [first]);

  assert.equal((await request('soup/start', { difficulty: '超級' }, headers)).status, 400);
  for (const difficulty of ['簡單', '中等', '困難']) {
    const caseView = await (await request('soup/start', { difficulty }, headers)).json();
    assert.equal(caseView.difficulty, difficulty);
    assert.equal(caseView.panels.length, 2);
    assert.equal(caseView.end, '');
    assert.equal(Object.hasOwn(caseView, 'answer'), false);
  }
  const puzzle = await (await request('soup/start', { difficulty: '困難' }, headers)).json();
  assert.equal(puzzle.difficulty, '困難');
  assert.equal((await request('soup/action', { id: puzzle.id, action: 'reveal' }, secondHeaders)).status, 400);
  assert.equal((await request('soup/action', { id: puzzle.id, action: 'hint' }, headers)).status, 200);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request('soup/action', { id: puzzle.id, action: 'reveal' }, headers)).status, 200);
  }
  const history = await (await request('history', undefined, headers)).json();
  assert.equal(history.soup.length, 1);
  assert.equal(history.soup[0].title, puzzle.title);
  assert.equal(history.soup[0].hints, 1);
  assert.equal(history.soup[0].result, 'revealed');
  assert.deepEqual(await (await request('history', undefined, secondHeaders)).json(), { arena: [], soup: [] });

  assert.equal((await request('logout', {}, { ...headers, Origin: 'https://example.test' })).status, 403);
  assert.equal((await request('logout', {}, headers)).status, 200);
  assert.deepEqual(await (await request('session', undefined, headers)).json(), { username: null, profile: null });

  const limited = { ...credentials, username: 'Unknown7' };
  for (let i = 0; i < 8; i++) assert.equal((await request('login', limited)).status, 401);
  const blocked = await request('login', limited);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});
