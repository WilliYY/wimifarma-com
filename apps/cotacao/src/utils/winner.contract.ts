import {
  computeWinnerForRow,
  isDistributorColumn,
  parsePriceForWinner
} from "./winner.js";
import type { CotacaoColumn } from "../contracts/domain.js";

const columns = [
  { key: "produto", label: "PRODUTO", position: 1, options: { fixed: true } },
  { key: "fornecedor_1", label: "Anb", position: 2, options: { kind: "distributor" } },
  { key: "fornecedor_2", label: "Profarma", position: 3, options: { kind: "distributor" } },
  { key: "quem_ganhou", label: "Ganhador", position: 4, options: { computed: true } }
] satisfies CotacaoColumn[];

export const winnerContractCases = {
  parsedBrazilianPrice: parsePriceForWinner("R$ 1.234,56"),
  parsedPlainPrice: parsePriceForWinner("12.50"),
  ignoredEmptyPrice: parsePriceForWinner(""),
  distributorColumn: isDistributorColumn(columns[1]),
  fixedColumn: isDistributorColumn(columns[0]),
  computedColumn: isDistributorColumn(columns[3]),
  singleWinner: computeWinnerForRow({ values: { fornecedor_1: "10,00", fornecedor_2: "12,00" } }, columns),
  tiedWinner: computeWinnerForRow({ values: { fornecedor_1: "10,00", fornecedor_2: "10,00" } }, columns),
  noWinner: computeWinnerForRow({ values: { fornecedor_1: "", fornecedor_2: "" } }, columns)
} satisfies Record<string, unknown>;
