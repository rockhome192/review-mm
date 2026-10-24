/** Lowercase, letters/digits only, so "one piece", "One-Piece" and "onepiece" all match. */
export const normalizeName = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
