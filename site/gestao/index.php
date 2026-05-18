<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

gestao_send_no_cache_headers();
$user = gestao_require_user();
$flash = array('type' => '', 'message' => '');
$selectedMonth = gestao_month_value((string) ($_GET['mes'] ?? $_POST['competencia_mes'] ?? ''));

try {
    gestao_ensure_schema();
} catch (Throwable $schemaError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui preparar a Gestao agora. Verifique o banco.');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Tente novamente.');
        gestao_redirect_home($selectedMonth);
    }

    $action = (string) ($_POST['action'] ?? '');
    $selectedMonth = gestao_month_value((string) ($_POST['competencia_mes'] ?? $selectedMonth));

    try {
        if ($action === 'create') {
            $items = gestao_post_items($_POST);
            gestao_create_conta($_POST, $items, (int) $user['id']);
            set_flash('success', 'Conta lancada na Gestao.');
        } elseif ($action === 'confirm_paid') {
            gestao_set_status((int) ($_POST['id'] ?? 0), 'pago');
            set_flash('success', 'Pagamento confirmado e somado no mes.');
        } elseif ($action === 'cancel') {
            gestao_set_status((int) ($_POST['id'] ?? 0), 'cancelado');
            set_flash('success', 'Conta cancelada sem apagar o historico.');
        } elseif ($action === 'reopen') {
            gestao_set_status((int) ($_POST['id'] ?? 0), 'pendente');
            set_flash('success', 'Conta voltou para pendente.');
        }
    } catch (InvalidArgumentException $error) {
        set_flash('error', $error->getMessage());
    } catch (Throwable $error) {
        set_flash('error', 'Nao consegui salvar essa conta agora.');
    }

    gestao_redirect_home($selectedMonth);
}

$storedFlash = get_flash();
if (!empty($storedFlash)) {
    $flash = $storedFlash;
}

$summary = array('pago_mes' => 0.0, 'pendente_mes' => 0.0, 'gerado_mes' => 0.0, 'contas_pendentes' => 0);
$accounts = array();

try {
    $summary = gestao_month_summary($selectedMonth);
    $accounts = gestao_list_contas($selectedMonth);
} catch (Throwable $listError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui carregar as contas agora.');
}

function gestao_render_account(array $account, string $selectedMonth): void
{
    $id = (int) ($account['id'] ?? 0);
    $status = gestao_valid_status((string) ($account['status'] ?? 'pendente'));
    $category = gestao_valid_category((string) ($account['categoria'] ?? 'geral'));
    $items = is_array($account['itens'] ?? null) ? $account['itens'] : array();
    ?>
    <article class="gestao-account status-<?php echo e($status); ?>">
        <div class="gestao-account-main">
            <div class="gestao-account-head">
                <div>
                    <span class="gestao-pill"><?php echo e(gestao_category_label($category)); ?></span>
                    <h2><?php echo e((string) ($account['titulo'] ?? '')); ?></h2>
                </div>
                <strong><?php echo e(br_money((float) ($account['valor_total'] ?? 0))); ?></strong>
            </div>

            <div class="gestao-account-meta">
                <span>Gerado <?php echo e(br_date((string) ($account['gerado_em'] ?? ''), true)); ?></span>
                <span>Competencia <?php echo e(gestao_month_label((string) ($account['competencia_mes'] ?? $selectedMonth))); ?></span>
                <?php if ($status === 'pago') : ?>
                    <span>Pago <?php echo e(br_date((string) ($account['pago_em'] ?? ''), true)); ?></span>
                <?php endif; ?>
            </div>

            <?php if (!empty($items)) : ?>
                <ul class="gestao-items">
                    <?php foreach ($items as $item) : ?>
                        <li>
                            <span><?php echo e((string) ($item['descricao'] ?? '')); ?></span>
                            <strong><?php echo e(br_money((float) ($item['valor'] ?? 0))); ?></strong>
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>

            <?php if (trim((string) ($account['observacao'] ?? '')) !== '') : ?>
                <p class="gestao-note"><?php echo nl2br(e((string) $account['observacao'])); ?></p>
            <?php endif; ?>
        </div>

        <div class="gestao-account-actions">
            <span class="gestao-status"><?php echo e(gestao_status_label($status)); ?></span>
            <?php if ($status === 'pendente') : ?>
                <form method="post" data-confirm="Confirmar que esta conta foi paga?">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="confirm_paid">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <input type="hidden" name="competencia_mes" value="<?php echo e($selectedMonth); ?>">
                    <button type="submit" class="gestao-btn gestao-btn-primary">Confirmar pago</button>
                </form>
                <form method="post" data-confirm="Cancelar esta conta sem apagar o historico?">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="cancel">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <input type="hidden" name="competencia_mes" value="<?php echo e($selectedMonth); ?>">
                    <button type="submit" class="gestao-btn gestao-btn-ghost">Cancelar</button>
                </form>
            <?php else : ?>
                <form method="post" data-confirm="Voltar esta conta para pendente?">
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="reopen">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <input type="hidden" name="competencia_mes" value="<?php echo e($selectedMonth); ?>">
                    <button type="submit" class="gestao-btn gestao-btn-ghost">Voltar pendente</button>
                </form>
            <?php endif; ?>
        </div>
    </article>
    <?php
}
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Gestao - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/gestao/styles.css?v=20260518a">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517j">
    <script src="/gestao/app.js?v=20260518a" defer></script>
    <script src="/miauw/widget.js?v=20260517j" defer></script>
</head>
<body class="gestao-app-body">
    <header class="gestao-topbar">
        <a class="gestao-brand" href="/">
            <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Gestao</strong>
        </a>
        <nav class="gestao-nav" aria-label="Navegacao">
            <a href="/">Home</a>
            <a href="/gestao/logout.php">Sair</a>
        </nav>
    </header>

    <main class="gestao-page" data-miauby-screen-object="modulo gestao" data-miauby-screen-label="Modulo Gestao: <?php echo e(br_money((float) $summary['pago_mes'])); ?> pago no mes, <?php echo e(br_money((float) $summary['pendente_mes'])); ?> pendente">
        <section class="gestao-hero">
            <div>
                <span class="gestao-kicker">Administrativo</span>
                <h1>Gestao</h1>
                <p>Contas manuais, itens flexiveis e confirmacao de pagamento por mes.</p>
            </div>
            <form method="get" class="gestao-month-filter">
                <label>
                    <span>Mes</span>
                    <input type="month" name="mes" value="<?php echo e($selectedMonth); ?>">
                </label>
                <button type="submit" class="gestao-btn gestao-btn-secondary">Ver</button>
            </form>
        </section>

        <?php if (!empty($flash['message'])) : ?>
            <div class="gestao-alert <?php echo e((string) $flash['type']); ?>"><?php echo e((string) $flash['message']); ?></div>
        <?php endif; ?>

        <section class="gestao-stats" aria-label="Resumo do mes">
            <div>
                <span>Pago no mes</span>
                <strong><?php echo e(br_money((float) $summary['pago_mes'])); ?></strong>
            </div>
            <div>
                <span>Pendente do mes</span>
                <strong><?php echo e(br_money((float) $summary['pendente_mes'])); ?></strong>
            </div>
            <div>
                <span>Gerado no mes</span>
                <strong><?php echo e(br_money((float) $summary['gerado_mes'])); ?></strong>
            </div>
            <div>
                <span>Contas pendentes</span>
                <strong><?php echo e((string) $summary['contas_pendentes']); ?></strong>
            </div>
        </section>

        <section class="gestao-layout">
            <form method="post" class="gestao-form" data-gestao-form>
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="create">
                <div class="gestao-section-title">
                    <span class="gestao-kicker">Nova conta</span>
                    <strong data-gestao-total>Total R$ 0,00</strong>
                </div>

                <label>
                    <span>Nome ou titulo</span>
                    <input type="text" name="titulo" maxlength="180" placeholder="Rogerio, Boleto internet, Funcionario Thiago" required>
                </label>

                <div class="gestao-form-grid">
                    <label>
                        <span>Categoria</span>
                        <select name="categoria">
                            <?php foreach (gestao_categories() as $key => $label) : ?>
                                <option value="<?php echo e((string) $key); ?>"><?php echo e((string) $label); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </label>
                    <label>
                        <span>Competencia</span>
                        <input type="month" name="competencia_mes" value="<?php echo e($selectedMonth); ?>">
                    </label>
                    <label>
                        <span>Status inicial</span>
                        <select name="status">
                            <option value="pendente">Pendente</option>
                            <option value="pago">Pago agora</option>
                        </select>
                    </label>
                </div>

                <div class="gestao-line-items" data-line-items>
                    <div class="gestao-line-item">
                        <label>
                            <span>Descricao do item</span>
                            <input type="text" name="item_descricao[]" maxlength="180" placeholder="Salario, aumento, comissao, boleto">
                        </label>
                        <label>
                            <span>Valor</span>
                            <input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>
                        </label>
                    </div>
                    <div class="gestao-line-item">
                        <label>
                            <span>Descricao do item</span>
                            <input type="text" name="item_descricao[]" maxlength="180" placeholder="Aumento">
                        </label>
                        <label>
                            <span>Valor</span>
                            <input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>
                        </label>
                    </div>
                    <div class="gestao-line-item">
                        <label>
                            <span>Descricao do item</span>
                            <input type="text" name="item_descricao[]" maxlength="180" placeholder="Comissao">
                        </label>
                        <label>
                            <span>Valor</span>
                            <input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>
                        </label>
                    </div>
                </div>

                <button type="button" class="gestao-btn gestao-btn-secondary" data-add-item>Adicionar item</button>

                <label>
                    <span>Observacao</span>
                    <textarea name="observacao" rows="3" placeholder="Detalhe curto, se precisar."></textarea>
                </label>

                <button type="submit" class="gestao-btn gestao-btn-primary">Lancar conta</button>
            </form>

            <section class="gestao-list-panel">
                <div class="gestao-section-title">
                    <span class="gestao-kicker">Contas do mes</span>
                    <strong><?php echo e(gestao_month_label($selectedMonth)); ?></strong>
                </div>

                <div class="gestao-list">
                    <?php if (empty($accounts)) : ?>
                        <div class="gestao-empty">Nada lancado nesse mes ainda.</div>
                    <?php endif; ?>

                    <?php foreach ($accounts as $account) : ?>
                        <?php gestao_render_account($account, $selectedMonth); ?>
                    <?php endforeach; ?>
                </div>
            </section>
        </section>
    </main>
</body>
</html>
