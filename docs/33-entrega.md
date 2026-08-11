# 33 - Entrega Wimifarma

## Objetivo

O modulo `/entrega/` registra entregas de balcao, imprime um comprovante local e contabiliza R$ 1,00 de comissao mais 400 XP para o usuario ativo escolhido como responsavel por cada entrega valida.

## Arquitetura

- App: `apps/entrega`, Node.js 22, TypeScript e Express.
- Container: `wimifarma-entrega-app`, porta interna `3980`.
- Banco: Postgres 17 dedicado `wimifarma_entrega` em `wimifarma-entrega-db`.
- XP: Postgres oficial `wimifarma_xp` em `wimifarma-xp-db`, ligado pelo core em `core_user_xp_links`.
- Sessao: cookie `WFENTREGA` em `entrega_sessions`.
- Entrada: Apache publica `/entrega/`, mas a Home mostra o card somente ao login mestre exato `adm`.
- Identidade: `WFHOME_SSO` e `core_users`; nao existe login paralelo. O backend revalida `username='adm'` em toda pagina e acao operacional, respondendo HTTP 403 para qualquer outra conta.
- Monitoramento: `/entrega/health` e assets estaticos permanecem acessiveis sem sessao; nenhuma rota operacional herda essa excecao.

## Dados e invariantes

### `deliveries`

- `id BIGSERIAL` e o numero sequencial, exibido como `#000123`.
- `request_token UUID UNIQUE` torna a criacao idempotente.
- Nome, telefone/WhatsApp e endereco sao obrigatorios.
- `created_by_user_id` e `created_by_name` preservam o responsavel escolhido no cadastro; o ator real da operacao fica na auditoria.
- Responsavel e `created_at` sao permanentes depois da criacao.
- `status` aceita `ACTIVE` e `CANCELLED`; cancelamento grava ator e horario.

### `delivery_commissions`

- `delivery_id UNIQUE` garante uma linha por entrega.
- `amount_cents=100` e protegido por CHECK e trigger.
- A comissao pertence ao responsavel escolhido na criacao.
- Cancelar muda o status para `CANCELLED`; nao apaga nem zera o valor historico.

### Pagamento de comissao

- `delivery_commission_payments` guarda um lote imutavel com UUID idempotente, usuario, mes, quantidade, total, pagador e data/hora.
- `delivery_commission_payment_items` vincula cada comissao e entrega a no maximo um lote por constraints `UNIQUE`.
- Cada item continua valendo exatamente 100 centavos; lote exige `total_cents = commission_count * 100`.
- O mesmo usuario pode receber um novo lote no mesmo mes se novas entregas forem criadas depois da primeira baixa.
- `delivery_commission_payment_audit_logs` preserva `PAYMENT_CREATED` e `PAYMENT_REPRINTED`.
- Lotes, itens e auditoria de pagamento nao podem ser alterados nem apagados.

### `delivery_audit_logs`

- Acoes: `DELIVERY_CREATED`, `DELIVERY_EDITED`, `DELIVERY_REPRINTED`, `DELIVERY_CANCELLED` e resultados de premiacao/estorno XP.
- Guarda ator, nome, data/hora e metadata JSONB.
- Triggers bloqueiam DELETE nas tabelas de negocio e auditoria.

## Permissoes

- Somente o login mestre exato `adm` abre o modulo, cria, consulta, edita, reimprime, cancela e paga comissoes.
- Perfis `admin`, `gerente` e usuarios comuns nao veem o card e recebem HTTP 403 no acesso direto.
- `adm` pode escolher como responsavel qualquer conta humana ativa da Wimifarma; o escolhido recebe entrega, comissao e XP, mas nao recebe acesso ao modulo.
- Somente `adm` ve o painel, executa a baixa e reimprime o relatorio de pagamento.
- A interface escolhe o responsavel somente na criacao e nunca o altera depois, assim como data/hora original, numero ou comissao.

## Criacao idempotente

1. A pagina emite UUID ligado a sessao.
2. O POST valida sessao, CSRF, UUID, dados e revalida no core o responsavel ativo escolhido.
3. Entrega e comissao ficam com o responsavel selecionado; a auditoria guarda o usuario realmente logado como ator da acao.
4. Entrega, comissao e auditoria entram na mesma transacao.
5. Depois do commit, +400 XP sao gravados para o vinculo XP ativo do responsavel com `source='delivery_creation'` e `source_entity_id=<deliveries.id>`.
6. Clique duplo ou retry encontra o UUID existente e a chave de origem existente, sem duplicar entrega, comissao ou XP.
7. Falha ou ausencia de vinculo XP fica visivel/auditada e nao desfaz entrega/comissao confirmadas.
8. A sessao autoriza uma unica abertura da rota de impressao.

## Edicao, reimpressao e cancelamento

- Edicao muda somente nome, telefone e endereco e audita antes/depois.
- Reimpressao usa o registro existente e nao escreve em entrega/comissao.
- Cancelamento usa lock, muda entrega e comissao atomicamente e mantem o historico.
- Depois do commit do cancelamento, o lancamento XP recebe `deleted_at`/`deleted_by`; falha no XP nao reativa a entrega e fica auditada para conferencia.
- Comissao ja paga bloqueia cancelamento da entrega na aplicacao e no trigger do banco; um estorno futuro precisa ser um fluxo contabil explicito.
- Registros cancelados nao podem ser reativados nem reimpressos.

## Pagar comissao

1. `adm` escolhe o usuario no mes que ja esta selecionado no painel.
2. O POST valida sessao, perfil, CSRF, UUID idempotente, usuario ativo e mes.
3. Uma trava transacional serializa baixas do mesmo usuario.
4. Somente comissoes `ACTIVE`, ligadas a entregas `ACTIVE` e sem item de pagamento entram no lote.
5. Lote, itens e auditoria sao gravados na mesma transacao; qualquer falha reverte tudo.
6. Clique duplo/retry reutiliza o lote do UUID e nao duplica valor.
7. O relatorio abre uma vez pela sessao; reimpressao cria somente auditoria.

## Indicadores e historico

- Mes selecionavel, resumo pessoal, valores a receber/ja pagos e ranking por usuario para `adm`.
- Painel `Pagar comissao` mostra pendente, pago, pessoas pendentes e comprovantes recentes do mes.
- Busca por cliente, telefone, endereco, numero ou responsavel.
- Filtros por hoje, mes, mes anterior, periodo personalizado, usuario e status.
- Historico paginado em 50 linhas.

## Impressao

- Dialogo local do navegador no computador atual.
- Papel de 80 mm, bloco de 76 mm e altura variavel.
- O cadastro mostra uma previa ao vivo com cliente, telefone, endereco e responsavel antes de salvar.
- A previa e o cupom final usam `apps/entrega/public/logo-wimifarma-receipt.png`, convertida para preto e branco no CSS termico.
- Mostra marca, `ENTREGA`, numero, cliente, telefone, endereco, responsavel pela entrega e data/hora.
- Nao mostra comissao nem afirma que o papel saiu fisicamente.
- O relatorio de pagamento usa o mesmo papel e mostra somente usuario, mes, entregas pagas, total, numero do lote, pagador e data/hora; nao lista clientes, telefones ou enderecos.

## Diagnostico

- `/entrega/health` falha quando encontra entrega sem comissao, status divergente, lote com quantidade/total diferente dos itens ou comissao paga depois marcada como cancelada.

## Validacao

```bash
cd apps/entrega
npm ci
npm run check
npm test
docker compose up -d --build wimifarma-entrega-db wimifarma-entrega-app wimifarma-com-web
curl -fsS http://127.0.0.1:3002/entrega/health
```
