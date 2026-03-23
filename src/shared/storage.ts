export interface ColumnPrefs {
  hidden: string[];
  frozen: string[];
}

const PREFS_KEY = 'columnPrefs';

export async function getColumnPrefs(): Promise<ColumnPrefs> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(PREFS_KEY, (result) => {
      resolve(result[PREFS_KEY] ?? { hidden: [], frozen: [] });
    });
  });
}

export async function setColumnPrefs(prefs: ColumnPrefs): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [PREFS_KEY]: prefs }, resolve);
  });
}

export function onColumnPrefsChanged(
  callback: (prefs: ColumnPrefs) => void
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && PREFS_KEY in changes) {
      callback(changes[PREFS_KEY].newValue ?? { hidden: [], frozen: [] });
    }
  });
}
