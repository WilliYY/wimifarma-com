# 31 - Wimi Impressora Web

## Objetivo

`Wimi Impressora Web` conecta a fila HTTPS do Cashback ao Chrome aberto no computador da Bematech MP-4200 TH. Nao existe EXE, servico do Windows, porta local, compartilhamento de rede ou atualizador nativo.

Os outros computadores continuam usando somente o botao `Imprimir`. Quando a estacao web esta online, o comprovante entra na fila central; sem estacao online, o sistema abre imediatamente a impressao do computador atual. Uma resposta incerta depois de tentar a fila nunca abre uma segunda via local automaticamente.

O Chrome usa a impressora padrao do Windows. Com o atalho web fornecido pelo painel, ele abre em modo aplicativo com `--kiosk-printing`; sem o atalho, a mesma pagina funciona, mas o Chrome mostra o dialogo normal de impressao.

## Papel e area util

No rolo termico, `80x40` normalmente significa 80 mm de largura por 40 m de comprimento, nao uma etiqueta fixa de 80 x 40 mm. O comprovante usa altura variavel conforme os dados.

Tanto a estacao web quanto a impressao local usam a mesma geometria: papel de 80 mm, bloco externo de 76 mm, margens laterais de 2 mm e area interna util de 72 mm. A logo usa 48 mm; valor, codigo e validade ocupam a hierarquia principal, enquanto contato e emissor ficam compactos e legiveis. No driver da Bematech, manter papel continuo de 80 mm, escala 100%, margens desativadas e cabecalho/rodape do navegador desligados.

## Acesso

- O card da Home e `/cashback/impressora.php` aparecem somente para o username normalizado exato `adm`.
- Ativar, renovar, baixar o atalho, testar, revogar e reimprimir exigem sessao `adm` e CSRF.
- Qualquer usuario autenticado no Cashback pode enviar para a fila somente um comprovante cujo ID foi autorizado na sessao que concluiu a operacao.
- Depois da ativacao, `/cashback/internal/print-station` usa uma credencial exclusiva de dispositivo e nao depende de manter a sessao administrativa aberta.

## Ativacao no computador da Bematech

1. Instalar o driver normal da Bematech e deixa-la como impressora padrao do Windows.
2. Abrir a Home no Google Chrome com o login `adm` e entrar em `Wimi Impressora`.
3. Baixar `Iniciar Wimi Impressora Web.cmd` e abri-lo.
4. Na janela exclusiva que abrir, entrar como `adm`, voltar a `Wimi Impressora`, informar um nome e clicar em `Ativar este navegador`.
5. Manter a tela `Estacao de impressao` aberta.
6. Voltar ao painel ADM em outra janela e usar `Imprimir teste`.

A ativacao grava no navegador um cookie `WFWIMIPRINT` com `HttpOnly`, `SameSite=Strict`, escopo `/cashback`, validade de um ano e `Secure` em producao. O token bruto nao entra em log nem no Postgres; o banco recebe somente SHA-256.

Revogar a estacao remove o hash do banco, cancela apenas trabalhos ainda `pending` e invalida imediatamente o navegador. Trabalhos ja reservados continuam como `printing` e, se nao forem concluidos, viram `uncertain`.

## Atalho web e inicio com o Windows

`Baixar atalho web` entrega `Iniciar Wimi Impressora Web.cmd`. O arquivo:

- procura o Google Chrome nos caminhos padrao do Windows;
- abre somente `https://wimifarma.com/cashback/internal/print-station`;
- usa um perfil exclusivo em `%LocalAppData%\WimiFarma\ImpressoraWeb\ChromeProfile`, evitando que o Chrome comum ignore `--kiosk-printing` quando ja estiver aberto;
- usa `--app`, `--kiosk-printing`, `--start-maximized` e `--no-first-run`;
- nao contem token, senha, Base64, PowerShell, tarefa agendada, registro, elevacao ou processo oculto;
- cria somente a pasta local do perfil do Chrome; nao instala programa nem altera configuracao do Windows.

Para iniciar junto com o Windows, coloque uma copia do `.cmd` na pasta aberta por `Win + R` e `shell:startup`. A ativacao deve ser feita dentro da janela aberta por esse atalho. Atualizacoes da interface e da logica chegam pelo servidor no proximo carregamento; nao ha arquivo local para atualizar.

## Fila e garantias

Tabelas preservadas:

- `cashback_print_devices`: estacao, transporte `web` ou `agent` legado, hash do token, sinal e revogacao;
- `cashback_print_pairing_tickets`: historico de pareamentos do agente antigo, sem novos downloads;
- `cashback_print_jobs`: payload estruturado e estados da fila.

Estados:

- `pending`: aguardando uma estacao;
- `printing`: reservado com `FOR UPDATE SKIP LOCKED`;
- `printed`: a janela de impressao do navegador terminou;
- `failed`: falha registrada por agente legado;
- `uncertain`: a estacao foi fechada, caiu ou nao confirmou o fim em ate 15 minutos;
- `cancelled`: dispositivo revogado antes de reservar o trabalho.

A estacao usa Web Locks para permitir somente uma aba consumindo a fila por dispositivo. Uma segunda aba fica aguardando a primeira liberar a trava.

Um trabalho `uncertain` ou `failed` nunca volta sozinho para `pending`. O ADM confere o papel e decide usar `Reimprimir`. `printed` significa que o navegador concluiu o fluxo de impressao; a Web nao consegue provar que houve papel, tinta termica ou corte fisico.

Os payloads continuam fechados em `quick_voucher`, `purchase` e `test`. O navegador nao recebe nem executa comando arbitrario. O comprovante de compra mostra nome, telefone, codigo permanente do cliente, cashback gerado, novo codigo quando houver, validade, contato, endereco, atendente e operacao. Voucher rapido anonimo continua sem nome e codigo de cliente.

## Seguranca da estacao

- autenticacao por cookie de dispositivo separado de `WFCASHBACK`;
- token aleatorio de 32 bytes, armazenado no servidor somente como SHA-256;
- CSRF derivado por HMAC do segredo do Cashback e do token do dispositivo;
- `SameSite=Strict`, conferencia de `Sec-Fetch-Site` e chamadas `fetch` somente para a mesma origem;
- CSP exclusiva da pagina com nonce para script e estilo;
- `Cache-Control: private, no-store`;
- payload montado no DOM com `textContent`, sem inserir dados operacionais como HTML;
- heartbeat e fila usam somente HTTPS de saida;
- revogacao pelo `adm` sem precisar acessar o computador fisicamente.

O cookie da estacao permite imprimir os jobs destinados ao dispositivo, por isso o perfil do Chrome desse computador deve permanecer restrito ao balcao. Se o computador for perdido ou trocado, revogue a estacao no painel.

## Compatibilidade com o agente antigo

As APIs Bearer do agente antigo permanecem temporariamente para nao interromper uma maquina que ainda esteja conectada. Novos instaladores, downloads e atualizacoes EXE foram retirados. O endpoint antigo de download responde `410`, e o endpoint de atualizacao informa a migracao para a estacao web.

Quando uma estacao web e um agente legado estiverem online, a fila nova prioriza a estacao web. Registros, jobs e auditorias antigas nao sao apagados.

## Deploy

O Cashback `1.6.1` nao monta `wimi-printer-release/` e nao usa `WIMI_PRINTER_INSTALLER_PATH` ou `WIMI_PRINTER_INSTALLER_VERSION`.

Configuracao opcional:

```env
WIMI_PRINTER_PUBLIC_STATION_URL=https://wimifarma.com/cashback/internal/print-station
```

Deploy:

```powershell
npm run check --prefix apps/cashback
npm test --prefix apps/cashback
node --check site/cashback/app.js
docker compose config
```

No VPS, rebuildar `wimifarma-cashback-app` e `wimifarma-com-web`, conferir `/cashback/health`, ativar o Chrome da Bematech e realizar um teste fisico controlado.

## Testes obrigatorios

- card invisivel para usuario comum e visivel somente para `adm`;
- ativacao recusada sem `adm` ou sem CSRF;
- cookie com `HttpOnly`, `SameSite=Strict`, `Secure` e escopo correto;
- heartbeat, claim e conclusao recusados sem cookie ou HMAC CSRF;
- duas abas nao consomem simultaneamente a mesma fila;
- claim concorrente nao duplica job;
- fechamento durante impressao resulta em `uncertain`;
- job `uncertain` nao e reimpresso automaticamente;
- atalho nao contem segredo nem comando de instalacao/elevacao;
- impressao fisica na MP-4200 TH com cupom rapido, compra identificada e teste;
- reinicio do Windows com o atalho em `shell:startup`;
- revogacao da estacao bloqueia o navegador sem apagar historico.
