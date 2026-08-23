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

export function parseAudioActivationTranscript(text: string, prefix: string, required: boolean): ActivationPrefixResult {
  const exact = parseActivationPrefix(text, prefix, required);
  if (!required || exact.accepted || exact.reason === 'empty_after_prefix') return exact;

  const clean = String(text || '').trim();
  const match = clean.match(audioPhoneticActivationPattern());
  if (!match) return exact;

  let remainder = clean.slice(match[0].length).replace(/^[\s,:-]+/, '').trim();
  while (remainder) {
    const repeated = remainder.match(audioRepeatedActivationPattern(prefix));
    if (!repeated) break;
    remainder = remainder.slice(repeated[0].length).replace(/^[\s,:-]+/, '').trim();
  }

  return remainder
    ? { accepted: true, text: remainder, reason: 'audio_prefix_phonetic' }
    : { accepted: false, text: '', reason: 'empty_after_prefix' };
}

function activationPattern(prefix: string): RegExp {
  const escaped = String(prefix || 'miauby').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:(?:oi|ola|olá|bom\\s+dia|boa\\s+tarde|boa\\s+noite)[\\s,:-]+)?${escaped}(?=$|[\\s,:-])`, 'iu');
}

function audioPhoneticActivationPattern(): RegExp {
  return /^(?:(?:oi|ola|olá|bom\s+dia|boa\s+tarde|boa\s+noite)[\s,:-]+)?(?:miau(?:[\s-]+)?bi(?:s)?|miauw)(?=$|[\s,:-])/iu;
}

function audioRepeatedActivationPattern(prefix: string): RegExp {
  const escaped = String(prefix || 'miauby').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:${escaped}|miau(?:[\\s-]+)?bi(?:s)?|miauw)(?=$|[\\s,:-])`, 'iu');
}
