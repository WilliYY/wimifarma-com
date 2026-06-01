import {
  isUuid,
  matrixFromSheet,
  rowsFromMatrix
} from "./sheets.js";
import type { CotacaoColumn, CotacaoSheetSnapshot } from "../contracts/domain.js";

const columns = [
  { key: "produto", label: "PRODUTO", position: 1, options: { fixed: true } },
  { key: "fornecedor_1", label: "Anb", position: 2, options: { kind: "distributor" } },
  { key: "fornecedor_2", label: "Profarma", position: 3, options: { kind: "distributor" } },
  { key: "quem_ganhou", label: "Ganhador", position: 4, options: { computed: true } }
] satisfies CotacaoColumn[];

const snapshot = {
  columns,
  rows: [{
    id: "11111111-1111-4111-8111-111111111111",
    position: 1,
    values: {
      produto: "Dipirona",
      fornecedor_1: "10,00",
      fornecedor_2: "12,00"
    },
    version: 1,
    updatedAt: "2026-05-31T00:00:00.000Z"
  }]
} satisfies Pick<CotacaoSheetSnapshot, "columns" | "rows">;

const exportedMatrix = matrixFromSheet(snapshot);
const importedRows = rowsFromMatrix([
  ["PRODUTO", "Anb", "Profarma", "cotacao_row_id"],
  ["Dipirona", "10,00", "12,00", "11111111-1111-4111-8111-111111111111"],
  ["", "", "", ""]
], columns);

export const sheetContractCases = {
  exportedMatrix,
  importedRows,
  validUuid: isUuid("11111111-1111-4111-8111-111111111111"),
  invalidUuid: isUuid("not-a-uuid")
} satisfies Record<string, unknown>;
