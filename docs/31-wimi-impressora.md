# 31 - Wimi Impressora

## Objetivo

`Wimi Impressora` conecta a Bematech MP-4200 TH de um computador Windows ao Cashback hospedado no VPS. Os outros computadores nao acessam a USB nem precisam estar na mesma rede: enviam o comprovante para a fila HTTPS e o agente instalado no PC da impressora consulta essa fila.

Nos comprovantes existe somente o botao `Imprimir`: quando a Wimi Impressora esta online no momento em que o comprovante abre, ele envia para a fila HTTPS; sem agente online, abre imediatamente o dialogo de impressao deste computador. Se ocorrer uma falha de rede ou resposta incerta depois de tentar a fila, o sistema nao abre a impressao local automaticamente, evitando cupom duplicado.

O modelo termico prioriza leitura no balcao: validade, WhatsApp, endereco, atendente e data/hora usam fonte ampliada e em negrito. A Wimi Impressora reserva altura adicional para esse rodape sem cortar informacoes.
O agente `1.0.4` imprime o codigo recebido como texto e suporta tanto os comprovantes historicos de quatro digitos quanto as novas emissoes de cinco digitos, sem recalcular ou alterar o voucher.
O payload `purchase` inclui `client_code`, derivado de `cashback_clients.id`, e o mostra em destaque junto de nome e telefone. O payload `quick_voucher` permanece sem `client_code`, porque a emissao rapida pode ser anonima.
O Cashback `1.4.0` renova os assets da interface, mostra o comprovante da compra inicial dentro de `Novo cliente` e explicita a busca por codigo do cliente.

## Acesso

- O card da Home e `/cashback/impressora.php` aparecem somente para o username exato `adm`.
- Qualquer usuario autenticado no Cashback pode enviar um comprovante ja autorizado na propria sessao para a impressora conectada.
- Download, teste, revogacao e reimpressao manual exigem sessao `adm` e CSRF.

## Instalacao no computador da Bematech

1. Entrar na Home com `adm` e abrir `Wimi Impressora`.
2. Clicar em `Baixar instalador`.
3. Abrir o EXE baixado e confirmar o controle de conta do Windows.
4. Conferir o comprovante de teste.

O download recebe o nome `WimiImpressoraSetup--<ticket>.exe`. O ticket tem 32 bytes aleatorios, fica salvo no Postgres somente como SHA-256, vale 30 minutos e e consumido uma unica vez. Renomear o arquivo antes da primeira instalacao remove o pareamento automatico; nesse caso deve-se baixar outro.

O agente:

- procura nomes contendo `MP-4200 TH`, `MP-4200`, `Bematech` ou `Elgin`;
- depende do driver da impressora ja instalado no Windows;
- copia o executavel para `C:\Program Files\Wimifarma\Wimi Impressora\WimiImpressora.exe`;
- salva configuracao em `C:\ProgramData\Wimifarma\Wimi Impressora\config.json`;
- cifra o token do dispositivo com DPAPI `LocalMachine`;
- registra o servico `WimiImpressora` com inicio atrasado automatico e recuperacao por reinicio;
- usa apenas conexoes HTTPS de saida para `https://wimifarma.com/cashback`;
- nao abre porta local nem exige regra de firewall ou rede compartilhada.

## Fila e garantias

Tabelas:

- `cashback_print_devices`: computador, impressora, versao, token com hash, sinal e revogacao;
- `cashback_print_pairing_tickets`: downloads de uso unico e expiracao;
- `cashback_print_jobs`: payload estruturado e estados da fila.

Estados do trabalho:

- `pending`: aguardando agente;
- `printing`: reservado pelo agente com `FOR UPDATE SKIP LOCKED`;
- `printed`: enviado com sucesso ao spooler do Windows;
- `failed`: driver ou spooler recusou o trabalho;
- `uncertain`: o agente foi interrompido depois de reservar o trabalho;
- `cancelled`: dispositivo foi revogado antes da impressao.

Um trabalho `uncertain` ou `failed` nao e impresso novamente sozinho. O ADM deve conferir o papel e usar `Reimprimir`. Isso reduz o risco de cupom duplicado. Depois de o Windows aceitar um trabalho, o agente mantem o registro local e repete somente a confirmacao ao servidor; ele nao registra essa situacao como falha nem puxa outro cupom antes de a confirmacao. `printed` nao prova que o papel saiu fisicamente; prova que o driver/spooler aceitou.

Os payloads aceitos sao fechados: `quick_voucher`, `purchase` e `test`. O agente nao executa comandos arbitrarios recebidos do servidor.

## Atualizacao

O agente consulta a versao periodicamente. Quando existe versao maior:

1. baixa o EXE pelo endpoint autenticado;
2. confere o SHA-256 informado pelo servidor;
3. inicia o atualizador local;
4. para o servico, substitui o executavel e inicia novamente.

O projeto ainda nao possui certificado comercial de assinatura de codigo. Por isso o Windows pode mostrar SmartScreen na primeira instalacao, mesmo com a verificacao SHA-256 usada nas atualizacoes. Assinar Authenticode e o hardening recomendado antes de distribuir fora da farmacia.

Desde a versao `1.0.2`, o agente le a propria versao do assembly, evitando divergencia entre o identificador enviado ao servidor e o EXE publicado. A versao `1.0.3` reforca a tipografia menor de validade, contato, endereco, atendente e data/hora na impressao termica.

## Build local

Requer .NET SDK 8. O runtime nao basta.

```powershell
cd apps\wimi-impressora
dotnet restore WimiImpressora.csproj
dotnet build WimiImpressora.csproj -c Release
dotnet publish WimiImpressora.csproj -c Release -r win-x64 --self-contained true -o ..\..\wimi-printer-release
```

O resultado publicado e `wimi-printer-release/WimiImpressoraSetup.exe`. `bin/`, `obj/` e `wimi-printer-release/` sao ignorados pelo Git.
O projeto ativa os analisadores recomendados e trata warnings como erro; corrija a causa de qualquer novo aviso, sem desativar a regra.

Validacao visual sem instalar servico:

```powershell
dotnet apps\wimi-impressora\bin\Release\net8.0-windows\win-x64\WimiImpressoraSetup.dll --render-preview "$env:TEMP\wimi-cupom.png"
dotnet apps\wimi-impressora\bin\Release\net8.0-windows\win-x64\WimiImpressoraSetup.dll --render-preview "$env:TEMP\wimi-compra.png" purchase
```

## Deploy

O Compose monta `./wimi-printer-release` como `/opt/wimi-impressora` somente leitura no container do Cashback. O EXE nao passa pelo Git.

No deploy:

1. publicar o agente localmente;
2. criar `wimi-printer-release/` no projeto oficial do VPS;
3. enviar somente `WimiImpressoraSetup.exe` para essa pasta;
4. definir `WIMI_PRINTER_INSTALLER_VERSION` com a mesma `<Version>` do projeto .NET;
5. rebuildar `wimifarma-cashback-app` e `wimifarma-com-web` quando a Home mudar;
6. conferir `/cashback/health`, painel ADM, download protegido e teste fisico.

Nunca versionar EXE, token, `config.json` do agente ou arquivos de `ProgramData`.

## Testes obrigatorios

- `npm run check` e `npm run build` em `apps/cashback`;
- build .NET sem warnings;
- duas previews PNG sem corte ou sobreposicao;
- `php -l site/home.php`;
- `node --check site/cashback/app.js`;
- `docker compose config`;
- card invisivel para usuario comum e visivel para `adm`;
- download sem `adm` recusado;
- ticket usado/expirado recusado;
- pareamento, heartbeat, claim e conclusao autenticados;
- impressao fisica na MP-4200 TH, reinicio do Windows e retorno automatico do servico;
- simulacao de interrupcao para confirmar estado `uncertain` sem reimpressao automatica.
