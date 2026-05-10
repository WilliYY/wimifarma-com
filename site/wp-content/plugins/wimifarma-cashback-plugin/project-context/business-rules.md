# Business Rules

## Objetivo
Operar o programa de cashback da Wimifarma dentro do WordPress, com controle administrativo, histórico confiável e base preparada para integração com automações externas.

## Regra padrão de geração
- Toda compra registrada gera cashback automaticamente.
- Percentual inicial: `5%`.
- O percentual é configurável em `Configurações`.
- O cálculo é feito sobre o valor bruto da compra (`gross_amount`).

## Validade do crédito
- Cada crédito gerado expira em `45 dias` por padrão.
- O prazo é configurável.
- A data de expiração é calculada a partir da data da compra.

## Regra de uso mínimo
- O cliente só pode usar cashback se a compra atual for de no mínimo `4x` o valor do cashback desejado.
- Exemplo: para usar `R$ 10,00`, a compra precisa ser de `R$ 40,00`.
- O multiplicador é configurável.
- A validação ocorre no lançamento da compra.

## Cadastro de cliente
- Nome é obrigatório.
- Telefone é opcional, mas recomendado.
- Data de nascimento é opcional.
- Observações são opcionais.
- O cadastro pode ser marcado como ativo ou inativo.
- O cadastro deve registrar o atendente responsável quando informado.

## Identificação do cliente
- O sistema deve localizar clientes por:
  - telefone
  - nome
  - ID interno
- A ausência de telefone não bloqueia o cadastro nem a busca.

## Cadastro de atendente
- O atendente é um cadastro operacional do plugin.
- Pode ou não ser vinculado a um usuário WordPress.
- Campos base:
  - nome
  - status
  - observações
  - data de criação

## Compra
- Cada compra armazena:
  - cliente
  - atendente
  - valor bruto
  - cashback gerado
  - cashback usado
  - valor líquido
  - data da compra
  - observação

## Uso de cashback
- O consumo de cashback é registrado por crédito utilizado.
- O consumo segue ordem dos créditos disponíveis com vencimento mais próximo primeiro.
- Cada uso gera rastreabilidade no histórico.

## Expiração
- Créditos vencidos perdem o saldo restante.
- O saldo remanescente é movido para `expired_amount`.
- O status do crédito muda para `expired`.
- O processamento roda via WP-Cron.

## Alertas de expiração
- O sistema trabalha com janelas configuráveis, padrão `10,5`.
- A consulta de alertas depende da configuração de dias.
- O envio é preparado para webhook.

## Aniversário
- Se o cliente tiver data de nascimento cadastrada, o sistema pode disparar webhook no dia do aniversário.
- O disparo é controlado por configuração.

## Histórico do cliente
- O resumo exibido ao abrir um cliente inclui:
  - saldo total gerado
  - saldo disponível
  - saldo expirado
  - saldo utilizado
  - cashback próximo de vencer
  - próximo vencimento
  - compras registradas
  - usos de cashback
  - créditos e respectivos prazos

## Logs
- Eventos automáticos e ações sensíveis geram log em tabela própria.
- O objetivo é rastreabilidade mínima séria sem tornar a operação pesada.
