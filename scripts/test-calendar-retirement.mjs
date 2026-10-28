import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

test('Home e Usuarios nao oferecem nem concedem Calendario', () => {
  assert.doesNotMatch(read('site/home.php'), /'module_key'\s*=>\s*'calendario'/);
  const users = read('apps/usuarios/src/server.ts');
  assert.doesNotMatch(users, /key:\s*'calendario'/);
  assert.doesNotMatch(users, /SELECT u\.id, 'calendario', true/);
});

test('Compose nao inicia servicos nem injeta conexao do Calendario', () => {
  const compose = read('docker-compose.yml');
  assert.doesNotMatch(compose, /wimifarma-calendario-(?:app|db)/);
  assert.doesNotMatch(compose, /CALENDARIO_INTERNAL_(?:TOKEN|BASE_URL)/);
  assert.doesNotMatch(read('scripts/database-backup.sh'), /wimifarma-calendario-db/);
});

test('rotas antigas respondem Gone sem proxy para servico aposentado', () => {
  const apache = read('docker/php/Dockerfile');
  assert.match(apache, /RedirectMatch 410.*calendario/);
  assert.doesNotMatch(apache, /ProxyPass(?:Reverse)? .*calendario/);
});

test('fontes do app foram retiradas e dados historicos permanecem protegidos', () => {
  assert.equal(fs.existsSync(new URL('apps/calendario/src/server.ts', root)), false);
  assert.equal(fs.existsSync(new URL('apps/calendario/Dockerfile', root)), false);
  assert.match(read('.gitignore'), /^\/calendario-data\//m);
});

test('Miauby nao oferece ferramenta nem consulta resumo do Calendario', () => {
  assert.doesNotMatch(read('apps/miauw-agent/src/semantic-command.ts'), /id:\s*'consultar_calendario'/);
  assert.doesNotMatch(read('apps/miauby/src/tool-contracts.ts'), /name:\s*'resumo_calendario'/);
  assert.doesNotMatch(read('apps/miauby/src/text-command-contracts.ts'), /intent:\s*'consultar_calendario'/);
  assert.doesNotMatch(read('site/miauw/module-status.php'), /wimifarma-calendario-app/);
  assert.doesNotMatch(read('site/miauw/miauw-skills.php'), /miauw_skill_calendario_summary\(/);
});

test('selecao de datas propria do Financeiro permanece intacta', () => {
  assert.match(read('apps/financeiro/src/server.ts'), /<details id="calendario"/);
});
