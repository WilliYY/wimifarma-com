<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

tarefa_send_no_cache_headers();
$user = tarefa_require_user();
$flash = array('type' => '', 'message' => '');

try {
    tarefa_ensure_schema();
} catch (Throwable $schemaError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui preparar as tarefas agora. Verifique o banco.');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';

    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        set_flash('error', 'Sessao expirada. Tente novamente.');
        tarefa_redirect_home();
    }

    $action = (string) ($_POST['action'] ?? '');
    $statusActionConfirmed = (string) ($_POST['status_action'] ?? '') === $action;

    try {
        if ($action === 'create') {
            tarefa_create(
                (string) ($_POST['prioridade'] ?? 'normal'),
                (string) ($_POST['titulo'] ?? ''),
                (string) ($_POST['descricao'] ?? ''),
                (int) $user['id']
            );
            set_flash('success', 'Tarefa criada e colocada na fila.');
        } elseif ($action === 'update') {
            tarefa_update(
                (int) ($_POST['id'] ?? 0),
                (string) ($_POST['prioridade'] ?? 'normal'),
                (string) ($_POST['titulo'] ?? ''),
                (string) ($_POST['descricao'] ?? '')
            );
            set_flash('success', 'Tarefa atualizada.');
        } elseif ($action === 'complete') {
            if (!$statusActionConfirmed) {
                throw new InvalidArgumentException('Prioridade alterada nao conclui tarefa. Use o botao Concluir para fechar.');
            }
            tarefa_set_status((int) ($_POST['id'] ?? 0), 'concluida');
            set_flash('success', 'Tarefa concluida e movida para o historico.');
        } elseif ($action === 'cancel') {
            if (!$statusActionConfirmed) {
                throw new InvalidArgumentException('Prioridade alterada nao cancela tarefa. Use o botao Cancelar para fechar.');
            }
            tarefa_set_status((int) ($_POST['id'] ?? 0), 'cancelada');
            set_flash('success', 'Tarefa cancelada e movida para o historico.');
        } elseif ($action === 'reopen') {
            if (!$statusActionConfirmed) {
                throw new InvalidArgumentException('Use o botao Reabrir para devolver a tarefa para a fila.');
            }
            tarefa_set_status((int) ($_POST['id'] ?? 0), 'aberta');
            set_flash('success', 'Tarefa reaberta.');
        }
    } catch (InvalidArgumentException $error) {
        set_flash('error', $error->getMessage());
    } catch (Throwable $error) {
        set_flash('error', 'Nao consegui salvar essa tarefa agora.');
    }

    tarefa_redirect_home();
}

$storedFlash = get_flash();
if (!empty($storedFlash)) {
    $flash = $storedFlash;
}

$prioridades = tarefa_prioridades();
$counts = array('aberta' => 0, 'concluida' => 0, 'cancelada' => 0);
$openTasks = array();
$historyTasks = array();

try {
    $counts = tarefa_counts();
    $openTasks = tarefa_list('aberta');
    $historyTasks = tarefa_history();
} catch (Throwable $listError) {
    $flash = array('type' => 'error', 'message' => 'Nao consegui carregar as tarefas agora.');
}

function tarefa_priority_label(array $prioridades, string $prioridade): string
{
    return (string) ($prioridades[$prioridade]['label'] ?? 'Normal');
}

function tarefa_render_task(array $task, array $prioridades, bool $history = false): void
{
    $id = (int) ($task['id'] ?? 0);
    $prioridade = tarefa_valid_prioridade((string) ($task['prioridade'] ?? 'normal'));
    $status = tarefa_valid_status((string) ($task['status'] ?? 'aberta'));
    $titulo = (string) ($task['titulo'] ?? '');
    $descricao = trim((string) ($task['descricao'] ?? ''));
    $date = br_date($task['criado_em'] ?? '', true);
    $finishDate = $status === 'concluida' ? br_date($task['concluido_em'] ?? '', true) : br_date($task['cancelado_em'] ?? '', true);
    ?>
    <article class="task-row priority-<?php echo e($prioridade); ?> status-<?php echo e($status); ?>" data-task-row>
        <div class="task-priority">
            <span class="priority-pill"><?php echo e(tarefa_priority_label($prioridades, $prioridade)); ?></span>
            <small><?php echo e($status === 'aberta' ? $date : $finishDate); ?></small>
        </div>
        <div class="task-main">
            <h2><?php echo e($titulo); ?></h2>
            <?php if ($descricao !== '') : ?>
                <p><?php echo nl2br(e($descricao)); ?></p>
            <?php else : ?>
                <p class="task-muted">Sem descricao.</p>
            <?php endif; ?>

            <?php if (!$history) : ?>
                <details class="task-edit">
                    <summary>Editar</summary>
                    <form method="post" class="task-edit-form" data-task-edit-form>
                        <?php echo csrf_field(); ?>
                        <input type="hidden" name="action" value="update">
                        <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                        <label>
                            <span>Prioridade</span>
                            <select name="prioridade">
                                <?php foreach ($prioridades as $key => $item) : ?>
                                    <option value="<?php echo e((string) $key); ?>" <?php echo $key === $prioridade ? 'selected' : ''; ?>><?php echo e((string) $item['label']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>
                            <span>Titulo</span>
                            <input type="text" name="titulo" value="<?php echo e($titulo); ?>" maxlength="180" required>
                        </label>
                        <label>
                            <span>Descricao</span>
                            <textarea name="descricao" rows="3"><?php echo e($descricao); ?></textarea>
                        </label>
                        <button type="submit" class="task-btn task-btn-secondary">Salvar ajuste</button>
                    </form>
                </details>
            <?php endif; ?>
        </div>
        <div class="task-actions">
            <?php if ($status === 'aberta') : ?>
                <form method="post" data-task-status-form>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="complete">
                    <input type="hidden" name="status_action" value="complete">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <button type="submit" class="task-icon-btn complete" title="Concluir">Concluir</button>
                </form>
                <form method="post" data-task-status-form>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="cancel">
                    <input type="hidden" name="status_action" value="cancel">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <button type="submit" class="task-icon-btn cancel" title="Cancelar">Cancelar</button>
                </form>
            <?php else : ?>
                <form method="post" data-task-status-form>
                    <?php echo csrf_field(); ?>
                    <input type="hidden" name="action" value="reopen">
                    <input type="hidden" name="status_action" value="reopen">
                    <input type="hidden" name="id" value="<?php echo e((string) $id); ?>">
                    <button type="submit" class="task-icon-btn reopen" title="Reabrir">Reabrir</button>
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
    <title>Tarefas - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/tarefa/favicon.svg">
    <link rel="stylesheet" href="/tarefa/styles.css?v=20260507b">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260517f">
    <script src="/miauw/widget.js?v=20260517f" defer></script>
</head>
<body class="task-app-body">
    <header class="task-topbar">
        <a class="task-brand" href="/">
            <img src="/tarefa/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Tarefas</strong>
        </a>
        <nav class="task-nav" aria-label="Navegacao">
            <a href="/tarefa/logout.php">Sair</a>
        </nav>
    </header>

    <main class="task-page" data-miauby-screen-object="modulo tarefas" data-miauby-screen-label="Modulo Tarefas: <?php echo e((string) $counts['aberta']); ?> aberta(s), <?php echo e((string) $counts['concluida']); ?> concluida(s), <?php echo e((string) $counts['cancelada']); ?> cancelada(s)">
        <section class="task-hero">
            <div>
                <h1>Tarefas</h1>
            </div>
            <div class="task-stats" aria-label="Resumo">
                <span><strong><?php echo e((string) $counts['aberta']); ?></strong> aberta(s)</span>
                <span><strong><?php echo e((string) $counts['concluida']); ?></strong> concluida(s)</span>
                <span><strong><?php echo e((string) $counts['cancelada']); ?></strong> cancelada(s)</span>
            </div>
        </section>

        <?php if (!empty($flash['message'])) : ?>
            <div class="task-alert <?php echo e((string) $flash['type']); ?>"><?php echo e((string) $flash['message']); ?></div>
        <?php endif; ?>

        <section class="task-board">
            <form method="post" class="task-create">
                <?php echo csrf_field(); ?>
                <input type="hidden" name="action" value="create">
                <div class="task-create-head">
                    <span class="task-kicker">Nova tarefa</span>
                    <select name="prioridade" aria-label="Prioridade">
                        <option value="alta">Alta</option>
                        <option value="normal" selected>Normal</option>
                        <option value="baixa">Baixa</option>
                    </select>
                </div>
                <label>
                    <span>Titulo</span>
                    <input type="text" name="titulo" maxlength="180" placeholder="Ex.: Conferir pendencia do caixa" required>
                </label>
                <label>
                    <span>Descricao</span>
                    <textarea name="descricao" rows="4" placeholder="Detalhe curto para ninguem precisar adivinhar."></textarea>
                </label>
                <button type="submit" class="task-btn task-btn-primary">Criar tarefa</button>
            </form>

            <section class="task-list-panel">
                <div class="task-section-title">
                    <span class="task-kicker">Abertas por prioridade</span>
                    <strong><?php echo e((string) count($openTasks)); ?> na fila</strong>
                </div>
                <div class="task-list">
                    <?php if (empty($openTasks)) : ?>
                        <div class="task-empty">Sem tarefa aberta. Milagre administrativo, mas eu nao confio cegamente.</div>
                    <?php endif; ?>

                    <?php foreach ($openTasks as $task) : ?>
                        <?php tarefa_render_task($task, $prioridades); ?>
                    <?php endforeach; ?>
                </div>
            </section>
        </section>

        <details class="task-history">
            <summary>
                <span>Historico concluido/cancelado</span>
                <strong><?php echo e((string) count($historyTasks)); ?></strong>
            </summary>
            <div class="task-history-list">
                <?php if (empty($historyTasks)) : ?>
                    <div class="task-empty">Nada no historico ainda.</div>
                <?php endif; ?>
                <?php foreach ($historyTasks as $task) : ?>
                    <?php tarefa_render_task($task, $prioridades, true); ?>
                <?php endforeach; ?>
            </div>
        </details>
    </main>

    <script src="/tarefa/app.js?v=20260507b" defer></script>
</body>
</html>
