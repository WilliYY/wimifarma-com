# 32 - Auditoria Cashback - 2026-07-24

## Escopo e criterio

Auditoria tecnica do Cashback Node/Postgres, vouchers rapidos e da integracao Wimi Impressora. Foram revisados controles de sessao, CSRF, autorizacao, transacoes de compra/resgate, validade, codigos, fila de impressao, dependencias e o estado operacional do VPS.

Este documento nao registra senhas, tokens, numeros de clientes ou valores de producao.

## Validado

- O VPS respondeu `200` em `/cashback/health`; Postgres Cashback e Core estavam acessiveis.
- A navegacao publica redireciona HTTP para HTTPS e a resposta HTTPS possui HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
- Sem sessao, o dashboard e a consulta de codigo rapido redirecionam para a Home; o resumo interno recusou chamada sem token com `401`.
- A verificacao somente leitura do Postgres retornou zero creditos negativos, zero saldo maior que o original, zero compras com valor inconsistente, zero divergencias entre resgates e itens, zero codigos rapidos duplicados e zero vouchers ativos expirados ou com validade diferente de seis meses.
- O resgate comum usa transacao e `FOR UPDATE` dos creditos; o voucher rapido usa lock de transacao antes de ser consumido. O codigo de quatro digitos nao e reutilizado.
- A fonte passou em `npm run check`, `npm run build`, `node --check` e `git diff --check`.
- O agente Wimi foi compilado sem avisos, tem atualizacao autenticada por HTTPS com verificacao SHA-256 e armazena o token local com DPAPI `LocalMachine`.
- As duas previsualizacoes termicas foram conferidas, sem corte visual: voucher rapido e comprovante de compra.

## Achados

### P1 - Endpoint publico de health executa DDL de esquema

`/cashback/health` chama `ensureSchema()` em [server.ts](../apps/cashback/src/server.ts#L225), e essa rotina inclui `ALTER TABLE`, recriacao de constraints e indices em [server.ts](../apps/cashback/src/server.ts#L1671). Como o health e publico, monitoramentos ou chamadas repetidas podem disputar locks com vendas e resgates.

**Recomendacao:** deixar `ensureSchema()` somente no startup/deploy, registrar versao de migracao e manter o health estritamente somente leitura.

### P1 - Backups de `.env` permanecem dentro da pasta oficial do VPS

Foram encontrados cinco arquivos `/.env.codex-backup-*` nao versionados em `/home/ubuntu/projetos/wimifarma-com`. As permissoes estao restritas a dono (`0600`), mas esses arquivos provavelmente contem configuracoes sensiveis e ficam no mesmo diretorio usado pelo deploy.

**Recomendacao:** antes de mover, confirmar se possuem dados unicos; depois arquivar fora do projeto com permissao restrita e manter somente o `.env` operacional. Nao apagar sem backup confirmado.

### P2 - Cookie de sessao nao exige transporte HTTPS explicitamente

A sessao `WFCASHBACK` usa `httpOnly` e `sameSite=lax`, mas esta com `secure: false` em [server.ts](../apps/cashback/src/server.ts#L194). O redirecionamento HTTP e o HSTS reduzem o risco, porem a flag `Secure` continua sendo a defesa correta para nao enviar o cookie em HTTP.

**Recomendacao:** configurar `trust proxy` para o proxy reverso conhecido e ativar `secure: true` em producao, validando primeiro o login e o SSO atras do proxy.

### P2 - Instalador Wimi ainda nao possui assinatura Authenticode

O EXE publicado localmente e de arquivo unico, mas esta `NotSigned`. O hash SHA-256 protege a atualizacao pelo agente, porem o Windows pode exibir SmartScreen na primeira instalacao.

**Recomendacao:** adquirir/configurar certificado de assinatura de codigo antes de distribuir o instalador fora do computador controlado da farmacia. A orientacao operacional esta em [docs/31-wimi-impressora.md](31-wimi-impressora.md#L56).

### P3 - Dependencia indireta com alerta baixo

`npm audit --omit=dev` encontrou `body-parser@1.20.5` com alerta baixo de limite invalido. O Cashback define limites validos de `1mb` nos parsers; ainda assim a atualizacao do Express/body-parser deve entrar na proxima manutencao de dependencias.

### P3 - Limites operacionais para acompanhar

- O codigo de voucher tem quatro digitos e nao pode ser reutilizado por seguranca. A capacidade e de 10.000 emissoes permanentes; atualmente a producao tem 8. Deve haver alerta operacional antes de aproximar desse limite. Veja [server.ts](../apps/cashback/src/server.ts#L132).
- Se houver mais de uma Wimi Impressora online, a fila escolhe a que enviou sinal mais recente. Hoje isso atende ao unico computador da Bematech, mas o proximo passo deve ser definir uma impressora principal ou permitir escolha do destino. Veja [server.ts](../apps/cashback/src/server.ts#L2317).

## Wimi Impressora antes do deploy

- O agente agora preserva o journal e repete somente a confirmacao ao servidor depois de o Windows aceitar o trabalho, evitando converter uma impressao ja enviada em `failed` por instabilidade de rede. Veja [AgentWorker.cs](../apps/wimi-impressora/AgentWorker.cs#L73).
- Trabalhos em estado incerto continuam sem reimpressao automatica; o ADM decide reimprimir depois de conferir o papel.
- Uma reinstalacao nao falha apenas porque o servico Windows ja esta em execucao. Veja [Installer.cs](../apps/wimi-impressora/Installer.cs#L137).
- O VPS ainda estava na versao `1.1.5`, sem o EXE nem as tabelas de impressao. Isso e esperado antes do deploy desta entrega.

## Testes pendentes apos publicar

1. Entrar com `adm`, confirmar que o card aparece apenas para ele e baixar o instalador.
2. Executar o EXE no PC com a Bematech MP-4200 TH e conferir o cupom de teste.
3. Reiniciar o computador da impressora e confirmar retorno automatico do servico.
4. Gerar voucher rapido e compra com dados reais de teste; conferir fila, papel e auditoria.
5. Simular perda de internet depois de enviar ao spooler e conferir que o job nao e reimpresso automaticamente.
