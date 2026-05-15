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
$total = 0;

try {
    $items = codigos_list($search);
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
    <link rel="stylesheet" href="/codigos/styles.css?v=20260514a">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260514a">
    <script src="/codigos/app.js?v=20260514a" defer></script>
    <script src="/miauw/widget.js?v=20260511b" defer></script>
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
                <span><strong><?php echo e((string) $total); ?></strong> ativo(s)</span>
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
        </section>

        <section class="codes-sheet-panel" aria-label="Tabela de codigos">
            <div class="codes-sheet-scroll">
                <div class="codes-sheet" role="table" aria-label="Codigos de comissao">
                    <div class="codes-sheet-head" role="row">
                        <span>#</span>
                        <span>CÓDIGO</span>
                        <span>EAN</span>
                        <span>PREÇO</span>
                        <span>AÇÕES</span>
                    </div>

                    <?php foreach ($items as $index => $item) : ?>
                        <form method="post" class="codes-row" role="row" data-code-row>
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="id" value="<?php echo e((string) ($item['id'] ?? 0)); ?>">
                            <span class="codes-row-number"><?php echo e((string) ($index + 1)); ?></span>
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
                                <button type="submit" name="action" value="update" class="codes-btn codes-btn-save">Salvar</button>
                                <button type="submit" name="action" value="delete" class="codes-btn codes-btn-danger" data-confirm-delete formnovalidate>Apagar</button>
                            </div>
                        </form>
                    <?php endforeach; ?>

                    <?php if (empty($items)) : ?>
                        <div class="codes-empty">Nenhum codigo encontrado.</div>
                    <?php endif; ?>

                    <form method="post" class="codes-row codes-row-new" role="row" data-code-row>
                        <?php echo csrf_field(); ?>
                        <span class="codes-row-number">+</span>
                        <label>
                            <span>Código</span>
                            <input type="text" name="codigo" maxlength="180" placeholder="Novo codigo" required>
                        </label>
                        <label>
                            <span>EAN</span>
                            <input type="text" name="ean" maxlength="80" placeholder="20 000" required>
                        </label>
                        <label>
                            <span>Preço</span>
                            <input type="text" name="preco" inputmode="decimal" data-price-input placeholder="0,00" required>
                        </label>
                        <div class="codes-row-actions">
                            <button type="submit" name="action" value="create" class="codes-btn codes-btn-primary">Adicionar</button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    </main>
</body>
</html>
