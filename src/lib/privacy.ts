/** Best-effort removal of common direct identifiers before unpaid-tier processing. */
export function redactCommonPersonalData(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, '[phone removed]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[identifier removed]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[payment number removed]');
}
