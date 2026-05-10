<?php
declare(strict_types=1);

if (!defined('MIAUW_WEB_REFERENCES_ENABLED')) {
    define('MIAUW_WEB_REFERENCES_ENABLED', true);
}

function miauw_web_clean_text(string $text): string
{
    $text = html_entity_decode(strip_tags($text), ENT_QUOTES, 'UTF-8');
    $text = preg_replace('/\s+/', ' ', $text) ?? $text;

    return trim($text);
}

function miauw_web_decode_duckduckgo_url(string $url): string
{
    $url = html_entity_decode($url, ENT_QUOTES, 'UTF-8');
    if (strpos($url, '//duckduckgo.com/l/?') !== false || strpos($url, '/l/?') === 0) {
        $parts = parse_url($url);
        $query = array();
        parse_str((string) ($parts['query'] ?? ''), $query);
        if (!empty($query['uddg']) && is_string($query['uddg'])) {
            return (string) $query['uddg'];
        }
    }

    if (strpos($url, '//') === 0) {
        return 'https:' . $url;
    }

    return $url;
}

function miauw_web_http_get(string $url): string
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL indisponivel para pesquisa web.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Wimifarma Miauby/1.0',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ));
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if (is_string($body) && $body !== '' && $status >= 200 && $status < 400) {
        return $body;
    }

    throw new RuntimeException('Pesquisa web indisponivel: HTTP ' . $status . ($error !== '' ? ' - ' . $error : ''));
}

function miauw_web_search_references(string $query, int $limit = 5): array
{
    if (!(bool) MIAUW_WEB_REFERENCES_ENABLED) {
        return array();
    }

    $query = trim(preg_replace('/\s+/', ' ', $query) ?? '');
    if ($query === '') {
        return array();
    }

    $limit = max(1, min(6, $limit));
    $searchUrl = 'https://duckduckgo.com/html/?q=' . rawurlencode($query . ' farmacia saude referencia');
    $html = miauw_web_http_get($searchUrl);
    $results = array();

    if (class_exists('DOMDocument')) {
        $dom = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if ($loaded) {
            $xpath = new DOMXPath($dom);
            foreach ($xpath->query('//div[contains(concat(" ", normalize-space(@class), " "), " result ")]') as $node) {
                $link = $xpath->query('.//a[contains(concat(" ", normalize-space(@class), " "), " result__a ")]', $node)->item(0);
                if (!$link instanceof DOMElement) {
                    continue;
                }

                $title = miauw_web_clean_text($link->textContent);
                $url = miauw_web_decode_duckduckgo_url((string) $link->getAttribute('href'));
                $snippetNode = $xpath->query('.//*[contains(concat(" ", normalize-space(@class), " "), " result__snippet ")]', $node)->item(0);
                $snippet = $snippetNode ? miauw_web_clean_text($snippetNode->textContent) : '';

                if ($title !== '' && preg_match('#^https?://#i', $url)) {
                    $results[$url] = array(
                        'title' => $title,
                        'url' => $url,
                        'snippet' => $snippet,
                    );
                }

                if (count($results) >= $limit) {
                    break;
                }
            }
        }
    }

    if (!$results && preg_match_all('/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/is', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $url = miauw_web_decode_duckduckgo_url((string) $match[1]);
            $title = miauw_web_clean_text((string) $match[2]);
            if ($title !== '' && preg_match('#^https?://#i', $url)) {
                $results[$url] = array('title' => $title, 'url' => $url, 'snippet' => '');
            }
            if (count($results) >= $limit) {
                break;
            }
        }
    }

    return array_values($results);
}

function miauw_web_references_text(string $query, int $limit = 5): string
{
    $results = miauw_web_search_references($query, $limit);
    if (!$results) {
        return "REFERENCIAS WEB\nNao consegui buscar referencias agora. Use fonte oficial ou tente uma consulta mais especifica.";
    }

    $lines = array(
        'REFERENCIAS WEB',
        'Consulta: ' . $query,
        'Regra: use como referencia externa, cite fonte e nao transforme snippet em verdade absoluta.',
    );

    foreach ($results as $index => $result) {
        $lines[] = ($index + 1) . '. ' . (string) $result['title'];
        $lines[] = '   Link: ' . (string) $result['url'];
        if (trim((string) ($result['snippet'] ?? '')) !== '') {
            $lines[] = '   Trecho: ' . miauw_substr((string) $result['snippet'], 0, 220);
        }
    }

    return implode("\n", $lines);
}

function miauw_web_is_official_medicine_source(string $url): bool
{
    $parts = parse_url($url);
    $host = strtolower((string) ($parts['host'] ?? ''));
    $path = strtolower((string) ($parts['path'] ?? ''));

    if ($host === 'www.in.gov.br' || $host === 'in.gov.br') {
        return true;
    }

    if (substr($host, -7) !== '.gov.br' && $host !== 'gov.br' && $host !== 'www.gov.br') {
        return false;
    }

    return strpos($path, '/anvisa/') !== false
        || strpos($path, '/saude/') !== false
        || strpos($path, '/conitec/') !== false;
}

function miauw_web_official_medicine_news_text(int $limit = 4): string
{
    $limit = max(1, min(5, $limit));
    $year = date('Y');
    $query = 'site:gov.br/anvisa medicamentos noticia ' . $year
        . ' OR site:gov.br/saude medicamentos farmacia popular ' . $year
        . ' OR site:in.gov.br medicamento anvisa ' . $year;

    $results = miauw_web_search_references($query, min(6, $limit + 2));
    $official = array_values(array_filter($results, static function ($result): bool {
        return miauw_web_is_official_medicine_source((string) ($result['url'] ?? ''));
    }));

    if (!$official) {
        $official = $results;
    }

    if (!$official) {
        return "NOTICIAS OFICIAIS DE MEDICAMENTOS\nNao consegui buscar agora. Confira Anvisa, Ministerio da Saude ou Diario Oficial manualmente.";
    }

    $lines = array(
        'NOTICIAS OFICIAIS DE MEDICAMENTOS',
        'Fontes priorizadas: Anvisa, Ministerio da Saude e Diario Oficial.',
        'Uso interno: tratar como curiosidade operacional e conferir detalhe antes de orientar cliente.',
    );

    foreach (array_slice($official, 0, $limit) as $index => $result) {
        $lines[] = ($index + 1) . '. ' . (string) ($result['title'] ?? 'Fonte oficial');
        $lines[] = '   Link: ' . (string) ($result['url'] ?? '');
        if (trim((string) ($result['snippet'] ?? '')) !== '') {
            $lines[] = '   Trecho: ' . miauw_substr((string) $result['snippet'], 0, 180);
        }
    }

    return implode("\n", $lines);
}
