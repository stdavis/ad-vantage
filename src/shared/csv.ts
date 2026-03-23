/**
 * Fetches the bundled lookup CSV and builds a map from Task# → Vantage description.
 */
export async function loadLookupMap(): Promise<Map<string, string>> {
  const url = chrome.runtime.getURL("data/lookup.csv");
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return parseCsv(text);
  } catch (error) {
    console.warn(
      "[ad-vantage] Failed to load lookup CSV; continuing without description column.",
      { url, error },
    );
    return new Map();
  }
}

export function parseCsv(text: string): Map<string, string> {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  let headerIdx = -1;
  let headers: string[] = [];

  // Find the header row
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((h) => h.trim());
    if (
      (cols.includes("Task#") || cols.includes("Task #")) &&
      (cols.includes("Vantage") || cols.includes("Task Name"))
    ) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }

  if (headerIdx === -1) {
    console.warn(
      "[ad-vantage] CSV is missing required Task# or Vantage/Task Name columns.",
    );
    return new Map();
  }

  const taskCol = headers.findIndex((h) => h === "Task#" || h === "Task #");
  const vantageCol = headers.findIndex((h) => h === "Vantage");
  const taskNameCol = headers.findIndex((h) => h === "Task Name");

  // Prefer Task Name for description, fallback to Vantage
  const descCol = taskNameCol !== -1 ? taskNameCol : vantageCol;

  const map = new Map<string, string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const taskKey = cols[taskCol]?.trim();
    const vantageKey = vantageCol !== -1 ? cols[vantageCol]?.trim() : undefined;
    const value = descCol !== -1 ? cols[descCol]?.trim() : undefined;

    if (taskKey) map.set(taskKey, value ?? "");
    if (vantageKey) map.set(vantageKey, value ?? "");
  }
  return map;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
