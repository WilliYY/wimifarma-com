<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_sensitive_area_access('Configuracao e Relatorio');

$pageTitle = 'Configuracao e Relatorio';
$tipos = array(
    'clientes' => 'Clientes',
    'compras' => 'Compras',
    'resgates' => 'Resgates',
    'creditos' => 'Creditos de cashback',
    'whatsapp' => 'Todos Whats',
    'atendentes' => 'Atendentes',
);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'enable_maintenance') {
    verify_csrf();
    set_maintenance_mode(true);
    log_action('manutencao_ativada', 'system', null, 'Modo manutencao ativado pela tela de configuracao e relatorio.');
    redirect_to('manutencao.php');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_attendant') {
    verify_csrf();

    $nome = trim((string) ($_POST['nome'] ?? ''));
    $status = (string) ($_POST['status'] ?? 'ativo');
    $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

    if ($nome === '') {
        set_flash('error', 'Informe o nome do atendente.');
        redirect_to('relatorio.php#atendentes');
    }

    if (!in_array($status, array('ativo', 'inativo'), true)) {
        $status = 'ativo';
    }

    $stmt = db()->prepare('INSERT INTO wf_atendentes (nome, status, observacoes) VALUES (?, ?, ?)');
    $stmt->execute(array($nome, $status, $observacoes ?: null));
    $id = (int) db()->lastInsertId();

    log_action('atendente_criado', 'atendente', $id, 'Atendente criado em Configuracao e Relatorio: ' . $nome);
    set_flash('success', 'Atendente cadastrado: ' . $nome . '.');
    redirect_to('relatorio.php#atendentes');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'update_attendant') {
    verify_csrf();

    $id = max(0, (int) ($_POST['id'] ?? 0));
    $nome = trim((string) ($_POST['nome'] ?? ''));
    $status = (string) ($_POST['status'] ?? 'ativo');
    $observacoes = trim((string) ($_POST['observacoes'] ?? ''));

    if ($id <= 0 || $nome === '') {
        set_flash('error', 'Informe o atendente e o nome para alterar.');
        redirect_to('relatorio.php#atendentes');
    }

    if (!in_array($status, array('ativo', 'inativo'), true)) {
        $status = 'ativo';
    }

    $stmt = db()->prepare('UPDATE wf_atendentes SET nome = ?, status = ?, observacoes = ? WHERE id = ?');
    $stmt->execute(array($nome, $status, $observacoes ?: null, $id));

    log_action('atendente_alterado', 'atendente', $id, 'Atendente alterado em Configuracao e Relatorio: ' . $nome);
    set_flash('success', 'Atendente atualizado: ' . $nome . '.');
    redirect_to('relatorio.php#atendentes');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete_attendant') {
    verify_csrf();

    $id = max(0, (int) ($_POST['id'] ?? 0));

    if ($id <= 0) {
        set_flash('error', 'Atendente invalido para excluir.');
        redirect_to('relatorio.php#atendentes');
    }

    $stmt = db()->prepare(
        "SELECT
            (SELECT COUNT(*) FROM wf_clientes WHERE atendente_id = ?) +
            (SELECT COUNT(*) FROM wf_compras WHERE atendente_id = ?) +
            (SELECT COUNT(*) FROM wf_resgates WHERE atendente_id = ?) AS usos"
    );
    $stmt->execute(array($id, $id, $id));
    $usos = (int) $stmt->fetchColumn();

    if ($usos > 0) {
        $stmt = db()->prepare("UPDATE wf_atendentes SET status = 'inativo' WHERE id = ?");
        $stmt->execute(array($id));
        log_action('atendente_inativado', 'atendente', $id, 'Atendente inativado porque possui historico vinculado.');
        set_flash('success', 'Atendente possui historico e foi inativado para preservar os dados.');
    } else {
        $stmt = db()->prepare('DELETE FROM wf_atendentes WHERE id = ?');
        $stmt->execute(array($id));
        log_action('atendente_excluido', 'atendente', $id, 'Atendente excluido sem historico vinculado.');
        set_flash('success', 'Atendente excluido.');
    }

    redirect_to('relatorio.php#atendentes');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete_user') {
    verify_csrf();

    $id = max(0, (int) ($_POST['id'] ?? 0));
    $deletePassword = (string) ($_POST['delete_password'] ?? '');
    $current = current_user();

    if (!hash_equals('wimifarma', $deletePassword)) {
        set_flash('error', 'Senha interna incorreta para excluir usuario.');
        redirect_to('relatorio.php#usuarios');
    }

    if ($id <= 0) {
        set_flash('error', 'Usuario invalido para excluir.');
        redirect_to('relatorio.php#usuarios');
    }

    if ($current && (int) $current['id'] === $id) {
        set_flash('error', 'Por seguranca, nao exclua o usuario que esta logado agora.');
        redirect_to('relatorio.php#usuarios');
    }

    $stmt = db()->prepare('SELECT id, username, role, active FROM wf_users WHERE id = ? LIMIT 1');
    $stmt->execute(array($id));
    $targetUser = $stmt->fetch();

    if (!$targetUser) {
        set_flash('error', 'Usuario nao encontrado.');
        redirect_to('relatorio.php#usuarios');
    }

    if ((string) $targetUser['role'] === 'admin' && (int) $targetUser['active'] === 1) {
        $stmt = db()->prepare("SELECT COUNT(*) FROM wf_users WHERE role = 'admin' AND active = 1 AND id <> ?");
        $stmt->execute(array($id));

        if ((int) $stmt->fetchColumn() <= 0) {
            set_flash('error', 'Mantenha pelo menos um usuario administrador ativo.');
            redirect_to('relatorio.php#usuarios');
        }
    }

    $stmt = db()->prepare('UPDATE wf_users SET active = 0, updated_at = NOW() WHERE id = ?');
    $stmt->execute(array($id));

    log_action('usuario_inativado', 'usuario', $id, 'Usuario removido do acesso: ' . (string) $targetUser['username']);
    set_flash('success', 'Usuario removido do acesso: ' . (string) $targetUser['username'] . '.');
    redirect_to('relatorio.php#usuarios');
}

$start = $_GET['start'] ?? date('Y-m-01');
$end = $_GET['end'] ?? date('Y-m-d');

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $start)) {
    $start = date('Y-m-01');
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $end)) {
    $end = date('Y-m-d');
}

$clientesAtivos = (int) db()->query("SELECT COUNT(*) FROM wf_clientes WHERE status = 'ativo'")->fetchColumn();

$stmt = db()->prepare(
    "SELECT
        COUNT(*) AS compras,
        COALESCE(SUM(valor_total), 0) AS total_gasto,
        COALESCE(SUM(cashback_gerado), 0) AS cashback_gerado
     FROM wf_compras
     WHERE DATE(data_compra) BETWEEN ? AND ?"
);
$stmt->execute(array($start, $end));
$comprasStats = $stmt->fetch() ?: array();

$stmt = db()->prepare(
    "SELECT COALESCE(SUM(valor_resgatado), 0)
     FROM wf_resgates
     WHERE DATE(data_resgate) BETWEEN ? AND ?"
);
$stmt->execute(array($start, $end));
$cashbackUsado = (float) $stmt->fetchColumn();

$stmt = db()->prepare(
    "SELECT COALESCE(SUM(valor_restante), 0)
     FROM wf_cashback_creditos
     WHERE status = 'expirado'
       AND DATE(updated_at) BETWEEN ? AND ?"
);
$stmt->execute(array($start, $end));
$cashbackExpirado = (float) $stmt->fetchColumn();

$gerado = (float) ($comprasStats['cashback_gerado'] ?? 0);
$roi = $gerado > 0 ? ($cashbackUsado / $gerado) * 100 : 0;

$atendentesReport = db()->query(
    "SELECT
        a.*,
        (SELECT COUNT(*) FROM wf_clientes c WHERE c.atendente_id = a.id) AS clientes,
        (SELECT COUNT(*) FROM wf_compras co WHERE co.atendente_id = a.id) AS compras,
        (SELECT COALESCE(SUM(co.valor_total), 0) FROM wf_compras co WHERE co.atendente_id = a.id) AS vendido,
        (SELECT COALESCE(SUM(co.cashback_gerado), 0) FROM wf_compras co WHERE co.atendente_id = a.id) AS cashback
     FROM wf_atendentes a
     ORDER BY FIELD(a.status, 'ativo', 'inativo'), a.nome ASC"
)->fetchAll();

$usuariosReport = db()->query(
    "SELECT id, username, role, active, created_at, updated_at
     FROM wf_users
     ORDER BY active DESC, role ASC, username ASC"
)->fetchAll();
$loggedUser = current_user();

require __DIR__ . '/header.php';
?>

<section class="panel maintenance-control">
    <div>
        <span class="kicker">Controle do sistema</span>
        <h2>Modo manutencao</h2>
        <p>Use quando precisar mexer no sistema sem deixar atendentes usando as telas. Enquanto estiver ativo, qualquer acesso ao cashback sera guiado para a tela de manutencao.</p>
    </div>
    <form method="post" class="maintenance-control-form" data-no-enter-submit>
        <?php echo csrf_field(); ?>
        <input type="hidden" name="action" value="enable_maintenance">
        <button class="btn primary" type="submit">Colocar site em manutencao</button>
        <span class="soft-pill">Para retirar: senha wimifarma</span>
    </form>
</section>

<section id="atendentes" class="panel team-manager">
    <div class="section-title">
        <div>
            <span class="kicker">Equipe</span>
            <h2>Atendentes do cashback</h2>
        </div>
        <span class="soft-pill"><?php echo e(count($atendentesReport)); ?> cadastrado(s)</span>
    </div>

    <div class="team-layout">
        <form method="post" action="<?php echo e(app_url('relatorio.php#atendentes')); ?>" class="form-grid team-form" data-no-enter-submit>
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="save_attendant">
            <h3>Novo atendente</h3>
            <label>
                <span>Nome *</span>
                <input type="text" name="nome" required placeholder="Nome da equipe">
            </label>
            <label>
                <span>Status</span>
                <select name="status">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                </select>
            </label>
            <label>
                <span>Observacoes</span>
                <textarea name="observacoes" rows="3" placeholder="Opcional"></textarea>
            </label>
            <button class="btn primary" type="submit">Cadastrar atendente</button>
            <p class="muted">Depois de cadastrar, o nome aparece no cadastro de cliente e na Compra Cashback.</p>
        </form>

        <div class="team-list">
            <?php if ($atendentesReport) : ?>
                <?php foreach ($atendentesReport as $atendente) : ?>
                    <article class="attendant-card">
                        <form method="post" action="<?php echo e(app_url('relatorio.php#atendentes')); ?>" class="attendant-edit-form" data-no-enter-submit>
                            <?php echo csrf_field(); ?>
                            <input type="hidden" name="id" value="<?php echo e($atendente['id']); ?>">
                            <div class="attendant-card-head">
                                <label>
                                    <span>Nome</span>
                                    <input type="text" name="nome" value="<?php echo e($atendente['nome']); ?>" required>
                                </label>
                                <label>
                                    <span>Status</span>
                                    <select name="status">
                                        <option value="ativo" <?php echo $atendente['status'] === 'ativo' ? 'selected' : ''; ?>>Ativo</option>
                                        <option value="inativo" <?php echo $atendente['status'] === 'inativo' ? 'selected' : ''; ?>>Inativo</option>
                                    </select>
                                </label>
                            </div>
                        <dl>
                            <div><dt>Clientes</dt><dd><?php echo e($atendente['clientes']); ?></dd></div>
                            <div><dt>Compras</dt><dd><?php echo e($atendente['compras']); ?></dd></div>
                            <div><dt>Vendido</dt><dd><?php echo e(br_money($atendente['vendido'])); ?></dd></div>
                            <div><dt>Cashback</dt><dd><?php echo e(br_money($atendente['cashback'])); ?></dd></div>
                        </dl>
                            <label class="attendant-notes">
                                <span>Observacoes</span>
                                <textarea name="observacoes" rows="2" placeholder="Opcional"><?php echo e($atendente['observacoes'] ?? ''); ?></textarea>
                            </label>
                            <div class="attendant-actions">
                                <button class="btn primary" type="submit" name="action" value="update_attendant">Alterar</button>
                                <button class="btn danger" type="submit" name="action" value="delete_attendant" data-confirm-submit="Confirma excluir ou inativar este atendente?">Excluir</button>
                            </div>
                        </form>
                    </article>
                <?php endforeach; ?>
            <?php else : ?>
                <p class="muted">Nenhum atendente cadastrado ainda.</p>
            <?php endif; ?>
        </div>
    </div>
</section>

<section id="usuarios" class="panel section-block">
    <div class="section-title">
        <div>
            <span class="kicker">Acessos</span>
            <h2>Usuarios do sistema</h2>
        </div>
        <span class="soft-pill"><?php echo e(count($usuariosReport)); ?> usuario(s)</span>
    </div>

    <div class="message-grid">
        <?php foreach ($usuariosReport as $usuario) : ?>
            <article class="message-card user-access-card">
                <div class="message-card-head">
                    <div>
                        <strong><?php echo e($usuario['username']); ?></strong>
                        <span><?php echo e(ucfirst((string) $usuario['role'])); ?> | Criado em <?php echo e(br_date($usuario['created_at'], true)); ?></span>
                    </div>
                    <span class="soft-pill"><?php echo (int) $usuario['active'] === 1 ? 'ativo' : 'sem acesso'; ?></span>
                </div>

                <?php if ($loggedUser && (int) $loggedUser['id'] === (int) $usuario['id']) : ?>
                    <p>Este e o usuario em uso agora. Para evitar bloqueio acidental, ele nao pode ser removido nesta sessao.</p>
                <?php elseif ((int) $usuario['active'] !== 1) : ?>
                    <p>Acesso removido. O historico permanece preservado nos logs e relatorios.</p>
                <?php else : ?>
                    <form method="post" action="<?php echo e(app_url('relatorio.php#usuarios')); ?>" class="user-delete-form" data-no-enter-submit data-confirm-submit="Confirma remover este usuario do acesso?">
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="delete_user">
                        <input type="hidden" name="id" value="<?php echo e($usuario['id']); ?>">
                        <label>
                            <span>Senha para excluir</span>
                            <input type="password" name="delete_password" required placeholder="Senha interna">
                        </label>
                        <button class="btn danger" type="submit">Excluir usuario</button>
                    </form>
                <?php endif; ?>
            </article>
        <?php endforeach; ?>
    </div>
</section>

<section class="operation-hero compact-hero">
    <div>
        <span class="kicker">Exportacao Excel</span>
        <h2>Baixe os dados reais do cashback.</h2>
        <p>Use estes arquivos para conferencia, campanhas externas, backup operacional ou analise fora do sistema.</p>
    </div>
    <form method="get" action="<?php echo e(app_url('relatorio.php')); ?>" class="inline-form hero-filter">
        <label>
            <span>De</span>
            <input type="date" name="start" value="<?php echo e($start); ?>">
        </label>
        <label>
            <span>Ate</span>
            <input type="date" name="end" value="<?php echo e($end); ?>">
        </label>
        <button class="btn primary" type="submit">Atualizar periodo</button>
    </form>
</section>

<section class="metrics report-metrics">
    <article class="metric highlight"><span>Clientes ativos</span><strong><?php echo e($clientesAtivos); ?></strong></article>
    <article class="metric"><span>Compras no periodo</span><strong><?php echo e($comprasStats['compras'] ?? 0); ?></strong></article>
    <article class="metric"><span>Total vendido</span><strong><?php echo e(br_money($comprasStats['total_gasto'] ?? 0)); ?></strong></article>
    <article class="metric"><span>Cashback gerado</span><strong><?php echo e(br_money($gerado)); ?></strong></article>
    <article class="metric"><span>Cashback usado</span><strong><?php echo e(br_money($cashbackUsado)); ?></strong></article>
    <article class="metric"><span>Cashback expirado</span><strong><?php echo e(br_money($cashbackExpirado)); ?></strong></article>
    <article class="metric"><span>ROI simples</span><strong><?php echo e(number_format($roi, 2, ',', '.')); ?>%</strong></article>
</section>

<section class="panel">
    <div class="section-title">
        <div>
            <span class="kicker">Arquivos</span>
            <h2>Baixar relatorios</h2>
        </div>
        <span class="soft-pill"><?php echo e(br_date($start)); ?> ate <?php echo e(br_date($end)); ?></span>
    </div>

    <div class="message-grid">
        <?php foreach ($tipos as $tipo => $label) : ?>
            <article class="message-card">
                <div>
                    <strong><?php echo e($label); ?></strong>
                    <span>Exportacao CSV compativel com Excel</span>
                </div>
                <p>Arquivo gerado direto do MySQL, sem dados ficticios.</p>
                <div class="message-actions">
                    <a class="btn primary" href="<?php echo e(app_url('exportar.php?tipo=' . $tipo . '&start=' . $start . '&end=' . $end)); ?>">Baixar</a>
                </div>
            </article>
        <?php endforeach; ?>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
