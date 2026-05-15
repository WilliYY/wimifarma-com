<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = miauw_require_user();
if (!miauw_diagnostics_can_review($user)) {
    http_response_code(403);
    echo 'Acesso restrito ao diagnostico do Miauby.';
    exit;
}

miauw_diagnostics_ensure_review_columns();

$notice = $_SESSION['miauw_diagnostics_notice'] ?? null;
unset($_SESSION['miauw_diagnostics_notice']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    $ok = is_string($token) && hash_equals(csrf_token(), $token);

    if (!$ok) {
        $_SESSION['miauw_diagnostics_notice'] = array('type' => 'error', 'message' => 'Sessao expirada. Atualize e tente de novo.');
    } else {
        $kind = (string) ($_POST['kind'] ?? '');
        $id = (int) ($_POST['id'] ?? 0);
        $status = (string) ($_POST['status'] ?? '');
        $done = miauw_diagnostics_review_item($kind, $id, $status, (int) $user['id']);
        $_SESSION['miauw_diagnostics_notice'] = $done
            ? array('type' => 'success', 'message' => 'Revisao registrada. Nada foi apagado.')
            : array('type' => 'error', 'message' => 'Nao consegui registrar essa revisao.');
    }

    header('Location: /miauw/diagnostico.php');
    exit;
}

$data = miauw_diagnostics_panel_data(true);
$summary = $data['summary'];
$agent = $summary['agent'] ?? array();
$nextPhase = $summary['next_phase'] ?? array();
$agentService = $summary['agent_service'] ?? array();
$api = $summary['api'] ?? array();
$skills = $summary['skills'] ?? array();
$models = $summary['models'] ?? array();
$memCounts = $summary['memorias'] ?? array();
$patternCounts = $summary['padroes'] ?? array();
$messageStats = $summary['mensagens_24h'] ?? array();
$traceStats = $summary['traces_24h'] ?? array();
$avatar = miauw_avatar_src();

function miauw_diag_api_status_label(array $api): string
{
    $status = (string) ($api['status'] ?? '');

    if ($status === 'configured_not_validated') {
        return 'Configurada';
    }

    if ($status === 'missing') {
        return 'Pendente';
    }

    return $status !== '' ? $status : 'Indefinido';
}

function miauw_diag_agent_service_label(array $service): string
{
    $status = (string) ($service['status'] ?? '');
    if (!empty($service['reachable']) && $status === 'ok') {
        return 'Sombra ativa';
    }

    if ($status === 'not_checked') {
        return 'Nao checado';
    }

    if ($status === 'unavailable') {
        return 'Indisponivel';
    }

    return $status !== '' ? $status : 'Offline';
}

function miauw_diag_date_label(string $date): string
{
    $timestamp = $date !== '' ? strtotime($date) : false;
    if (!$timestamp) {
        return 'sem data';
    }

    return date('d/m/y H:i', $timestamp);
}

function miauw_diag_review_buttons(string $kind, int $id): string
{
    $csrf = e(csrf_token());
    $kindValue = e($kind);
    $idValue = e((string) $id);

    return '<form class="diag-actions" method="post">'
        . '<input type="hidden" name="csrf_token" value="' . $csrf . '">'
        . '<input type="hidden" name="kind" value="' . $kindValue . '">'
        . '<input type="hidden" name="id" value="' . $idValue . '">'
        . '<button class="diag-btn ok" type="submit" name="status" value="aprovado">Aprovar</button>'
        . '<button class="diag-btn warn" type="submit" name="status" value="ignorado">Ignorar</button>'
        . '</form>';
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Diagnostico Miauby - Wimifarma</title>
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
            <a href="/miauw/">Chat</a>
            <a href="/cashback/">Cashback</a>
            <a href="/cotacao/">Cotacao</a>
            <a href="/financeiro/">Financeiro</a>
            <a class="soft" href="/miauw/logout.php">Sair</a>
        </nav>
    </header>

    <main class="diagnostic-shell">
        <section class="diagnostic-hero">
            <div class="agent diagnostic-agent">
                <img src="<?php echo e($avatar); ?>" alt="Miauby">
                <div>
                    <span class="diag-kicker">Fase 7</span>
                    <h1>Diagnostico do Miauby</h1>
                    <p>Saude, evals, skills, traces, alertas, memorias e padroes em revisao.</p>
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

        <section class="diag-grid" aria-label="Resumo do Miauby">
            <article class="diag-card">
                <span>Camada online</span>
                <strong><?php echo e(miauw_diag_api_status_label($api)); ?></strong>
                <p><?php echo e((string) ($api['message'] ?? '')); ?></p>
            </article>
            <article class="diag-card">
                <span>Skills</span>
                <strong><?php echo e((string) ($skills['total'] ?? 0)); ?></strong>
                <p><?php echo e((string) ($skills['openai_tools'] ?? 0)); ?> tool(s) online, <?php echo e((string) ($skills['acoes_locais'] ?? 0)); ?> acao(oes) locais.</p>
            </article>
            <article class="diag-card">
                <span>Alertas ativos</span>
                <strong><?php echo e((string) ($summary['alertas_ativos'] ?? 0)); ?></strong>
                <p>Riscos e pendencias ainda abertos no guardiao.</p>
            </article>
            <article class="diag-card">
                <span>Mensagens 24h</span>
                <strong><?php echo e((string) ($messageStats['total'] ?? 0)); ?></strong>
                <p><?php echo e((string) ($messageStats['fallback'] ?? 0)); ?> fallback(s) registrado(s).</p>
            </article>
            <article class="diag-card">
                <span>Traces 24h</span>
                <strong><?php echo e((string) ($traceStats['total'] ?? 0)); ?></strong>
                <p><?php echo e((string) ($traceStats['confirmacoes'] ?? 0)); ?> confirmacao(oes), <?php echo e((string) ($traceStats['erros'] ?? 0)); ?> erro(s).</p>
            </article>
            <article class="diag-card">
                <span>Servico agente</span>
                <strong><?php echo e(miauw_diag_agent_service_label(is_array($agentService) ? $agentService : array())); ?></strong>
                <p><?php echo e((string) ($agentService['phase'] ?? 'modo sombra')); ?> | escrita <?php echo !empty($agentService['writes_enabled']) ? 'ativa' : 'bloqueada'; ?></p>
            </article>
        </section>

        <section class="diag-two">
            <article class="diag-panel">
                <div class="diag-panel-head">
                    <div>
                        <span>Modelos</span>
                        <h2>Rotas atuais</h2>
                    </div>
                </div>
                <div class="diag-list compact">
                    <p><strong>Fast</strong><span><?php echo e((string) ($models['fast'] ?? '')); ?></span></p>
                    <p><strong>Smart</strong><span><?php echo e((string) ($models['smart'] ?? '')); ?></span></p>
                    <p><strong>Boss</strong><span><?php echo e((string) ($models['boss'] ?? '')); ?></span></p>
                </div>
            </article>

            <article class="diag-panel">
                <div class="diag-panel-head">
                    <div>
                        <span>Registry</span>
                        <h2>Distribuicao das skills</h2>
                    </div>
                </div>
                <div class="diag-tags">
                    <?php foreach ((array) ($skills['por_modulo'] ?? array()) as $module => $total) : ?>
                        <span><?php echo e((string) $module); ?>: <?php echo e((string) $total); ?></span>
                    <?php endforeach; ?>
                    <?php if (!empty($skills['executores_indisponiveis'])) : ?>
                        <b>Executor ausente: <?php echo e(implode(', ', (array) $skills['executores_indisponiveis'])); ?></b>
                    <?php endif; ?>
                </div>
            </article>
        </section>

        <section class="diag-panel">
            <div class="diag-panel-head">
                <div>
                    <span>Fase 7</span>
                    <h2>Contrato do servico agente</h2>
                </div>
                <p><?php echo e((string) ($nextPhase['runtime'] ?? '')); ?></p>
            </div>
            <div class="diag-list compact">
                <p><strong>Destino</strong><span><?php echo e((string) ($nextPhase['sdk'] ?? '')); ?> | <?php echo e((string) ($nextPhase['endpoint_interno'] ?? '')); ?></span></p>
                <p><strong>Modo</strong><span><?php echo e((string) ($nextPhase['modo'] ?? '')); ?> | servico <?php echo e(miauw_diag_agent_service_label(is_array($agentService) ? $agentService : array())); ?></span></p>
                <p><strong>Compatibilidade</strong><span><?php echo e((string) ($nextPhase['compatibilidade'] ?? '')); ?></span></p>
            </div>
            <div class="diag-tags">
                <?php foreach ((array) ($nextPhase['pronto_agora'] ?? array()) as $name => $ready) : ?>
                    <span><?php echo e((string) $name); ?>: <?php echo !empty($ready) ? 'pronto' : 'pendente'; ?></span>
                <?php endforeach; ?>
            </div>
        </section>

        <section class="diag-panel" id="memorias">
            <div class="diag-panel-head">
                <div>
                    <span>Memorias</span>
                    <h2>Revisao pendente</h2>
                </div>
                <p><?php echo e((string) ($memCounts['pendente'] ?? 0)); ?> pendente(s), <?php echo e((string) ($memCounts['aprovado'] ?? 0)); ?> aprovada(s).</p>
            </div>

            <?php if (!empty($data['memories'])) : ?>
                <div class="diag-table">
                    <?php foreach ($data['memories'] as $memory) : ?>
                        <article class="diag-row">
                            <div>
                                <span><?php echo e((string) $memory['modulo']); ?> | <?php echo e((string) $memory['origem']); ?></span>
                                <strong><?php echo e((string) $memory['chave']); ?></strong>
                                <p><?php echo e((string) $memory['valor']); ?></p>
                                <small>Peso <?php echo e(number_format((float) $memory['peso'], 2, ',', '.')); ?> | usos <?php echo e((string) $memory['usos']); ?> | <?php echo e(miauw_diag_date_label((string) $memory['updated_at'])); ?></small>
                            </div>
                            <?php echo miauw_diag_review_buttons('memoria', (int) $memory['id']); ?>
                        </article>
                    <?php endforeach; ?>
                </div>
            <?php else : ?>
                <p class="diag-empty">Sem memoria pendente para revisar.</p>
            <?php endif; ?>
        </section>

        <section class="diag-panel" id="padroes">
            <div class="diag-panel-head">
                <div>
                    <span>Padroes</span>
                    <h2>Aprendizados em revisao</h2>
                </div>
                <p><?php echo e((string) ($patternCounts['pendente'] ?? 0)); ?> pendente(s), <?php echo e((string) ($patternCounts['aprovado'] ?? 0)); ?> aprovado(s).</p>
            </div>

            <?php if (!empty($data['patterns'])) : ?>
                <div class="diag-table">
                    <?php foreach ($data['patterns'] as $pattern) : ?>
                        <article class="diag-row">
                            <div>
                                <span><?php echo e((string) $pattern['modulo']); ?> | <?php echo e((string) $pattern['tipo']); ?></span>
                                <strong><?php echo e((string) $pattern['chave']); ?></strong>
                                <p><?php echo e((string) $pattern['descricao']); ?></p>
                                <small><?php echo e((string) $pattern['contador']); ?> ocorrencia(s) | confianca <?php echo e(number_format((float) $pattern['confianca'] * 100, 0, ',', '.')); ?>% | <?php echo e(miauw_diag_date_label((string) $pattern['last_seen_at'])); ?></small>
                            </div>
                            <?php echo miauw_diag_review_buttons('padrao', (int) $pattern['id']); ?>
                        </article>
                    <?php endforeach; ?>
                </div>
            <?php else : ?>
                <p class="diag-empty">Sem padrao pendente para revisar.</p>
            <?php endif; ?>
        </section>

        <section class="diag-two">
            <article class="diag-panel">
                <div class="diag-panel-head">
                    <div>
                        <span>Rastreabilidade</span>
                        <h2>Tools recentes</h2>
                    </div>
                </div>
                <div class="diag-list">
                    <?php foreach ((array) ($data['traces'] ?? array()) as $trace) : ?>
                        <p><strong><?php echo e((string) $trace['ferramenta']); ?> | <?php echo e((string) $trace['status']); ?></strong><span><?php echo e((string) $trace['modulo']); ?> | <?php echo e((string) $trace['risco']); ?><?php echo !empty($trace['confirmacao']) ? ' | confirmacao' : ''; ?> | <?php echo e(miauw_diag_date_label((string) $trace['created_at'])); ?><?php echo (int) ($trace['duracao_ms'] ?? 0) > 0 ? ' | ' . e((string) $trace['duracao_ms']) . 'ms' : ''; ?><br><?php echo e((string) $trace['resumo']); ?></span></p>
                    <?php endforeach; ?>
                    <?php if (empty($data['traces'])) : ?>
                        <p><strong>Sem trace recente</strong><span>Nenhuma tool registrada ainda nas ultimas operacoes.</span></p>
                    <?php endif; ?>
                </div>
            </article>

            <article class="diag-panel">
                <div class="diag-panel-head">
                    <div>
                        <span>Alertas</span>
                        <h2>Fila operacional</h2>
                    </div>
                </div>
                <div class="diag-list">
                    <?php foreach ((array) $data['alerts'] as $alert) : ?>
                        <p><strong><?php echo e((string) ($alert['titulo'] ?? 'Alerta')); ?></strong><span><?php echo e((string) ($alert['mensagem'] ?? '')); ?></span></p>
                    <?php endforeach; ?>
                    <?php if (empty($data['alerts'])) : ?>
                        <p><strong>Sem alerta ativo</strong><span>O guardiao nao encontrou pendencia aberta agora.</span></p>
                    <?php endif; ?>
                </div>
            </article>

            <article class="diag-panel">
                <div class="diag-panel-head">
                    <div>
                        <span>Falhas recentes</span>
                        <h2>Diagnostico interno</h2>
                    </div>
                </div>
                <div class="diag-list">
                    <?php foreach ((array) $data['events'] as $event) : ?>
                        <p><strong><?php echo e((string) $event['title']); ?></strong><span><?php echo e((string) $event['module']); ?> | <?php echo e((string) $event['type']); ?> | <?php echo e(miauw_diag_date_label((string) $event['created_at'])); ?></span></p>
                    <?php endforeach; ?>
                    <?php if (empty($data['events'])) : ?>
                        <p><strong>Sem falha recente</strong><span>Nenhum diagnostico interno no arquivo mensal atual.</span></p>
                    <?php endif; ?>
                </div>
            </article>
        </section>
    </main>
</body>
</html>
