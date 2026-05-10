<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(array('ok' => false, 'message' => 'Metodo invalido.'), JSON_UNESCAPED_UNICODE);
    exit;
}

$token = (string) ($_POST['csrf_token'] ?? '');

if ($token === '' || !hash_equals(csrf_token(), $token)) {
    http_response_code(403);
    echo json_encode(array('ok' => false, 'message' => 'Sessao expirada.'), JSON_UNESCAPED_UNICODE);
    exit;
}

$id = (int) ($_POST['id'] ?? 0);
$event = (string) ($_POST['event'] ?? 'opened');

if ($id <= 0 || !in_array($event, array('opened', 'copied', 'sent', 'cancelled'), true)) {
    http_response_code(422);
    echo json_encode(array('ok' => false, 'message' => 'Dados invalidos.'), JSON_UNESCAPED_UNICODE);
    exit;
}

$columns = array(
    'opened' => array('aberta', 'opened_at'),
    'copied' => array('copiada', 'copied_at'),
    'sent' => array('enviada', 'sent_at'),
    'cancelled' => array('cancelada', null),
);

list($status, $dateColumn) = $columns[$event];

if ($dateColumn) {
    $stmt = db()->prepare(
        "UPDATE wf_whatsapp_mensagens
         SET status = ?,
             {$dateColumn} = COALESCE({$dateColumn}, NOW()),
             user_id = ?
         WHERE id = ?"
    );
    $stmt->execute(array($status, $_SESSION['user_id'] ?? null, $id));
} else {
    $stmt = db()->prepare(
        "UPDATE wf_whatsapp_mensagens
         SET status = ?,
             user_id = ?
         WHERE id = ?
           AND status <> 'enviada'"
    );
    $stmt->execute(array($status, $_SESSION['user_id'] ?? null, $id));
}

log_action('whatsapp_' . $event, 'whatsapp', $id, 'Mensagem WhatsApp marcada como ' . $status . '.');

echo json_encode(array('ok' => true, 'status' => $status), JSON_UNESCAPED_UNICODE);
