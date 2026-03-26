export interface ColumnPrefs {
  hidden: string[];
  frozen: string[];
}

export interface LookupDataRecord {
  entries: Array<[string, string]>;
  fileName: string;
  entryCount: number;
  uploadedAt: string;
}

interface StoredColumnPrefs extends ColumnPrefs {
  schemaVersion?: number;
}

const DESCRIPTION_COL_KEY = "adv-description";
const DAILY_ACTIVITY_QA = "DLY_ACTV_CD";
const LEGACY_DAILY_ACTIVITY_QA = "DACT_CD";
const PREFS_KEY = "columnPrefs";
const PREFS_SCHEMA_VERSION = 3;
const LOOKUP_DATA_KEY = "lookupData";

const DEFAULT_COLUMN_PREFS: ColumnPrefs = {
  hidden: [],
  frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
};

function getDefaultColumnPrefs(): ColumnPrefs {
  return normalizeColumnPrefs(DEFAULT_COLUMN_PREFS);
}

function normalizeColumnPrefs(
  prefs: Partial<ColumnPrefs> | null | undefined,
  options?: { migrateLegacyDescriptionVisibility?: boolean },
): ColumnPrefs {
  const hidden = Array.isArray(prefs?.hidden)
    ? normalizeColumnKeys(prefs.hidden)
    : [];
  const frozen = Array.isArray(prefs?.frozen)
    ? normalizeColumnKeys(prefs.frozen)
    : [];

  if (options?.migrateLegacyDescriptionVisibility) {
    const descriptionHiddenIndex = hidden.indexOf(DESCRIPTION_COL_KEY);
    if (descriptionHiddenIndex !== -1) {
      hidden.splice(descriptionHiddenIndex, 1);
    }
  }

  if (
    frozen.includes(DESCRIPTION_COL_KEY) &&
    !frozen.includes(DAILY_ACTIVITY_QA)
  ) {
    frozen.unshift(DAILY_ACTIVITY_QA);
  }

  return { hidden, frozen };
}

function normalizeColumnKeys(keys: string[]): string[] {
  return [
    ...new Set(
      keys.map((key) => {
        if (key === LEGACY_DAILY_ACTIVITY_QA) {
          return DAILY_ACTIVITY_QA;
        }

        return key;
      }),
    ),
  ];
}

function serializeColumnPrefs(prefs: ColumnPrefs): StoredColumnPrefs {
  return {
    ...normalizeColumnPrefs(prefs),
    schemaVersion: PREFS_SCHEMA_VERSION,
  };
}

function shouldMigrateLegacyPrefs(
  prefs: StoredColumnPrefs | undefined,
): boolean {
  return prefs?.schemaVersion !== PREFS_SCHEMA_VERSION;
}

export async function getColumnPrefs(): Promise<ColumnPrefs> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(PREFS_KEY, (result) => {
      const storedPrefs = result[PREFS_KEY] as StoredColumnPrefs | undefined;
      const normalizedPrefs = normalizeColumnPrefs(
        storedPrefs ?? getDefaultColumnPrefs(),
        {
          migrateLegacyDescriptionVisibility:
            shouldMigrateLegacyPrefs(storedPrefs),
        },
      );

      if (shouldMigrateLegacyPrefs(storedPrefs)) {
        chrome.storage.sync.set({
          [PREFS_KEY]: serializeColumnPrefs(normalizedPrefs),
        });
      }

      resolve(normalizedPrefs);
    });
  });
}

export async function setColumnPrefs(prefs: ColumnPrefs): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      { [PREFS_KEY]: serializeColumnPrefs(prefs) },
      resolve,
    );
  });
}

export function onColumnPrefsChanged(
  callback: (prefs: ColumnPrefs) => void,
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && PREFS_KEY in changes) {
      const nextPrefs = changes[PREFS_KEY].newValue as
        | StoredColumnPrefs
        | undefined;
      callback(
        normalizeColumnPrefs(nextPrefs ?? getDefaultColumnPrefs(), {
          migrateLegacyDescriptionVisibility:
            shouldMigrateLegacyPrefs(nextPrefs),
        }),
      );
    }
  });
}

export async function getLookupData(): Promise<LookupDataRecord | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOOKUP_DATA_KEY, (result) => {
      const lookupData = result[LOOKUP_DATA_KEY] as
        | LookupDataRecord
        | undefined;
      resolve(lookupData ?? null);
    });
  });
}

export async function setLookupData(data: LookupDataRecord): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOOKUP_DATA_KEY]: data }, resolve);
  });
}

export async function clearLookupData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(LOOKUP_DATA_KEY, resolve);
  });
}

export function onLookupDataChanged(
  callback: (lookupData: LookupDataRecord | null) => void,
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && LOOKUP_DATA_KEY in changes) {
      const nextLookupData = changes[LOOKUP_DATA_KEY].newValue as
        | LookupDataRecord
        | undefined;
      callback(nextLookupData ?? null);
    }
  });
}
