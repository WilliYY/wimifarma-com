<?php
if (!defined('ABSPATH')) {
    exit;
}

class WFWC_Whatsapp
{
    private $db;
    private $clients;
    private $attendants;
    private $wpdb;

    public function __construct($db, $clients, $attendants)
    {
        $this->db         = $db;
        $this->clients    = $clients;
        $this->attendants = $attendants;
        $this->wpdb       = $db->get_wpdb();
    }

    private function get_retry_settings()
    {
        return array(
            'enabled'       => (bool) wfwc_get_setting('webhook_retry_enabled', 1),
            'max_attempts'  => max(1, absint(wfwc_get_setting('webhook_retry_attempts', 3))),
            'delay_minutes' => max(1, absint(wfwc_get_setting('webhook_retry_delay_minutes', 15))),
        );
    }

    private function replace_tokens($template, $payload)
    {
        $tokens = array();

        foreach ($payload as $key => $value) {
            if (is_scalar($value) || null === $value) {
                $tokens['{' . $key . '}'] = (string) $value;
            }
        }

        return strtr($template, $tokens);
    }

    private function update_related_status($event_type, $related_type, $related_id, $status)
    {
        if ('purchase_registered' !== $event_type || 'purchase' !== $related_type || empty($related_id)) {
            return;
        }

        $this->wpdb->update(
            $this->db->table('purchases'),
            array('webhook_status' => sanitize_key($status)),
            array('id' => absint($related_id)),
            array('%s'),
            array('%d')
        );
    }

    private function build_envelope($event_type, $message, $payload, $reference_key, $attempt_number, $max_attempts, $url_setting_key, $message_template_key, $related_type, $related_id)
    {
        return array(
            'event'     => $event_type,
            'source'    => 'wimifarma-cashback',
            'sent_at'   => current_time('mysql'),
            'message'   => $message,
            'reference' => $reference_key,
            'meta'      => array(
                'attempt_number'       => $attempt_number,
                'max_attempts'         => $max_attempts,
                'is_retry'             => $attempt_number > 1,
                'url_setting_key'      => $url_setting_key,
                'message_template_key' => $message_template_key,
                'related_type'         => $related_type,
                'related_id'           => absint($related_id),
                'site_url'             => home_url('/'),
                'plugin_version'       => WFWC_VERSION,
            ),
            'data'      => $payload,
        );
    }

    private function log_skip($event_type, $reference_key, $related_type, $related_id, $envelope, $reason)
    {
        $this->db->insert_log(
            array(
                'event_type'    => $event_type,
                'related_type'  => $related_type ?: null,
                'related_id'    => $related_id ?: null,
                'reference_key' => $reference_key ?: null,
                'status'        => 'skipped',
                'payload'       => wp_json_encode($envelope),
                'response_body' => $reason,
            )
        );

        $this->update_related_status($event_type, $related_type, $related_id, 'skipped');

        return array(
            'success'        => false,
            'status'         => 'skipped',
            'message'        => $reason,
            'attempt_number' => absint($envelope['meta']['attempt_number'] ?? 1),
        );
    }

    private function maybe_schedule_retry($reference_key, $event_type, $attempt_number, $retry_settings, $related_type, $related_id, $reason)
    {
        if (empty($reference_key) || empty($event_type) || empty($retry_settings['enabled'])) {
            return false;
        }

        if ($attempt_number >= absint($retry_settings['max_attempts'])) {
            $this->db->insert_log(
                array(
                    'event_type'    => 'webhook_retry_exhausted',
                    'related_type'  => $related_type ?: null,
                    'related_id'    => $related_id ?: null,
                    'reference_key' => $reference_key,
                    'status'        => 'info',
                    'payload'       => wp_json_encode(
                        array(
                            'original_event' => $event_type,
                            'attempts'       => $attempt_number,
                        )
                    ),
                    'response_body' => 'Limite maximo de tentativas atingido. Ultimo erro: ' . $reason,
                )
            );

            return false;
        }

        if (wp_next_scheduled('wfwc_retry_webhook_event', array($reference_key, $event_type))) {
            return true;
        }

        $timestamp = time() + (absint($retry_settings['delay_minutes']) * MINUTE_IN_SECONDS);

        wp_schedule_single_event($timestamp, 'wfwc_retry_webhook_event', array($reference_key, $event_type));

        $this->db->insert_log(
            array(
                'event_type'    => 'webhook_retry_scheduled',
                'related_type'  => $related_type ?: null,
                'related_id'    => $related_id ?: null,
                'reference_key' => $reference_key,
                'status'        => 'info',
                'payload'       => wp_json_encode(
                    array(
                        'original_event'  => $event_type,
                        'current_attempt' => $attempt_number,
                        'next_attempt'    => $attempt_number + 1,
                        'scheduled_for'   => wp_date('Y-m-d H:i:s', $timestamp),
                    )
                ),
                'response_body' => 'Retry agendado automaticamente. Motivo: ' . $reason,
            )
        );

        return true;
    }

    private function dispatch($event_type, $url_setting_key, $message_template_key, $payload, $reference_key = '', $related_type = '', $related_id = 0, $options = array())
    {
        if (!empty($reference_key) && $this->db->has_successful_log_reference($reference_key, $event_type)) {
            return array(
                'success' => true,
                'status'  => 'duplicate',
                'message' => 'Evento ja enviado anteriormente com sucesso.',
            );
        }

        $retry_settings = $this->get_retry_settings();
        $attempt_number = max(
            1,
            absint(
                $options['attempt_number'] ?? (
                    !empty($reference_key)
                        ? $this->db->count_event_logs_by_reference($reference_key, $event_type) + 1
                        : 1
                )
            )
        );
        $url      = (string) wfwc_get_setting($url_setting_key, '');
        $message  = $this->replace_tokens((string) wfwc_get_setting($message_template_key, ''), $payload);
        $envelope = $this->build_envelope(
            $event_type,
            $message,
            $payload,
            $reference_key,
            $attempt_number,
            absint($retry_settings['max_attempts']),
            $url_setting_key,
            $message_template_key,
            $related_type,
            $related_id
        );

        if (empty($url)) {
            return $this->log_skip($event_type, $reference_key, $related_type, $related_id, $envelope, 'Webhook nao configurado.');
        }

        $headers = array(
            'Content-Type' => 'application/json',
        );

        $token = (string) wfwc_get_setting('webhook_token', '');

        if ($token !== '') {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        $response = wp_remote_post(
            $url,
            array(
                'timeout' => 20,
                'headers' => $headers,
                'body'    => wp_json_encode($envelope),
            )
        );

        if (is_wp_error($response)) {
            $retry_scheduled = $this->maybe_schedule_retry(
                $reference_key,
                $event_type,
                $attempt_number,
                $retry_settings,
                $related_type,
                $related_id,
                $response->get_error_message()
            );

            $this->db->insert_log(
                array(
                    'event_type'    => $event_type,
                    'related_type'  => $related_type ?: null,
                    'related_id'    => $related_id ?: null,
                    'reference_key' => $reference_key ?: null,
                    'status'        => 'failed',
                    'payload'       => wp_json_encode($envelope),
                    'response_body' => $response->get_error_message(),
                )
            );

            $this->update_related_status($event_type, $related_type, $related_id, 'failed');

            return array(
                'success'         => false,
                'status'          => 'failed',
                'message'         => $response->get_error_message(),
                'attempt_number'  => $attempt_number,
                'retry_scheduled' => $retry_scheduled,
            );
        }

        $code   = (string) wp_remote_retrieve_response_code($response);
        $raw    = (string) wp_remote_retrieve_body($response);
        $status = ((int) $code >= 200 && (int) $code < 300) ? 'sent' : 'failed';

        if ('failed' === $status) {
            $retry_scheduled = $this->maybe_schedule_retry(
                $reference_key,
                $event_type,
                $attempt_number,
                $retry_settings,
                $related_type,
                $related_id,
                $raw ?: 'Resposta HTTP nao bem-sucedida.'
            );
        } else {
            $retry_scheduled = false;
        }

        $this->db->insert_log(
            array(
                'event_type'    => $event_type,
                'related_type'  => $related_type ?: null,
                'related_id'    => $related_id ?: null,
                'reference_key' => $reference_key ?: null,
                'status'        => $status,
                'payload'       => wp_json_encode($envelope),
                'response_code' => $code,
                'response_body' => $raw,
            )
        );

        $this->update_related_status($event_type, $related_type, $related_id, $status);

        return array(
            'success'         => 'sent' === $status,
            'status'          => $status,
            'message'         => $raw,
            'code'            => $code,
            'attempt_number'  => $attempt_number,
            'retry_scheduled' => $retry_scheduled,
        );
    }

    public function retry_webhook($reference_key, $event_type)
    {
        $reference_key = sanitize_text_field((string) $reference_key);
        $event_type    = sanitize_key((string) $event_type);

        if (empty($reference_key) || empty($event_type)) {
            return;
        }

        if ($this->db->has_successful_log_reference($reference_key, $event_type)) {
            return;
        }

        $latest_log = $this->db->get_latest_log_by_reference($reference_key, $event_type);

        if (!$latest_log || empty($latest_log['payload'])) {
            return;
        }

        $envelope = json_decode($latest_log['payload'], true);
        $meta     = is_array($envelope['meta'] ?? null) ? $envelope['meta'] : array();
        $payload  = is_array($envelope['data'] ?? null) ? $envelope['data'] : array();

        if (empty($meta['url_setting_key']) || empty($meta['message_template_key'])) {
            return;
        }

        $this->dispatch(
            $event_type,
            (string) $meta['url_setting_key'],
            (string) $meta['message_template_key'],
            $payload,
            $reference_key,
            (string) ($meta['related_type'] ?? ''),
            absint($meta['related_id'] ?? 0),
            array(
                'attempt_number' => absint($meta['attempt_number'] ?? 1) + 1,
            )
        );
    }

    public function send_purchase_event($purchase_id)
    {
        if (!(bool) wfwc_get_setting('enable_purchase_automation', 1)) {
            return array('success' => false, 'status' => 'skipped', 'message' => 'Automacao de compra desativada.');
        }

        $purchase = $this->wpdb->get_row(
            $this->wpdb->prepare(
                "SELECT p.*, c.full_name AS client_name, c.phone, a.full_name AS attendant_name
                FROM {$this->db->table('purchases')} p
                INNER JOIN {$this->db->table('clients')} c ON c.id = p.client_id
                LEFT JOIN {$this->db->table('attendants')} a ON a.id = p.attendant_id
                WHERE p.id = %d",
                absint($purchase_id)
            ),
            ARRAY_A
        );

        if (!$purchase) {
            return array('success' => false, 'status' => 'failed', 'message' => 'Compra nao encontrada.');
        }

        $expires_at = $this->wpdb->get_var(
            $this->wpdb->prepare(
                "SELECT expires_at FROM {$this->db->table('cashback_credits')} WHERE purchase_id = %d ORDER BY id DESC LIMIT 1",
                absint($purchase_id)
            )
        );

        $reference_key = 'purchase-' . absint($purchase_id);
        $payload       = array(
            'client_id'                    => absint($purchase['client_id']),
            'client_name'                  => $purchase['client_name'],
            'client_phone'                 => $purchase['phone'],
            'client_phone_digits'          => wfwc_sanitize_phone($purchase['phone']),
            'purchase_id'                  => absint($purchase['id']),
            'purchase_amount'              => (float) $purchase['gross_amount'],
            'purchase_amount_formatted'    => wfwc_format_currency($purchase['gross_amount']),
            'cashback_generated'           => (float) $purchase['cashback_generated'],
            'cashback_generated_formatted' => wfwc_format_currency($purchase['cashback_generated']),
            'cashback_used'                => (float) $purchase['cashback_used'],
            'cashback_used_formatted'      => wfwc_format_currency($purchase['cashback_used']),
            'net_amount'                   => (float) $purchase['net_amount'],
            'net_amount_formatted'         => wfwc_format_currency($purchase['net_amount']),
            'purchase_date'                => $purchase['purchase_date'],
            'purchase_date_formatted'      => wfwc_format_datetime($purchase['purchase_date']),
            'expires_at'                   => $expires_at,
            'expires_at_formatted'         => wfwc_format_datetime($expires_at, false),
            'attendant_id'                 => absint($purchase['attendant_id']),
            'attendant_name'               => $purchase['attendant_name'] ?: 'Nao informado',
        );

        if (empty($payload['client_phone_digits'])) {
            $envelope = $this->build_envelope('purchase_registered', '', $payload, $reference_key, 1, absint($this->get_retry_settings()['max_attempts']), 'purchase_webhook_url', 'message_purchase', 'purchase', absint($purchase_id));
            return $this->log_skip('purchase_registered', $reference_key, 'purchase', absint($purchase_id), $envelope, 'Cliente sem telefone valido para automacao.');
        }

        return $this->dispatch(
            'purchase_registered',
            'purchase_webhook_url',
            'message_purchase',
            $payload,
            $reference_key,
            'purchase',
            absint($purchase_id)
        );
    }

    public function send_expiration_event($client_id, $days, $amount, $expires_on)
    {
        if (!(bool) wfwc_get_setting('enable_expiration_automation', 1)) {
            return array('success' => false, 'status' => 'skipped', 'message' => 'Automacao de expiracao desativada.');
        }

        $client = $this->clients->get_client($client_id);

        if (!$client) {
            return array('success' => false, 'status' => 'failed', 'message' => 'Cliente nao encontrado.');
        }

        $reference_key = sprintf('expiration-%d-%d-%s', absint($client_id), absint($days), sanitize_key($expires_on));
        $payload       = array(
            'client_id'                 => absint($client['id']),
            'client_name'               => $client['full_name'],
            'client_phone'              => $client['phone'],
            'client_phone_digits'       => wfwc_sanitize_phone($client['phone']),
            'expiring_amount'           => (float) $amount,
            'expiring_amount_formatted' => wfwc_format_currency($amount),
            'expires_at'                => $expires_on,
            'expires_at_formatted'      => wfwc_format_datetime($expires_on, false),
            'days_to_expire'            => absint($days),
            'trigger_date'              => wp_date('Y-m-d'),
        );

        if (empty($payload['client_phone_digits'])) {
            $envelope = $this->build_envelope('cashback_expiration_alert', '', $payload, $reference_key, 1, absint($this->get_retry_settings()['max_attempts']), 'expiration_webhook_url', 'message_expiration', 'client', absint($client_id));
            return $this->log_skip('cashback_expiration_alert', $reference_key, 'client', absint($client_id), $envelope, 'Cliente sem telefone valido para automacao.');
        }

        return $this->dispatch(
            'cashback_expiration_alert',
            'expiration_webhook_url',
            'message_expiration',
            $payload,
            $reference_key,
            'client',
            absint($client_id)
        );
    }

    public function send_birthday_event($client_id)
    {
        if (!(bool) wfwc_get_setting('enable_birthday_automation', 1)) {
            return array('success' => false, 'status' => 'skipped', 'message' => 'Automacao de aniversario desativada.');
        }

        $client = $this->clients->get_client($client_id);

        if (!$client) {
            return array('success' => false, 'status' => 'failed', 'message' => 'Cliente nao encontrado.');
        }

        $reference_key = sprintf('birthday-%d-%s', absint($client_id), wp_date('Ymd', current_time('timestamp')));
        $payload       = array(
            'client_id'            => absint($client['id']),
            'client_name'          => $client['full_name'],
            'client_phone'         => $client['phone'],
            'client_phone_digits'  => wfwc_sanitize_phone($client['phone']),
            'birth_date'           => $client['birth_date'],
            'birth_date_formatted' => wfwc_format_datetime($client['birth_date'], false),
            'trigger_date'         => wp_date('Y-m-d'),
        );

        if (empty($payload['client_phone_digits'])) {
            $envelope = $this->build_envelope('client_birthday', '', $payload, $reference_key, 1, absint($this->get_retry_settings()['max_attempts']), 'birthday_webhook_url', 'message_birthday', 'client', absint($client_id));
            return $this->log_skip('client_birthday', $reference_key, 'client', absint($client_id), $envelope, 'Cliente sem telefone valido para automacao.');
        }

        return $this->dispatch(
            'client_birthday',
            'birthday_webhook_url',
            'message_birthday',
            $payload,
            $reference_key,
            'client',
            absint($client_id)
        );
    }
}
