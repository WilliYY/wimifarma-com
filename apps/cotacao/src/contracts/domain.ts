import type {
  ClientId,
  ColumnKey,
  IsoDateTime,
  JsonRecord,
  JsonValue,
  QuoteId,
  RowId,
  Uuid
} from "./common.js";

export type ColumnType = "text" | "number" | "currency" | "computed" | string;
export type FixedColumnKey = "ean" | "produto" | "quantidade" | "categoria";
export type SystemColumnKey = FixedColumnKey | "ganhador";
export type ColumnPlacement = "before" | "after";
export type ColumnMoveDirection = "left" | "right";

export interface ColumnOptions {
  fixed?: boolean;
  hidden?: boolean;
  kind?: "distributor" | "fixed" | "computed" | string;
  tone?: string;
  [key: string]: JsonValue | undefined;
}

export interface CotacaoQuote {
  id: QuoteId;
  name: string;
  status: "active" | "archived" | string;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface CotacaoColumn {
  quote_id?: QuoteId;
  key: ColumnKey;
  label: string;
  type?: ColumnType;
  position: number;
  width?: number | null;
  options?: ColumnOptions;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export type CellValue = string;
export type CellMap = Record<ColumnKey, CellValue>;

export interface CotacaoRow {
  id: RowId;
  position: number;
  values: CellMap;
  version: number;
  updatedAt: IsoDateTime;
}

export type RuleOperator = "contains" | "equals" | "starts";
export type RuleTarget = "cell";

export interface CotacaoRule {
  id: Uuid;
  quote_id: QuoteId;
  name: string;
  target: RuleTarget;
  column_key: ColumnKey;
  operator: RuleOperator;
  value: string;
  background: string;
  color: string;
  show_timestamp: boolean;
  enabled?: boolean;
  priority: number;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export type StyleScope = "row" | "column" | "cell";

export interface StyleTarget {
  scope: StyleScope;
  rowId: RowId | null;
  columnKey: ColumnKey | null;
  styleKey: string;
}

export interface StyleMutation extends StyleTarget {
  background: string;
  color: string;
}

export interface CotacaoStyle extends StyleMutation {
  id: number;
  updatedBy?: string | null;
  updatedAt?: IsoDateTime;
}

export type CotacaoEventType =
  | "rows_added"
  | "rows_inserted"
  | "row_deleted"
  | "column_created"
  | "column_renamed"
  | "column_moved"
  | "column_deleted"
  | "column_restored"
  | "column_resized"
  | "style_updated"
  | "styles_batch_updated"
  | "style_deleted"
  | "styles_batch_deleted"
  | "cell_updated"
  | "cells_batch_updated"
  | "rule_created"
  | "rule_updated"
  | "rule_deleted"
  | "google_sheets_exported"
  | "google_sheets_imported"
  | "backup_created"
  | "backup_restored";

export interface CotacaoEvent<TPayload extends JsonRecord = JsonRecord> {
  id: number;
  type: CotacaoEventType;
  rowId?: RowId | null;
  columnKey?: ColumnKey | null;
  payload: TPayload;
  userId?: number | null;
  username?: string | null;
  clientId?: ClientId | null;
  createdAt: IsoDateTime;
}

export interface PresenceUser {
  clientId: ClientId;
  userId: number;
  username: string;
  role: string;
  rowId: RowId | null;
  columnKey: ColumnKey | null;
  filter: string | null;
  editing: boolean;
  updatedAt: IsoDateTime;
}

export interface CotacaoSheetSnapshot {
  quote: CotacaoQuote;
  columns: CotacaoColumn[];
  rows: CotacaoRow[];
  rules: CotacaoRule[];
  styles: CotacaoStyle[];
  lastEventId: number;
}
