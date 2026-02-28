/** Returns a readable timestamp for log lines (e.g. "2025-02-28 14:30:45"). */
export function timestamp(): string {
  return new Date().toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  });
}
