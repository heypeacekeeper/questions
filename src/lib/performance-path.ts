/** Normalize emitted build paths before platform-independent budget matching. */
export function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}
