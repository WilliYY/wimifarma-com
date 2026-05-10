<?php
if (!defined('ABSPATH')) {
    exit;
}

$edit_id    = absint($_GET['edit'] ?? 0);
$attendant  = $edit_id ? $plugin->attendants->get_attendant($edit_id) : array();
$attendants = $plugin->attendants->get_attendants(array('limit' => 200));
$wp_users   = get_users(
    array(
        'fields' => array('ID', 'display_name', 'user_email'),
        'number' => 200,
    )
);
$active_count = count(
    array_filter(
        $attendants,
        static function ($item) {
            return isset($item['status']) && 'active' === $item['status'];
        }
    )
);
$linked_count = count(
    array_filter(
        $attendants,
        static function ($item) {
            return !empty($item['wp_user_id']);
        }
    )
);
?>
<div class="wrap wfwc-wrap">
    <section class="wfwc-command-bar wfwc-command-bar-compact">
        <div class="wfwc-command-main">
            <span class="wfwc-kicker">Equipe</span>
            <h1>Equipe pronta para operar o cashback com agilidade.</h1>
            <p>Centralize os atendentes, vincule usuarios do WordPress e mantenha a operacao organizada para cadastro, venda e consulta de saldo.</p>

            <div class="wfwc-action-strip">
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-clients')); ?>">Clientes</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-purchases')); ?>">Compras</a>
                <a class="wfwc-quick-link" href="<?php echo esc_url(wfwc_admin_page_url('wfwc-reports')); ?>">Relatorios</a>
            </div>
        </div>

        <aside class="wfwc-command-side">
            <div class="wfwc-side-stat-list">
                <div class="wfwc-side-stat">
                    <span>Total cadastrado</span>
                    <strong><?php echo esc_html(number_format_i18n(count($attendants))); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Ativos</span>
                    <strong><?php echo esc_html(number_format_i18n($active_count)); ?></strong>
                </div>
                <div class="wfwc-side-stat">
                    <span>Vinculados ao WordPress</span>
                    <strong><?php echo esc_html(number_format_i18n($linked_count)); ?></strong>
                </div>
            </div>
        </aside>
    </section>

    <div class="wfwc-grid wfwc-grid-main">
        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Cadastro</span>
                    <h2><?php echo $edit_id ? 'Editar atendente' : 'Novo atendente'; ?></h2>
                    <p>Formulario objetivo para uso interno e controle de acesso da equipe.</p>
                </div>
            </div>
            <?php
            echo wfwc_render_template(
                'attendant-form.php',
                array(
                    'attendant' => $attendant,
                    'wp_users'  => $wp_users,
                )
            );
            ?>
        </section>

        <section class="wfwc-panel">
            <div class="wfwc-panel-header">
                <div>
                    <span class="wfwc-kicker">Lista</span>
                    <h2>Equipe cadastrada</h2>
                    <p>Visual simples para localizar rapidamente quem esta apto a registrar compras e clientes.</p>
                </div>
                <span class="wfwc-counter"><?php echo esc_html(number_format_i18n(count($attendants))); ?></span>
            </div>
            <div class="table-responsive">
                <table class="widefat striped wfwc-data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Status</th>
                            <th>Usuario WordPress</th>
                            <th>Criado em</th>
                            <th>Acoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($attendants)) : ?>
                            <tr>
                                <td colspan="5" class="wfwc-empty-state">Nenhum atendente cadastrado.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($attendants as $item) : ?>
                                <?php $user = !empty($item['wp_user_id']) ? get_user_by('id', $item['wp_user_id']) : null; ?>
                                <tr class="<?php echo 'active' === $item['status'] ? 'is-highlighted' : ''; ?>">
                                    <td>
                                        <div class="wfwc-name-stack">
                                            <strong><?php echo esc_html($item['full_name']); ?></strong>
                                            <span><?php echo !empty($item['notes']) ? esc_html(wp_trim_words($item['notes'], 8)) : 'Equipe Wimifarma'; ?></span>
                                        </div>
                                    </td>
                                    <td><span class="wfwc-badge wfwc-badge-<?php echo esc_attr($item['status']); ?>"><?php echo esc_html($item['status']); ?></span></td>
                                    <td><?php echo esc_html($user ? $user->display_name : 'Nao vinculado'); ?></td>
                                    <td><?php echo esc_html(wfwc_format_datetime($item['created_at'])); ?></td>
                                    <td><a href="<?php echo esc_url(wfwc_admin_page_url('wfwc-attendants', array('edit' => absint($item['id'])))); ?>">Editar</a></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</div>
