<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

codigos_send_no_cache_headers();

if (!headers_sent()) {
    header('Content-Type: application/json; charset=UTF-8');
}

function codigos_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function codigos_item_payload(array $item): array
{
    return array(
        'id' => (int) ($item['id'] ?? 0),
        'codigo' => (string) ($item['codigo'] ?? ''),
        'ean' => (string) ($item['ean'] ?? ''),
        'preco' => codigos_price_input($item['preco'] ?? 0),
        'group' => codigos_group_key((string) ($item['ean'] ?? '')),
    );
}

$user = current_user();
if (!$user) {
    codigos_json(array('ok' => false, 'message' => 'Sessao expirada. Entre novamente.'), 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    codigos_json(array('ok' => false, 'message' => 'Metodo nao permitido.'), 405);
}

$token = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
    codigos_json(array('ok' => false, 'message' => 'Sessao expirada. Tente novamente.'), 419);
}

try {
    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'save' || $action === 'create' || $action === 'update') {
        $id = (int) ($_POST['id'] ?? 0);

        if ($id > 0) {
            codigos_update(
                $id,
                (string) ($_POST['codigo'] ?? ''),
                (string) ($_POST['ean'] ?? ''),
                $_POST['preco'] ?? '0'
            );
        } else {
            $id = codigos_create(
                (string) ($_POST['codigo'] ?? ''),
                (string) ($_POST['ean'] ?? ''),
                $_POST['preco'] ?? '0',
                (int) $user['id']
            );
        }

        $item = codigos_find($id);
        if (!$item) {
            throw new RuntimeException('Codigo salvo nao encontrado.');
        }

        codigos_json(array(
            'ok' => true,
            'item' => codigos_item_payload($item),
            'total' => codigos_count_active(),
        ));
    }

    if ($action === 'delete') {
        codigos_delete((int) ($_POST['id'] ?? 0));
        codigos_json(array(
            'ok' => true,
            'total' => codigos_count_active(),
        ));
    }

    if ($action === 'reorder') {
        $ids = json_decode((string) ($_POST['ids'] ?? '[]'), true);
        if (!is_array($ids)) {
            throw new InvalidArgumentException('Ordem invalida.');
        }

        codigos_reorder_group((string) ($_POST['group'] ?? ''), $ids);
        codigos_json(array(
            'ok' => true,
            'total' => codigos_count_active(),
        ));
    }

    codigos_json(array('ok' => false, 'message' => 'Acao invalida.'), 400);
} catch (InvalidArgumentException $error) {
    codigos_json(array('ok' => false, 'message' => $error->getMessage()), 422);
} catch (Throwable $error) {
    codigos_json(array('ok' => false, 'message' => 'Nao consegui salvar os codigos agora.'), 500);
}
