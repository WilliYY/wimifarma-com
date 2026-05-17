<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = miauw_require_user();
miauw_ensure_schema();
$conversationId = miauw_current_conversation_id((int) $user['id']);
$messages = miauw_messages($conversationId);
$avatar = miauw_avatar_src();
$guardianAlerts = array();
$guardianAlertCount = 0;
$guardianPatterns = array();
$canOpenDiagnostics = function_exists('miauw_diagnostics_can_review') && miauw_diagnostics_can_review($user);
$trainingSummary = function_exists('miauw_training_summary') ? miauw_training_summary() : array();
$audioContract = function_exists('miauw_agent_audio_contract') ? miauw_agent_audio_contract() : array();

try {
    if (function_exists('miauw_guardian_scan')) {
        miauw_guardian_scan(false);
    }

    if (function_exists('miauw_intelligence_active_alerts')) {
        $guardianAlerts = function_exists('miauw_intelligence_public_alerts')
            ? miauw_intelligence_public_alerts(5)
            : miauw_intelligence_active_alerts(5);
        $guardianAlertCount = function_exists('miauw_intelligence_active_alert_count')
            ? miauw_intelligence_active_alert_count()
            : count(miauw_intelligence_active_alerts(30));
    }

    if (function_exists('miauw_intelligence_recent_patterns')) {
        $guardianPatterns = miauw_intelligence_recent_patterns(3);
    }
} catch (Throwable $error) {
    error_log('Miauby guardian panel error: ' . $error->getMessage());
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Miauby - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/miauw/favicon.svg">
    <link rel="alternate icon" href="/miauw/favicon.png">
    <link rel="stylesheet" href="/miauw/styles.css?v=<?php echo e(MIAUW_VERSION); ?>">
    <script src="/miauw/app.js?v=<?php echo e(MIAUW_VERSION); ?>" defer></script>
</head>
<body class="miauw-app-body">
    <header class="topbar">
        <a class="topbar-brand" href="/miauw/" aria-label="Miauby">
            <img src="/miauw/logo-wimifarma.svg" alt="Wimifarma">
            <strong>Miauby</strong>
        </a>
        <nav class="topbar-actions" aria-label="Menu Miauby">
            <a href="/cashback/">Cashback</a>
            <a href="/cotacao/">Cotacao</a>
            <a href="/financeiro/">Financeiro</a>
            <?php if ($canOpenDiagnostics) : ?>
                <a href="/miauw/treino.php">Treino</a>
                <a href="/miauw/diagnostico.php">Diagnostico</a>
            <?php endif; ?>
            <a class="soft" href="/miauw/logout.php">Sair</a>
        </nav>
    </header>

    <main
        class="miauw-shell"
        data-chat
        data-csrf="<?php echo e(csrf_token()); ?>"
        data-audio-enabled="<?php echo !empty($audioContract['ui_enabled']) ? '1' : '0'; ?>"
        data-audio-status="<?php echo e((string) ($audioContract['status'] ?? 'desativado')); ?>"
        data-audio-model="<?php echo e((string) ($audioContract['model'] ?? '')); ?>"
        data-audio-voice="<?php echo e((string) ($audioContract['voice'] ?? '')); ?>">
        <section class="chat-panel" aria-label="Conversa com Miauby">
            <div class="chat-header">
                <div class="agent">
                    <img src="<?php echo e($avatar); ?>" alt="Miauby">
                    <div>
                        <h1>Miauby</h1>
                        <p>Fiscal interno da operacao Wimifarma.</p>
                    </div>
                </div>
                <button class="btn ghost" type="button" data-clear-chat>Limpar conversa</button>
            </div>

            <div class="chat-feed" data-chat-feed aria-live="polite">
                <?php if (!$messages) : ?>
                    <article class="message assistant">
                        <img src="<?php echo e($avatar); ?>" alt="">
                        <div class="bubble">
                            <p>Miauby acordado. Diga a tela, o dado e o objetivo. Sem contexto, meu bigode entra em greve.</p>
                            <time><?php echo e(date('d/m/y H:i')); ?></time>
                        </div>
                    </article>
                <?php endif; ?>

                <?php foreach ($messages as $message) : ?>
                    <article class="message <?php echo $message['papel'] === 'assistant' ? 'assistant' : 'user'; ?>" data-message-id="<?php echo e((string) $message['id']); ?>">
                        <?php if ($message['papel'] === 'assistant') : ?>
                            <img src="<?php echo e($avatar); ?>" alt="">
                        <?php endif; ?>
                        <div class="bubble">
                            <p><?php echo nl2br(e($message['conteudo'])); ?></p>
                            <time><?php echo e(miauw_message_time((string) $message['created_at'])); ?></time>
                            <?php if ($message['papel'] === 'assistant') : ?>
                                <nav class="training-actions" data-training-actions data-message-id="<?php echo e((string) $message['id']); ?>" aria-label="Treinar resposta do Miauby">
                                    <button type="button" data-training-rating="boa">Boa</button>
                                    <button type="button" data-training-open>Treinar</button>
                                    <span data-training-status></span>
                                </nav>
                            <?php endif; ?>
                        </div>
                    </article>
                <?php endforeach; ?>
            </div>

            <form class="composer" data-chat-form autocomplete="off">
                <section class="audio-draft" data-audio-draft hidden aria-live="polite">
                    <div class="audio-draft-main">
                        <div class="audio-draft-head">
                            <span class="audio-draft-dot" aria-hidden="true"></span>
                            <strong>Audio pronto</strong>
                            <small data-audio-draft-duration>00:00</small>
                        </div>
                        <div class="audio-draft-player">
                            <audio data-audio-draft-player controls controlsList="nodownload noplaybackrate"></audio>
                            <span class="audio-draft-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
                        </div>
                    </div>
                    <p><strong>Transcricao:</strong> <span data-audio-draft-transcript></span></p>
                </section>
                <textarea name="message" rows="1" maxlength="1200" placeholder="Fala logo, humano..." required></textarea>
                <button
                    class="audio-button"
                    type="button"
                    data-audio-toggle
                    aria-label="Falar com Miauby"
                    aria-pressed="false"
                    title="Falar com Miauby"
                    <?php echo !empty($audioContract['ui_enabled']) ? '' : 'disabled'; ?>>
                    <span class="audio-button-dot" aria-hidden="true"></span>
                    <span data-audio-label>Falar</span>
                </button>
                <button class="audio-cancel-button" type="button" data-audio-cancel hidden>Descartar audio</button>
                <button class="send-button" type="submit" aria-label="Enviar">
                    <span>Enviar</span>
                </button>
            </form>
        </section>

        <aside class="side-panel" aria-label="Guardiao operacional do Miauby">
            <div class="guardian-card<?php echo $guardianAlertCount > 0 ? ' has-alerts' : ''; ?>">
                <div class="guardian-head">
                    <div>
                        <span>Guardiao operacional</span>
                        <strong><?php echo e((string) $guardianAlertCount); ?> alerta(s)</strong>
                    </div>
                    <i aria-hidden="true"></i>
                </div>

                <?php if ($guardianAlerts) : ?>
                    <div class="alert-list">
                        <?php foreach ($guardianAlerts as $alert) : ?>
                            <article class="alert-pill severity-<?php echo e((string) ($alert['severidade'] ?? 'media')); ?>">
                                <div class="alert-pill-main">
                                    <strong><?php echo e((string) ($alert['titulo'] ?? 'Alerta')); ?></strong>
                                    <span><?php echo e((string) ($alert['mensagem'] ?? '')); ?></span>
                                    <?php if (!empty($alert['acao_sugerida'])) : ?>
                                        <em><?php echo e((string) $alert['acao_sugerida']); ?></em>
                                    <?php endif; ?>
                                </div>
                                <button
                                    class="alert-dismiss"
                                    type="button"
                                    data-dismiss-alert="<?php echo e((string) ($alert['id'] ?? 0)); ?>"
                                    aria-label="Apagar alerta">
                                    Apagar
                                </button>
                            </article>
                        <?php endforeach; ?>
                    </div>
                <?php else : ?>
                    <p class="guardian-empty">Sem alerta ativo agora. Milagre operacional detectado, mas eu continuo olhando.</p>
                <?php endif; ?>

                <?php if ($guardianPatterns) : ?>
                    <div class="pattern-list">
                        <span>Padroes recentes</span>
                        <?php foreach ($guardianPatterns as $pattern) : ?>
                            <small><?php echo e((string) ($pattern['descricao'] ?? $pattern['chave'] ?? 'Padrao aprendido')); ?></small>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>

            <?php if ($canOpenDiagnostics) : ?>
                <div class="trainer-card">
                    <div class="guardian-head">
                        <div>
                            <span>Treinador Miauby</span>
                            <strong><?php echo e((string) ($trainingSummary['pendente'] ?? 0)); ?> pendente(s)</strong>
                        </div>
                        <i aria-hidden="true"></i>
                    </div>
                    <p class="guardian-empty">Use os botoes dos baloes para ensinar o jeito certo. Exemplo aprovado entra no contexto do Miauby sem apagar historico.</p>
                    <a class="trainer-link" href="/miauw/treino.php">Abrir treinador</a>
                </div>
            <?php endif; ?>
        </aside>
    </main>
</body>
</html>
