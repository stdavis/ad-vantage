export function normalizeColumnString(str: string): string {
  const match = str.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\d{1,2}\/\d{1,2}/i);
  return match ? match[1] : str;
}
