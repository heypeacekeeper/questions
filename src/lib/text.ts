/** Text utilities shared by services, validation, and import tooling. Pure & isomorphic. */

/**
 * Normalize question option text for duplicate detection only. The displayed
 * wording is never modified. Lower-cases, strips punctuation/diacritics,
 * collapses whitespace, removes a leading "would you rather".
 */
export function normalizeForComparison(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\s*would\s+you\s+rather\s+/i, '')
    .replace(/[’'"`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Order-independent fingerprint for an A/B pair — detects reversed duplicates. */
export function questionPairFingerprint(optionA: string, optionB: string): string {
  const a = normalizeForComparison(optionA);
  const b = normalizeForComparison(optionB);
  return [a, b].sort().join(' || ');
}

/** Order-dependent fingerprint for exact (normalized) duplicates. */
export function questionOrderedFingerprint(optionA: string, optionB: string): string {
  return `${normalizeForComparison(optionA)} || ${normalizeForComparison(optionB)}`;
}

/** Collapse whitespace, trim, strip control characters. Keeps original casing/punctuation. */
export function cleanUserText(input: string, maxLength: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Multi-line variant that preserves paragraph breaks. */
export function cleanUserTextMultiline(input: string, maxLength: number): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

/** Basic RFC-5322-ish email check. Not exhaustive by design. */
export function looksLikeEmail(value: string): boolean {
  if (value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Escape for safe HTML text insertion (used in build-time templating). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lower-case first letter unless it looks like an acronym/proper noun sentence start. */
export function lowerFirst(value: string): string {
  if (!value) return value;
  const first = value.charAt(0);
  const second = value.charAt(1);
  if (
    first === first.toUpperCase() &&
    second &&
    second === second.toUpperCase() &&
    /[A-Z]/.test(second)
  )
    return value;
  return first.toLowerCase() + value.slice(1);
}

/** Truncate to a max length at a word boundary and append an ellipsis. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
