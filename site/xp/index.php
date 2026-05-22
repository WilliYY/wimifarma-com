<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

xp_send_no_cache_headers();
$user = xp_require_user();
$canManage = xp_user_can_manage($user);

try {
    xp_ensure_schema();
} catch (Throwable $schemaError) {
    set_flash('error', 'Nao consegui preparar o modulo XP agora. Verifique o banco.');
}

$monthContext = xp_month_context($_GET['month'] ?? null);
$activeTab = (string) ($_GET['tab'] ?? 'trilha');
$activeTab = $activeTab === 'configuracoes' ? 'configuracoes' : 'trilha';
$trailUrl = '/xp/?tab=trilha&month=' . rawurlencode((string) $monthContext['month']);
$settingsUrl = '/xp/?tab=configuracoes&month=' . rawurlencode((string) $monthContext['month']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Tente novamente.');
        header('Location: ' . $settingsUrl);
        exit;
    }

    try {
        xp_require_manager($user);
        $action = (string) ($_POST['action'] ?? '');

        if ($action === 'create_employee') {
            xp_create_employee(
                (string) ($_POST['name'] ?? ''),
                $_FILES['photo'] ?? null,
                (int) $user['id']
            );
            set_flash('success', 'Funcionario cadastrado no XP.');
        } elseif ($action === 'update_admin_profile') {
            xp_update_admin_profile($_FILES['photo'] ?? null, (int) $user['id']);
            set_flash('success', 'Foto da moldura ADM atualizada.');
        } elseif ($action === 'update_employee') {
            xp_update_employee(
                (int) ($_POST['employee_id'] ?? 0),
                (string) ($_POST['name'] ?? ''),
                $_FILES['photo'] ?? null,
                (int) $user['id']
            );
            set_flash('success', 'Funcionario atualizado.');
        } elseif ($action === 'deactivate_employee') {
            xp_deactivate_employee((int) ($_POST['employee_id'] ?? 0));
            set_flash('success', 'Usuario removido do XP.');
        } elseif ($action === 'create_sale') {
            xp_create_sale(
                (int) ($_POST['employee_id'] ?? 0),
                (string) ($_POST['sale_date'] ?? ''),
                $_POST['amount'] ?? '0',
                (string) ($_POST['note'] ?? ''),
                (int) $user['id']
            );
            set_flash('success', 'XP calculado e lancado.');
        } elseif ($action === 'delete_sale') {
            xp_delete_sale((int) ($_POST['sale_id'] ?? 0), (int) $user['id']);
            set_flash('success', 'Lancamento cancelado sem apagar historico.');
        } else {
            set_flash('error', 'Acao invalida.');
        }
    } catch (InvalidArgumentException $error) {
        set_flash('error', $error->getMessage());
    } catch (Throwable $error) {
        set_flash('error', 'Nao consegui salvar o XP agora.');
    }

    header('Location: ' . $settingsUrl);
    exit;
}

$flash = get_flash();
$employees = array();
$summary = array('employee_count' => 0, 'month_amount_cents' => 0, 'month_xp' => 0, 'total_xp' => 0, 'top_employee' => null);
$recentSales = array();
$adminProfile = array('photo_path' => '');

try {
    $adminProfile = xp_admin_profile();
    $employees = xp_list_employees($monthContext);
    $summary = xp_summary($employees);
    $recentSales = xp_recent_sales(9);
} catch (Throwable $listError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui carregar o XP agora.');
}

[$levelStart, $levelEnd] = xp_level_track_bounds($employees);
$playersByLevel = array();
foreach ($employees as $employee) {
    $level = (int) ($employee['progress']['level'] ?? 1);
    if (!isset($playersByLevel[$level])) {
        $playersByLevel[$level] = array();
    }
    $playersByLevel[$level][] = $employee;
}

$adminPlayer = array(
    'id' => 'adm',
    'name' => 'ADM',
    'photo_path' => $adminProfile['photo_path'],
    'is_admin' => true,
    'progress' => xp_progress_from_total(0),
);
if (!isset($playersByLevel[1])) {
    $playersByLevel[1] = array();
}
array_unshift($playersByLevel[1], $adminPlayer);
$gamePlayers = array_merge(array($adminPlayer), array_slice($employees, 0, 3));

$today = date('Y-m-d');
?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>XP - Wimifarma</title>
    <link rel="icon" type="image/png" href="/cashback/favicon.png">
    <link rel="stylesheet" href="/xp/styles.css?v=20260522k">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517k">
    <script src="/xp/app.js?v=20260522d" defer></script>
    <script src="/miauw/widget.js?v=20260517k" defer></script>
</head>
<body class="xp-app-body <?php echo $activeTab === 'trilha' ? 'is-trail-view' : 'is-settings-view'; ?>">
    <header class="xp-topbar">
        <a class="xp-brand" href="/">
            <img src="/cashback/logo-wimifarma.svg" alt="Wimifarma">
            <strong>XP</strong>
        </a>
        <nav class="xp-section-tabs" aria-label="Abas XP">
            <a class="<?php echo $activeTab === 'trilha' ? 'is-active' : ''; ?>" href="<?php echo e($trailUrl); ?>" <?php echo $activeTab === 'trilha' ? 'aria-current="page"' : ''; ?>>Trilha</a>
            <a class="<?php echo $activeTab === 'configuracoes' ? 'is-active' : ''; ?>" href="<?php echo e($settingsUrl); ?>" <?php echo $activeTab === 'configuracoes' ? 'aria-current="page"' : ''; ?>>Configura&ccedil;&otilde;es</a>
        </nav>
        <nav class="xp-nav" aria-label="Navegacao">
            <a href="/">Home</a>
            <a href="/xp/logout.php">Sair</a>
        </nav>
    </header>

    <main class="xp-page <?php echo $activeTab === 'trilha' ? 'is-trail-view' : 'is-settings-view'; ?>" data-miauby-screen-object="modulo xp" data-miauby-screen-label="Modulo XP: <?php echo e((string) $summary['employee_count']); ?> funcionario(s)">
        <section class="xp-hero xp-settings-only">
            <div>
                <h1>XP</h1>
            </div>
            <form class="xp-month" method="get">
                <input type="hidden" name="tab" value="configuracoes">
                <label>
                    <span>Mes</span>
                    <input type="month" name="month" value="<?php echo e($monthContext['month']); ?>">
                </label>
                <button type="submit" class="xp-btn">Ver</button>
            </form>
        </section>

        <?php if (!empty($flash['message'])) : ?>
            <div class="xp-alert xp-settings-only <?php echo e((string) $flash['type']); ?>"><?php echo e((string) $flash['message']); ?></div>
        <?php endif; ?>

        <section class="xp-summary-grid xp-settings-only" aria-label="Resumo XP">
            <article>
                <span>Funcionarios</span>
                <strong><?php echo e((string) $summary['employee_count']); ?></strong>
            </article>
            <article>
                <span>XP do mes</span>
                <strong><?php echo e(xp_number($summary['month_xp'])); ?></strong>
            </article>
            <article>
                <span>XP total</span>
                <strong><?php echo e(xp_number($summary['total_xp'])); ?></strong>
            </article>
        </section>

        <?php if ($canManage) : ?>
            <section class="xp-admin-grid xp-settings-only" aria-label="Administracao XP">
                <article class="xp-admin-card xp-admin-profile-card">
                    <h2>Moldura ADM</h2>
                    <div class="xp-admin-avatar">
                        <?php if ($adminProfile['photo_path'] !== '') : ?>
                            <img src="<?php echo e($adminProfile['photo_path']); ?>" alt="Foto ADM XP">
                        <?php else : ?>
                            <span>ADM</span>
                        <?php endif; ?>
                    </div>
                    <form method="post" enctype="multipart/form-data" class="xp-form">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="update_admin_profile">
                        <label>
                            <span>Sua foto</span>
                            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input required>
                            <small>Essa foto usa a moldura ADM.</small>
                        </label>
                        <div class="xp-photo-preview" hidden data-xp-photo-preview></div>
                        <button type="submit" class="xp-btn xp-btn-primary">Atualizar ADM</button>
                    </form>
                </article>

                <article class="xp-admin-card">
                    <h2>Cadastrar funcionario</h2>
                    <form method="post" enctype="multipart/form-data" class="xp-form">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="create_employee">
                        <label>
                            <span>Nome</span>
                            <input type="text" name="name" maxlength="180" required placeholder="Nome do atendente">
                        </label>
                        <label>
                            <span>Foto</span>
                            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input>
                            <small>JPG, PNG ou WEBP ate 3 MB.</small>
                        </label>
                        <div class="xp-photo-preview" hidden data-xp-photo-preview></div>
                        <button type="submit" class="xp-btn xp-btn-primary">Adicionar</button>
                    </form>
                </article>

                <article class="xp-admin-card xp-admin-card-wide">
                    <h2>Gerar XP diario</h2>
                    <form method="post" class="xp-form xp-form-sale">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="create_sale">
                        <label>
                            <span>Funcionario</span>
                            <select name="employee_id" required>
                                <option value="">Escolha</option>
                                <?php foreach ($employees as $employee) : ?>
                                    <option value="<?php echo e((string) $employee['id']); ?>"><?php echo e((string) $employee['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>
                            <span>Data</span>
                            <input type="date" name="sale_date" value="<?php echo e($today); ?>" required>
                        </label>
                        <label>
                            <span>Valor em R$</span>
                            <input type="text" name="amount" inputmode="decimal" required placeholder="1.000,00">
                        </label>
                        <label class="xp-form-note">
                            <span>Observacao</span>
                            <input type="text" name="note" maxlength="220" placeholder="Opcional">
                        </label>
                        <button type="submit" class="xp-btn xp-btn-primary">Gerar XP</button>
                    </form>
                    <p class="xp-admin-hint">Exemplo: R$ 1.000,00 gera <?php echo e(xp_number(XP_POINTS_PER_THOUSAND_REAIS)); ?> XP.</p>
                </article>
            </section>
        <?php endif; ?>

        <?php if ($activeTab === 'trilha') : ?>
        <section class="xp-world xp-trail-only" aria-label="Trilha de niveis XP">
            <div class="xp-world-hud">
                <div class="xp-world-copy">
                    <h1>XP</h1>
                    <span>Fase dos atendentes</span>
                </div>
                <div class="xp-world-score">
                    <span>Ranking atual</span>
                    <strong><?php echo !empty($summary['top_employee']) ? e((string) $summary['top_employee']['name']) : 'Sem jogadores'; ?></strong>
                    <small><?php echo e(xp_number($summary['total_xp'])); ?> XP total na equipe</small>
                </div>
                <div class="xp-world-controls" aria-label="Controles da trilha">
                    <button type="button" data-xp-track-step="-1" aria-label="Voltar niveis">&lsaquo;</button>
                    <button type="button" data-xp-track-step="1" aria-label="Avancar niveis">&rsaquo;</button>
                </div>
            </div>
            <div class="xp-track-scroll" data-xp-track>
                <div class="xp-track" style="--xp-level-count: <?php echo e((string) (($levelEnd - $levelStart) + 1)); ?>;">
                    <?php for ($level = $levelStart; $level <= $levelEnd; $level++) : ?>
                        <?php $players = $playersByLevel[$level] ?? array(); ?>
                        <article class="xp-level xp-level-<?php echo e(xp_level_kind($level)); ?> <?php echo !empty($players) ? 'has-players' : ''; ?>" data-xp-level="<?php echo e((string) $level); ?>">
                            <?php if ($level > $levelStart) : ?>
                                <img class="xp-path" src="/xp/assets/caminho-xp.svg?v=20260522b" alt="" aria-hidden="true">
                            <?php endif; ?>
                            <div class="xp-level-node">
                                <img class="xp-level-art" src="<?php echo e(xp_level_asset($level)); ?>" alt="">
                                <strong>Nivel <?php echo e((string) $level); ?></strong>
                                <?php if (!empty($players)) : ?>
                                    <div class="xp-node-players" aria-label="Funcionarios neste nivel">
                                        <?php foreach ($players as $player) : ?>
                                            <?php $photoUrl = xp_photo_url($player['photo_path'] ?? null); ?>
                                            <button type="button" class="xp-node-player <?php echo !empty($player['is_admin']) ? 'is-adm' : ''; ?>" data-xp-focus-employee="<?php echo e((string) $player['id']); ?>" title="<?php echo e((string) $player['name']); ?>">
                                                <?php if ($photoUrl !== '') : ?>
                                                    <img src="<?php echo e($photoUrl); ?>" alt="<?php echo e((string) $player['name']); ?>">
                                                <?php else : ?>
                                                    <span><?php echo e(xp_employee_initials((string) $player['name'])); ?></span>
                                                <?php endif; ?>
                                            </button>
                                        <?php endforeach; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        </article>
                    <?php endfor; ?>
                </div>
            </div>
            <?php if (!empty($gamePlayers)) : ?>
                <div class="xp-game-roster" aria-label="Placar de jogadores">
                    <?php foreach ($gamePlayers as $hudEmployee) : ?>
                        <?php
                        $hudProgress = $hudEmployee['progress'];
                        $hudProgressClass = 'xp-fill-p' . (string) (int) round(max(0, min(100, (float) $hudProgress['percent'])));
                        $hudPhotoUrl = xp_photo_url($hudEmployee['photo_path'] ?? null);
                        ?>
                        <button type="button" class="xp-game-player <?php echo !empty($hudEmployee['is_admin']) ? 'is-adm' : ''; ?>" data-xp-focus-employee="<?php echo e((string) $hudEmployee['id']); ?>">
                            <span class="xp-game-avatar">
                                <?php if ($hudPhotoUrl !== '') : ?>
                                    <img src="<?php echo e($hudPhotoUrl); ?>" alt="<?php echo e((string) $hudEmployee['name']); ?>">
                                <?php else : ?>
                                    <i><?php echo e(xp_employee_initials((string) $hudEmployee['name'])); ?></i>
                                <?php endif; ?>
                            </span>
                            <span class="xp-game-info">
                                <strong><?php echo e((string) $hudEmployee['name']); ?></strong>
                                <small><?php echo !empty($hudEmployee['is_admin']) ? 'ADM - teste' : 'Nivel ' . e((string) $hudProgress['level']) . ' - ' . e(xp_percent($hudProgress['percent'])); ?></small>
                                <em class="<?php echo e($hudProgressClass); ?>"><b></b></em>
                            </span>
                        </button>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </section>
        <?php endif; ?>

        <section class="xp-employee-grid xp-settings-only" aria-label="Funcionarios XP">
            <?php if (empty($employees)) : ?>
                <article class="xp-empty">
                    <h2>Nenhum funcionario cadastrado ainda</h2>
                    <p>Cadastre os atendentes e gere XP diario para a trilha comecar a andar.</p>
                </article>
            <?php endif; ?>

            <?php foreach ($employees as $employee) : ?>
                <?php
                $progress = $employee['progress'];
                $progressFillClass = 'xp-fill-p' . (string) (int) round(max(0, min(100, (float) $progress['percent'])));
                $photoUrl = xp_photo_url($employee['photo_path'] ?? null);
                ?>
                <article class="xp-employee-card" data-xp-employee-card="<?php echo e((string) $employee['id']); ?>" data-xp-employee-level="<?php echo e((string) $progress['level']); ?>">
                    <div class="xp-employee-main">
                        <div class="xp-avatar-frame">
                            <?php if ($photoUrl !== '') : ?>
                                <img src="<?php echo e($photoUrl); ?>" alt="<?php echo e((string) $employee['name']); ?>">
                            <?php else : ?>
                                <span><?php echo e(xp_employee_initials((string) $employee['name'])); ?></span>
                            <?php endif; ?>
                        </div>

                        <div class="xp-employee-info">
                            <span class="xp-rank">#<?php echo e((string) $employee['rank']); ?></span>
                            <h2><?php echo e((string) $employee['name']); ?></h2>
                            <p>Nivel <?php echo e((string) $progress['level']); ?> -> <?php echo e((string) $progress['next_level']); ?></p>
                            <dl>
                                <div>
                                    <dt>XP do mes</dt>
                                    <dd><?php echo e(xp_number($employee['month_xp'])); ?></dd>
                                </div>
                                <div>
                                    <dt>XP total</dt>
                                    <dd><?php echo e(xp_number($employee['total_xp'])); ?></dd>
                                </div>
                            </dl>
                        </div>

                        <div class="xp-liquid-bar <?php echo e($progressFillClass); ?>">
                            <i aria-hidden="true"></i>
                            <span><?php echo e(xp_number($progress['progress_xp'])); ?>/<?php echo e(xp_number($progress['required_xp'])); ?> XP</span>
                        </div>
                    </div>

                    <div class="xp-progress-line <?php echo e($progressFillClass); ?>" aria-label="Progresso para o proximo nivel">
                        <i></i>
                        <span><?php echo e(xp_percent($progress['percent'])); ?></span>
                    </div>

                    <?php if ($canManage) : ?>
                        <div class="xp-employee-actions" aria-label="Acoes do usuario">
                            <form method="post" class="xp-delete-user-form">
                                <?php echo csrf_field(); ?>
                                <input type="hidden" name="action" value="deactivate_employee">
                                <input type="hidden" name="employee_id" value="<?php echo e((string) $employee['id']); ?>">
                                <button type="submit" class="xp-btn xp-btn-danger" aria-label="Excluir usuario <?php echo e((string) $employee['name']); ?> do XP" data-xp-confirm="Excluir este usuario do XP? Ele sai da trilha e da lista, mas os lancamentos antigos ficam preservados.">Excluir usuario</button>
                            </form>
                        </div>
                        <details class="xp-edit-details">
                            <summary>Editar usuario</summary>
                            <form method="post" enctype="multipart/form-data" class="xp-form xp-form-edit">
                                <?php echo csrf_field(); ?>
                                <input type="hidden" name="action" value="update_employee">
                                <input type="hidden" name="employee_id" value="<?php echo e((string) $employee['id']); ?>">
                                <label>
                                    <span>Nome</span>
                                    <input type="text" name="name" maxlength="180" value="<?php echo e((string) $employee['name']); ?>" required>
                                </label>
                                <label>
                                    <span>Nova foto</span>
                                    <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" data-xp-photo-input>
                                </label>
                                <button type="submit" class="xp-btn">Salvar</button>
                            </form>
                        </details>
                    <?php endif; ?>
                </article>
            <?php endforeach; ?>
        </section>

        <?php if ($canManage) : ?>
            <section class="xp-recent xp-settings-only" aria-label="Lancamentos recentes">
                <h2>Ultimos lancamentos</h2>
                <?php if (empty($recentSales)) : ?>
                    <p>Nenhum lancamento ainda.</p>
                <?php else : ?>
                    <div class="xp-recent-list">
                        <?php foreach ($recentSales as $sale) : ?>
                            <article>
                                <div>
                                    <strong><?php echo e((string) $sale['employee_name']); ?></strong>
                                    <span><?php echo e(br_date($sale['sale_date'] ?? null)); ?></span>
                                </div>
                                <b><?php echo e(xp_number($sale['xp_points'] ?? 0)); ?> XP</b>
                                <form method="post">
                                    <?php echo csrf_field(); ?>
                                    <input type="hidden" name="action" value="delete_sale">
                                    <input type="hidden" name="sale_id" value="<?php echo e((string) $sale['id']); ?>">
                                    <button type="submit" class="xp-mini-danger" data-xp-confirm="Cancelar este lancamento?">Cancelar</button>
                                </form>
                            </article>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>
        <?php endif; ?>
    </main>
</body>
</html>
