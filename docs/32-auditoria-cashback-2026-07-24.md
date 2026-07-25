# 32 - Auditoria Cashback - 2026-07-24

> Nota de 2026-07-25: a arquitetura `Wimi Impressora` auditada abaixo foi retirada. Card, estacao web, agente e fila nao estao mais ativos; a impressao atual e local pelo navegador. O restante deste documento permanece como registro historico da auditoria feita em 24/07.

## Escopo e criterio

Auditoria tecnica do Cashback Node/Postgres, vouchers rapidos e da integracao Wimi Impressora. Foram revisados controles de sessao, CSRF, autorizacao, transacoes de compra/resgate, validade, codigos, fila de impressao, dependencias e o estado operacional do VPS.

Este documento nao registra senhas, tokens, numeros de clientes ou valores de producao.

## Validado

- O VPS respondeu `200` em `/cashback/health`; Postgres Cashback e Core estavam acessiveis.
- A navegacao publica redireciona HTTP para HTTPS e a resposta HTTPS possui HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
- Sem sessao, o dashboard e a consulta de codigo rapido redirecionam para a Home; o resumo interno recusou chamada sem token com `401`.
- A verificacao somente leitura do Postgres retornou zero creditos negativos, zero saldo maior que o original, zero compras com valor inconsistente, zero divergencias entre resgates e itens, zero codigos rapidos duplicados e zero vouchers ativos expirados ou com validade diferente de seis meses.
- O resgate comum usa transacao e `FOR UPDATE` dos creditos; o voucher rapido usa lock de transacao antes de ser consumido. Novas emissoes usam cinco digitos e uma combinacao so pode ser reutilizada depois de `expires_at`.
- A fonte passou em `npm run check`, `npm run build`, `node --check` e `git diff --check`; o TypeScript agora verifica declaracoes de dependencias e rejeita locais/parametros sem uso.
- `npm audit` ficou com zero alertas depois da atualizacao pontual de `body-parser@1.20.6`.
- O agente Wimi foi compilado com analisadores recomendados e warnings tratados como erro. Nao ha pacote NuGet depreciado, vulneravel ou desatualizado dentro da linha .NET 8.
- O agente tem atualizacao autenticada por HTTPS com verificacao SHA-256 e armazena o token local com DPAPI `LocalMachine`.
- As duas previsualizacoes termicas foram conferidas, sem corte visual: voucher rapido e comprovante de compra.

## Pontos fortes

- CSRF em formularios e APIs de sessao, consultas SQL parametrizadas e autorizacao separada para endpoints internos e do agente.
- Compras, resgates e vouchers usam transacoes e locks; a fila nao reimprime automaticamente estados incertos.
- Segredos ficam fora do Git, o token do agente usa hash no servidor e DPAPI no Windows, e atualizacoes exigem HTTPS mais SHA-256.
- Validade de seis meses e consumo integral do voucher rapido sao validados novamente no backend, sem depender da interface.
- Build estrito passa sem warnings em TypeScript e .NET.

## Corrigido nesta manutencao

### P1 - Health publico executava DDL

Resolvido. `/cashback/health` nao chama mais `ensureSchema()`: migracoes continuam no startup e no endpoint interno autenticado. As contagens preservadas no contrato do health usam cache de 30 segundos, reduzindo varreduras repetidas, e falhas publicas nao exibem detalhes internos do banco.

### P2 - Cookie de sessao sem `Secure`

Resolvido no codigo. Em producao, `WFCASHBACK` usa `Secure`, `HttpOnly` e `SameSite=Lax`; o app confia explicitamente em dois saltos do proxy e permite sobrescrita apenas por variavel de ambiente para testes HTTP. O startup recusa segredo padrao/curto e configuracao incompativel entre cookie seguro e proxy.

### P2 - Versao interna do agente divergente

Resolvido. O EXE `1.0.1` ainda se identificava por `AppConstants.Version` como `1.0.0`, o que poderia provocar tentativa recorrente de autoatualizacao. A versao `1.0.2` deriva diretamente da versao do assembly, o manifesto foi alinhado e o Compose publica a mesma versao.

### P3 - Dependencia indireta com alerta baixo

Resolvido sem troca de major: `body-parser` passou de `1.20.5` para `1.20.6`, removendo o alerta de limite invalido. Os parsers continuam com limite explicito de `1mb`.

### P3 - Warnings e comportamento dependente da regiao

Resolvido. Foram removidos helpers TypeScript sem uso, os logs frequentes do servico usam delegates `LoggerMessage`, metodos criptograficos sem estado viraram estaticos e datas usam cultura explicita. Os analisadores permanecem ativos; nenhum aviso foi suprimido.

### P1 - Backups de `.env` dentro da pasta oficial do VPS

Resolvido sem apagar dados. Os cinco arquivos `/.env.codex-backup-*` foram movidos para `/home/ubuntu/projetos/_arquivados-wimifarma/2026-07-24/env-backups`, fora do projeto oficial, preservados com permissao `0600`. A pasta de deploy ficou sem esses backups.

## Pendencias e fragilidades

### P2 - Instalador Wimi sem assinatura Authenticode

Resolvido pela retirada do binario do fluxo operacional. O painel nao oferece mais EXE, o Compose nao monta `wimi-printer-release/` e os endpoints antigos de download/atualizacao respondem retirada/migracao. A Estacao Web usa somente Chrome, cookie seguro e um atalho `.cmd` transparente sem segredo ou elevacao. O codigo do agente antigo permanece no repositorio apenas como historico/compatibilidade e nao deve voltar a ser distribuido sem assinatura.

### P3 - Limites operacionais para acompanhar

- O codigo novo possui cinco digitos e capacidade de 100.000 combinacoes simultaneamente reservadas. A capacidade deixou de ser um limite vitalicio: depois dos seis meses, a combinacao volta ao sorteio. Acompanhar apenas a quantidade de codigos com `expires_at >= CURRENT_DATE`; status usado ou cancelado nao libera o numero antes da data.
- Se houver mais de uma Wimi Impressora online, a fila prioriza transporte `web` e, entre estacoes do mesmo tipo, escolhe o sinal mais recente. O painel deve ser usado para revogar estacoes antigas e manter um unico computador operacional.
- O navegador nao consegue confirmar papel, corte ou resultado fisico. `printed` significa fim do fluxo de impressao do Chrome; conferencia do papel continua obrigatoria em falha ou duvida.

## Wimi Impressora Web antes do deploy

- A estacao usa cookie de dispositivo separado da sessao administrativa, HMAC CSRF, CSP com nonce e `Cache-Control: private, no-store`.
- Web Locks impedem duas abas do mesmo dispositivo de consumir simultaneamente a fila.
- O claim continua transacional com `FOR UPDATE SKIP LOCKED`.
- Trabalhos em estado incerto continuam sem reimpressao automatica; o ADM decide reimprimir depois de conferir o papel.
- O atalho web nao usa PowerShell, registro, tarefa agendada, processo oculto ou permissao de administrador.
- O transporte web e priorizado sobre eventual agente legado ainda online.

## Testes pendentes apos publicar

1. Entrar com `adm`, confirmar que o card aparece apenas para ele e ativar o Chrome da Bematech.
2. Baixar/inspecionar o atalho web e conferir que abre somente a URL oficial com `--kiosk-printing`.
3. Colocar o atalho em `shell:startup`, reiniciar o computador e confirmar retorno da estacao.
4. Gerar voucher rapido e compra com dados reais de teste; conferir fila, papel e auditoria.
5. Fechar a estacao durante um teste controlado e conferir `uncertain` sem reimpressao automatica.
6. Abrir duas abas e confirmar que somente uma consome a fila.
