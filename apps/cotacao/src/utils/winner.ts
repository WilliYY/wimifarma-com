import type { ColumnKey } from "../contracts/common.js";
import type { CellMap, CotacaoColumn } from "../contracts/domain.js";

export type WinnerLabel = string;

type WinnerRow = {
  values?: Partial<Record<ColumnKey, unknown>>;
};

function columnOption(column: CotacaoColumn | null | undefined, key: string): boolean {
  const value = column?.options?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

export function isComputedColumn(column: CotacaoColumn | null | undefined): boolean {
  return column?.key === "quem_ganhou" || columnOption(column, "computed");
}

export function isDistributorColumn(column: CotacaoColumn | null | undefined): boolean {
  if (!column || isComputedColumn(column)) return false;
  if (columnOption(column, "fixed") || columnOption(column, "hidden")) return false;
  return true;
}

export function parsePriceForWinner(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function computeWinnerForRow(row: WinnerRow, columns: CotacaoColumn[]): WinnerLabel {
  const distributors = columns.filter(isDistributorColumn);
  let best: number | null = null;
  let winners: CotacaoColumn[] = [];

  distributors.forEach((column) => {
    const price = parsePriceForWinner((row.values as CellMap | undefined)?.[column.key]);
    if (price === null) return;
    if (best === null || price < best) {
      best = price;
      winners = [column];
      return;
    }
    if (price === best) winners.push(column);
  });

  if (!winners.length) return "Sem vencedor";
  if (winners.length > 1) return `Empate: ${winners.map((column) => column.label).join(", ")}`;
  return winners[0]?.label || "Sem vencedor";
}
