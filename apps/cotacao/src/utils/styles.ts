import type { ColumnKey, RowId } from "../contracts/common.js";
import type { StyleMutation, StyleScope, StyleTarget } from "../contracts/domain.js";

const STYLE_SCOPES = ["row", "column", "cell"] as const;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type StyleInput = {
  scope?: unknown;
  rowId?: unknown;
  columnKey?: unknown;
  background?: unknown;
  color?: unknown;
};

function isStyleScope(value: string): value is StyleScope {
  return (STYLE_SCOPES as readonly string[]).includes(value);
}

function styleKey(scope: StyleScope, rowId: RowId | null, columnKey: ColumnKey | null): string {
  return `${scope}:${rowId || ""}:${columnKey || ""}`;
}

function normalizeStyleBase(body: StyleInput): Omit<StyleTarget, "styleKey"> | null {
  const scope = String(body.scope || "");
  const rowId = body.rowId ? String(body.rowId) : null;
  const columnKey = body.columnKey ? String(body.columnKey) : null;

  if (!isStyleScope(scope)) return null;
  if (scope === "row" && !rowId) return null;
  if (scope === "column" && !columnKey) return null;
  if (scope === "cell" && (!rowId || !columnKey)) return null;

  return { scope, rowId, columnKey };
}

export function normalizeStyleTarget(body: StyleInput): StyleTarget | null {
  const target = normalizeStyleBase(body);
  if (!target) return null;

  return {
    ...target,
    styleKey: styleKey(target.scope, target.rowId, target.columnKey)
  };
}

export function normalizeStylePayload(body: StyleInput): StyleMutation | null {
  const target = normalizeStyleTarget(body);
  if (!target) return null;

  const background = String(body.background || "").trim();
  const color = String(body.color || "").trim();
  if (!HEX_COLOR_PATTERN.test(background)) return null;

  return {
    ...target,
    background,
    color: HEX_COLOR_PATTERN.test(color) ? color : ""
  };
}
