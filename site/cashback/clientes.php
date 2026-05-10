<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

$pageTitle = 'Clientes';
$editId = isset($_GET['edit']) ? (int) $_GET['edit'] : 0;
$search = trim((string) ($_GET['q'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $action = $_POST['action'] ?? '';

    if ($action === 'save') {
        $id = (int) ($_POST['id'] ?? 0);
        $nome = trim((string) ($_POST['nome'] ?? ''));
        $telefone = digits_only($_POST['telefone'] ?? '');
        $nascimento = trim((string) ($_POST['nascimento'] ?? ''));
        $observacoes = trim((string) ($_POST['observacoes'] ?? ''));
        $status = $_POST['status'] === 'inativo' ? 'inativo' : 'ativo';
        $atendenteId = (int) ($_POST['atendente_id'] ?? 0);

        if ($nome === '') {
            set_flash('error', 'Informe o nome do cliente.');
            redirect_to('clientes.php');
        }

        if ($nascimento !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $nascimento)) {
            set_flash('error', 'Data de nascimento invalida.');
            redirect_to('clientes.php');
        }

        try {
            $atendenteId = normalize_attendant_id($atendenteId);
        } catch (InvalidArgumentException $exception) {
            set_flash('error', $exception->getMessage());
            redirect_to('clientes.php');
        }

        if ($id > 0) {
            $stmt = db()->prepare(
                'UPDATE wf_clientes SET nome = ?, telefone = ?, nascimento = ?, observacoes = ?, status = ?, atendente_id = ? WHERE id = ?'
            );
            $stmt->execute(array($nome, $telefone ?: null, $nascimento ?: null, $observacoes ?: null, $status, $atendenteId, $id));
            log_action('cliente_atualizado', 'cliente', $id, 'Cliente atualizado: ' . $nome);
            set_flash('success', 'Cliente atualizado com sucesso.');
        } else {
            $stmt = db()->prepare(
                'INSERT INTO wf_clientes (nome, telefone, nascimento, observacoes, status, atendente_id) VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute(array($nome, $telefone ?: null, $nascimento ?: null, $observacoes ?: null, $status, $atendenteId));
            $id = (int) db()->lastInsertId();
            log_action('cliente_criado', 'cliente', $id, 'Cliente criado: ' . $nome);
            set_flash('success', 'Cliente cadastrado com sucesso.');
        }

        redirect_to('cliente-detalhe.php?id=' . $id);
    }

    if ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);

        $stmt = db()->prepare(
            'SELECT
                (SELECT COUNT(*) FROM wf_compras WHERE cliente_id = ?) +
                (SELECT COUNT(*) FROM wf_resgates WHERE cliente_id = ?) +
                (SELECT COUNT(*) FROM wf_cashback_creditos WHERE cliente_id = ?) AS total'
        );
        $stmt->execute(array($id, $id, $id));
        $hasHistory = (int) $stmt->fetchColumn() > 0;

        if ($hasHistory) {
            $stmt = db()->prepare("UPDATE wf_clientes SET status = 'inativo' WHERE id = ?");
            $stmt->execute(array($id));
            log_action('cliente_inativado', 'cliente', $id, 'Cliente inativado por possuir historico.');
            set_flash('success', 'Cliente possui historico e foi inativado para preservar os dados.');
        } else {
            $stmt = db()->prepare('DELETE FROM wf_clientes WHERE id = ?');
            $stmt->execute(array($id));
            log_action('cliente_excluido', 'cliente', $id, 'Cliente excluido sem historico.');
            set_flash('success', 'Cliente excluido.');
        }

        redirect_to('clientes.php');
    }
}

$cliente = array(
    'id' => 0,
    'nome' => '',
    'telefone' => '',
    'nascimento' => '',
    'observacoes' => '',
    'status' => 'ativo',
    'atendente_id' => '',
);

if ($editId > 0) {
    $stmt = db()->prepare('SELECT * FROM wf_clientes WHERE id = ? LIMIT 1');
    $stmt->execute(array($editId));
    $cliente = $stmt->fetch() ?: $cliente;
}

$params = array();
$sql = "SELECT c.*, a.nome AS atendente_nome
        FROM wf_clientes c
        LEFT JOIN wf_atendentes a ON a.id = c.atendente_id";

if ($search !== '') {
    $sql .= ' WHERE c.nome LIKE ? OR c.telefone LIKE ? OR c.id = ?';
    $params[] = '%' . $search . '%';
    $params[] = '%' . digits_only($search) . '%';
    $params[] = ctype_digit($search) ? (int) $search : 0;
}

$sql .= ' ORDER BY c.created_at DESC LIMIT 300';
$stmt = db()->prepare($sql);
$stmt->execute($params);
$clientes = $stmt->fetchAll();
$atendentes = atendentes_options();

require __DIR__ . '/header.php';
?>

<section class="grid two">
    <div class="panel">
        <h2><?php echo $editId ? 'Editar cliente' : 'Cadastrar cliente'; ?></h2>
        <form method="post" class="form-grid" data-no-enter-submit>
            <?php echo csrf_field(); ?>
            <input type="hidden" name="action" value="save">
            <input type="hidden" name="id" value="<?php echo e($cliente['id'] ?? 0); ?>">

            <label>
                <span>Nome *</span>
                <input type="text" name="nome" required value="<?php echo e($cliente['nome'] ?? ''); ?>">
            </label>
            <label>
                <span>Telefone</span>
                <input type="text" name="telefone" inputmode="numeric" placeholder="11999999999" value="<?php echo e($cliente['telefone'] ?? ''); ?>">
            </label>
            <label>
                <span>Data de nascimento</span>
                <input type="date" name="nascimento" value="<?php echo e($cliente['nascimento'] ?? ''); ?>">
            </label>
            <label>
                <span>Atendente responsavel</span>
                <select name="atendente_id">
                    <option value="">Sem atendente</option>
                    <?php foreach ($atendentes as $atendente) : ?>
                        <option value="<?php echo e($atendente['id']); ?>" <?php echo (int) ($cliente['atendente_id'] ?? 0) === (int) $atendente['id'] ? 'selected' : ''; ?>>
                            <?php echo e($atendente['nome']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                <span>Status</span>
                <select name="status">
                    <option value="ativo" <?php echo ($cliente['status'] ?? '') === 'ativo' ? 'selected' : ''; ?>>Ativo</option>
                    <option value="inativo" <?php echo ($cliente['status'] ?? '') === 'inativo' ? 'selected' : ''; ?>>Inativo</option>
                </select>
            </label>
            <label class="full">
                <span>Observacoes</span>
                <textarea name="observacoes" rows="4"><?php echo e($cliente['observacoes'] ?? ''); ?></textarea>
            </label>
            <div class="actions">
                <button type="submit" class="btn primary"><?php echo $editId ? 'Salvar alteracoes' : 'Cadastrar cliente'; ?></button>
                <?php if ($editId) : ?><a class="btn" href="<?php echo e(app_url('clientes.php')); ?>">Cancelar edicao</a><?php endif; ?>
            </div>
        </form>
    </div>

    <div class="panel">
        <h2>Busca rapida</h2>
        <form method="get" class="form-grid">
            <label>
                <span>Nome, telefone ou ID</span>
                <input type="search" name="q" value="<?php echo e($search); ?>" placeholder="Digite para localizar">
            </label>
            <button type="submit" class="btn primary">Buscar cliente</button>
            <a class="btn" href="<?php echo e(app_url('clientes.php')); ?>">Limpar busca</a>
        </form>
    </div>
</section>

<section class="panel">
    <h2>Clientes cadastrados</h2>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>Atendente</th>
                    <th>Status</th>
                    <th>Saldo</th>
                    <th>Acoes</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($clientes as $item) : ?>
                    <?php $saldo = balance_for_client((int) $item['id']); ?>
                    <tr>
                        <td>#<?php echo e($item['id']); ?></td>
                        <td><strong><?php echo e($item['nome']); ?></strong></td>
                        <td><?php echo e(format_phone($item['telefone'])); ?></td>
                        <td><?php echo e($item['atendente_nome'] ?: '-'); ?></td>
                        <td><span class="badge <?php echo e($item['status']); ?>"><?php echo e($item['status']); ?></span></td>
                        <td><?php echo e(br_money($saldo['saldo_disponivel'])); ?></td>
                        <td class="table-actions">
                            <a href="<?php echo e(app_url('cliente-detalhe.php?id=' . (int) $item['id'])); ?>">Historico</a>
                            <a href="<?php echo e(app_url('clientes.php?edit=' . (int) $item['id'])); ?>">Editar</a>
                            <form method="post" data-confirm-submit="Excluir ou inativar este cliente?">
                                <?php echo csrf_field(); ?>
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="id" value="<?php echo e($item['id']); ?>">
                                <button type="submit" class="link-danger">Excluir</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$clientes) : ?>
                    <tr><td colspan="7">Nenhum cliente encontrado.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</section>

<?php require __DIR__ . '/footer.php'; ?>
