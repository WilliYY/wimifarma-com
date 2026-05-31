export const RULE_OPERATORS = ["contains", "equals", "starts"] as const;

export type RuleOperator = (typeof RULE_OPERATORS)[number];

export function isRuleOperator(value: string): value is RuleOperator {
  return RULE_OPERATORS.includes(value as RuleOperator);
}

export function normalizeRuleOperator(value: unknown): RuleOperator {
  const operator = String(value || "contains");
  return isRuleOperator(operator) ? operator : "contains";
}

export function normalizeHexColor(value: unknown, fallback = "#fff7ed"): string {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

export function parseEventCursor(value: unknown): number | null {
  const cursor = Number.parseInt(String(value ?? "0"), 10);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

export function jsonByteLength(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch (_error) {
    return null;
  }
}
