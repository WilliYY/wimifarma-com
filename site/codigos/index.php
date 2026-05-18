<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

codigos_send_no_cache_headers();
$user = codigos_require_user();

try {
    codigos_ensure_schema();
} catch (Throwable $schemaError) {
    set_flash('error', 'Nao consegui preparar os codigos agora. Verifique o banco.');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Tente novamente.');
        codigos_redirect_home();
    }

    $action = (string) ($_POST['action'] ?? '');

    try {
        if ($action === 'create') {
            codigos_create(
                (string) ($_POST['codigo'] ?? ''),
                (string) ($_POST['ean'] ?? ''),
                $_POST['preco'] ?? '0',
                (int) $user['id']
            );
            set_flash('success', 'Codigo adicionado.');
        } elseif ($action === 'update') {
            codigos_update(
                (int) ($_POST['id'] ?? 0),
                (string) ($_POST['codigo'] ?? ''),
                (string) ($_POST['ean'] ?? ''),
                $_POST['preco'] ?? '0'
            );
            set_flash('success', 'Codigo atualizado.');
        } elseif ($action === 'delete') {
            codigos_delete((int) ($_POST['id'] ?? 0));
            set_flash('success', 'Codigo apagado da lista.');
        }
    } catch (InvalidArgumentException $error) {
        set_flash('error', $error->getMessage());
    } catch (Throwable $error) {
        set_flash('error', 'Nao consegui salvar os codigos agora.');
    }

    codigos_redirect_home();
}

$flash = get_flash();
$search = trim((string) ($_GET['q'] ?? ''));
$items = array();
$groups = array('20' => array(), '40' => array(), 'outros' => array());
$groupKeys = array('20', '40');
$total = 0;

try {
    $items = codigos_list($search);
    $groups = codigos_group_items($items);
    $groupKeys = codigos_ordered_group_keys($groups);
    $total = codigos_count_active();
} catch (Throwable $listError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui carregar os codigos agora.');
}
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codigos - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/codigos/styles.css?v=20260518a">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517k">
    <script src="/codigos/app.js?v=20260515i" defer></script>
    <script src="/miauw/widget.js?v=20260517k" defer></script>
</head>
<body class="codes-app-body">
    <header class="codes-topbar">
        <a class="codes-brand" href="/">
            <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Códigos</strong>
        </a>
        <nav class="codes-nav" aria-label="Navegacao">
            <a href="/">Home</a>
            <a href="/codigos/logout.php">Sair</a>
        </nav>
    </header>

    <main class="codes-page" data-miauby-screen-object="modulo codigos" data-miauby-screen-label="Modulo Codigos: <?php echo e((string) $total); ?> codigo(s) ativo(s)">
        <section class="codes-hero">
            <div>
                <h1>Códigos</h1>
            </div>
            <div class="codes-stats" aria-label="Resumo">
                <span><strong data-total-count><?php echo e((string) $total); ?></strong> ativo(s)</span>
                <?php if ($search !== '') : ?>
                    <span><strong><?php echo e((string) count($items)); ?></strong> filtrado(s)</span>
                <?php endif; ?>
            </div>
        </section>

        <?php if (!empty($flash['message'])) : ?>
            <div class="codes-alert <?php echo e((string) $flash['type']); ?>"><?php echo e((string) $flash['message']); ?></div>
        <?php endif; ?>

        <section class="codes-toolbar" aria-label="Ferramentas">
            <form method="get" class="codes-search">
                <label>
                    <span>Buscar</span>
                    <input type="search" name="q" value="<?php echo e($search); ?>" placeholder="Codigo ou EAN">
                </label>
                <button type="submit" class="codes-btn">Filtrar</button>
                <?php if ($search !== '') : ?>
                    <a class="codes-btn codes-btn-soft" href="/codigos/">Limpar</a>
                <?php endif; ?>
            </form>
            <div class="codes-group-adder" data-group-adder>
                <input type="text" inputmode="numeric" maxlength="2" data-new-group-input aria-label="Prefixo do novo bloco de EAN" placeholder="EAN">
                <button type="button" class="codes-btn codes-btn-icon" data-add-code-group aria-label="Criar novo bloco de EAN" title="Criar novo bloco de EAN">+</button>
            </div>
        </section>

        <section class="codes-sheet-board" aria-label="Tabelas de codigos por EAN">
            <?php foreach ($groupKeys as $groupKey) : ?>
                <?php $groupItems = $groups[$groupKey] ?? array(); ?>
                <section class="codes-sheet-panel" aria-label="<?php echo e(codigos_group_label($groupKey)); ?>" data-code-group-panel="<?php echo e($groupKey); ?>">
                    <div class="codes-sheet-title">
                        <h2><?php echo e(codigos_group_label($groupKey)); ?></h2>
                        <div class="codes-sheet-title-actions">
                            <span data-code-group-count="<?php echo e($groupKey); ?>"><?php echo e((string) count($groupItems)); ?> item(ns)</span>
                            <?php if (codigos_can_delete_group($groupKey)) : ?>
                                <button type="button" class="codes-btn codes-btn-table-delete" data-delete-code-group="<?php echo e($groupKey); ?>" data-delete-code-group-label="<?php echo e(codigos_group_label($groupKey)); ?>">Excluir tabela</button>
                            <?php endif; ?>
                        </div>
                    </div>

                    <div class="codes-sheet-scroll">
                        <div class="codes-sheet" role="table" aria-label="<?php echo e(codigos_group_label($groupKey)); ?>">
                            <div class="codes-sheet-head" role="row">
                                <span>#</span>
                                <span>CÓDIGO</span>
                                <span>EAN</span>
                                <span>PREÇO</span>
                                <span>STATUS</span>
                            </div>

                            <?php foreach ($groupItems as $index => $item) : ?>
                                <form method="post" class="codes-row" role="row" data-code-row data-code-group="<?php echo e($groupKey); ?>">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="update">
                                    <input type="hidden" name="id" value="<?php echo e((string) ($item['id'] ?? 0)); ?>">
                                    <span class="codes-row-number codes-row-drag-handle" data-drag-handle title="Arraste para mudar a ordem"><?php echo e((string) ($index + 1)); ?></span>
                                    <label>
                                        <span>Código</span>
                                        <input type="text" name="codigo" value="<?php echo e((string) ($item['codigo'] ?? '')); ?>" maxlength="180" required>
                                    </label>
                                    <label>
                                        <span>EAN</span>
                                        <input type="text" name="ean" value="<?php echo e((string) ($item['ean'] ?? '')); ?>" maxlength="80" required>
                                    </label>
                                    <label>
                                        <span>Preço</span>
                                        <input type="text" name="preco" value="<?php echo e(codigos_price_input($item['preco'] ?? 0)); ?>" inputmode="decimal" data-price-input required>
                                    </label>
                                    <div class="codes-row-actions">
                                        <span class="codes-save-status" data-save-status>Salvo</span>
                                        <button type="submit" name="action" value="delete" class="codes-btn codes-btn-danger" data-confirm-delete formnovalidate>Apagar</button>
                                    </div>
                                </form>
                            <?php endforeach; ?>

                            <form method="post" class="codes-row codes-row-new" role="row" data-code-row data-new-row data-code-group="<?php echo e($groupKey); ?>">
                                <?php echo csrf_field(); ?>
                                <input type="hidden" name="action" value="create">
                                <input type="hidden" name="id" value="">
                                <span class="codes-row-number">+</span>
                                <label>
                                    <span>Código</span>
                                    <input type="text" name="codigo" maxlength="180" placeholder="Novo codigo" required>
                                </label>
                                <label>
                                    <span>EAN</span>
                                    <input type="text" name="ean" maxlength="80" placeholder="<?php echo e(codigos_default_ean_placeholder($groupKey)); ?>" required>
                                </label>
                                <label>
                                    <span>Preço</span>
                                    <input type="text" name="preco" inputmode="decimal" data-price-input placeholder="0,00" required>
                                </label>
                                <div class="codes-row-actions">
                                    <span class="codes-save-status is-muted" data-save-status>Novo</span>
                                </div>
                            </form>
                        </div>
                    </div>
                </section>
            <?php endforeach; ?>

            <?php if (!empty($groups['outros'])) : ?>
                <section class="codes-sheet-panel codes-sheet-panel-other" aria-label="Outros EANs" data-code-group-panel="outros">
                    <div class="codes-sheet-title">
                        <h2>Outros</h2>
                        <div class="codes-sheet-title-actions">
                            <span data-code-group-count="outros"><?php echo e((string) count($groups['outros'])); ?> item(ns)</span>
                        </div>
                    </div>

                    <div class="codes-sheet-scroll">
                        <div class="codes-sheet" role="table" aria-label="Outros EANs">
                            <div class="codes-sheet-head" role="row">
                                <span>#</span>
                                <span>CÓDIGO</span>
                                <span>EAN</span>
                                <span>PREÇO</span>
                                <span>STATUS</span>
                            </div>

                            <?php foreach ($groups['outros'] as $index => $item) : ?>
                                <form method="post" class="codes-row" role="row" data-code-row data-code-group="outros">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="update">
                                    <input type="hidden" name="id" value="<?php echo e((string) ($item['id'] ?? 0)); ?>">
                                    <span class="codes-row-number codes-row-drag-handle" data-drag-handle title="Arraste para mudar a ordem"><?php echo e((string) ($index + 1)); ?></span>
                                    <label>
                                        <span>Código</span>
                                        <input type="text" name="codigo" value="<?php echo e((string) ($item['codigo'] ?? '')); ?>" maxlength="180" required>
                                    </label>
                                    <label>
                                        <span>EAN</span>
                                        <input type="text" name="ean" value="<?php echo e((string) ($item['ean'] ?? '')); ?>" maxlength="80" required>
                                    </label>
                                    <label>
                                        <span>Preço</span>
                                        <input type="text" name="preco" value="<?php echo e(codigos_price_input($item['preco'] ?? 0)); ?>" inputmode="decimal" data-price-input required>
                                    </label>
                                    <div class="codes-row-actions">
                                        <span class="codes-save-status" data-save-status>Salvo</span>
                                        <button type="submit" name="action" value="delete" class="codes-btn codes-btn-danger" data-confirm-delete formnovalidate>Apagar</button>
                                    </div>
                                </form>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </section>
            <?php endif; ?>
            <button type="button" class="codes-sheet-panel codes-add-panel" data-focus-group-adder aria-label="Ir para criacao de bloco de EAN" title="Ir para criacao de bloco de EAN">
                <span>+</span>
            </button>
        </section>
    </main>

    <div class="codes-dialog" hidden data-group-delete-dialog role="dialog" aria-modal="true" aria-labelledby="codes-delete-title">
        <div class="codes-dialog-card">
            <span class="codes-dialog-kicker">Acao forte</span>
            <h2 id="codes-delete-title">Excluir tabela</h2>
            <p>Essa acao apaga a tabela inteira e todos os codigos ativos dentro dela.</p>
            <strong data-group-delete-label>EAN</strong>
            <label>
                <span>Senha para excluir</span>
                <input type="password" data-group-delete-password autocomplete="off" placeholder="Digite a senha">
            </label>
            <div class="codes-dialog-error" hidden data-group-delete-error></div>
            <div class="codes-dialog-actions">
                <button type="button" class="codes-btn" data-cancel-group-delete>Cancelar</button>
                <button type="button" class="codes-btn codes-btn-danger-solid" data-confirm-group-delete>Excluir tabela</button>
            </div>
        </div>
    </div>
</body>
</html>
