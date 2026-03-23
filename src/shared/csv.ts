/**
 * Fetches the bundled lookup CSV and builds a map from Task# → Vantage description.
 */
export async function loadLookupMap(): Promise<Map<string, string>> {
  const url = chrome.runtime.getURL('data/lookup.csv');
  const response = await fetch(url);
  const text = await response.text();
  return parseCsv(text);
}

export function parseCsv(text: string): Map<string, string> {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const headers = splitCsvLine(lines[0]);
  const taskCol = headers.findIndex((h) => h.trim() === 'Task#');
  const vantageCol = headers.findIndex((h) => h.trim() === 'Vantage');

  if (taskCol === -1 || vantageCol === -1) {
    console.warn('[ad-vantage] CSV is missing "Task#" or "Vantage" columns.');
    return new Map();
  }

  const map = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const key = cols[taskCol]?.trim();
    const value = cols[vantageCol]?.trim();
    if (key) map.set(key, value ?? '');
  }
  return map;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
