import {
  jsonByteLength,
  normalizeBoolean,
  normalizeHexColor,
  normalizeRuleOperator,
  parseEventCursor,
  type RuleOperator
} from "./normalizers.js";

const validRuleOperator: RuleOperator = normalizeRuleOperator("starts");
const fallbackRuleOperator: RuleOperator = normalizeRuleOperator("invalid");

export const normalizerContractCases = {
  validRuleOperator,
  fallbackRuleOperator,
  validColor: normalizeHexColor("#A1b2C3"),
  fallbackColor: normalizeHexColor("red"),
  booleanTrue: normalizeBoolean("on"),
  booleanFalse: normalizeBoolean("off"),
  eventCursor: parseEventCursor("42"),
  invalidEventCursor: parseEventCursor("-1"),
  byteLength: jsonByteLength({ ok: true })
} satisfies Record<string, unknown>;
