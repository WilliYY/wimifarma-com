WIMIFARMA CASHBACK
README-USO
Versao: 1.1.0

==================================================
1. COMO CADASTRAR CLIENTE
==================================================

Menu:
Wimifarma Cashback > Clientes

Passos:
1. Preencha o nome do cliente.
2. Informe telefone, se houver.
3. Informe data de nascimento, se houver.
4. Selecione o atendente responsavel.
5. Adicione observacoes, se necessario.
6. Salve.

O sistema permite localizar cliente por:
- nome
- telefone
- ID interno

==================================================
2. COMO LANCAR COMPRA
==================================================

Menu:
Wimifarma Cashback > Compras

Passos:
1. Selecione o cliente.
2. Informe o valor da compra.
3. Defina a data/hora.
4. Escolha o atendente.
5. Opcionalmente informe o cashback a usar.
6. Salve.

Ao salvar:
- a compra entra no historico
- o cashback e calculado automaticamente
- o saldo disponivel do cliente e atualizado
- o webhook de compra pode ser disparado
- o plugin registra sucesso, falha ou retry automatico

==================================================
3. COMO USAR CASHBACK
==================================================

Fluxo recomendado:
1. Abra o menu "Cashback" ou "Compras".
2. Consulte o saldo disponivel do cliente.
3. Informe o valor da compra atual.
4. Informe quanto de cashback deseja usar.
5. O sistema valida a regra minima automaticamente.

Regra atual:
- para usar R$ 10,00, a compra precisa ser de no minimo R$ 40,00

Se a regra nao for atendida:
- o sistema bloqueia o lancamento

==================================================
4. COMO CONSULTAR SALDO
==================================================

Menu:
Wimifarma Cashback > Cashback

Ao consultar um cliente, o sistema mostra:
- saldo total gerado
- saldo disponivel
- saldo utilizado
- saldo expirado
- cashback proximo de vencer
- proximo vencimento
- compras
- usos
- creditos por validade

==================================================
5. COMO VER RELATORIOS
==================================================

Menu:
Wimifarma Cashback > Relatorios

O relatorio mostra:
- compras no periodo
- cashback gerado
- cashback usado
- cashback expirado
- ranking por atendente
- aniversariantes proximos
- alertas pendentes

==================================================
6. COMO ACOMPANHAR EXPIRACAO
==================================================

Menu:
- Cashback
- Logs de automacao
- Configuracoes

O sistema trata:
- creditos vencendo nos dias configurados
- creditos vencidos
- logs de envio dos alertas

Rotina automatica:
- WP-Cron diario

==================================================
7. COMO ACOMPANHAR WEBHOOKS E RETRIES
==================================================

Menu:
Wimifarma Cashback > Logs de automacao

Voce vera:
- evento disparado
- status
- referencia do evento
- tentativa atual
- codigo de resposta
- resumo da resposta
- data do envio

Se o webhook falhar:
- o plugin pode agendar novo envio automaticamente
- o novo envio reaproveita a mesma reference
- o numero da tentativa sobe em meta.attempt_number

==================================================
8. COMO USAR OS SHORTCODES
==================================================

[wfwc_login_form]
- exibe o formulario de login WordPress

[wfwc_client_lookup]
- exibe a consulta de cashback
- por seguranca, por padrao e restrita a equipe logada
- pode ser liberada em Configuracoes

==================================================
9. BOAS PRATICAS DE OPERACAO
==================================================

- sempre selecione o atendente correto
- complete data de nascimento quando disponivel
- revise os logs apos configurar o n8n
- acompanhe creditos proximos do vencimento
- mantenha apenas usuarios autorizados com acesso ao painel
- use a reference do webhook para deduplicacao no n8n
