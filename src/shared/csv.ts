import {
  getLookupData,
  type LookupDataRecord,
  type LookupSearchEntryRecord,
} from "./storage";

export interface LookupSearchEntry {
  taskCode: string;
  description: string;
  searchText: string;
}

export interface ParsedLookupData {
  lookupMap: Map<string, string>;
  searchEntries: LookupSearchEntry[];
}

/**
 * Loads persisted lookup data and builds a map from Task# → Vantage description.
 */
export async function loadLookupMap(): Promise<Map<string, string>> {
  try {
    const lookupData = await getLookupData();
    return deserializeLookupMap(lookupData);
  } catch (error) {
    console.warn(
      "[ad-vantage] Failed to load saved lookup data; continuing without description column.",
      { error },
    );
    return new Map();
  }
}

export async function loadLookupEntries(): Promise<LookupSearchEntry[]> {
  try {
    const lookupData = await getLookupData();
    return deserializeLookupEntries(lookupData);
  } catch (error) {
    console.warn(
      "[ad-vantage] Failed to load saved lookup search data; continuing without autocomplete.",
      { error },
    );
    return [];
  }
}

export function serializeLookupMap(
  lookupMap: Map<string, string>,
  fileName: string,
  searchEntries: LookupSearchEntry[] = [],
): LookupDataRecord {
  return {
    entries: Array.from(lookupMap.entries()),
    searchEntries: serializeLookupEntries(searchEntries),
    fileName,
    entryCount:
      searchEntries.length > 0 ? searchEntries.length : lookupMap.size,
    uploadedAt: new Date().toISOString(),
  };
}

export function deserializeLookupMap(
  lookupData: LookupDataRecord | null | undefined,
): Map<string, string> {
  if (!lookupData || !Array.isArray(lookupData.entries)) {
    return new Map();
  }

  const entries = lookupData.entries.filter(
    (entry): entry is [string, string] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string",
  );

  return new Map(entries);
}

export function deserializeLookupEntries(
  lookupData: LookupDataRecord | null | undefined,
): LookupSearchEntry[] {
  const persistedEntries = lookupData?.searchEntries;
  if (Array.isArray(persistedEntries) && persistedEntries.length > 0) {
    return persistedEntries
      .filter(
        (entry): entry is LookupSearchEntryRecord =>
          Boolean(entry) &&
          typeof entry.taskCode === "string" &&
          typeof entry.description === "string" &&
          typeof entry.searchText === "string",
      )
      .map((entry) => ({
        taskCode: entry.taskCode.trim(),
        description: entry.description.trim(),
        searchText: entry.searchText.trim(),
      }))
      .filter((entry) => entry.taskCode.length > 0);
  }

  const lookupMap = deserializeLookupMap(lookupData);
  return Array.from(lookupMap.entries())
    .filter(([taskCode]) => isLikelyTaskCode(taskCode))
    .map(([taskCode, description]) => ({
      taskCode,
      description,
      searchText: [taskCode, description].filter(Boolean).join(" "),
    }));
}

export function parseCsvData(text: string): ParsedLookupData {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { lookupMap: new Map(), searchEntries: [] };
  }

  let headerIdx = -1;
  let headers: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const cols = splitCsvLine(lines[index]).map((header) => header.trim());
    if (
      (cols.includes("Task#") || cols.includes("Task #")) &&
      (cols.includes("Vantage") || cols.includes("Task Name"))
    ) {
      headerIdx = index;
      headers = cols;
      break;
    }
  }

  if (headerIdx === -1) {
    console.warn(
      "[ad-vantage] CSV is missing required Task# or Vantage/Task Name columns.",
    );
    return { lookupMap: new Map(), searchEntries: [] };
  }

  const taskCol = headers.findIndex(
    (header) => header === "Task#" || header === "Task #",
  );
  const vantageCol = headers.findIndex((header) => header === "Vantage");
  const taskNameCol = headers.findIndex((header) => header === "Task Name");
  const descCol = taskNameCol !== -1 ? taskNameCol : vantageCol;

  const lookupMap = new Map<string, string>();
  const searchEntries = new Map<string, LookupSearchEntry>();

  for (let index = headerIdx + 1; index < lines.length; index++) {
    const cols = splitCsvLine(lines[index]);
    const taskCode = cols[taskCol]?.trim() ?? "";
    const vantageValue =
      vantageCol !== -1 ? (cols[vantageCol]?.trim() ?? "") : "";
    const taskNameValue =
      taskNameCol !== -1 ? (cols[taskNameCol]?.trim() ?? "") : "";
    const description =
      (descCol !== -1 ? (cols[descCol]?.trim() ?? "") : "") || vantageValue;

    if (taskCode) {
      lookupMap.set(taskCode, description);

      const searchText = [taskCode, description, taskNameValue, vantageValue]
        .filter(
          (value, valueIndex, values) =>
            value.length > 0 && values.indexOf(value) === valueIndex,
        )
        .join(" ");

      searchEntries.set(taskCode, {
        taskCode,
        description,
        searchText,
      });
    }

    if (vantageValue) {
      lookupMap.set(vantageValue, description);
    }
  }

  return {
    lookupMap,
    searchEntries: Array.from(searchEntries.values()),
  };
}

export function parseCsv(text: string): Map<string, string> {
  return parseCsvData(text).lookupMap;
}

function serializeLookupEntries(
  searchEntries: LookupSearchEntry[],
): LookupSearchEntryRecord[] {
  return searchEntries
    .filter((entry) => entry.taskCode.trim().length > 0)
    .map((entry) => ({
      taskCode: entry.taskCode.trim(),
      description: entry.description.trim(),
      searchText: entry.searchText.trim(),
    }));
}

function isLikelyTaskCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_-]*\d[\w-]*$/i.test(value.trim());
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
