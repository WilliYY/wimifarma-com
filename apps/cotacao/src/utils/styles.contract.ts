import {
  normalizeStylePayload,
  normalizeStyleTarget
} from "./styles.js";
import type { StyleMutation, StyleTarget } from "../contracts/domain.js";

const rowTarget: StyleTarget | null = normalizeStyleTarget({ scope: "row", rowId: "row-1" });
const columnTarget: StyleTarget | null = normalizeStyleTarget({ scope: "column", columnKey: "produto" });
const cellTarget: StyleTarget | null = normalizeStyleTarget({ scope: "cell", rowId: "row-1", columnKey: "produto" });
const invalidTarget: StyleTarget | null = normalizeStyleTarget({ scope: "cell", rowId: "row-1" });

const validPayload: StyleMutation | null = normalizeStylePayload({
  scope: "cell",
  rowId: "row-1",
  columnKey: "produto",
  background: "#fef3c7",
  color: "#111827"
});

const invalidPayload: StyleMutation | null = normalizeStylePayload({
  scope: "cell",
  rowId: "row-1",
  columnKey: "produto",
  background: "yellow"
});

export const styleContractCases = {
  rowTarget,
  columnTarget,
  cellTarget,
  invalidTarget,
  validPayload,
  invalidPayload
} satisfies Record<string, unknown>;
