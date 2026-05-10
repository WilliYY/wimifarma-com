<?php
$login_state = sanitize_text_field(wp_unslash($_GET['login'] ?? ''));
?>
<div class="wfwc-public-shell">
    <div class="wfwc-public-box wfwc-login-box">
        <h2>Entrar na area da equipe</h2>
        <p>Use o login interno do sistema para liberar o painel de cashback direto no site.</p>

        <?php if ('failed' === $login_state) : ?>
            <div class="wfwc-public-alert is-error">Usuario ou senha invalidos. Tente novamente.</div>
        <?php elseif ('empty' === $login_state) : ?>
            <div class="wfwc-public-alert is-error">Preencha usuario e senha para continuar.</div>
        <?php endif; ?>

        <div class="wfwc-login-form">
            <form method="post" action="<?php echo esc_url(home_url('/')); ?>">
                <input type="hidden" name="wfwc_portal_action" value="login">
                <?php wp_nonce_field('wfwc_portal_login', 'wfwc_portal_login_nonce'); ?>

                <p>
                    <label for="wfwc-portal-username">Usuario</label>
                    <input id="wfwc-portal-username" type="text" name="portal_username" autocomplete="username" required>
                </p>

                <p>
                    <label for="wfwc-portal-password">Senha</label>
                    <input id="wfwc-portal-password" type="password" name="portal_password" autocomplete="current-password" required>
                </p>

                <p class="login-submit">
                    <button type="submit">Entrar no sistema</button>
                </p>
            </form>
        </div>

        <div class="wfwc-login-help">
            <p><strong>Acesso inicial:</strong> usuario <code>adm</code> e senha <code>adm</code>.</p>
            <p>Depois podemos evoluir para controle completo de usuarios e permissoes no proprio sistema.</p>
        </div>
    </div>
</div>
