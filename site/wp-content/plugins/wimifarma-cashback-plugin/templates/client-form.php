<?php
$client = wp_parse_args(
    (array) $client,
    array(
        'id'           => 0,
        'full_name'    => '',
        'phone'        => '',
        'birth_date'   => '',
        'notes'        => '',
        'status'       => 'active',
        'attendant_id' => 0,
    )
);
?>
<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wfwc-form">
    <input type="hidden" name="action" value="wfwc_save_client">
    <input type="hidden" name="client_id" value="<?php echo esc_attr($client['id']); ?>">
    <?php wfwc_render_portal_form_fields('clients'); ?>
    <?php wp_nonce_field('wfwc_save_client'); ?>

    <div class="wfwc-field-stack">
        <label>
            <span>Nome do cliente</span>
            <input type="text" name="full_name" value="<?php echo esc_attr($client['full_name']); ?>" required>
        </label>

        <label>
            <span>Telefone</span>
            <input type="text" name="phone" value="<?php echo esc_attr($client['phone']); ?>" placeholder="11999999999">
        </label>

        <div class="wfwc-field-grid">
            <label>
                <span>Data de nascimento</span>
                <input type="date" name="birth_date" value="<?php echo esc_attr($client['birth_date']); ?>">
            </label>
            <label>
                <span>Status</span>
                <select name="status">
                    <option value="active" <?php selected($client['status'], 'active'); ?>>Ativo</option>
                    <option value="inactive" <?php selected($client['status'], 'inactive'); ?>>Inativo</option>
                </select>
            </label>
        </div>

        <label>
            <span>Atendente responsavel pelo cadastro</span>
            <select name="attendant_id">
                <option value="0">Selecione</option>
                <?php foreach ($attendants as $attendant) : ?>
                    <option value="<?php echo esc_attr($attendant['id']); ?>" <?php selected((int) $client['attendant_id'], (int) $attendant['id']); ?>>
                        <?php echo esc_html($attendant['full_name']); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>

        <label>
            <span>Observacoes</span>
            <textarea name="notes" rows="4"><?php echo esc_textarea($client['notes']); ?></textarea>
        </label>
    </div>

    <div class="wfwc-form-actions">
        <button type="submit" class="button button-primary"><?php echo $client['id'] ? 'Atualizar cliente' : 'Cadastrar cliente'; ?></button>
    </div>
</form>
