const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { isIP, BlockList } = require('node:net');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'apps/notas/node_modules/typescript'));

// Execute the actual server functions without starting HTTP listeners or databases.
function loadFunctions(module, names, globals) {
  const source = fs.readFileSync(path.join(root, `apps/${module}/src/server.ts`), 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length, 'All tested functions must exist');
  const resolver = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'resolveSessionUser');
  if (resolver && names.includes('requireUser')) functions.push(resolver);
  const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({ crypto, Date, console, isIP, BlockList, URL, BASE_PATH: `/${module}`, ...globals });
  vm.runInContext(compiled, context);
  return context;
}

function loadLoginRoute(module, globals, routePath = '/login.php', method = 'post') {
  const source = fs.readFileSync(path.join(root, `apps/${module}/src/server.ts`), 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const route = ast.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === `app.${method}`
    && node.expression.arguments[0]?.getText(ast) === '`${BASE_PATH}' + routePath + '`');
  assert.ok(route, `${module}: direct login route must exist`);
  let handler;
  vm.runInNewContext(ts.transpileModule(route.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    BASE_PATH: `/${module}`, SERVICE_NAME: module,
    app: { [method](_path, callback) { handler = callback; } },
    asyncRoute: callback => callback, csrfMatches: () => true, cleanText: value => String(value),
    renderLogin: () => '', ...globals,
  });
  return handler;
}

async function testModule(module) {
  let storedUser = { id: 1, username: 'first', role: 'admin' };
  let coreUser = storedUser;
  let homeUser = null;
  let allowed = true;
  const authName = ['gestao', 'pedidos', 'tarefa'].includes(module) ? 'ensureSessionUser' : 'requireUser';
  const authFunctions = [authName];
  if (module === 'gestao') authFunctions.push('currentUser');
  if (module === 'pedidos') authFunctions.push('internalActorForPedidos');
  const auth = loadFunctions(module, authFunctions, {
    currentUser: async () => coreUser,
    currentSessionUser: async () => coreUser,
    canManageUsers: user => ['admin', 'gerente'].includes(user?.role) || user?.username === 'adm',
    corePgPool: { async query(_sql, params) {
      assert.equal(params[0], storedUser.id, `${module}: direct identity must be reread by core id`);
      return { rows: coreUser ? [{ ...coreUser, id: String(coreUser.id) }] : [] };
    } },
    coreUserToSessionUser: row => ({ ...row, id: Number(row.id) }),
    internalActorForPedidos: async () => allowed ? coreUser : null,
    userByHomeSso: async () => homeUser,
    hasHomeSsoCookie: req => Boolean(req.cookie),
    canAccessModule: async () => allowed,
    isAllowedUser: () => allowed,
    canAccessFinanceiro: async () => allowed,
    wantsJson: () => false,
    regenerateWithUser: async (req, user) => { req.session = { user, authenticationSource: 'home' }; },
  });
  function request(source = 'home', cookie = false) {
    return { cookie, session: { user: storedUser, authenticationSource: source }, originalUrl: `/${module}/` };
  }
  const res = { redirect() {}, status() { return this; }, json() {} };
  assert.equal(await auth[authName](request(), res), null, `${module}: logout must invalidate an SSO-derived session`);
  assert.equal(await auth[authName](request('direct', true), res), null, `${module}: invalid SSO must never fall back to another session`);
  assert.equal((await auth[authName](request('direct'), res)).id, storedUser.id, `${module}: direct login remains valid`);
  if (['gestao', 'pedidos'].includes(module)) {
    coreUser = null;
    assert.equal(await auth[authName](request('direct'), res), null, `${module}: inactive direct operator cannot reuse an admin snapshot`);
    coreUser = { ...storedUser, role: 'user' };
    allowed = false;
    assert.equal(await auth[authName](request('direct'), res), null, `${module}: demoted direct operator must pass current permissions`);
    coreUser = storedUser;
    allowed = true;
  }
  homeUser = { id: 2, username: 'second', role: 'admin' };
  const switched = request('home', true);
  assert.equal((await auth[authName](switched, res)).id, 2, `${module}: SSO switches operator`);
  assert.equal(switched.session.user.id, 2);
  if (module === 'notas') {
    allowed = false;
    assert.equal(await auth[authName](request('home', true), res), null, 'Notas must recheck access for the SSO operator');
  }

  const rows = new Map();
  const pool = { async query(sql, params) {
    if (sql.trim().startsWith('SELECT')) {
      return { rows: [...rows.values()].filter(row => params[0].includes(row.rate_key)) };
    }
    if (sql.trim().startsWith('INSERT')) {
      const previous = rows.get(params[0]);
      const count = (previous?.count || 0) + 1;
      rows.set(params[0], { rate_key: params[0], count,
        blocked_until: count >= params[3] ? new Date(Date.now() + 600_000) : null });
      return { rows: [] };
    }
    if (sql.trim().startsWith('DELETE')) {
      params[0].forEach(key => rows.delete(key));
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const clear = module === 'notas' ? 'clearLoginFailures' : 'clearLoginRateLimit';
  const limiter = loadFunctions(module, ['loginRateIdentities', 'loginWaitSeconds', 'registerLoginFailure', clear], { corePgPool: pool });
  const req = ip => ({ session: {}, ip, socket: { remoteAddress: ip }, get: () => undefined });
  const forged = req('8.8.8.8');
  forged.ip = '1.1.1.1';
  forged.get = name => ({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '1.1.1.1' })[name];
  assert.equal(limiter.loginRateIdentities(forged, 'operator')[0].key,
    limiter.loginRateIdentities(req('8.8.8.8'), 'operator')[0].key, `${module}: public peers cannot forge the rate identity through headers`);
  const proxied = req('::ffff:172.18.0.2');
  proxied.ip = '1.1.1.1';
  proxied.get = name => ({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 8.8.8.8' })[name];
  assert.equal(limiter.loginRateIdentities(proxied, 'operator')[0].key,
    limiter.loginRateIdentities(req('9.9.9.9'), 'operator')[0].key, `${module}: mapped IPv6 trusted proxy honors X-Real-IP first`);
  proxied.get = name => ({ 'x-real-ip': 'invalid', 'x-forwarded-for': '1.1.1.1, 8.8.8.8, invalid' })[name];
  assert.equal(limiter.loginRateIdentities(proxied, 'operator')[0].key,
    limiter.loginRateIdentities(req('8.8.8.8'), 'operator')[0].key, `${module}: trusted forwarded chain uses the rightmost valid IP like Home`);
  const mappedPublic = req('::ffff:808:808');
  mappedPublic.ip = '1.1.1.1';
  mappedPublic.get = () => '1.1.1.1';
  assert.equal(limiter.loginRateIdentities(mappedPublic, 'operator')[0].key,
    limiter.loginRateIdentities(req('8.8.8.8'), 'operator')[0].key, `${module}: mapped public peers remain untrusted and normalize to the same key`);
  for (let attempt = 0; attempt < 5; attempt++) await limiter.registerLoginFailure(req('192.0.2.5'), 'operator');
  assert.ok(await limiter.loginWaitSeconds(req('192.0.2.5'), 'operator') > 0, `${module}: fresh sessions must retain the persistent block`);
  let authenticationCalls = 0;
  const login = loadLoginRoute(module, {
    loginWaitSeconds: limiter.loginWaitSeconds,
    authenticateCore: async () => { authenticationCalls++; },
    authenticate: async () => { authenticationCalls++; },
  });
  const loginRequest = req('192.0.2.5');
  loginRequest.session.csrfToken = 'csrf';
  loginRequest.body = { username: 'operator', password: 'incorrect', csrf_token: 'csrf' };
  let status;
  await login(loginRequest, { status(code) { status = code; return this; }, type() { return this; }, send() {} });
  assert.equal(status, 429, `${module}: actual POST must block a new session before authentication`);
  assert.equal(authenticationCalls, 0, `${module}: blocked login must not verify credentials`);
  for (let attempt = 0; attempt < 10; attempt++) await limiter.registerLoginFailure(req(`192.0.2.${20 + attempt}`), 'victim');
  assert.ok(await limiter.loginWaitSeconds(req('192.0.2.200'), 'victim') > 0, `${module}: username limit spans IPs`);
  for (let attempt = 0; attempt < 30; attempt++) await limiter.registerLoginFailure(req('192.0.2.6'), `different${attempt}`);
  await limiter[clear](req('192.0.2.6'), 'different29');
  assert.ok(await limiter.loginWaitSeconds(req('192.0.2.6'), 'unseen') > 0, `${module}: success must retain the aggregate IP limit`);
  const offline = loadFunctions(module, ['loginRateIdentities', 'loginWaitSeconds'], {
    corePgPool: { async query() { throw new Error('core unavailable'); } },
  });
  await assert.rejects(offline.loginWaitSeconds(req('192.0.2.5'), 'operator'), /core unavailable/,
    `${module}: unavailable persistent limits must not permit an unbounded direct login`);
  console.log(`PASS ${module}: SSO logout, invalid SSO, direct login, operator switch, persistent pair/user/IP limits`);
}

async function testXpCard(module) {
  const oldUser = { id: 7, username: 'old', role: 'user' };
  let homeUser = null;
  let guardCalls = 0;
  let profileCalls = 0;
  const auth = loadFunctions(module, ['requireUser'], {
    currentUser: async () => oldUser, currentSessionUser: async () => oldUser,
    userByHomeSso: async () => homeUser, hasHomeSsoCookie: req => Boolean(req.cookie),
    canManageUsers: user => user?.role === 'admin', canAccessModule: async () => true,
    regenerateWithUser: async (req, user) => { req.session = { user, authenticationSource: 'home' }; },
  });
  const card = loadLoginRoute(module, {
    currentUser: async () => oldUser, currentSessionUser: async () => oldUser,
    homeSsoUsername: async () => null, userByHomeSso: async () => homeUser,
    regenerateWithUser: async () => {}, canAccessModule: async () => true,
    resolveSessionUser: async req => { guardCalls++; return auth.resolveSessionUser(req); },
    linkedXpProfile: async () => { profileCalls++; return {}; },
  }, '/api/me/xp-card', 'get');
  const response = () => ({ code: 200, body: null, status(value) { this.code = value; return this; }, json(value) { this.body = value; } });
  for (const cookie of [false, true]) {
    const req = { cookie, session: { user: oldUser, authenticationSource: 'home' } };
    const res = response();
    await card(req, res);
    assert.equal(res.code, 401, `${module}: actual XP-card handler rejects stale sessions and invalid SSO`);
  }
  assert.equal(profileCalls, 0, `${module}: denied XP card must not load a profile`);
  const directRes = response();
  await card({ cookie: false, session: { user: oldUser, authenticationSource: 'direct' } }, directRes);
  assert.equal(directRes.code, 200, `${module}: ordinary users keep direct access to their XP card`);
  assert.equal(directRes.body.user.id, oldUser.id);
  homeUser = { id: 8, username: 'new', role: 'user' };
  const ssoRes = response();
  await card({ cookie: true, session: { user: oldUser, authenticationSource: 'home' } }, ssoRes);
  assert.equal(ssoRes.body.user.id, 8, `${module}: XP card follows the current SSO operator`);
  assert.equal(guardCalls, 4, `${module}: all XP-card requests use the canonical session guard`);
  console.log(`PASS ${module}: actual XP-card handler, invalid/absent SSO, direct ordinary user, operator switch`);
}

(async () => {
  const selected = process.argv.slice(2);
  if (selected[0] === 'xp-card') {
    for (const module of ['usuarios', 'xp']) await testXpCard(module);
    return;
  }
  for (const module of selected.length ? selected : ['notas', 'usuarios', 'codigos', 'gestao', 'pedidos', 'tarefa', 'xp', 'financeiro']) await testModule(module);
  if (!selected.length) for (const module of ['usuarios', 'xp']) await testXpCard(module);
})().catch(error => { console.error(error); process.exitCode = 1; });
