<?php
if (!defined('ABSPATH')) {
    exit;
}

$wpdb     = $plugin->db->get_wpdb();
$category = sanitize_text_field(wp_unslash($_GET['category'] ?? ''));
$status   = sanitize_text_field(wp_unslash($_GET['status'] ?? ''));
$search   = sanitize_text_field(wp_unslash($_GET['s'] ?? ''));
$where    = 'WHERE 1=1';

if ($category !== '') {
    $where .= $wpdb->prepare(' AND category = %s', $category);
}

if ($status !== '') {
    $where .= $wpdb->prepare(' AND status = %s', $status);
}

if ($search !== '') {
    $like  = '%' . $wpdb->esc_like($search) . '%';
    $where .= $wpdb->prepare(' AND (event_type LIKE %s OR reference_key LIKE %s OR response_body LIKE %s OR payload LIKE %s)', $like, $like, $like, $like);
}

$logs = $wpdb->get_results(
    "SELECT * FROM {$plugin->db->table('logs')} {$where} ORDER BY created_at DESC LIMIT 200",
    ARRAY_A
);
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Logs</span>
            <h1>Auditoria enxuta para acompanhar automacoes e falhas.</h1>
            <p>Filtre rapidamente envios, retries, cron e eventos sensiveis para entender o que aconteceu sem sair do fluxo administrativo.</p>
        </div>

        <aside class="wfwc-command-side">
            <form method="get" action="<?php echo esc_url(wfwc_route_base_url()); ?>" class="wfwc-period-card">
                <?php wfwc_render_route_hidden_page('wfwc-logs'); ?>
                <div class="wfwc-panel-header wfwc-panel-header-compact">
                    <div>
                        <span class="wfwc-kicker">Filtro</span>
                        <h2>Localizar eventos</h2>
                    </div>
                </div>
                <label>
                    <span>Categoria</span>
                    <select name="category">
                        <option value="">Todas as categorias</option>
                        <option value="automation" <?php selected($category, 'automation'); ?>>Automacao</option>
                        <option value="security" <?php selected($category, 'security'); ?>>Seguranca</option>
                    </select>
                </label>
                <label>
                    <span>Status</span>
                    <select name="status">
                        <option value="">Todos os status</option>
                        <option value="sent" <?php selected($status, 'sent'); ?>>Enviado</option>
                        <option value="failed" <?php selected($status, 'failed'); ?>>Falhou</option>
                        <option value="skipped" <?php selected($status, 'skipped'); ?>>Ignorado</option>
                        <option value="success" <?php selected($status, 'success'); ?>>Sucesso</option>
                        <option value="info" <?php selected($status, 'info'); ?>>Informativo</option>
                    </select>
                </label>
                <label>
                    <span>Busca</span>
                    <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Evento, referencia ou resposta">
                </label>
                <button type="submit" class="button button-primary">Filtrar</button>
            </form>
        </aside>
    </section>

    <section class="wfwc-panel">
        <div class="wfwc-panel-header">
            <div>
                <span class="wfwc-kicker">Auditoria</span>
                <h2>Ultimos registros</h2>
                <p>Os eventos mais recentes de automacao e seguranca ficam visiveis em uma unica grade.</p>
            </div>
            <span class="wfwc-counter"><?php echo esc_html(number_format_i18n(count($logs))); ?></span>
        </div>
        <div class="table-responsive">
            <table class="widefat striped wfwc-data-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Categoria</th>
                        <th>Evento</th>
                        <th>Status</th>
                        <th>Ref./tentativa</th>
                        <th>Relacionamento</th>
                        <th>Codigo</th>
                        <th>Resumo</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($logs)) : ?>
                        <tr>
                            <td colspan="8" class="wfwc-empty-state">Nenhum log encontrado.</td>
                        </tr>
                    <?php else : ?>
                        <?php foreach ($logs as $log) : ?>
                            <?php
                            $payload = json_decode((string) $log['payload'], true);
                            $attempt = '';

                            if (is_array($payload) && !empty($payload['meta']['attempt_number'])) {
                                $attempt = 'Tentativa ' . absint($payload['meta']['attempt_number']);
                            }
                            ?>
                            <tr class="<?php echo 'failed' === $log['status'] ? 'is-highlighted' : ''; ?>">
                                <td><?php echo esc_html(wfwc_format_datetime($log['created_at'])); ?></td>
                                <td><?php echo esc_html($log['category']); ?></td>
                                <td><?php echo esc_html($log['event_type']); ?></td>
                                <td><span class="wfwc-badge wfwc-badge-<?php echo esc_attr($log['status']); ?>"><?php echo esc_html($log['status']); ?></span></td>
                                <td>
                                    <strong><?php echo esc_html($log['reference_key'] ?: '-'); ?></strong><br>
                                    <span><?php echo esc_html($attempt ?: '-'); ?></span>
                                </td>
                                <td><?php echo esc_html(trim(($log['related_type'] ?: '-') . ' #' . ($log['related_id'] ?: '-'))); ?></td>
                                <td><?php echo esc_html($log['response_code'] ?: '-'); ?></td>
                                <td><?php echo esc_html(wp_trim_words($log['response_body'] ?: $log['payload'], 18)); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </section>
</div>
