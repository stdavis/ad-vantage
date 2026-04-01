import {
  clearLookupData,
  getColumnPrefs,
  getLookupData,
  setLookupData,
  setColumnPrefs,
  type ColumnPrefs,
  type LookupDataRecord,
} from "../shared/storage";
import { parseCsvData, serializeLookupMap } from "../shared/csv";

interface ColumnInfo {
  key: string;
  label: string;
}

const DESCRIPTION_COL_KEY = "adv-description";
const DESCRIPTION_COL_LABEL = "Description";
const DAILY_ACTIVITY_QA = "DLY_ACTV_CD";
const GET_COLUMNS_MESSAGE_TYPE = "adv:get-columns";

let prefs: ColumnPrefs = {
  hidden: [],
  frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
};
let columns: ColumnInfo[] = [];
let lookupData: LookupDataRecord | null = null;

async function init() {
  const [nextPrefs, nextColumns, nextLookupData] = await Promise.all([
    getColumnPrefs(),
    detectColumnsFromActiveTab(),
    getLookupData(),
  ]);

  prefs = nextPrefs;
  columns = nextColumns;
  lookupData = nextLookupData;

  const emptyState = document.getElementById("empty-state")!;
  const columnList = document.getElementById("column-list")!;
  const lookupFileInput = document.getElementById(
    "lookup-file",
  ) as HTMLInputElement;
  const uploadButton = document.getElementById(
    "upload-btn",
  ) as HTMLButtonElement;
  const clearLookupButton = document.getElementById(
    "clear-lookup-btn",
  ) as HTMLButtonElement;

  renderLookupSummary();

  lookupFileInput.addEventListener("change", () => {
    uploadButton.disabled = !lookupFileInput.files?.length;
    setLookupStatus("");
  });

  uploadButton.addEventListener("click", async () => {
    const file = lookupFileInput.files?.[0];
    if (!file) {
      setLookupStatus("Choose a CSV file to upload.", "error");
      return;
    }

    const text = await file.text();
    const parsedLookup = parseCsvData(text);

    if (parsedLookup.lookupMap.size === 0) {
      setLookupStatus(
        "The CSV did not contain any valid Task# or Vantage lookup rows.",
        "error",
      );
      return;
    }

    lookupData = serializeLookupMap(
      parsedLookup.lookupMap,
      file.name,
      parsedLookup.searchEntries,
    );
    await setLookupData(lookupData);
    renderLookupSummary();
    setLookupStatus(
      `Uploaded ${lookupData.entryCount} Daily Activity suggestions.`,
    );
    lookupFileInput.value = "";
    uploadButton.disabled = true;
  });

  clearLookupButton.addEventListener("click", async () => {
    await clearLookupData();
    lookupData = null;
    lookupFileInput.value = "";
    uploadButton.disabled = true;
    renderLookupSummary();
    setLookupStatus("Cleared uploaded lookup data.");
  });

  if (columns.length === 0) {
    emptyState.hidden = false;
    columnList.hidden = true;
  } else {
    emptyState.hidden = true;
    columnList.hidden = false;
    renderColumnList(columnList);
  }

  document.getElementById("reset-btn")!.addEventListener("click", async () => {
    prefs = {
      hidden: [],
      frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
    };
    await setColumnPrefs(prefs);
    renderColumnList(columnList);
  });
}

function renderLookupSummary() {
  const summary = document.getElementById("lookup-summary")!;
  const clearLookupButton = document.getElementById(
    "clear-lookup-btn",
  ) as HTMLButtonElement;

  if (!lookupData) {
    summary.textContent =
      "No CSV uploaded. The Description column and Daily Activity autocomplete will stay blank.";
    clearLookupButton.disabled = true;
    return;
  }

  const uploadedAt = new Date(lookupData.uploadedAt).toLocaleString();
  summary.textContent = `${lookupData.fileName} loaded with ${lookupData.entryCount} task suggestions. Updated ${uploadedAt}.`;
  clearLookupButton.disabled = false;
}

function setLookupStatus(message: string, state: "info" | "error" = "info") {
  const status = document.getElementById("lookup-status")!;
  status.textContent = message;
  if (message.length === 0) {
    status.removeAttribute("data-state");
    return;
  }

  status.setAttribute("data-state", state);
}

function renderColumnList(container: HTMLElement) {
  container.innerHTML = "";
  columns.forEach(({ key, label }) => {
    const isVisible = !prefs.hidden.includes(key);
    const isFrozen = prefs.frozen.includes(key);

    const row = document.createElement("div");
    row.className = "column-row";

    row.innerHTML = `
      <span class="column-label" title="${label}">${label}</span>
      <div class="column-controls">
        <div class="control-group">
          <label>Visible</label>
          <label class="toggle">
            <input type="checkbox" data-key="${key}" data-type="visible" ${isVisible ? "checked" : ""}/>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="control-group">
          <label>Freeze</label>
          <input type="checkbox" class="freeze-check" data-key="${key}" data-type="freeze" ${isFrozen ? "checked" : ""}/>
        </div>
      </div>
    `;

    container.appendChild(row);
  });

  container
    .querySelectorAll<HTMLInputElement>('input[data-type="visible"]')
    .forEach((input) => {
      input.addEventListener("change", async () => {
        const key = input.dataset.key!;
        if (input.checked) {
          prefs.hidden = prefs.hidden.filter((k) => k !== key);
        } else {
          if (!prefs.hidden.includes(key)) prefs.hidden.push(key);
        }
        await setColumnPrefs(prefs);
      });
    });

  container
    .querySelectorAll<HTMLInputElement>('input[data-type="freeze"]')
    .forEach((input) => {
      input.addEventListener("change", async () => {
        const key = input.dataset.key!;
        if (input.checked) {
          if (!prefs.frozen.includes(key)) prefs.frozen.push(key);
          if (
            key === DESCRIPTION_COL_KEY &&
            !prefs.frozen.includes(DAILY_ACTIVITY_QA)
          ) {
            prefs.frozen.unshift(DAILY_ACTIVITY_QA);
          }
        } else {
          prefs.frozen = prefs.frozen.filter((k) => k !== key);
          if (key === DAILY_ACTIVITY_QA) {
            prefs.frozen = prefs.frozen.filter(
              (k) => k !== DESCRIPTION_COL_KEY,
            );
          }
        }
        await setColumnPrefs(prefs);
        prefs = await getColumnPrefs();
        renderColumnList(container);
      });
    });
}

async function detectColumnsFromActiveTab(): Promise<ColumnInfo[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return [];

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: GET_COLUMNS_MESSAGE_TYPE,
    })) as { columns?: ColumnInfo[] } | undefined;

    return ensureDescriptionColumn(response?.columns ?? []);
  } catch {
    return ensureDescriptionColumn([]);
  }
}

function ensureDescriptionColumn(columns: ColumnInfo[]): ColumnInfo[] {
  const withoutDescription = columns.filter(
    ({ key }) => key !== DESCRIPTION_COL_KEY,
  );
  const insertAt = withoutDescription.findIndex(
    ({ key }) => key === DAILY_ACTIVITY_QA,
  );
  const descriptionColumn = {
    key: DESCRIPTION_COL_KEY,
    label: DESCRIPTION_COL_LABEL,
  };

  if (insertAt === -1) {
    return [...withoutDescription, descriptionColumn];
  }

  return [
    ...withoutDescription.slice(0, insertAt + 1),
    descriptionColumn,
    ...withoutDescription.slice(insertAt + 1),
  ];
}

init();
