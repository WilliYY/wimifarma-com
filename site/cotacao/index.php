<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = cotacao_require_user();
clear_sensitive_area_access();
cotacao_ensure_schema();

function cotacao_general_block(): array
{
    $slug = trim((string) ($_POST['bloco'] ?? $_GET['bloco'] ?? 'cotacao-geral'));
    $block = cotacao_block_by_slug($slug);

    if ($block) {
        return $block;
    }

    $fallback = cotacao_block_by_slug('cotacao-geral');

    if (!$fallback) {
        throw new RuntimeException('Cotacao Geral nao encontrada.');
    }

    return $fallback;
}

function cotacao_row_has_content(array $row, array $prices): bool
{
    foreach (array('ean', 'produto', 'quantidade', 'categoria') as $key) {
        if (trim((string) ($row[$key] ?? '')) !== '') {
            return true;
        }
    }

    foreach ($prices as $price) {
        if (trim((string) $price) !== '') {
            return true;
        }
    }

    return false;
}

$block = cotacao_general_block();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        cotacao_verify_csrf();
        $action = (string) ($_POST['action'] ?? '');

        if ($action === 'add_category') {
            $category = trim((string) ($_POST['categoria_nova'] ?? ''));
            if ($category === '') {
                throw new InvalidArgumentException('Informe a categoria.');
            }

            cotacao_add_category((int) $block['id'], $category);
            set_flash('success', 'Categoria cadastrada.');
            cotacao_redirect(array('bloco' => $block['slug']));
        }

        if ($action === 'save_sheet') {
            set_flash('error', 'A Cotacao agora salva ao vivo por celula. Atualize a pagina e continue pela planilha sincronizada.');
            cotacao_redirect(array('bloco' => $block['slug']));
        }

        throw new InvalidArgumentException('Acao invalida.');
    } catch (Throwable $error) {
        set_flash('error', cotacao_public_error($error));
        cotacao_redirect(array('bloco' => $block['slug']));
    }
}

$flash = get_flash();
$suppliers = cotacao_suppliers((int) $block['id']);
$categories = cotacao_categories((int) $block['id']);
$syncState = cotacao_sync_state((int) $block['id']);
$filters = array(
    'q' => '',
    'categoria' => '',
    'cor' => '',
    'vencedor' => '',
);
$items = cotacao_sheet_items((int) $block['id'], $filters);
$prices = cotacao_item_prices($items);
$rowCount = max(50, count($items) + 10);
$colorOptions = cotacao_color_options();
$conditionalRules = cotacao_conditional_rules((int) $block['id']);
$conditionalOperators = cotacao_conditional_operator_options();
$supplierToneCount = 6;
$categoryFilterTerms = cotacao_category_filter_terms($filters['categoria']);
$hasCategoryFilter = $filters['categoria'] !== '';
$exportParams = array('bloco' => $block['slug']);

foreach ($filters as $key => $value) {
    if ($value !== '') {
        $exportParams[$key] = $value;
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cotacao Geral - Wimifarma</title>
    <link rel="icon" type="image/svg+xml" href="/cotacao/favicon.svg">
    <link rel="alternate icon" href="/cotacao/favicon.png">
    <meta name="wfwc-csrf" content="<?php echo e(csrf_token()); ?>">
    <link rel="stylesheet" href="/cotacao/styles.css?v=<?php echo e(COTACAO_VERSION); ?>">
    <link rel="stylesheet" href="/miauw/widget.css?v=20260506a">
    <script src="/cotacao/app.js?v=<?php echo e(COTACAO_VERSION); ?>" defer></script>
    <script src="/miauw/widget.js?v=20260511b" defer></script>
</head>
<body>
<header class="cotacao-topbar">
    <a class="cotacao-brand" href="/">
        <img src="/cotacao/logo-wimifarma.svg" alt="Wimifarma">
        <span>Cotacao</span>
    </a>
    <nav class="cotacao-nav" aria-label="Navegacao cotacao">
        <a class="active" href="/cotacao/">Cotacao Geral</a>
        <button type="button">Farmacia Popular</button>
        <button type="button">Beb&ecirc;</button>
        <a href="/cotacao/exportar.php?bloco=<?php echo e((string) $block['slug']); ?>">Baixar .csv</a>
        <a href="/cotacao/logout.php">Sair</a>
    </nav>
</header>

<main class="cotacao-shell sheet-shell">
    <section class="sheet-heading">
        <div>
            <span class="kicker">Wimifarma Cotacao</span>
            <h1>Cotacao Geral</h1>
        </div>
        <div class="sheet-heading-actions">
            <div class="sheet-count sheet-status-pill" data-save-status><?php echo e((string) count($items)); ?> linha(s) com dados</div>
            <div class="presence-pill" data-presence-summary>1 pessoa usando</div>
            <div class="presence-list" data-presence-list aria-live="polite"></div>
            <div class="user-pill">Usuario: <?php echo e((string) $user['username']); ?></div>
        </div>
    </section>

    <?php if (!empty($flash['message'])) : ?>
        <div class="notice <?php echo e((string) ($flash['type'] ?? 'info')); ?>"><?php echo e((string) $flash['message']); ?></div>
    <?php endif; ?>

    <form id="sheet-filter-form" class="sheet-filter-form" method="get" aria-hidden="true">
        <input type="hidden" name="bloco" value="<?php echo e((string) $block['slug']); ?>">
        <input id="category-filter-value" type="hidden" value="<?php echo e((string) ($syncState['filtro_categoria'] ?? '')); ?>">
    </form>

    <form method="post" class="sheet-form" data-no-enter-submit>
        <?php echo csrf_field(); ?>
        <input type="hidden" name="action" value="save_sheet">
        <input type="hidden" name="bloco" value="<?php echo e((string) $block['slug']); ?>">

        <section class="sheet-quick-toolbar" aria-label="Atalhos da planilha">
            <div class="sheet-format-toolbar" aria-label="Formatacao">
                <button type="button" class="format-button history-button" data-history-undo title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 7 4 12l5 5"/>
                        <path d="M5 12h9a6 6 0 0 1 6 6v1"/>
                    </svg>
                </button>
                <button type="button" class="format-button history-button" data-history-redo title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="m15 7 5 5-5 5"/>
                        <path d="M19 12h-9a6 6 0 0 0-6 6v1"/>
                    </svg>
                </button>
                <button type="button" class="format-button" data-format-toggle="bold" title="Negrito">B</button>
                <button type="button" class="format-button is-underlined" data-format-toggle="underline" title="Sublinhado">S</button>
                <span class="font-size-stepper" aria-label="Tamanho da letra">
                    <button type="button" class="format-button font-size-stepper-button" data-format-size="-1" title="Diminuir letra" aria-label="Diminuir tamanho da letra">-</button>
                    <input class="font-size-input" type="number" min="8" max="36" step="1" value="20" inputmode="numeric" data-font-size-indicator aria-label="Tamanho da fonte">
                    <button type="button" class="format-button font-size-stepper-button" data-format-size="1" title="Aumentar letra" aria-label="Aumentar tamanho da letra">+</button>
                </span>
                <button type="button" class="format-button align-button" data-format-align="left" title="Alinhar a esquerda" aria-label="Alinhar a esquerda"><?php echo cotacao_align_icon('left'); ?></button>
                <button type="button" class="format-button align-button" data-format-align="center" title="Centralizar" aria-label="Centralizar"><?php echo cotacao_align_icon('center'); ?></button>
                <button type="button" class="format-button align-button" data-format-align="right" title="Alinhar a direita" aria-label="Alinhar a direita"><?php echo cotacao_align_icon('right'); ?></button>
                <span class="paint-dropdown" aria-label="Cores">
                    <button class="format-button has-label paint-button" type="button" data-open-toolbar-palette title="Cor da celula" aria-label="Cor da celula">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M5 3h9.5a4.5 4.5 0 0 1 0 9H12v3.5a3.5 3.5 0 0 1-7 0V3Zm2 2v6h7.5a2.5 2.5 0 0 0 0-5H7Zm0 8v2.5a1.5 1.5 0 0 0 3 0V13H7Z"/>
                            <path d="M18 14.5s3 3.2 3 5a3 3 0 0 1-6 0c0-1.8 3-5 3-5Z"/>
                        </svg>
                        <span class="tool-label">Cor</span>
                    </button>
                    <span class="toolbar-color-palette" data-toolbar-palette hidden>
                        <span class="toolbar-palette-title">Cor da celula</span>
                        <?php foreach ($colorOptions as $color => $label) : ?>
                            <button class="color-swatch <?php echo $color === '' ? 'is-clear' : ''; ?>" type="button" data-toolbar-color="<?php echo e($color); ?>" data-swatch-color="<?php echo e($color); ?>" style="<?php echo $color !== '' ? '--swatch-color: ' . e($color) . '; background: ' . e($color) . ' !important; background-color: ' . e($color) . ' !important;' : ''; ?>" title="<?php echo e($label); ?>" aria-label="<?php echo e($label); ?>"></button>
                        <?php endforeach; ?>
                    </span>
                </span>
                <button type="button" class="format-button has-label conditional-format-button" data-open-conditional-format title="Formatacao condicional" aria-label="Formatacao condicional">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 5h16M4 12h16M4 19h10"/>
                        <path d="M16 15.5s3 2.8 3 4.4a3 3 0 0 1-6 0c0-1.6 3-4.4 3-4.4Z"/>
                    </svg>
                    <span class="tool-label">Condicoes</span>
                </button>
                <button type="button" class="format-button has-label clear-format-button" data-clear-formatting title="Limpar formatacao" aria-label="Limpar formatacao">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 20h7"/>
                        <path d="m7 15 8-8 4 4-8 8H7v-4Z"/>
                        <path d="M14 8 10 4"/>
                    </svg>
                    <span class="tool-label">Limpar</span>
                </button>
                <button type="button" class="format-button print-selection-button" data-print-selected title="Imprimir celulas marcadas" aria-label="Imprimir celulas marcadas">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M7 3h10v5H7V3Zm-2 7h14a3 3 0 0 1 3 3v5h-4v3H6v-3H2v-5a3 3 0 0 1 3-3Zm3 6v3h8v-3H8Zm10-3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>
                    </svg>
                </button>
            </div>
            <div class="category-legend" aria-label="Legenda de categorias">
                <div class="selection-summary" data-selection-summary hidden>
                    <button class="selection-summary-button" type="button" data-selection-summary-toggle aria-label="Resumo da selecao">
                        <span data-selection-summary-value>Soma: R$ 0,00</span>
                        <span class="selection-summary-caret" aria-hidden="true">&#9662;</span>
                    </button>
                    <div class="selection-summary-menu" data-selection-summary-menu hidden>
                        <button type="button" data-summary-metric="sum">Soma <strong data-summary-metric-value></strong></button>
                        <button type="button" data-summary-metric="average">Media <strong data-summary-metric-value></strong></button>
                        <button type="button" data-summary-metric="min">Min <strong data-summary-metric-value></strong></button>
                        <button type="button" data-summary-metric="max">Max <strong data-summary-metric-value></strong></button>
                        <button type="button" data-summary-metric="count">Contagem <strong data-summary-metric-value></strong></button>
                        <button type="button" data-summary-metric="number-count">Numeros <strong data-summary-metric-value></strong></button>
                    </div>
                </div>
            </div>
        </section>

        <div class="sheet-grid-wrap">
            <table id="sheet-grid" class="sheet-grid" data-next-row="<?php echo e((string) $rowCount); ?>" data-block="<?php echo e((string) $block['slug']); ?>" data-user-id="<?php echo e((string) ($user['id'] ?? 0)); ?>" data-user-name="<?php echo e((string) $user['username']); ?>" data-sync-version="<?php echo e((string) ($syncState['versao'] ?? 1)); ?>" data-sync-data-version="<?php echo e((string) ($syncState['dados_versao'] ?? 1)); ?>" data-sync-filter-version="<?php echo e((string) ($syncState['filtro_versao'] ?? 1)); ?>" data-sync-structure-version="<?php echo e((string) ($syncState['estrutura_versao'] ?? 1)); ?>" data-sync-event-id="<?php echo e((string) ($syncState['evento_id'] ?? 0)); ?>" data-sync-filter-color="<?php echo e((string) ($syncState['filtro_cor'] ?? '')); ?>" data-sync-filter-winner="<?php echo e((string) ($syncState['filtro_vencedor'] ?? '')); ?>">
                <colgroup>
                    <col class="row-number-col">
                    <col class="col-ean" data-col-index="0">
                    <col class="col-product" data-col-index="1">
                    <col class="col-qty" data-col-index="2">
                    <col class="col-category" data-col-index="3">
                    <?php foreach ($suppliers as $index => $supplier) : ?>
                        <?php $supplierToneClass = 'supplier-tone-' . ($index % $supplierToneCount); ?>
                        <col class="supplier-col <?php echo e($supplierToneClass); ?>" data-col-index="<?php echo e((string) ($index + 4)); ?>">
                    <?php endforeach; ?>
                    <col class="winner-col" data-col-index="<?php echo e((string) (count($suppliers) + 4)); ?>">
                </colgroup>
                <thead>
                    <tr>
                        <th class="row-number all-select-heading" data-select-all title="Selecionar tudo para edicao em massa" aria-label="Selecionar tudo para edicao em massa">#</th>
                        <th class="col-ean" data-col-index="0">EAN<span class="column-resizer" data-resize-col></span></th>
                        <th class="col-product" data-col-index="1">
                            <span class="heading-with-filter">
                                <span>PRODUTO</span>
                                <button class="filter-funnel color-filter-funnel" type="button" data-open-product-color-filter aria-label="Filtrar cor do produto"></button>
                            </span>
                            <span class="column-resizer" data-resize-col></span>
                        </th>
                        <th class="col-qty" data-col-index="2">QUANTIDADE<span class="column-resizer" data-resize-col></span></th>
                        <th class="col-category" data-col-index="3">
                            <span class="heading-with-filter">
                                <span>CATEGORIA</span>
                                <button class="filter-funnel <?php echo $filters['categoria'] !== '' ? 'is-active' : ''; ?>" type="button" data-open-category-filter aria-label="Filtrar categoria"></button>
                            </span>
                            <span class="column-resizer" data-resize-col></span>
                        </th>
                        <?php foreach ($suppliers as $index => $supplier) : ?>
                            <?php $supplierToneClass = 'supplier-tone-' . ($index % $supplierToneCount); ?>
                            <th class="supplier-heading <?php echo e($supplierToneClass); ?>" data-col-index="<?php echo e((string) ($index + 4)); ?>" data-supplier-id="<?php echo e((string) $supplier['id']); ?>" data-supplier-name="<?php echo e((string) $supplier['nome']); ?>">
                                <div class="supplier-header-inner">
                                    <input class="supplier-name-input" value="<?php echo e((string) $supplier['nome']); ?>" data-supplier-id="<?php echo e((string) $supplier['id']); ?>" aria-label="Nome da distribuidora" readonly>
                                </div>
                                <span class="column-resizer" data-resize-col></span>
                            </th>
                        <?php endforeach; ?>
                        <th class="winner-col" data-col-index="<?php echo e((string) (count($suppliers) + 4)); ?>">
                            <span class="heading-with-filter">
                                <span>QUEM GANHOU</span>
                                <button class="filter-funnel winner-filter-funnel" type="button" data-open-winner-filter aria-label="Filtrar quem ganhou"></button>
                            </span>
                            <span class="column-resizer" data-resize-col></span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <?php for ($rowIndex = 0; $rowIndex < $rowCount; $rowIndex++) : ?>
                        <?php
                        $item = $items[$rowIndex] ?? array();
                        $itemId = (int) ($item['id'] ?? 0);
                        $isEmptyPersistedRow = $itemId > 0 && !empty($item['linha_vazia']);
                        $rowOrder = (int) ($item['ordem'] ?? (($rowIndex + 1) * 1000));
                        $itemPrices = $itemId > 0 ? ($prices[$itemId] ?? array()) : array();
                        $rowColor = cotacao_color_value((string) ($item['cor'] ?? ''));
                        $cellColors = cotacao_cell_colors_array($item['cores'] ?? '');
                        $cellStyles = cotacao_cell_styles_array($item['estilos'] ?? '');
                        $itemCategory = $isEmptyPersistedRow ? '' : (string) ($item['categoria'] ?? '');
                        $orderRegisteredAttrs = cotacao_order_registered_attrs($item['encomenda_registrada_em'] ?? null);
                        ?>
                        <tr class="sheet-row" data-item-id="<?php echo e((string) $itemId); ?>" data-row-index="<?php echo e((string) $rowIndex); ?>" data-row-order="<?php echo e((string) $rowOrder); ?>" data-line-empty="<?php echo $isEmptyPersistedRow ? '1' : '0'; ?>" data-color="<?php echo e($rowColor); ?>">
                            <td class="row-number" role="button" tabindex="0" title="Selecionar linha para edicao em massa"><?php echo e((string) ($rowIndex + 1)); ?></td>
                            <td class="sheet-cell" data-col="0" data-col-key="ean" data-color="<?php echo e(cotacao_cell_color($cellColors, 'ean')); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, 'ean'); ?>>
                                <input class="row-id-input" type="hidden" name="rows[<?php echo e((string) $rowIndex); ?>][id]" value="<?php echo e((string) $itemId); ?>">
                                <input class="row-color-input" type="hidden" name="rows[<?php echo e((string) $rowIndex); ?>][cor]" value="<?php echo e($rowColor); ?>">
                                <input class="row-colors-input" type="hidden" name="rows[<?php echo e((string) $rowIndex); ?>][cores]" value="<?php echo e(cotacao_cell_colors_json($cellColors)); ?>">
                                <input class="row-styles-input" type="hidden" name="rows[<?php echo e((string) $rowIndex); ?>][estilos]" value="<?php echo e(cotacao_cell_styles_json($cellStyles)); ?>">
                                <textarea class="sheet-input sheet-textarea" rows="1" data-col="0" name="rows[<?php echo e((string) $rowIndex); ?>][ean]" readonly><?php echo e($isEmptyPersistedRow ? '' : (string) ($item['ean'] ?? '')); ?></textarea>
                            </td>
                            <td class="sheet-cell" data-col="1" data-col-key="produto" data-color="<?php echo e(cotacao_cell_color($cellColors, 'produto')); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, 'produto'); ?>><textarea class="sheet-input sheet-textarea product-input" rows="1" data-col="1" name="rows[<?php echo e((string) $rowIndex); ?>][produto]" readonly><?php echo e($isEmptyPersistedRow ? '' : (string) ($item['produto'] ?? '')); ?></textarea></td>
                            <td class="sheet-cell" data-col="2" data-col-key="quantidade" data-color="<?php echo e(cotacao_cell_color($cellColors, 'quantidade')); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, 'quantidade'); ?>><input class="sheet-input qty-input" data-col="2" name="rows[<?php echo e((string) $rowIndex); ?>][quantidade]" value="<?php echo e($itemId > 0 && !$isEmptyPersistedRow ? cotacao_price_format($item['quantidade']) : ''); ?>" inputmode="decimal" readonly></td>
                            <td class="sheet-cell category-cell" data-col="3" data-col-key="categoria" data-color="<?php echo e(cotacao_cell_color($cellColors, 'categoria')); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, 'categoria'); ?><?php echo $orderRegisteredAttrs; ?>><textarea class="sheet-input sheet-textarea category-input" rows="1" data-col="3" name="rows[<?php echo e((string) $rowIndex); ?>][categoria]" readonly><?php echo e($itemCategory); ?></textarea></td>
                            <?php foreach ($suppliers as $supplierIndex => $supplier) : ?>
                                <?php
                                $supplierId = (int) $supplier['id'];
                                $isWinner = $itemId > 0 && (int) ($item['vencedor_fornecedor_id'] ?? 0) === $supplierId;
                                $supplierKey = 'supplier-' . $supplierId;
                                $supplierToneClass = 'supplier-tone-' . ($supplierIndex % $supplierToneCount);
                                ?>
                                <td class="sheet-cell price-cell <?php echo e($supplierToneClass); ?> <?php echo $isWinner ? 'winner-price' : ''; ?>" data-col="<?php echo e((string) ($supplierIndex + 4)); ?>" data-col-key="<?php echo e($supplierKey); ?>" data-color="<?php echo e(cotacao_cell_color($cellColors, $supplierKey)); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, $supplierKey); ?>>
                                    <input class="sheet-input price-input" data-col="<?php echo e((string) ($supplierIndex + 4)); ?>" data-supplier-id="<?php echo e((string) $supplierId); ?>" data-supplier-name="<?php echo e((string) $supplier['nome']); ?>" name="precos[<?php echo e((string) $rowIndex); ?>][<?php echo e((string) $supplierId); ?>]" value="<?php echo e($isEmptyPersistedRow ? '' : cotacao_price_format($itemPrices[$supplierId] ?? null)); ?>" inputmode="decimal" readonly>
                                </td>
                            <?php endforeach; ?>
                            <td class="sheet-cell winner-col" data-col="<?php echo e((string) (count($suppliers) + 4)); ?>" data-col-key="vencedor" data-color="<?php echo e(cotacao_cell_color($cellColors, 'vencedor')); ?>"<?php echo cotacao_cell_style_attrs($cellStyles, 'vencedor'); ?>><textarea class="winner-output" readonly tabindex="-1"><?php echo e(cotacao_winner_text($item)); ?></textarea></td>
                        </tr>
                    <?php endfor; ?>
                </tbody>
            </table>
        </div>
        <section class="sheet-bottom-actions">
            <button class="btn secondary" type="button" data-add-rows="10">Adicionar 10 linhas</button>
        </section>
    </form>

    <div id="category-filter-popover" class="filter-popover" data-all-categories="<?php echo e(json_encode(array_values($categories), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?>" hidden>
        <div class="filter-popover-title">Filtrar categoria</div>
        <input class="filter-popover-search" type="search" data-category-filter-search placeholder="Buscar categoria...">
        <div class="filter-popover-actions">
            <button type="button" data-category-select-all>Selecionar todos</button>
            <button type="button" data-category-clear>Limpar filtro</button>
        </div>
        <div class="filter-options" data-category-options>
            <?php if (!$categories) : ?>
                <span class="filter-empty">Nenhuma categoria digitada ainda.</span>
            <?php endif; ?>
            <?php foreach ($categories as $category) : ?>
                <?php
                $categoryLower = cotacao_filter_text((string) $category);
                $categoryChecked = !$hasCategoryFilter;
                if ($hasCategoryFilter) {
                    foreach ($categoryFilterTerms as $term) {
                        if (strpos($categoryLower, $term) !== false) {
                            $categoryChecked = true;
                            break;
                        }
                    }
                }
                ?>
                <label class="filter-option">
                    <input type="checkbox" value="<?php echo e((string) $category); ?>" <?php echo $categoryChecked ? 'checked' : ''; ?>>
                    <span><?php echo e((string) $category); ?></span>
                </label>
            <?php endforeach; ?>
        </div>
        <div class="filter-popover-footer">
            <button class="btn secondary" type="button" data-category-apply>Aplicar</button>
        </div>
    </div>

    <div id="product-color-filter-popover" class="filter-popover color-filter-popover" hidden>
        <div class="filter-popover-title">Filtrar cor do produto</div>
        <div class="product-color-options" data-product-color-options aria-label="Cores usadas no produto">
        </div>
        <div class="filter-popover-footer">
            <button class="btn secondary" type="button" data-product-color-clear>Limpar cor</button>
        </div>
    </div>

    <div id="winner-filter-popover" class="filter-popover winner-filter-popover" hidden>
        <div class="filter-popover-title">Filtrar quem ganhou</div>
        <div class="filter-options winner-filter-options" data-winner-options></div>
        <div class="filter-popover-footer">
            <button class="btn secondary" type="button" data-winner-clear>Limpar filtro</button>
        </div>
    </div>

    <div id="conditional-format-popover" class="conditional-format-popover" hidden>
        <div class="conditional-popover-head">
            <strong>Condicoes</strong>
            <button type="button" class="conditional-close-button" data-conditional-close title="Fechar" aria-label="Fechar">x</button>
        </div>
        <input type="hidden" data-conditional-id value="">
        <input type="hidden" data-conditional-color-value value="">
        <label>
            Coluna selecionada
            <select data-conditional-column></select>
        </label>
        <div class="conditional-rule-grid">
            <label>
                Regra
                <select data-conditional-operator>
                    <?php foreach ($conditionalOperators as $operator => $label) : ?>
                        <option value="<?php echo e($operator); ?>"><?php echo e($label); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label data-conditional-term-wrap>
                Texto
                <input type="search" data-conditional-term placeholder="palavra, valor ou trecho">
            </label>
        </div>
        <div class="conditional-colors" aria-label="Cores da condicao">
            <?php foreach ($colorOptions as $color => $label) : ?>
                <?php if ($color === '') { continue; } ?>
                <button class="color-swatch" type="button" data-conditional-color="<?php echo e($color); ?>" data-swatch-color="<?php echo e($color); ?>" style="--swatch-color: <?php echo e($color); ?>; background: <?php echo e($color); ?> !important; background-color: <?php echo e($color); ?> !important;" title="<?php echo e($label); ?>" aria-label="<?php echo e($label); ?>"></button>
            <?php endforeach; ?>
        </div>
        <div class="conditional-actions">
            <button class="btn" type="button" data-conditional-save>Salvar condicao</button>
        </div>
        <div class="conditional-rule-list" data-conditional-rule-list></div>
    </div>
    <script type="application/json" id="conditional-rules-data"><?php echo str_replace('</', '<\/', json_encode($conditionalRules, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></script>

    <div id="sheet-context-menu" class="sheet-context-menu compact-color-menu" hidden>
        <div class="context-sheet-actions" data-cell-menu>
            <button type="button" data-context-insert-row-above>Inserir linha acima</button>
            <button type="button" data-context-insert-row-below>Inserir linha abaixo</button>
            <button type="button" data-context-delete-row>Excluir linha</button>
            <button type="button" data-context-add-supplier>Nova distribuidora</button>
            <button type="button" data-context-delete-supplier>Excluir distribuidora</button>
        </div>
        <div class="context-format-grid" data-cell-menu>
            <div class="context-format-row">
                <button type="button" data-context-toggle="bold" title="Negrito">B</button>
                <button type="button" class="is-underlined" data-context-toggle="underline" title="Sublinhado">S</button>
                <span class="font-size-stepper context-font-size-stepper" aria-label="Tamanho da letra">
                    <button type="button" class="font-size-stepper-button" data-context-size="-1" title="Diminuir letra" aria-label="Diminuir tamanho da letra">-</button>
                    <input class="font-size-input" type="number" min="8" max="36" step="1" value="20" inputmode="numeric" data-context-font-size-input aria-label="Tamanho da fonte">
                    <button type="button" class="font-size-stepper-button" data-context-size="1" title="Aumentar letra" aria-label="Aumentar tamanho da letra">+</button>
                </span>
                <button type="button" data-context-print-selected title="Imprimir celulas marcadas" aria-label="Imprimir celulas marcadas">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M7 3h10v5H7V3Zm-2 7h14a3 3 0 0 1 3 3v5h-4v3H6v-3H2v-5a3 3 0 0 1 3-3Zm3 6v3h8v-3H8Zm10-3.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>
                    </svg>
                </button>
            </div>
            <div class="context-align-row">
                <button type="button" data-context-toggle-color title="Cor da celula" aria-expanded="false">Cor</button>
                <button type="button" data-context-align="left" title="Alinhar a esquerda" aria-label="Alinhar a esquerda"><?php echo cotacao_align_icon('left'); ?></button>
                <button type="button" data-context-align="center" title="Centralizar" aria-label="Centralizar"><?php echo cotacao_align_icon('center'); ?></button>
                <button type="button" data-context-align="right" title="Alinhar a direita" aria-label="Alinhar a direita"><?php echo cotacao_align_icon('right'); ?></button>
            </div>
        </div>
        <div class="context-color-panel" data-cell-menu hidden>
            <div class="context-color-title">Cor da celula</div>
            <div class="context-color-grid">
                <?php foreach ($colorOptions as $color => $label) : ?>
                    <button class="color-swatch <?php echo $color === '' ? 'is-clear' : ''; ?>" type="button" data-context-color="<?php echo e($color); ?>" data-swatch-color="<?php echo e($color); ?>" style="<?php echo $color !== '' ? '--swatch-color: ' . e($color) . '; background: ' . e($color) . ' !important; background-color: ' . e($color) . ' !important;' : ''; ?>" title="<?php echo e($label); ?>" aria-label="<?php echo e($label); ?>"></button>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="context-header-note" data-header-menu hidden>
            Cabecalho: formate tamanho/alinhamento. Colunas fixas nao podem ser excluidas.
        </div>
    </div>
</main>
</body>
</html>
