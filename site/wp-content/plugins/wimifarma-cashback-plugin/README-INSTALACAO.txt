WIMIFARMA CASHBACK
README-INSTALACAO
Versao: 1.1.0

==================================================
1. VISAO GERAL
==================================================

Este projeto foi criado para WordPress tradicional, sem build obrigatorio, sem React, sem Node para rodar e com upload manual dos arquivos.

Entrega principal:
- plugin: /wimifarma-cashback-plugin
- tema opcional: /wimifarma-cashback-theme

Requisitos minimos recomendados:
- WordPress 6.x
- PHP 8.0 ou superior
- MySQL 5.7+ ou MariaDB compativel
- HTTPS ativo no dominio
- WP-Cron habilitado

==================================================
2. INSTALACAO DO PLUGIN
==================================================

Opcao A: upload por ZIP no painel WordPress
1. Compacte a pasta "wimifarma-cashback-plugin" em .zip.
2. No WordPress, acesse Plugins > Adicionar novo > Enviar plugin.
3. Envie o .zip.
4. Ative o plugin "Wimifarma Cashback".

Opcao B: upload manual pela HostGator / FTP
1. Envie a pasta "wimifarma-cashback-plugin" para:
   /public_html/wp-content/plugins/
2. No painel WordPress, va em Plugins.
3. Ative o plugin "Wimifarma Cashback".

O que acontece na ativacao:
- criacao das tabelas proprias do plugin
- criacao das roles/capabilities
- agendamento da rotina diaria de cron
- carga das configuracoes padrao

==================================================
3. INSTALACAO DO TEMA OPCIONAL
==================================================

O tema e opcional.
Use apenas se quiser paginas publicas dedicadas para login e consulta.

Passos:
1. Envie a pasta "wimifarma-cashback-theme" para:
   /public_html/wp-content/themes/
2. Ative o tema no painel WordPress, se desejar.
3. Crie paginas no WordPress e associe os templates:
   - "Login Wimifarma Cashback"
   - "Consulta Cashback Wimifarma"

Se nao quiser usar o tema:
- mantenha o tema atual
- use os shortcodes do plugin nas paginas existentes

Shortcodes:
- [wfwc_login_form]
- [wfwc_client_lookup]

==================================================
4. CONFIGURACAO INICIAL NA HOSTGATOR
==================================================

Checklist recomendado:
1. Ativar HTTPS no dominio wimifarma.com.
2. Conferir se WP-Cron esta funcionando.
3. Garantir que o WordPress consiga fazer requisicoes externas para os webhooks do n8n.
4. Manter backups automaticos do banco.
5. Testar permissoes de upload do plugin e tema.

Se o WP-Cron estiver inconsistente na hospedagem:
- configure um cron real da HostGator chamando wp-cron.php periodicamente
- recomendacao: a cada 15 minutos

==================================================
5. PRIMEIRO ACESSO ADMINISTRATIVO
==================================================

Apos ativar o plugin:
1. Entre com um usuario administrador do WordPress.
2. No menu lateral, abra "Wimifarma Cashback".
3. Acesse Configuracoes.
4. Revise:
   - percentual de cashback
   - validade em dias
   - multiplicador minimo para uso
   - webhooks do n8n
   - retry automatico
   - mensagens padrao

==================================================
6. COMO CADASTRAR O PRIMEIRO ATENDENTE
==================================================

1. Va em Wimifarma Cashback > Atendentes.
2. Preencha:
   - nome
   - status ativo
   - usuario WordPress vinculado (opcional)
   - observacoes
3. Salve.

Observacao:
- o cadastro de atendente e operacional
- o login administrativo continua sendo feito pelo usuario WordPress

==================================================
7. COMO CADASTRAR O PRIMEIRO CLIENTE
==================================================

1. Va em Wimifarma Cashback > Clientes.
2. Preencha:
   - nome do cliente
   - telefone, se houver
   - data de nascimento, se houver
   - atendente responsavel
   - observacoes
3. Salve.

O cliente pode existir sem telefone.
Nesse caso, a localizacao continua possivel por:
- nome
- ID interno

==================================================
8. COMO TESTAR UMA COMPRA
==================================================

1. Va em Wimifarma Cashback > Compras.
2. Selecione o cliente.
3. Informe:
   - valor da compra
   - data/hora da compra
   - atendente
   - observacao
4. Se desejar, preencha o campo de uso de cashback.
5. Salve.

Resultado esperado:
- compra registrada
- cashback gerado automaticamente
- credito com validade de 45 dias por padrao
- envio do evento de compra para o webhook, se configurado
- log de sucesso ou falha com referencia do evento

==================================================
9. COMO CONFIGURAR WEBHOOKS DO N8N
==================================================

No WordPress:
1. Va em Wimifarma Cashback > Configuracoes.
2. Preencha:
   - URL webhook compra
   - URL webhook aniversario
   - URL webhook expiracao
   - token/chave, se seu fluxo exigir autenticacao
   - tentativas maximas de retry
   - intervalo entre retries
3. Ative as automacoes desejadas.
4. Salve.

Envelope enviado:
- event
- source
- sent_at
- message
- reference
- meta
- data

Eventos:
- purchase_registered
- cashback_expiration_alert
- client_birthday

Documentacao tecnica detalhada:
- /project-context/n8n-webhooks.md
- /project-context/n8n-flow-examples.md
- /project-context/webhook-payload-examples.json

==================================================
10. RETRY AUTOMATICO
==================================================

O plugin pode repetir automaticamente webhooks com falha.

Comportamento:
- falha de rede ou HTTP nao 2xx gera log com status failed
- se retry estiver ativo, o plugin agenda novo envio via WP-Cron
- o limite e o intervalo sao configuraveis
- o payload inclui:
  - meta.attempt_number
  - meta.max_attempts
  - reference

==================================================
11. ROLES E PERMISSOES
==================================================

Roles criadas:
- wimifarma_gerente
- wimifarma_atendente

Capabilities principais:
- view_wimifarma_cashback
- manage_wimifarma_cashback
- manage_wimifarma_cashback_settings
- view_wimifarma_cashback_reports
- view_wimifarma_cashback_logs

==================================================
12. TABELAS CRIADAS NO BANCO
==================================================

Prefixo:
- wp_wfwc_...

Tabelas:
- attendants
- clients
- purchases
- cashback_credits
- cashback_usages
- logs

==================================================
13. OBSERVACOES FINAIS
==================================================

- O plugin usa a estrutura do proprio WordPress.
- Nao depende de build.
- Foi pensado para upload manual e manutencao simples.
- Antes de subir em producao, faca um teste completo em homologacao.
- Se precisar de evolucoes futuras, consulte a pasta project-context.
