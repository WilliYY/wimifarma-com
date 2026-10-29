# Login / Senha: categorias e exclusao

Atualizado em 2026-10-29.

## Organizacao

`login_senha_entries.category` guarda uma das categorias aceitas pelo servidor: `distribuidor`, `laboratorios_marcas`, `redes_sociais`, `portais_servicos`, `sistemas` ou `outros`. Cadastro e edicao usam um select; valores desconhecidos sao rejeitados. O startup acrescenta a coluna, classifica somente registros com categoria nula e aplica default `outros` e NOT NULL. Nomes desconhecidos recebem `outros`; novas contas usam a escolha do formulario. Alterar nome nao sobrescreve uma categoria escolhida.

Distribuidor aparece primeiro. GAM, Profarma, Panpharma, Santa Cruz, ANB, DM Arthur e Gira Brasil sao classificados inicialmente nesse grupo. Laboratorios e marcas, redes sociais e e-mail, portais e servicos, sistemas e outros ficam em grupos proprios. Cada grupo mostra nomes em A-Z usando comparacao pt-BR sem distinguir acentos/caixa. Busca por nome/login e categoria podem ser combinadas; nenhuma senha entra no indice da busca.

A interface usa largura operacional maior, fonte legivel, tabelas no desktop e cards rotulados em telas menores. O editor abre somente por Editar. A ordem manual deixou de ser usada, mantendo `sort_order` existente para historico/rollback. Clientes antigos recebem 410 no endpoint de reorder depois da verificacao de sessao e CSRF e devem recarregar.

## Exclusao e seguranca

Somente `core_users.username === 'adm'` pode usar `archive`, `delete`, `delete_archived` e `clear_archived`. O servidor revalida usuario ativo e acesso ao cofre e verifica CSRF antes de despachar a acao. Perfis `admin` e `gerente` nao concedem exclusao. A mesma regra vale para `geral` e `adm`; os controles tambem ficam ausentes do HTML de outros usuarios.

O botao Excluir ao lado de Editar pede confirmacao e arquiva o acesso, preservando o segredo cifrado, responsavel e data no historico. A remocao definitiva continua disponivel somente para arquivados, com confirmacao e auditoria sem valor de senha. Nenhum acesso existente e excluido automaticamente pela migracao.

AES-256-GCM, chave do cofre, sessao WFLOGINSENHA, isolamento por scope, cabecalhos no-store, POST reveal/copy com CSRF e auditoria permanecem obrigatorios. A categoria entra nos eventos de criacao/edicao; senha nunca entra em logs, documentos, fixtures, screenshots ou Git.

## Publicacao e verificacao

Executar testes, check e build do app, revisar o diff e fazer backup validado do banco dedicado antes do deploy. No VPS, usar `umask 022` antes de Git e rebuild direcionado de `wimifarma-login-senha-app`; usar mascara privada somente no subshell do backup. Validar health pelos dois caminhos, assets, redirecionamento sem sessao, leitura de PHP por www-data e o HTML real da Home.

Testes visuais usam apenas dados ficticios. Conferencia operacional de credenciais deve comparar em memoria e devolver somente nomes e indicadores de igualdade; nao retornar senhas ou logins reais. Divergencias em fonte antiga nao autorizam substituir dados atuais. Acessos vinculados devem indicar o provedor/conta de origem, sem inventar senha independente.
