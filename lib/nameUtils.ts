export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
