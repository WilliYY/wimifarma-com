# Decisão: evoluir o backend atual da Wimifarma

Data: 22/11/2026. Estado: aprovado para as correções da auditoria.

## Contexto

A Wimifarma tem 17 aplicações Node, bancos PostgreSQL por domínio e autenticação central. A Cotação também usa Redis e Socket.IO. O WordPress e partes do Miauby ainda usam PHP e MySQL. A operação depende dos contratos existentes de login, caixa, compras, XP e impressão. Esses contratos devem continuar funcionando durante a evolução.

## Decisão

Manter **Node.js LTS, TypeScript, Express e PostgreSQL** para os módulos internos. Manter SQL explícito onde o domínio exige bloqueios, idempotência, auditoria e transações. Preservar o Redis nos fluxos que já dependem dele. Atualizar o núcleo WordPress dentro da série instalada e manter os fluxos PHP em operação enquanto forem necessários.

Priorizar as melhorias nas fronteiras compartilhadas: sessões derivadas da Home, credenciais da infraestrutura, recuperação dos bancos, operações repetidas e coordenação entre módulos. Cada corte deve ter verificação local, validação do serviço em produção e caminho de volta conhecido.

Node 22 continua em LTS na data desta decisão. Uma troca de major merece uma rodada isolada com os 17 módulos, dependências nativas, sockets e pagamentos. A versão publicada e o calendário de suporte ficam na [documentação oficial do Node.js](https://nodejs.org/en/about/previous-releases).

## Alternativas avaliadas

- **Trocar a plataforma ou adotar outro framework em todos os módulos.** Isso exigiria revalidar a operação, permissões, rotas e transações em paralelo. A auditoria não identificou um problema que dependa dessa troca para ser corrigido.
- **Padronizar tudo imediatamente em um ORM, como Prisma.** Pode simplificar novos módulos. Os fluxos atuais dependem de SQL e bloqueios específicos, então o valor precisa ser confirmado num piloto isolado.
- **Fundir os serviços e os bancos.** Reduz serviços, mas concentra indisponibilidade e exige migração de dados e permissões. A topologia atual já permite publicar módulos separadamente.

## Como medir a evolução

Cobrir renovação e expiração de sessão, repetição de operações financeiras e recuperação a partir de backup. Medir tempo de resposta e falhas por serviço antes de propor trocar framework ou consolidar módulos. Usar mudanças pequenas que preservem dados, URLs e comportamento durante implantação e rollback.
