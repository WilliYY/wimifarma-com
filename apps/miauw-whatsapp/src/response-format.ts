export function formatMiaubyResponse(value: unknown): string {
  let text = String(value ?? '').trim();
  if (!text) return '';
  while (/^miauby\s*:/iu.test(text)) {
    text = text.replace(/^miauby\s*:\s*/iu, '').trim();
  }
  return text ? `Miauby: ${text}` : 'Miauby:';
}
