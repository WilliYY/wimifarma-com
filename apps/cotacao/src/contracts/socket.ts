import type { ClientId, ColumnKey, RowId } from "./common.js";
import type { CellUpdateResult } from "./api.js";
import type { CotacaoColumn, CotacaoRule, CotacaoSheetSnapshot, CotacaoStyle, PresenceUser } from "./domain.js";
import type { CotacaoUser } from "./session.js";

export interface SocketJoinPayload {
  quoteId: string;
  clientId: ClientId;
}

export interface PresenceUpdatePayload {
  rowId?: RowId | null;
  columnKey?: ColumnKey | null;
  filter?: string | null;
  editing?: boolean;
}

export interface ClientToServerEvents {
  join: (payload: SocketJoinPayload) => void;
  "presence:update": (payload?: PresenceUpdatePayload) => void;
}

export interface RowsAddedEvent {
  rows: CotacaoSheetSnapshot["rows"];
  eventId: number;
  clientId?: ClientId;
  mode?: "insert";
}

export interface RowDeletedEvent {
  rowId: RowId;
  eventId: number;
  clientId?: ClientId;
}

export type ColumnsChangedType =
  | "column_created"
  | "column_renamed"
  | "column_moved"
  | "column_deleted"
  | "column_restored";

export interface ColumnsChangedEvent {
  type: ColumnsChangedType;
  column?: CotacaoColumn;
  columnKey?: ColumnKey;
  columns?: CotacaoColumn[];
  eventId: number;
  clientId?: ClientId;
}

export interface ColumnResizedEvent {
  type: "column_resized";
  column: CotacaoColumn;
  columnKey: ColumnKey;
  width: number;
  eventId: number;
  clientId?: ClientId;
}

export interface StyleUpdateEvent {
  style: CotacaoStyle;
  eventId: number;
  clientId?: ClientId;
}

export interface StylesUpdateEvent {
  styles: CotacaoStyle[];
  eventId: number;
  clientId?: ClientId;
}

export interface StyleDeleteEvent {
  styleKey: string;
  eventId: number;
  clientId?: ClientId;
}

export interface StylesDeleteEvent {
  styleKeys: string[];
  eventId: number;
  clientId?: ClientId;
}

export interface CellUpdateEvent extends CellUpdateResult {
  eventId: number;
  user: CotacaoUser;
  clientId?: ClientId;
}

export interface CellsUpdateEvent {
  cells: CellUpdateResult[];
  eventId: number;
  user: CotacaoUser;
  clientId?: ClientId;
}

export interface RulesUpdateEvent {
  rules?: CotacaoRule[];
  id?: string;
  mode: "created" | "updated" | "deleted";
  eventId: number;
}

export interface SheetReloadEvent {
  eventId: number;
  clientId?: ClientId;
}

export interface ServerToClientEvents {
  "presence:update": (presence: PresenceUser[]) => void;
  "rows:added": (payload: RowsAddedEvent) => void;
  "row:deleted": (payload: RowDeletedEvent) => void;
  "columns:changed": (payload: ColumnsChangedEvent) => void;
  "column:resized": (payload: ColumnResizedEvent) => void;
  "style:update": (payload: StyleUpdateEvent) => void;
  "styles:update": (payload: StylesUpdateEvent) => void;
  "style:delete": (payload: StyleDeleteEvent) => void;
  "styles:delete": (payload: StylesDeleteEvent) => void;
  "cell:update": (payload: CellUpdateEvent) => void;
  "cells:update": (payload: CellsUpdateEvent) => void;
  "rules:update": (payload: RulesUpdateEvent) => void;
  "sheet:reload": (payload: SheetReloadEvent) => void;
}
