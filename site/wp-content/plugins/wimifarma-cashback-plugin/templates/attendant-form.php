<?php
$attendant = wp_parse_args(
    (array) $attendant,
    array(
        'id'         => 0,
        'wp_user_id' => 0,
        'full_name'  => '',
        'status'     => 'active',
        'notes'      => '',
    )
);
?>
<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wfwc-form">
    <input type="hidden" name="action" value="wfwc_save_attendant">
    <input type="hidden" name="attendant_id" value="<?php echo esc_attr($attendant['id']); ?>">
    <?php wfwc_render_portal_form_fields('attendants'); ?>
    <?php wp_nonce_field('wfwc_save_attendant'); ?>

    <div class="wfwc-field-stack">
        <label>
            <span>Nome</span>
            <input type="text" name="full_name" value="<?php echo esc_attr($attendant['full_name']); ?>" required>
        </label>

        <div class="wfwc-field-grid">
            <label>
                <span>Status</span>
                <select name="status">
                    <option value="active" <?php selected($attendant['status'], 'active'); ?>>Ativo</option>
                    <option value="inactive" <?php selected($attendant['status'], 'inactive'); ?>>Inativo</option>
                </select>
            </label>
            <label>
                <span>Usuario WordPress vinculado</span>
                <select name="wp_user_id">
                    <option value="0">Nao vincular</option>
                    <?php foreach ($wp_users as $wp_user) : ?>
                        <option value="<?php echo esc_attr($wp_user->ID); ?>" <?php selected((int) $attendant['wp_user_id'], (int) $wp_user->ID); ?>>
                            <?php echo esc_html($wp_user->display_name . ' - ' . $wp_user->user_email); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
        </div>

        <label>
            <span>Observacoes</span>
            <textarea name="notes" rows="4"><?php echo esc_textarea($attendant['notes']); ?></textarea>
        </label>
    </div>

    <div class="wfwc-form-actions">
        <button type="submit" class="button button-primary"><?php echo $attendant['id'] ? 'Atualizar atendente' : 'Cadastrar atendente'; ?></button>
    </div>
</form>
