const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { BlockList, isIP } = require('node:net');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'apps/cashback/node_modules/typescript'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function request(ip = '203.0.113.9', username = 'operator', headers = {}) {
  const req = { socket: { remoteAddress: ip }, ip: 'untrusted-express-ip',
    body: { username, password: 'password', csrf_token: 'csrf' },
    get: name => headers[name.toLowerCase()],
    session: { csrfToken: 'csrf', regenerate(callback) { delete this.user; callback(); } },
  };
  return req;
}

function harness(module) {
  const extension = module === 'cashback' ? 'ts' : 'js';
  const source = fs.readFileSync(path.join(root, `apps/${module}/src/server.${extension}`), 'utf8');
  const ast = ts.createSourceFile(`server.${extension}`, source, ts.ScriptTarget.Latest, true);
  const names = new Set(['loginRateIdentities', 'loginRateKey', 'loginRateLimitKey', 'pruneLoginRateLimits',
    'loginWaitSeconds', 'loginRateLimitWaitSeconds', 'registerLoginFailure', 'clearLoginFailures', 'clearLoginRateLimit']);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
  const route = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && ['router.post', 'app.post'].includes(node.expression.expression.getText(ast))
    && node.expression.arguments[0]?.getText(ast).includes('/login.php'));
  assert.ok(route, `${module}: rota de login deve existir`);
  let handler;
  let authenticateCalls = 0;
  let sqlFails = false;
  let authenticatedUser = null;
  let pausedPrefix;
  let pausedSql;
  const rows = new Map();
  const corePgPool = { async query(sql, params) {
    if (sqlFails) throw new Error('simulated SQL unavailable');
    if (pausedPrefix && sql.trim().startsWith(pausedPrefix)) await pausedSql;
    const keys = Array.isArray(params[0]) ? params[0] : [params[0]];
    if (sql.trim().startsWith('SELECT')) {
      return { rows: keys.map(key => rows.get(key)).filter(row => row?.blocked_until > new Date()) };
    }
    if (sql.trim().startsWith('INSERT')) {
      const count = (rows.get(params[0])?.count || 0) + 1;
      rows.set(params[0], { count, blocked_until: count >= Number(params[3] || 5) ? new Date(Date.now() + 600_000) : null });
    }
    if (sql.trim().startsWith('DELETE')) keys.forEach(key => rows.delete(key));
    return { rows: [] };
  } };
  const registrar = { post(_path, callback) { handler = callback; } };
  const context = vm.createContext({ crypto, BlockList, isIP, URL, Date, console, corePgPool,
    loginRateLimits: new Map(), LOGIN_RATE_LIMIT_WINDOW_MS: 900_000,
    LOGIN_RATE_LIMIT_BLOCK_MS: 600_000, LOGIN_RATE_LIMIT_MAX_FAILURES: 5,
    BASE_PATH: `/${module}`, router: registrar, app: registrar,
    asyncRoute: callback => callback, csrfMatches: () => true,
    normalizeUsername: value => String(value || '').trim().toLowerCase(), renderLogin: (_req, message) => message,
    authenticateUser: async () => { authenticateCalls += 1; return authenticatedUser; },
    authenticate: async () => { authenticateCalls += 1; return authenticatedUser; }, logAction: async () => {},
  });
  const code = functions.map(node => node.getText(ast)).join('\n') + '\n' + route.getText(ast);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText, context);
  return {
    context, rows,
    async login(req = request()) {
      const result = { statusCode: 200, body: '', destination: '' };
      const res = { status(code) { result.statusCode = code; return this; }, type() { return this; },
        send(body) { result.body = body; return this; }, redirect(destination) { result.destination = destination; } };
      try { await handler(req, res); } catch (error) { result.error = error; }
      return result;
    },
    get authenticateCalls() { return authenticateCalls; },
    failSql() { sqlFails = true; },
    pauseSql(prefix) {
      pausedPrefix = prefix;
      let release;
      pausedSql = new Promise(resolve => { release = resolve; });
      return release;
    },
    succeed() { authenticatedUser = { id: 1, username: 'operator', role: 'user' }; },
  };
}

for (const module of ['cashback', 'cotacao']) {
  test(`${module}: bloqueio global da Home impede login com IP e cookie novos`, async () => {
    const db = harness(module);
    db.rows.set(hash('home|user|operator'), { blocked_until: new Date(Date.now() + 600_000) });
    await db.login(request('198.51.100.20'));
    assert.equal(db.authenticateCalls, 0);
  });

  test(`${module}: falha SQL impede verificar a senha`, async () => {
    const db = harness(module);
    db.failSql();
    await db.login();
    assert.equal(db.authenticateCalls, 0);
  });

  test(`${module}: dez falhas distribuidas bloqueiam usuario em outro IP`, async () => {
    const db = harness(module);
    for (let index = 1; index <= 10; index += 1) {
      await db.context.registerLoginFailure(request(`198.51.100.${index}`), 'operator');
    }
    await db.login(request('203.0.113.25'));
    assert.equal(db.authenticateCalls, 0);
    assert.equal(db.rows.get(hash('home|user|operator')).count, 10);
  });

  test(`${module}: IP normalizado ignora headers de remetente publico e aceita proxy privado`, () => {
    const db = harness(module);
    const publicRequest = request('198.51.100.9', 'operator', { 'x-real-ip': '203.0.113.77' });
    const direct = db.context.loginRateIdentities(publicRequest, ' Operator ');
    assert.equal(direct[0].key, hash(`home|pair|${hash('198.51.100.9')}|operator`));
    const proxy = db.context.loginRateIdentities(request('172.18.0.2', 'operator', { 'x-real-ip': '::ffff:cb00:7109' }), 'operator');
    assert.equal(proxy[0].ipHash, hash('203.0.113.9'));
    assert.equal(proxy[1].key, hash('home|user|operator'));
  });

  test(`${module}: sucesso preserva bloqueio global de IP e regenera sessao`, async () => {
    const db = harness(module);
    const req = request();
    const ipKey = hash(`home|ip|${hash('203.0.113.9')}`);
    db.rows.set(ipKey, { count: 1, blocked_until: null });
    db.rows.set(hash('home|user|operator'), { count: 1, blocked_until: null });
    db.succeed();
    const result = await db.login(req);
    assert.equal(req.session.user?.id, 1);
    assert.ok(result.destination.startsWith(`/${module}/`));
    assert.equal(db.rows.has(ipKey), true);
    assert.equal(db.rows.has(hash('home|user|operator')), false);
  });

  test(`${module}: cinco falhas na mesma sessao continuam bloqueando identidades diferentes`, async () => {
    const db = harness(module);
    const req = request();
    for (let index = 0; index < 5; index += 1) await db.context.registerLoginFailure(req, `operator${index}`);
    req.body.username = 'new-operator';
    await db.login(req);
    assert.equal(db.authenticateCalls, 0);
  });

  test(`${module}: resposta de senha invalida aguarda persistencia da falha`, async () => {
    const db = harness(module);
    const release = db.pauseSql('INSERT');
    let completed = false;
    const pending = db.login().then(result => { completed = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    const respondedBeforePersistence = completed;
    release();
    await pending;
    assert.equal(respondedBeforePersistence, false);
    assert.equal(db.rows.get(hash('home|user|operator')).count, 1);
  });

  test(`${module}: sessao autenticada aguarda limpeza persistente`, async () => {
    const db = harness(module);
    db.succeed();
    const req = request();
    const release = db.pauseSql('DELETE');
    const pending = db.login(req);
    await new Promise(resolve => setImmediate(resolve));
    const authenticatedBeforeCleanup = Boolean(req.session.user);
    release();
    await pending;
    assert.equal(authenticatedBeforeCleanup, false);
    assert.equal(req.session.user?.id, 1);
  });
}
