# Modulo Comissao

## Objetivo

O modulo `/comissao/` controla campanhas de indicacao por cupom. O indicador e uma pessoa externa ao sistema, recebe uma comissao em dinheiro por uso confirmado, e o usuario Wimifarma que confirma o cupom recebe +300 XP.

## Arquitetura

- App: `apps/comissao`, Node.js 22, TypeScript e Express.
- Rota publica interna: `/comissao/`, via proxy Apache para `wimifarma-comissao-app:3990`.
- Sessao: `WFCOMISSAO`, criada somente depois da validacao de `WFHOME_SSO` e de `core_users.active=TRUE`.
- Banco operacional: Postgres 17 dedicado `wimifarma_comissao`, em `wimifarma-comissao-db`.
- Identidade, roles e vinculo XP: `wimifarma_core`.
- Premio: Postgres oficial `wimifarma_xp`, sem tabela XP paralela.
- Impressao: navegador local, papel de 80 mm, sem agente ou fila remota.
- O startup tolera a janela de criacao do Postgres com ate 30 tentativas de um segundo e falha de forma explicita se banco/core continuarem indisponiveis.

## Acesso

- Toda conta ativa autenticada pode abrir o card, consultar e confirmar um cupom.
- `/comissao` redireciona uma vez para `/comissao/`; sem sessao valida, `/comissao/` retorna para a Home sem criar laco de redirecionamento.
- Usuario comum ve apenas as proprias utilizacoes.
- `adm`, `admin` e `gerente` administram indicadores, cupons, pagamentos, cancelamentos, ranking e historicos completos.
- Indicadores sao pessoas externas e nunca recebem login automaticamente.

## Regras do cupom

- O codigo pode ser digitado pelo gestor ou gerado automaticamente.
- A chave de busca ignora hifens, espacos, pontuacao e diferenca entre maiusculas/minusculas.
- A chave normalizada e unica em todo o sistema.
- Produto, preco normal, preco promocional, comissao, inicio, validade opcional e status ficam persistidos.
- O preco promocional precisa ser menor que o normal; a comissao precisa ser positiva e nao pode superar o promocional.
- `ACTIVE` aceita uso somente dentro do periodo; `PAUSED` e `CLOSED` bloqueiam confirmacao.
- A consulta nao cria utilizacao, comissao nem XP. A gravacao ocorre somente no botao explicito de confirmar.

## Confirmacao e XP

1. O servidor reconsulta e trava o cupom com `FOR UPDATE`.
2. Revalida status e datas usando a data local `America/Sao_Paulo`.
3. Grava uma linha em `referral_redemptions` com snapshots do indicador, cupom, produto e valor da comissao.
4. Grava uma unica transacao `COMMISSION` no livro-razao.
5. Confirma a transacao local.
6. Depois do `COMMIT`, tenta gerar +300 XP para o usuario realmente logado e vinculado em `core_user_xp_links`.

O XP usa `xp_sales.source='referral_coupon_redemption'` e `source_entity_id=<referral_redemptions.id>`. O indice unico oficial impede duplicacao em clique repetido ou retry. Ausencia de vinculo ou indisponibilidade do XP nao desfaz a utilizacao/comissao ja confirmada; o estado fica visivel e auditado. `adm`, `admin` e `gerente` podem tentar novamente um XP `PENDING`, `SKIPPED` ou `FAILED`; a idempotencia mantem um unico premio para o usuario original da utilizacao, e a tentativa fica auditada.

## Comissoes e pagamentos

- `referral_commission_transactions` e o livro-razao imutavel.
- `COMMISSION` acrescenta saldo; `REVERSAL` e `PAYMENT` reduzem saldo.
- O gestor pode pagar qualquer valor positivo ate o saldo atual do indicador.
- Cada pagamento usa UUID idempotente, guarda forma `PIX`, `CASH` ou `OTHER`, observacao opcional, pagador e data/hora.
- Pagamento e transacao correspondente sao imutaveis e nao podem ser apagados.
- O perfil do indicador exibe saldo, total gerado, total pago e historico.
- `Pagar e imprimir` confirma a baixa antes de abrir um comprovante termico resumido com indicador, valor, forma, responsavel e data/hora; o historico permite reimprimir o mesmo registro sem recalcular nem duplicar o pagamento.

## Cancelamento

- Somente gestor cancela uma utilizacao ativa e informa motivo.
- O cancelamento marca a utilizacao como `CANCELLED`, cria uma unica `REVERSAL` e estorna logicamente o XP em `xp_sales.deleted_at`/`deleted_by`.
- Nenhum historico e apagado.
- Se a comissao ja foi paga, o estorno pode deixar o saldo do indicador negativo; o valor fica exposto e compensa comissoes futuras. Isso preserva o caixa real sem editar pagamento passado.

## Tabelas

- `referral_people`: indicadores externos, contato, PIX, documento, observacao, status e ator de criacao.
- `referral_coupons`: campanha, codigo/chave unica, oferta, comissao, datas, status e ator.
- `referral_redemptions`: uso idempotente, snapshots, usuario, +300 XP e cancelamento logico.
- `referral_commission_transactions`: lancamentos imutaveis de comissao, estorno e pagamento.
- `referral_payments`: pagamentos parciais/integrais imutaveis.
- `referral_audit_logs`: auditoria local.
- `comissao_sessions`: sessoes `WFCOMISSAO`.

## Impressao

- A previa termica mostra a marca Wimifarma, produto, preco normal, preco promocional, codigo, indicador e validade.
- O cupom entregue ao cliente nunca mostra comissao.
- Imprimir reutiliza o cupom salvo e nao cria utilizacao, comissao ou XP.
- O comprovante de pagamento nao lista clientes, cupons ou observacoes; mostra somente os dados essenciais da baixa.
- O registro de impressao significa solicitacao ao navegador, nao confirmacao fisica do papel.
- Em telas estreitas, os historicos sao reorganizados em blocos rotulados para preservar todas as informacoes sem depender de uma tabela cortada.

## Validacao

```powershell
cd apps/comissao
npm ci
npm run check
npm test
```

```bash
docker compose up -d --build wimifarma-comissao-db wimifarma-comissao-app wimifarma-com-web
docker compose logs --tail=100 wimifarma-comissao-app wimifarma-comissao-db
curl -fsS http://127.0.0.1:3002/comissao/health
```

Antes de publicar, validar criacao/edicao de indicador e cupom, bloqueios de status/data, confirmacao idempotente, um lancamento de comissao e um de XP, pagamento parcial, cancelamento com estorno, ownership do usuario comum e cupom termico sem comissao.
