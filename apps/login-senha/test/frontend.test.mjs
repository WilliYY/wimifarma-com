import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function fixture({ clipboardFails = false, revealFails = false, legacyClipboard = false, deferFirstReveal = false } = {}) {
  const listeners = new Map();
  const requests = [];
  const timers = [];
  const alerts = [];
  let releaseFirstReveal = () => {};
  const classes = () => {
    const values = new Set();
    return {
      contains: value => values.has(value),
      add: value => values.add(value),
      remove: value => values.delete(value),
      toggle(value, enabled) {
        const next = enabled ?? !values.has(value);
        if (next) values.add(value); else values.delete(value);
      },
    };
  };
  function element(attributes = {}) {
    return {
      dataset: {}, classList: classes(), disabled: false, textContent: '',
      getAttribute: name => attributes[name] ?? null,
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; },
    };
  }
  const rows = ['1', '2'].map(id => {
    const row = element({ 'data-entry-id': id });
    row.draggable = false;
    row.output = Object.assign(element(), { type: 'text', value: '' });
    row.toggle = element({ 'data-entry-id': id, 'data-vault-action': 'row-reveal' });
    row.edit = element({ 'data-entry-id': id, 'data-vault-action': 'edit' });
    row.handle = element({ 'data-vault-drag-handle': '' });
    row.text = element();
    row.editor = element({ 'data-entry-id': id });
    row.editor.hidden = true;
    row.editor.output = Object.assign(element(), { type: 'text', value: '' });
    row.editor.toggle = element({ 'data-entry-id': id, 'data-vault-action': 'reveal' });
    row.copy = element({ 'data-entry-id': id, 'data-vault-action': 'copy-password' });
    row.querySelector = selector => selector.includes('password-output') || selector.includes('secret-output')
      ? row.output : selector.includes('row-number') ? null : row.toggle;
    row.editor.querySelector = selector => selector.includes('secret-output') ? row.editor.output
      : selector.includes('data-vault-action') ? row.editor.toggle : null;
    row.closest = selector => selector.includes('vault-entry') ? row : null;
    for (const target of [row.output, row.toggle, row.edit, row.handle, row.text, row.copy, row.editor.toggle]) {
      target.closest = selector => selector.includes('data-vault-drag-handle') ? (target === row.handle ? target : null)
        : selector.includes('data-vault-action') ? (target.getAttribute?.('data-vault-action') ? target : null)
        : selector.includes('vault-entry') ? row : null;
    }
    row.handle.draggable = true;
    return row;
  });
  const document = {
    body: element({ 'data-base-path': '/login-senha' }),
    addEventListener: (name, callback) => listeners.set(name, callback),
    getElementById: id => rows.find(row => id === `vault-entry-editor-${row.getAttribute('data-entry-id')}`)?.editor,
    querySelector(selector) {
      if (selector.includes('csrf-token')) return element({ content: 'fixture-csrf' });
      return rows.find(row => selector.includes(`data-entry-id="${row.getAttribute('data-entry-id')}"`)) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.vault-entry-row') return rows;
      if (selector.includes('.vault-entry-row.is-selected')) return rows.filter(row => row.classList.contains('is-selected'));
      return [];
    },
    createElement: () => Object.assign(element(), { style: {}, select() {} }),
    execCommand: () => false,
  };
  document.body.appendChild = () => {};
  document.body.removeChild = () => {};
  const sandbox = {
    document,
    window: { setTimeout: (callback, delay) => timers.push({ callback, delay }), alert: value => alerts.push(value), location: { reload() {} } },
    navigator: { clipboard: legacyClipboard ? undefined : { writeText: async () => { if (clipboardFails) throw new Error('Clipboard blocked'); } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (deferFirstReveal && requests.length === 1) {
        await new Promise(resolve => { releaseFirstReveal = resolve; });
      }
      const failed = revealFails && url.endsWith('/reveal');
      return { ok: !failed, json: async () => failed ? { ok: false, error: 'Sem acesso' }
        : { ok: true, password: 'Senha ficticia <>&', login_username: 'login-ficticio' } };
    },
    Date, Promise,
  };
  vm.runInNewContext(script, sandbox);
  async function settle() {
    for (let index = 0; index < 12; index += 1) await new Promise(resolve => setImmediate(resolve));
  }
  function dispatch(type, target, extra = {}) {
    const event = { target, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    listeners.get(type)?.(event);
    return event;
  }
  return { rows, requests, timers, alerts, dispatch, settle, releaseInitialReveal: () => releaseFirstReveal() };
}

test('senhas aparecem automaticamente por POST auditado com CSRF', async () => {
  const ui = fixture();
  await ui.settle();
  assert.equal(ui.requests.length, 2);
  for (const request of ui.requests) {
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['X-CSRF-Token'], 'fixture-csrf');
    assert.match(request.url, /^\/login-senha\/api\/entries\/[12]\/reveal$/);
  }
  for (const row of ui.rows) {
    assert.equal(row.output.type, 'text');
    assert.equal(row.output.value, 'Senha ficticia <>&');
  }
  for (const timer of ui.timers.filter(timer => timer.delay >= 15000)) timer.callback();
  assert.equal(ui.rows[0].output.type, 'text');
});

test('clicar em texto e senha permite selecionar sem abrir o editor', async () => {
  const ui = fixture();
  await ui.settle();
  for (const target of [ui.rows[0].text, ui.rows[0].output]) {
    assert.equal(ui.dispatch('click', target).prevented, false);
    assert.equal(ui.rows[0].editor.hidden, true);
  }
});

test('espaco e Enter no campo de senha nao abrem o editor', async () => {
  const ui = fixture();
  await ui.settle();
  for (const key of [' ', 'Enter']) assert.equal(ui.dispatch('keydown', ui.rows[0].output, { key }).prevented, false);
  assert.equal(ui.rows[0].editor.hidden, true);
});

test('Editar abre e fecha apenas o editor escolhido sem requisitar outra senha', async () => {
  const ui = fixture();
  await ui.settle();
  ui.dispatch('click', ui.rows[0].edit);
  assert.equal(ui.rows[0].editor.hidden, false);
  assert.equal(ui.rows[1].editor.hidden, true);
  ui.dispatch('click', ui.rows[0].edit);
  assert.equal(ui.rows[0].editor.hidden, true);
  await ui.settle();
  assert.equal(ui.requests.length, 2);
});

test('somente a alca inicia reordenacao', async () => {
  const ui = fixture();
  await ui.settle();
  let started = false;
  const dataTransfer = { setData() { started = true; } };
  ui.dispatch('dragstart', ui.rows[0].text, { dataTransfer });
  assert.equal(started, false);
  ui.dispatch('dragstart', ui.rows[0].handle, { dataTransfer });
  assert.equal(started, true);
  assert.equal(ui.rows[0].classList.contains('is-dragging'), true);
});

test('falha ao revelar deixa apenas aquele campo indisponivel', async () => {
  const ui = fixture({ revealFails: true });
  await ui.settle();
  assert.equal(ui.rows[0].output.value, '');
  assert.equal(ui.rows[0].editor.output.placeholder, 'Senha indisponivel');
  assert.equal(ui.alerts.length, 0);
});

test('editor permite tentar revelar novamente depois de falha inicial', async () => {
  const ui = fixture({ revealFails: true });
  await ui.settle();
  const before = ui.requests.length;
  ui.dispatch('click', ui.rows[0].editor.toggle);
  await ui.settle();
  assert.equal(ui.requests.length, before + 1);
});

test('botao do editor reflete a senha revelada depois de ocultar', async () => {
  const ui = fixture();
  await ui.settle();
  ui.dispatch('click', ui.rows[0].editor.toggle);
  ui.dispatch('click', ui.rows[0].editor.toggle);
  await ui.settle();
  assert.equal(ui.rows[0].editor.output.type, 'text');
  assert.equal(ui.rows[0].editor.toggle.textContent, 'Ocultar');
});

test('resposta inicial atrasada preserva ocultacao manual posterior', async () => {
  const ui = fixture({ deferFirstReveal: true });
  await ui.settle();
  ui.dispatch('click', ui.rows[0].editor.toggle);
  await ui.settle();
  assert.equal(ui.rows[0].editor.output.type, 'text');
  ui.dispatch('click', ui.rows[0].editor.toggle);
  assert.equal(ui.rows[0].editor.output.type, 'password');
  ui.releaseInitialReveal();
  await ui.settle();
  assert.equal(ui.rows[0].output.type, 'password');
  assert.equal(ui.rows[0].editor.output.type, 'password');
});

test('falha ao copiar nao anuncia sucesso', async () => {
  const ui = fixture({ clipboardFails: true });
  await ui.settle();
  ui.dispatch('click', ui.rows[0].copy);
  await ui.settle();
  assert.notEqual(ui.rows[0].copy.textContent, 'Copiado');
  assert.deepEqual(ui.alerts, ['Clipboard blocked']);
});

test('copia legada rejeitada pelo navegador nao anuncia sucesso', async () => {
  const ui = fixture({ legacyClipboard: true });
  await ui.settle();
  ui.dispatch('click', ui.rows[0].copy);
  await ui.settle();
  assert.notEqual(ui.rows[0].copy.textContent, 'Copiado');
  assert.deepEqual(ui.alerts, ['Nao foi possivel copiar. Selecione o texto e use Ctrl+C.']);
});
