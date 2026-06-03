<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = miauw_require_user();
if (!function_exists('miauw_diagnostics_can_review') || !miauw_diagnostics_can_review($user)) {
    http_response_code(403);
    echo 'Acesso restrito ao treinador do Miauby.';
    exit;
}

miauw_ensure_schema();

$notice = $_SESSION['miauw_training_notice'] ?? null;
unset($_SESSION['miauw_training_notice']);

$allowedStatus = array('pendente', 'aprovado', 'rejeitado', 'superado');
$filter = strtolower(trim((string) ($_GET['status'] ?? 'pendente')));
if (!in_array($filter, $allowedStatus, true)) {
    $filter = 'pendente';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    $ok = is_string($token) && hash_equals(csrf_token(), $token);

    if (!$ok) {
        $_SESSION['miauw_training_notice'] = array('type' => 'error', 'message' => 'Sessao expirada. Atualize e tente de novo.');
    } else {
        $id = (int) ($_POST['id'] ?? 0);
        $status = (string) ($_POST['status'] ?? 'pendente');
        $ideal = (string) ($_POST['ideal'] ?? '');
        $category = (string) ($_POST['category'] ?? '');
        $style = (string) ($_POST['style'] ?? '');
        $note = (string) ($_POST['note'] ?? '');
        $done = $id > 0 && miauw_training_review_item($id, $status, (int) $user['id'], $ideal, $category, $style, $note);

        $_SESSION['miauw_training_notice'] = $done
            ? array('type' => 'success', 'message' => 'Treino revisado. Historico preservado, sem apagar nada.')
            : array('type' => 'error', 'message' => 'Nao consegui revisar esse treino agora.');
    }

    $redirectStatus = in_array((string) ($_POST['filter'] ?? ''), $allowedStatus, true) ? (string) $_POST['filter'] : $filter;
    header('Location: /miauw/treino.php?status=' . rawurlencode($redirectStatus));
    exit;
}

$summary = miauw_training_summary();
$items = miauw_training_items($filter, 60);
$agent = function_exists('miauw_agent_public_status') ? miauw_agent_public_status() : array();
$nextPhase = function_exists('miauw_agent_next_phase_contract') ? miauw_agent_next_phase_contract() : array();
$voiceProfile = function_exists('miauw_agent_voice_profile_contract') ? miauw_agent_voice_profile_contract() : array();
$audioContract = is_array($voiceProfile['audio'] ?? null) ? $voiceProfile['audio'] : array();
$avatar = miauw_avatar_src();

function miauw_training_date_label(string $date): string
{
    $timestamp = $date !== '' ? strtotime($date) : false;
    if (!$timestamp) {
        return 'sem data';
    }

    return date('d/m/y H:i', $timestamp);
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Treinador Miauby - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/miauw/favicon.svg">
    <link rel="alternate icon" href="/miauw/favicon.png">
    <link rel="stylesheet" href="/miauw/styles.css?v=<?php echo e(MIAUW_VERSION); ?>">
</head>
<body class="miauw-app-body">
    <header class="topbar">
        <a class="topbar-brand" href="/miauw/" aria-label="Miauby">
            <img src="/miauw/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Miauby</strong>
        </a>
        <nav class="topbar-actions" aria-label="Menu Miauby">
            <a href="/">Home</a>
            <a href="/miauw/">Chat</a>
            <a href="/miauw/diagnostico.php">Diagnostico</a>
        </nav>
    </header>

    <main class="training-shell">
        <section class="diagnostic-hero">
            <div class="agent diagnostic-agent">
                <img src="<?php echo e($avatar); ?>" alt="Miauby">
                <div>
                    <span class="diag-kicker"><?php echo e((string) ($nextPhase['fase_atual'] ?? 'Fase atual')); ?></span>
                    <h1>Treinador do Miauby</h1>
                    <p>Feedback do chat, exemplos aprovados, perfil compilado e voz/tom antes de audio oficial.</p>
                </div>
            </div>
            <div class="diag-version">
                <strong><?php echo e((string) ($agent['version'] ?? '')); ?></strong>
                <span><?php echo e((string) ($agent['policy_version'] ?? '')); ?></span>
            </div>
        </section>

        <?php if (is_array($notice)) : ?>
            <div class="diag-notice <?php echo e((string) ($notice['type'] ?? 'info')); ?>">
                <?php echo e((string) ($notice['message'] ?? '')); ?>
            </div>
        <?php endif; ?>

        <?php if ($voiceProfile) : ?>
            <div class="diag-notice">
                Voz atual: <?php echo e((string) ($voiceProfile['label'] ?? 'Miauby padrao')); ?>.
                Audio: <?php echo e((string) ($audioContract['status'] ?? 'desativado')); ?>, sem microfone ou gravacao nesta fase.
            </div>
        <?php endif; ?>

        <section class="diag-grid" aria-label="Resumo do treino">
            <?php foreach ($allowedStatus as $statusName) : ?>
                <article class="diag-card">
                    <span><?php echo e($statusName); ?></span>
                    <strong><?php echo e((string) ($summary[$statusName] ?? 0)); ?></strong>
                    <p><?php echo $statusName === 'aprovado' ? 'Entra no contexto do Miauby.' : 'Historico preservado para revisao.'; ?></p>
                </article>
            <?php endforeach; ?>
        </section>

        <nav class="training-filters" aria-label="Filtros do treino">
            <?php foreach ($allowedStatus as $statusName) : ?>
                <a class="<?php echo $filter === $statusName ? 'is-active' : ''; ?>" href="/miauw/treino.php?status=<?php echo e($statusName); ?>">
                    <?php echo e(ucfirst($statusName)); ?> (<?php echo e((string) ($summary[$statusName] ?? 0)); ?>)
                </a>
            <?php endforeach; ?>
        </nav>

        <section class="training-list" aria-label="Itens de treino">
            <?php if (!$items) : ?>
                <p class="training-empty">Nada nessa fila agora. Quando o chat receber feedback, aparece aqui.</p>
            <?php endif; ?>

            <?php foreach ($items as $item) : ?>
                <?php
                $ideal = trim((string) ($item['resposta_ideal'] ?? ''));
                if ($ideal === '') {
                    $ideal = (string) ($item['resposta_original'] ?? '');
                }
                ?>
                <article class="training-row">
                    <div class="training-copy">
                        <small>
                            #<?php echo e((string) ($item['id'] ?? 0)); ?>
                            v<?php echo e((string) ($item['versao'] ?? 1)); ?>
                            | <?php echo e((string) ($item['avaliacao'] ?? 'ajuste')); ?>
                            | <?php echo e((string) ($item['motivo'] ?? 'manual')); ?>
                            | <?php echo e(miauw_training_date_label((string) ($item['created_at'] ?? ''))); ?>
                        </small>
                        <div>
                            <strong>Pergunta</strong>
                            <p><?php echo nl2br(e((string) ($item['pergunta'] ?? ''))); ?></p>
                        </div>
                        <div>
                            <strong>Resposta original</strong>
                            <p><?php echo nl2br(e((string) ($item['resposta_original'] ?? ''))); ?></p>
                        </div>
                        <span class="training-meta">Status atual: <?php echo e((string) ($item['status'] ?? '')); ?></span>
                    </div>

                    <form class="training-form" method="post">
                        <input type="hidden" name="csrf_token" value="<?php echo e(csrf_token()); ?>">
                        <input type="hidden" name="id" value="<?php echo e((string) ($item['id'] ?? 0)); ?>">
                        <input type="hidden" name="filter" value="<?php echo e($filter); ?>">
                        <label>
                            Resposta ideal
                            <textarea name="ideal" maxlength="1200"><?php echo e($ideal); ?></textarea>
                        </label>
                        <label>
                            Tema
                            <input name="category" maxlength="80" value="<?php echo e((string) ($item['categoria'] ?? 'geral')); ?>">
                        </label>
                        <label>
                            Estilo
                            <input name="style" maxlength="80" value="<?php echo e((string) ($item['estilo'] ?? 'miauby')); ?>">
                        </label>
                        <label>
                            Observacao
                            <input name="note" maxlength="500" value="<?php echo e((string) ($item['observacao'] ?? '')); ?>">
                        </label>
                        <nav>
                            <button class="diag-btn ok" type="submit" name="status" value="aprovado">Aprovar</button>
                            <button class="diag-btn warn" type="submit" name="status" value="rejeitado">Rejeitar</button>
                            <button class="diag-btn" type="submit" name="status" value="superado">Superar</button>
                            <button class="diag-btn" type="submit" name="status" value="pendente">Pendente</button>
                        </nav>
                    </form>
                </article>
            <?php endforeach; ?>
        </section>
    </main>
</body>
</html>
