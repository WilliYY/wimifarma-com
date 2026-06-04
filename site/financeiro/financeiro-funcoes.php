<?php
declare(strict_types=1);

/*
 * Helper minimo mantido para o Miauby PHP enquanto o Financeiro oficial roda
 * em apps/financeiro (Node/TypeScript/Postgres). Nao adicionar consultas,
 * schema ou escritas MySQL neste arquivo.
 */

function financeiro_valid_date(?string $value, ?string $default = null): string
{
    $value = trim((string) $value);

    if ($value === '') {
        return $default !== null ? $default : date('Y-m-d');
    }

    foreach (array('Y-m-d', 'd/m/Y', 'd-m-Y', 'd.m.Y') as $format) {
        $date = DateTime::createFromFormat('!' . $format, $value);

        if ($date instanceof DateTime && $date->format($format) === $value) {
            return $date->format('Y-m-d');
        }
    }

    if (preg_match('/^\d+(?:[,.]\d+)?$/', $value)) {
        $serial = (float) str_replace(',', '.', $value);

        if ($serial > 20000 && $serial < 80000) {
            return (new DateTime('1899-12-30'))->modify('+' . (int) $serial . ' days')->format('Y-m-d');
        }
    }

    $timestamp = strtotime(str_replace('/', '-', $value));

    if (!$timestamp) {
        return $default !== null ? $default : date('Y-m-d');
    }

    return date('Y-m-d', $timestamp);
}
