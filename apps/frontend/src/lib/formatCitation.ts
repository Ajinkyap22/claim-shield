/**
 * Normalizes citation text for display: replaces the section symbol "§" with "Sec."
 * so backend can send "§" and the UI shows a readable label.
 */
export function formatCitation(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(/§\s*/g, "Sec. ").trim();
}
