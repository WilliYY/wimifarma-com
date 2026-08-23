export type ActivationPrefixResult = {
  accepted: boolean;
  text: string;
  reason: string;
};

export function parseActivationPrefix(text: string, prefix: string, required: boolean): ActivationPrefixResult {
  const clean = String(text || '').trim();
  if (!required) return { accepted: true, text: clean, reason: '' };
  const match = clean.match(activationPattern(prefix));
  if (!match) return { accepted: false, text: '', reason: 'missing_prefix' };
  const remainder = clean.slice(match[0].length).replace(/^[\s,:-]+/, '').trim();
  return remainder
    ? { accepted: true, text: remainder, reason: '' }
    : { accepted: false, text: '', reason: 'empty_after_prefix' };
}

export function hasActivationPrefix(text: string, prefix: string): boolean {
  return activationPattern(prefix).test(String(text || '').trim());
}

function activationPattern(prefix: string): RegExp {
  const escaped = String(prefix || 'miauby').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:(?:oi|ola|olá|bom\\s+dia|boa\\s+tarde|boa\\s+noite)[\\s,:-]+)?${escaped}(?=$|[\\s,:-])`, 'iu');
}
