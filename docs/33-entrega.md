# 33 - Entrega Wimifarma

## Objetivo

O modulo `/entrega/` registra entregas de balcao, imprime um comprovante local e contabiliza R$ 1,00 de comissao para o usuario que criou cada entrega valida.

## Arquitetura

- App: `apps/entrega`, Node.js 22, TypeScript e Express.
- Container: `wimifarma-entrega-app`, porta interna `3980`.
- Banco: Postgres 17 dedicado `wimifarma_entrega` em `wimifarma-entrega-db`.
- Sessao: cookie `WFENTREGA` em `entrega_sessions`.
- Entrada: Apache publica `/entrega/` e o card aparece para toda conta ativa.
- Identidade: `WFHOME_SSO` e `core_users`; nao existe login paralelo nem permissao removivel.

## Dados e invariantes

### `deliveries`

- `id BIGSERIAL` e o numero sequencial, exibido como `#000123`.
- `request_token UUID UNIQUE` torna a criacao idempotente.
- Nome, telefone/WhatsApp e endereco sao obrigatorios.
- `created_by_user_id`, `created_by_name` e `created_at` sao permanentes.
- `status` aceita `ACTIVE` e `CANCELLED`; cancelamento grava ator e horario.

### `delivery_commissions`

- `delivery_id UNIQUE` garante uma linha por entrega.
- `amount_cents=100` e protegido por CHECK e trigger.
- A comissao pertence ao criador original.
- Cancelar muda o status para `CANCELLED`; nao apaga nem zera o valor historico.

### `delivery_audit_logs`

- Acoes: `DELIVERY_CREATED`, `DELIVERY_EDITED`, `DELIVERY_REPRINTED`, `DELIVERY_CANCELLED`.
- Guarda ator, nome, data/hora e metadata JSONB.
- Triggers bloqueiam DELETE nas tabelas de negocio e auditoria.

## Permissoes

- Toda conta ativa abre e cria entrega.
- Usuario comum consulta, edita dados do cliente e reimprime somente entregas proprias.
- `adm`, `admin` e `gerente` consultam equipe, filtram por usuario, editam e cancelam.
- A interface nunca altera responsavel, data/hora original, numero ou comissao.

## Criacao idempotente

1. A pagina emite UUID ligado a sessao.
2. O POST valida sessao, CSRF, UUID e dados.
3. Entrega, comissao e auditoria entram na mesma transacao.
4. Clique duplo ou retry encontra o UUID existente e nao duplica.
5. A sessao autoriza uma unica abertura da rota de impressao.

## Edicao, reimpressao e cancelamento

- Edicao muda somente nome, telefone e endereco e audita antes/depois.
- Reimpressao usa o registro existente e nao escreve em entrega/comissao.
- Cancelamento usa lock, muda entrega e comissao atomicamente e mantem o historico.
- Registros cancelados nao podem ser reativados nem reimpressos.

## Indicadores e historico

- Mes selecionavel, resumo pessoal, totais e ranking por usuario para gestores.
- Busca por cliente, telefone, endereco, numero ou responsavel.
- Filtros por hoje, mes, mes anterior, periodo personalizado, usuario e status.
- Historico paginado em 50 linhas.

## Impressao

- Dialogo local do navegador no computador atual.
- Papel de 80 mm, bloco de 76 mm e altura variavel.
- Mostra marca, `ENTREGA`, numero, cliente, telefone, endereco, responsavel e data/hora.
- Nao mostra comissao nem afirma que o papel saiu fisicamente.

## Validacao

```bash
cd apps/entrega
npm ci
npm run check
npm test
docker compose up -d --build wimifarma-entrega-db wimifarma-entrega-app wimifarma-com-web
curl -fsS http://127.0.0.1:3002/entrega/health
```
