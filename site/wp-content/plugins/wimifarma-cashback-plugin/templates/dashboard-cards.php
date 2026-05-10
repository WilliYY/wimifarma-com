<?php if (!empty($cards)) : ?>
    <div class="wfwc-grid wfwc-grid-3">
        <?php foreach ($cards as $card) : ?>
            <div class="wfwc-metric-card <?php echo esc_attr($card['tone'] ?? ''); ?>">
                <span><?php echo esc_html($card['label']); ?></span>
                <strong><?php echo esc_html($card['value']); ?></strong>
                <small><?php echo esc_html($card['hint']); ?></small>
            </div>
        <?php endforeach; ?>
    </div>
<?php endif; ?>
