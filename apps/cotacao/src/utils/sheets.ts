import type { CellMap, CotacaoColumn, CotacaoSheetSnapshot } from "../contracts/domain.js";
import { computeWinnerForRow } from "./winner.js";

export type SheetMatrix = string[][];

export interface ImportedSheetRow {
  id: string | null;
  values: CellMap;
}

const ROW_ID_HEADERS = ["cotacao_row_id", "_cotacao_row_id", "row_id", "id"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return UUID_PATTERN.test(String(value || ""));
}

function isComputedSheetColumn(column: CotacaoColumn): boolean {
  return column.key === "quem_ganhou" || column.options?.computed === true;
}

export function matrixFromSheet(sheet: Pick<CotacaoSheetSnapshot, "columns" | "rows">): SheetMatrix {
  const columns = sheet.columns;
  const headers = [...columns.map((column) => column.label), "cotacao_row_id"];
  const values = sheet.rows.map((row) => columns.map((column) => {
    if (isComputedSheetColumn(column)) {
      return computeWinnerForRow(row, columns);
    }
    return String(row.values?.[column.key] ?? "");
  }).concat(row.id));

  return [headers, ...values];
}

export function rowsFromMatrix(matrix: unknown, columns: CotacaoColumn[]): ImportedSheetRow[] {
  const rows = Array.isArray(matrix) ? matrix : [];
  if (!rows.length) return [];

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const headers = headerRow.map((value) => String(value || "").trim().toLowerCase());
  const idIndex = ROW_ID_HEADERS
    .map((name) => headers.indexOf(name))
    .find((index) => index !== -1);
  const editableColumns = columns.filter((column) => column.options?.computed !== true);
  const indexByColumn = new Map<string, number>();

  editableColumns.forEach((column, fallbackIndex) => {
    const labelIndex = headers.indexOf(String(column.label || "").trim().toLowerCase());
    const keyIndex = headers.indexOf(String(column.key || "").trim().toLowerCase());
    indexByColumn.set(column.key, labelIndex !== -1 ? labelIndex : (keyIndex !== -1 ? keyIndex : fallbackIndex));
  });

  return rows.slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => String(value ?? "").trim() !== ""))
    .map((row) => {
      const values: CellMap = {};
      editableColumns.forEach((column) => {
        values[column.key] = String(row[indexByColumn.get(column.key) ?? 0] ?? "");
      });
      const id = typeof idIndex === "number" && idIndex >= 0 && isUuid(row[idIndex]) ? String(row[idIndex]) : null;
      return { id, values };
    });
}
