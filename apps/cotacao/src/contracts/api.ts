import type {
  ApiResult,
  ClientId,
  ColumnKey,
  EventEnvelope,
  IsoDateTime,
  JsonRecord,
  JsonValue,
  QuoteId,
  RowId
} from "./common.js";
import type {
  ColumnMoveDirection,
  ColumnPlacement,
  CotacaoColumn,
  CotacaoEvent,
  CotacaoRule,
  CotacaoSheetSnapshot,
  CotacaoStyle,
  PresenceUser,
  RuleOperator,
  StyleMutation,
  StyleTarget
} from "./domain.js";
import type { CotacaoUser } from "./session.js";

export interface CotacaoHealthAuth {
  provider: "core";
  mysqlDependency: false;
  coreReachable: boolean;
  usersSynced: boolean;
  [key: string]: JsonValue;
}

export type CotacaoHealthResponse = ApiResult<{
  service: "cotacao-v2";
  quote_id: QuoteId;
  mysql_auth: false;
  mysql_auth_fallback: false;
  mysql_reachable: null;
  auth: CotacaoHealthAuth;
}>;

export type BootstrapResponse = ApiResult<CotacaoSheetSnapshot & {
  presence: PresenceUser[];
  user: CotacaoUser;
}>;

export interface EventDelta {
  events: CotacaoEvent[];
  latestEventId: number;
  pendingEvents: number;
  requiresSnapshot: boolean;
  reason: "" | "invalid_cursor" | "event_limit" | "snapshot_event";
  snapshotEvent?: {
    id: number;
    type: string;
  };
}

export type EventsResponse = ApiResult<EventDelta & {
  quoteId?: QuoteId;
  after?: number;
  limit?: number;
}>;

export interface CellUpdatePayload {
  rowId: RowId;
  columnKey: ColumnKey;
  value: string;
  expectedValue?: string;
  clientId?: ClientId;
}

export interface CellUpdateResult {
  rowId: RowId;
  columnKey: ColumnKey;
  value: string;
  previousValue: string;
  expectedValue: string | null;
  overwroteRemote: boolean;
  version: number;
  updatedAt: IsoDateTime;
}

export type CellUpdateResponse = ApiResult<CellUpdateResult & EventEnvelope>;

export interface CellsBatchPayload {
  changes: CellUpdatePayload[];
  clientId?: ClientId;
}

export type CellsBatchResponse = ApiResult<{
  cells: CellUpdateResult[];
  eventId: number | null;
  noop?: boolean;
}>;

export interface CellHistoryItem {
  eventId: number;
  type: string;
  username: string;
  createdAt: IsoDateTime;
  previousValue: string;
  value: string;
  expectedValue: string | null;
  overwroteRemote: boolean;
}

export type CellHistoryResponse = ApiResult<{
  rowId: RowId;
  rowNumber: number;
  columnKey: ColumnKey;
  columnLabel: string;
  canRestore: boolean;
  history: CellHistoryItem[];
}>;

export interface RowsCreatePayload {
  count?: number;
  rows?: Array<Record<ColumnKey, string>>;
  clientId?: ClientId;
}

export interface RowsInsertPayload {
  anchorRowId: RowId;
  placement?: "above" | "below";
  count?: number;
  clientId?: ClientId;
}

export type RowsMutationResponse = ApiResult<{
  rows: CotacaoSheetSnapshot["rows"];
  eventId: number;
}>;

export type RowDeleteResponse = ApiResult<{
  rowId: RowId;
  eventId: number;
}>;

export interface ColumnCreatePayload {
  anchorKey?: ColumnKey;
  placement?: ColumnPlacement;
  label: string;
  clientId?: ClientId;
}

export interface ColumnRenamePayload {
  label: string;
  clientId?: ClientId;
}

export interface ColumnMovePayload {
  direction: ColumnMoveDirection;
  clientId?: ClientId;
}

export interface ColumnWidthPayload {
  width: number;
  clientId?: ClientId;
}

export type ColumnsMutationResponse = ApiResult<{
  column?: CotacaoColumn;
  columnKey?: ColumnKey;
  columns?: CotacaoColumn[];
  eventId: number;
}>;

export interface StylePayload extends StyleMutation {
  clientId?: ClientId;
}

export interface StylesBatchPayload {
  styles: StylePayload[];
  clientId?: ClientId;
}

export interface StyleDeletePayload extends StyleTarget {
  clientId?: ClientId;
}

export interface StylesBatchDeletePayload {
  targets: StyleDeletePayload[];
  clientId?: ClientId;
}

export type StyleResponse = ApiResult<{
  style: CotacaoStyle;
  eventId: number;
}>;

export type StylesBatchResponse = ApiResult<{
  styles: CotacaoStyle[];
  eventId: number;
}>;

export type StyleDeleteResponse = ApiResult<{
  styleKey: string;
  eventId: number;
}>;

export type StylesBatchDeleteResponse = ApiResult<{
  styleKeys: string[];
  eventId: number;
}>;

export interface RulePayload {
  columnKey?: ColumnKey;
  operator?: RuleOperator;
  value: string;
  background?: string;
  showTimestamp?: boolean;
  clientId?: ClientId;
}

export type RuleMutationResponse = ApiResult<{
  rule?: CotacaoRule;
  rules?: CotacaoRule[];
  id?: string;
  eventId: number;
}>;

export interface InternalSummaryItem {
  rowId: RowId;
  position: number;
  ean: string;
  produto: string;
  quantidade: string;
  categoria: string;
  ganhador: string;
  updatedAt: IsoDateTime;
}

export type InternalSummaryResponse = ApiResult<{
  source: "postgres";
  quoteId: QuoteId;
  quoteName: string;
  counts: {
    total: number;
    urgentes: number;
    encomendas: number;
    com_vencedor: number;
    sem_vencedor: number;
  };
  distributors: Array<Pick<CotacaoColumn, "key" | "label">>;
  recent: InternalSummaryItem[];
  lastEventId: number;
}>;

export type InternalSearchResponse = ApiResult<{
  query?: string;
  items: InternalSummaryItem[];
  total?: number;
  quoteId?: QuoteId;
  message?: string;
}>;

export interface InternalActorPayload {
  usuario_id?: number | string;
  user_id?: number | string;
  username?: string;
  usuario?: string;
}

export interface InternalCreateItemPayload extends InternalActorPayload {
  produto: string;
  responsavel?: string;
  observacao?: string;
  categoria?: string;
  categoria_extra?: string;
}

export type InternalCreateItemResponse = ApiResult<{
  item: JsonRecord;
  rows: CotacaoSheetSnapshot["rows"];
  eventId: number;
}>;

export interface InternalQuickQuoteItem {
  produto: string;
  categoria?: string;
  preco?: string | number;
}

export interface InternalQuickQuotePayload extends InternalActorPayload {
  fornecedor: string;
  itens: InternalQuickQuoteItem[];
}

export type InternalQuickQuoteResponse = ApiResult<{
  fornecedor: string;
  fornecedor_coluna: CotacaoColumn;
  coluna_criada: boolean;
  columnEventId: number | null;
  itens: JsonRecord[];
  rows: CotacaoSheetSnapshot["rows"];
  eventId: number;
}>;

export type DiagnosticsResponse = ApiResult<JsonRecord>;

export type GoogleSheetsStatusResponse = ApiResult<{
  configured: boolean;
  spreadsheetId: "configured" | "";
  range: string;
}>;

export type GoogleSheetsMutationResponse = ApiResult<{
  range: string;
  result?: JsonRecord;
  rows?: number;
  backup?: string;
  eventId: number;
}>;

export interface BackupInfo {
  name: string;
  bytes: number;
  updatedAt?: IsoDateTime;
}

export type BackupsListResponse = ApiResult<{
  backups: BackupInfo[];
}>;

export type BackupCreateResponse = ApiResult<{
  backup: Pick<BackupInfo, "name" | "bytes">;
  eventId: number;
}>;

export type BackupRestoreResponse = ApiResult<{
  rows: number;
  eventId: number;
}>;
