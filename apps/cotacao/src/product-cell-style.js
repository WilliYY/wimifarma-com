const PRODUCT_COLUMN_KEY = 'produto';

function hasVisibleText(value) {
  return String(value ?? '').trim().length > 0;
}

export function productCellStyleKeyToClear(change = {}) {
  const rowId = String(change.rowId || '');
  const columnKey = String(change.columnKey || '');
  if (!rowId || columnKey !== PRODUCT_COLUMN_KEY) return null;
  if (!hasVisibleText(change.previousValue) || hasVisibleText(change.value)) return null;
  return `cell:${rowId}:${PRODUCT_COLUMN_KEY}`;
}

export function productCellStyleKeysToClear(changes = []) {
  return Array.from(new Set(
    changes.map(productCellStyleKeyToClear).filter(Boolean)
  ));
}

export async function clearProductCellStyles(client, quoteId, changes = []) {
  const styleKeys = productCellStyleKeysToClear(changes);
  if (!styleKeys.length) return [];
  const clearedStyles = await client.query(
    `DELETE FROM cotacao_v2_styles
     WHERE quote_id = $1
       AND scope = 'cell'
       AND style_key = ANY($2::text[])
     RETURNING style_key AS "styleKey"`,
    [quoteId, styleKeys]
  );
  return clearedStyles.rows.map((style) => style.styleKey);
}
