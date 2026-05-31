export type Uuid = string;
export type QuoteId = Uuid;
export type RowId = Uuid;
export type ColumnKey = string;
export type ClientId = string;
export type IsoDateTime = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type ApiSuccess<TPayload extends object = Record<string, never>> = {
  ok: true;
} & TPayload;

export interface ApiFailure {
  ok: false;
  error: string;
  code?: string;
  details?: JsonValue;
}

export type ApiResult<TPayload extends object = Record<string, never>> =
  | ApiSuccess<TPayload>
  | ApiFailure;

export interface EventEnvelope {
  eventId: number;
  clientId?: ClientId;
}
