# 10 - Integracoes

## O que esta parte do sistema faz

Mapeia integracoes externas existentes e planejadas.

## Integracoes existentes

### OpenAI / Miauby

Arquivos:

- `site/miauw/config.local.example.php`
- `site/miauw/bootstrap.php`
- `site/miauw/miauw-funcoes.php`
- `site/miauw/api.php`
- `site/miauw/widget-status.php`

Variaveis/configuracoes:

- `MIAUW_OPENAI_API_KEY`
- `MIAUW_OPENAI_MODEL`
- `MIAUW_GUARDIAN_TOKEN`
- constantes opcionais em `site/miauw/config.local.php`

Tabelas:

- `miauw_conversas`
- `miauw_mensagens`
- `miauw_memorias`
- `miauw_conhecimentos`
- `miauw_alertas`

### Farmacia Popular / Miauby

Arquivos:

- `site/miauw/miauw-farmacia-popular.php`
- `site/miauw/farmacia-popular-cron.php`

Tabelas:

- `miauw_farmacia_popular_valores`
- `miauw_farmacia_popular_atualizacoes`

### GoDaddy DNS

Uso:

- Gerenciar registros de `wimifarma.com`.

Estado conhecido:

- `A @` para IP do VPS.
- `CNAME www` para `wimifarma.com.`
- nameservers GoDaddy.

### Nginx Proxy Manager

Uso:

- Proxy e SSL para dominios no VPS.

Destino correto:

- `http://wimifarma-com-web:80`

## Integracoes planejadas

### Google Sheets / Cotacao

Objetivo:

- Espelhar Cotacao com planilha, mantendo sistema e Sheets coerentes.

Arquivos/tabelas candidatos:

- `site/cotacao/cotacao-funcoes.php`
- `site/cotacao/api.php`
- `cotacao_itens`
- `cotacao_precos`
- `cotacao_sync_estado`
- `cotacao_auditoria`

### Miauby skills generativas

Objetivo:

- Evoluir Miauby para entender padroes operacionais e gerar sugestoes melhores, sem liberar acesso bruto ao banco ou escrita sem controle.

Arquivos candidatos:

- `site/miauw/miauw-funcoes.php`
- `site/miauw/miauw-skills.php`
- `site/miauw/miauw-intelligence.php`
- `site/miauw/miauw-system-map.php`

Direcao:

- criar registry formal de skills;
- separar skills de leitura, sugestao e escrita;
- validar permissao, schema e auditoria por skill;
- revisar memorias e padroes antes de transformar em automacao.

Documento especifico:

- `docs/18-miauby-evolucao-generativa.md`

## Regras que precisam ser preservadas

- Nao salvar chaves externas no Git.
- Usar APIs estruturadas em vez de copiar/colar texto solto.
- Registrar auditoria quando integracoes alterarem dados importantes.
- Em Cotacao + Sheets, preservar IDs, ordem, status, precos, observacoes e formatacao.

## Decisoes tecnicas ja tomadas

- Miauby pode ler chave OpenAI do `.env` ou de `config.local.php`.
- Cotacao ainda nao deve receber sincronizacao improvisada.
- DNS e proxy ficam fora do repositorio, mas suas decisoes devem ser documentadas.

## Riscos ao alterar

- Chaves expostas em commit.
- Integracao de Sheets sobrescrevendo dados de cotacao.
- Mudancas de DNS interrompendo acesso publico.
- Jobs sem token permitindo execucao publica indevida.

## Pendencias

- Definir credencial/conector Google Sheets.
- Definir modelo de conflito para Cotacao.
- Criar tela de diagnostico de integracoes.
- Criar logs de execucao para jobs.

## Evolucao futura

- Criar `docs/10-integracoes/google-sheets-cotacao.md`.
- Criar camada de servicos para integracoes externas.
- Adicionar fila/job para sincronizacoes longas.
- Usar Miauby para resumo de divergencias e alertas.
