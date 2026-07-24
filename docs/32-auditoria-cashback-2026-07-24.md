# 32 - Auditoria Cashback - 2026-07-24

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

### P2 - Instalador Wimi ainda nao possui assinatura Authenticode

O EXE publicado localmente e de arquivo unico, mas esta `NotSigned`. O hash SHA-256 protege a atualizacao pelo agente, porem o Windows pode exibir SmartScreen na primeira instalacao.

**Recomendacao:** adquirir/configurar certificado de assinatura de codigo antes de distribuir o instalador fora do computador controlado da farmacia. A orientacao operacional esta em [docs/31-wimi-impressora.md](31-wimi-impressora.md#L56).

### P3 - Limites operacionais para acompanhar

- O codigo novo possui cinco digitos e capacidade de 100.000 combinacoes simultaneamente reservadas. A capacidade deixou de ser um limite vitalicio: depois dos seis meses, a combinacao volta ao sorteio. Acompanhar apenas a quantidade de codigos com `expires_at >= CURRENT_DATE`; status usado ou cancelado nao libera o numero antes da data.
- Se houver mais de uma Wimi Impressora online, a fila escolhe a que enviou sinal mais recente. Hoje isso atende ao unico computador da Bematech, mas o proximo passo deve ser definir uma impressora principal ou permitir escolha do destino. Veja [server.ts](../apps/cashback/src/server.ts#L2317).

## Wimi Impressora antes do deploy

- O agente agora preserva o journal e repete somente a confirmacao ao servidor depois de o Windows aceitar o trabalho, evitando converter uma impressao ja enviada em `failed` por instabilidade de rede. Veja [AgentWorker.cs](../apps/wimi-impressora/AgentWorker.cs#L73).
- Trabalhos em estado incerto continuam sem reimpressao automatica; o ADM decide reimprimir depois de conferir o papel.
- Uma reinstalacao nao falha apenas porque o servico Windows ja esta em execucao. Veja [Installer.cs](../apps/wimi-impressora/Installer.cs#L137).
- A versao do agente agora tem uma unica fonte no assembly; `AppConstants.Version` nao deve voltar a ser literal separado.

## Testes pendentes apos publicar

1. Entrar com `adm`, confirmar que o card aparece apenas para ele e baixar o instalador.
2. Executar o EXE no PC com a Bematech MP-4200 TH e conferir o cupom de teste.
3. Reiniciar o computador da impressora e confirmar retorno automatico do servico.
4. Gerar voucher rapido e compra com dados reais de teste; conferir fila, papel e auditoria.
5. Simular perda de internet depois de enviar ao spooler e conferir que o job nao e reimpresso automaticamente.
