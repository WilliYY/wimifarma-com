<?php
declare(strict_types=1);

function miauw_system_map_needs_context(string $message): bool
{
    if (function_exists('miauw_skill_has_any')) {
        return miauw_skill_has_any($message, array(
            'sistema', 'tela', 'pagina', 'página', 'botao', 'botão', 'fluxo', 'fluxograma',
            'frontend', 'front end', 'backend', 'back end', 'arquivo', 'rota', 'endpoint',
            'como mexe', 'como usa', 'onde fica', 'onde clico', 'cashback', 'cotacao',
            'cotação', 'financeiro', 'tarefa', 'tarefas', 'miauw', 'site', 'menu', 'formulario', 'formulário'
        ));
    }

    return false;
}

function miauw_system_map_base_dirs(): array
{
    return array(
        'Home WordPress' => dirname(__DIR__) . '/wimifarma-cashback-theme',
        'Cashback' => dirname(__DIR__) . '/cashback',
        'Cotacao' => dirname(__DIR__) . '/cotacao',
        'Financeiro' => dirname(__DIR__) . '/financeiro',
        'Tarefas' => dirname(__DIR__) . '/tarefa',
        'Miauby' => __DIR__,
    );
}

function miauw_system_map_clean_label(string $label): string
{
    $label = html_entity_decode(strip_tags($label), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $label = preg_replace('/\s+/', ' ', $label) ?? '';

    $label = trim($label);
    if ($label === '' || strlen($label) > 90 || strpos($label, 'escapeHtml') !== false || strpos($label, '${') !== false) {
        return '';
    }

    return $label;
}

function miauw_system_map_extract_labels(string $content, string $pattern, int $limit = 8): array
{
    preg_match_all($pattern, $content, $matches);
    $labels = array();

    foreach (($matches[1] ?? array()) as $label) {
        $label = miauw_system_map_clean_label((string) $label);
        if ($label !== '' && !in_array($label, $labels, true)) {
            $labels[] = $label;
        }

        if (count($labels) >= $limit) {
            break;
        }
    }

    return $labels;
}

function miauw_system_map_extract_file(string $path, string $baseDir): array
{
    $content = file_get_contents($path);
    if (!is_string($content)) {
        return array();
    }

    $relative = str_replace('\\', '/', substr($path, strlen($baseDir) + 1));
    $labels = array();
    if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'js') {
        $labels = array_merge(
            miauw_system_map_extract_labels($content, '/<title[^>]*>(.*?)<\/title>/is', 2),
            miauw_system_map_extract_labels($content, '/<h[1-3][^>]*>(.*?)<\/h[1-3]>/is', 8),
            miauw_system_map_extract_labels($content, '/<button[^>]*>(.*?)<\/button>/is', 8),
            miauw_system_map_extract_labels($content, '/<a[^>]*>(.*?)<\/a>/is', 8)
        );
    }

    preg_match_all('/(?:action\s*===|action\s*==|case)\s*[\'"]([a-z0-9_\-]+)[\'"]/i', $content, $actionMatches);
    preg_match_all('/name=[\'"]action[\'"][^>]*value=[\'"]([a-z0-9_\-]+)[\'"]/i', $content, $formActionMatches);
    preg_match_all('/fetch\(\s*[\'"]([^\'"]+)[\'"]/i', $content, $fetchMatches);

    $actions = array_values(array_unique(array_merge($actionMatches[1] ?? array(), $formActionMatches[1] ?? array())));
    $fetches = array_values(array_unique($fetchMatches[1] ?? array()));

    return array(
        'file' => $relative,
        'labels' => array_slice(array_values(array_unique($labels)), 0, 12),
        'actions' => array_slice($actions, 0, 10),
        'fetches' => array_slice($fetches, 0, 8),
    );
}

function miauw_system_map_build(): string
{
    $blocks = array();

    foreach (miauw_system_map_base_dirs() as $module => $dir) {
        if (!is_dir($dir)) {
            continue;
        }

        $files = array();
        foreach (array('*.php', '*.js') as $pattern) {
            foreach (glob($dir . '/' . $pattern) ?: array() as $path) {
                if (is_file($path)) {
                    $files[] = $path;
                }
            }
        }

        sort($files);
        $items = array();
        foreach (array_slice($files, 0, 26) as $path) {
            $info = miauw_system_map_extract_file($path, $dir);
            if (!$info) {
                continue;
            }

            $line = '- ' . $info['file'];
            if ($info['labels']) {
                $line .= ' | tela/acoes visiveis: ' . implode(', ', array_slice($info['labels'], 0, 6));
            }
            if ($info['actions']) {
                $line .= ' | actions: ' . implode(', ', $info['actions']);
            }
            if ($info['fetches']) {
                $line .= ' | fetch: ' . implode(', ', $info['fetches']);
            }
            $items[] = $line;
        }

        if ($items) {
            $blocks[] = strtoupper($module) . "\n" . implode("\n", $items);
        }
    }

    $database = miauw_system_map_database_overview();
    if ($database !== '') {
        $blocks[] = $database;
    }

    $header = "MAPA AUTOMATICO DO SISTEMA WIMIFARMA\n";
    $header .= "Gerado lendo arquivos PHP/JS permitidos. Use para orientar telas, fluxos e arquivos, mas nao invente regra de negocio fora do que aparecer aqui.\n";

    return $header . implode("\n\n", array_slice($blocks, 0, 6));
}

function miauw_system_map_cached(): string
{
    $cacheKey = 'system_map_cache_v4';

    try {
        if (function_exists('db') && function_exists('miauw_ensure_schema')) {
            $stmt = db()->prepare('SELECT valor FROM miauw_configuracoes WHERE chave = ? LIMIT 1');
            $stmt->execute(array($cacheKey));
            $raw = $stmt->fetchColumn();
            $data = is_string($raw) ? json_decode($raw, true) : null;

            if (is_array($data) && isset($data['created_at'], $data['content']) && time() - (int) $data['created_at'] < 900) {
                return (string) $data['content'];
            }

            $content = miauw_system_map_build();
            $save = db()->prepare(
                'INSERT INTO miauw_configuracoes (chave, valor)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE valor = VALUES(valor)'
            );
            $save->execute(array($cacheKey, json_encode(array(
                'created_at' => time(),
                'content' => $content,
            ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));

            return $content;
        }
    } catch (Throwable $error) {
        error_log('Miauby system map cache failed: ' . $error->getMessage());
    }

    return miauw_system_map_build();
}

function miauw_system_map_context_for_message(string $message): string
{
    if (!miauw_system_map_needs_context($message)) {
        return '';
    }

    return miauw_system_map_cached();
}

function miauw_system_map_database_overview(): string
{
    if (!function_exists('db')) {
        return '';
    }

    try {
        $stmt = db()->query(
            "SELECT TABLE_NAME
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND (
                    TABLE_NAME LIKE 'financeiro_%'
                 OR TABLE_NAME LIKE 'cotacao_%'
                 OR TABLE_NAME LIKE 'wf_%'
                 OR TABLE_NAME LIKE 'miauw_%'
               )
             ORDER BY TABLE_NAME ASC
             LIMIT 36"
        );
        $tables = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : array();
        if (!$tables) {
            return '';
        }

        $lines = array('BANCO DE DADOS - VISAO CONTROLADA');
        $columnStmt = db()->prepare(
            "SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION ASC
             LIMIT 14"
        );

        foreach ($tables as $table) {
            $table = (string) $table;
            $columnStmt->execute(array($table));
            $columns = array_map('strval', $columnStmt->fetchAll(PDO::FETCH_COLUMN) ?: array());
            $lines[] = '- ' . $table . ($columns ? ' | campos: ' . implode(', ', $columns) : '');
        }

        return implode("\n", $lines);
    } catch (Throwable $error) {
        error_log('Miauby database overview failed: ' . $error->getMessage());

        return '';
    }
}
