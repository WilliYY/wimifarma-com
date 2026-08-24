export function safeInboundText(value: unknown, limit = 4000): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, Math.max(0, limit));
}
