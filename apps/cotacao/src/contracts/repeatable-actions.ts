import type { ColumnKey, RowId } from "./common.js";

export const REPEATABLE_ACTION_TYPES = [
  "cell-value",
  "paste-values",
  "apply-color",
  "erase-format"
] as const;

export type RepeatableActionType = typeof REPEATABLE_ACTION_TYPES[number];

export interface RepeatCellValuePayload {
  value: string;
}

export interface RepeatPasteValuesPayload {
  matrix: string[][];
}

export interface RepeatApplyColorPayload {
  color: string;
}

export interface RepeatEraseFormatPayload {
  [key: string]: never;
}

export type RepeatableActionPayload =
  | RepeatCellValuePayload
  | RepeatPasteValuesPayload
  | RepeatApplyColorPayload
  | RepeatEraseFormatPayload;

export interface RepeatableAction<TType extends RepeatableActionType = RepeatableActionType> {
  type: TType;
  label: string;
  payload: RepeatableActionPayload;
  createdAt: number;
}

export interface RepeatableCellTarget {
  rowId: RowId;
  columnKey: ColumnKey;
}

export type RepeatSelectionScope =
  | { type: "column"; columnKey: ColumnKey }
  | { type: "column-range"; startCol: number; endCol: number }
  | { type: "row"; rowId: RowId }
  | { type: "row-range"; startRow: number; endRow: number }
  | null;

export interface RepeatContext {
  activeCell: RepeatableCellTarget | null;
  cells: RepeatableCellTarget[];
  selectionScope: RepeatSelectionScope;
}

export type RepeatCompatibility =
  | { ok: true }
  | { ok: false; reason: string };
