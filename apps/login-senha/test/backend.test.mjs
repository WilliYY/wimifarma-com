import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/server.ts', import.meta.url);
const require = createRequire(sourceUrl);

function fixture(username = 'adm', role = 'admin', basePath = '/login-senha') {
  const queries = [];
  const user = { id: 1, username, display_name: username, role, active: true };
  const entry = { id: '12', scope: 'geral', name: 'GAM', category: 'distribuidor', login_username: 'fixture-login', created_at: '2026-01-01', archived_at: null };
  const rows = [entry];
  let poolIndex = 0;
  class Pool {
    constructor() { this.core = poolIndex++ === 1; }
    async query(sql, params = []) {
      queries.push({ core: this.core, sql, params });
      if (this.core && /FROM core_users/.test(sql)) return { rows: [user] };
      if (this.core && /FROM core_user_module_permissions/.test(sql)) return { rows: [{ can_access: true }] };
      if (/SELECT \*/.test(sql)) return { rows };
      if (/RETURNING/.test(sql)) return { rows: [{ id: '12' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }
  }
  const app = { set() {}, use() {}, get() {}, post() {} };
  const express = Object.assign(() => app, { urlencoded() {}, json() {}, static() {} });
  const session = () => ({});
  const context = vm.createContext({
    console, crypto, path, fileURLToPath, Buffer, URL, AbortController, setTimeout, clearTimeout,
    process: { env: { LOGIN_SENHA_SESSION_SECRET: 'fixture-only-secret' } },
    pg: { Pool }, express, session, connectPgSimple: () => class {},
  });
  let source = fs.readFileSync(sourceUrl, 'utf8');
  source = source.slice(0, source.lastIndexOf('\nensureSchema()'));
  source = source.replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.url', JSON.stringify(sourceUrl.href));
  source += '\nglobalThis.api = { handlePost, renderPage, listEntries, createEntry, updateEntry, inferCategory };';
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
  const req = {
    path: basePath + '/', originalUrl: basePath + '/',
    session: { user, csrfToken: 'fixture-csrf' }, body: { csrf_token: 'fixture-csrf', id: '12' },
    get() { return ''; },
  };
  const res = {
    statusCode: 200, status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; }, redirect(value) { this.redirected = value; },
  };
  return { ...context.api, queries, req, res, user, entry, rows };
}

test('classifica distribuidores conhecidos e separa redes e portais', () => {
  const ui = fixture();
  for (const name of ['GAM', 'profarma.com.br', 'panpharma', 'santa cruz', 'ANB', 'DM ARTHUR', 'GIRA BRASIL DISTR']) {
    assert.equal(ui.inferCategory(name), 'distribuidor', name);
  }
  assert.equal(ui.inferCategory('facebook pagina'), 'redes_sociais');
  assert.equal(ui.inferCategory('portal da drogaria'), 'portais_servicos');
  assert.equal(ui.inferCategory('Novo acesso desconhecido'), 'outros');
});

test('somente o login adm pode remover, inclusive por POST forjado', async () => {
  for (const basePath of ['/login-senha', '/login-senha-adm']) {
  for (const [username, role] of [['outra-admin', 'admin'], ['gerente', 'gerente'], ['colaborador', 'user'], ['ADM', 'admin']]) {
    for (const action of ['archive', 'delete', 'delete_archived', 'clear_archived']) {
      const ui = fixture(username, role, basePath);
      ui.req.body.action = action;
      await ui.handlePost(ui.req, ui.res);
      if (basePath === '/login-senha-adm' && role === 'user') {
        assert.equal(ui.res.redirected, '/', `${username}: cofre restrito`);
      } else {
        assert.equal(ui.res.statusCode, 403, `${username}: ${action}`);
      }
      assert.equal(ui.queries.some(q => !q.core && /^(UPDATE|DELETE|INSERT INTO login_senha_entries)/.test(q.sql.trim())), false);
    }
  }
  }
});

test('excluir ativo como adm arquiva sem apagar senha nem historico', async () => {
  const ui = fixture();
  ui.req.body.action = 'delete';
  await ui.handlePost(ui.req, ui.res);
  assert.equal(ui.res.redirected, '/login-senha/');
  const mutation = ui.queries.find(q => /UPDATE login_senha_entries/.test(q.sql));
  assert.ok(mutation);
  assert.match(mutation.sql, /archived_at = NOW\(\)/);
  assert.doesNotMatch(mutation.sql, /password_|DELETE/);
  assert.ok(ui.queries.some(q => q.params.includes('login_senha_acesso_arquivado')));
});

test('adm sem CSRF nao altera o cofre', async () => {
  const ui = fixture();
  ui.req.body = { action: 'delete', id: '12' };
  await ui.handlePost(ui.req, ui.res);
  assert.equal(ui.queries.some(q => !q.core), false);
  assert.equal(ui.req.session.flash.type, 'error');
});

test('criar rejeita categoria desconhecida antes de escrever', async () => {
  const ui = fixture();
  ui.req.body = { name: 'Acesso ficticio', login_username: 'fixture', password: 'fixture-only', category: '<script>' };
  await ui.createEntry(ui.req, ui.user, 'geral');
  assert.equal(ui.queries.length, 0);
  assert.equal(ui.req.session.flash.type, 'error');
});

test('alterar categoria sem nova senha preserva o segredo existente', async () => {
  const ui = fixture();
  ui.req.body = { id: '12', name: 'GAM', login_username: 'fixture', password: '', category: 'outros' };
  await ui.updateEntry(ui.req, ui.user, 'geral');
  const mutation = ui.queries.find(q => /UPDATE login_senha_entries/.test(q.sql));
  assert.ok(mutation.params.includes('outros'));
  assert.doesNotMatch(mutation.sql, /password_ciphertext/);
});

test('pagina agrupa em A-Z e somente adm recebe controles de exclusao', () => {
  for (const username of ['adm', 'outra-admin']) {
    const ui = fixture(username);
    const entries = [ui.entry, { ...ui.entry, id: '13', name: 'Ábaco' }, { ...ui.entry, id: '14', name: 'Instagram', category: 'redes_sociais' }];
    const html = ui.renderPage(ui.req, ui.user, entries, [{ ...ui.entry, archived_at: '2026-01-02' }], []);
    assert.ok(html.indexOf('<strong>Ábaco</strong>') < html.indexOf('<strong>GAM</strong>'));
    assert.match(html, /data-category="distribuidor"/);
    assert.match(html, /data-category="redes_sociais"/);
    assert.equal(html.includes('name="action" value="delete"'), username === 'adm');
    assert.equal(html.includes('name="action" value="delete_archived"'), username === 'adm');
    assert.equal(html.includes('name="action" value="clear_archived"'), username === 'adm');
    assert.doesNotMatch(html, /draggable="true"/);
    assert.doesNotMatch(html, /fixture-only-secret/);
  }
});
