import {
  getColumnPrefs,
  onColumnPrefsChanged,
  type ColumnPrefs,
} from "../shared/storage";
import { loadLookupMap } from "../shared/csv";

const DESCRIPTION_COL_KEY = "adv-description";
const DESCRIPTION_COL_LABEL = "Description";
const DAILY_ACTIVITY_QA = "DLY_ACTV_CD"; // data-qa value for the "Daily Activity" column
const MODAL_ANCESTOR_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

let lookupMap: Map<string, string> = new Map();
let currentPrefs: ColumnPrefs = {
  hidden: [],
  frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
};
let hasLoggedMissingGrid = false;
const warnedMissingTasks = new Set<string>();

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  console.info("[ad-vantage] Content script initializing.");

  lookupMap = await loadLookupMap();

  try {
    currentPrefs = await getColumnPrefs();
  } catch (error) {
    console.warn(
      "[ad-vantage] Failed to load column preferences; using defaults.",
      error,
    );
    currentPrefs = {
      hidden: [],
      frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
    };
  }

  console.info("[ad-vantage] Initial state ready.", {
    lookupEntries: lookupMap.size,
    hidden: currentPrefs.hidden,
    frozen: currentPrefs.frozen,
  });

  applyEnhancements();

  onColumnPrefsChanged((prefs) => {
    currentPrefs = prefs;
    console.info("[ad-vantage] Column preferences changed.", prefs);
    applyEnhancements();
  });

  observeMutations();
}

// ─── Main enhancement entry point ────────────────────────────────────────────

function applyEnhancements() {
  mutationObserver?.disconnect();
  try {
    const grids = Array.from(
      document.querySelectorAll<HTMLElement>('div[role="grid"]'),
    ).filter(isEnhanceableGrid);

    if (grids.length === 0) {
      if (!hasLoggedMissingGrid) {
        console.info(
          "[ad-vantage] No grids found yet; waiting for page render.",
        );
        hasLoggedMissingGrid = true;
      }
      return;
    }

    hasLoggedMissingGrid = false;
    grids.forEach(enhanceGrid);
  } finally {
    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

function enhanceGrid(grid: HTMLElement) {
  if (!isEnhanceableGrid(grid)) return;

  const headerRow = grid.querySelector<HTMLElement>("thead tr");
  if (!headerRow) return;

  injectDescriptionColumn(grid, headerRow);
  applyColumnVisibility(grid, headerRow);
  applyFrozenColumns(grid, headerRow);
}

function isEnhanceableGrid(grid: HTMLElement): boolean {
  return !grid.closest(MODAL_ANCESTOR_SELECTOR);
}

// ─── Column Visibility ───────────────────────────────────────────────────────

function applyColumnVisibility(grid: HTMLElement, headerRow: HTMLElement) {
  resetHiddenColumns(grid);

  const headers = getColumnHeaders(headerRow);

  headers.forEach((th) => {
    const key = getColumnKey(th);
    if (currentPrefs.hidden.includes(key)) {
      setColumnHidden(grid, getColumnIndex(th), true);
    }
  });
}

function resetHiddenColumns(grid: HTMLElement) {
  grid.querySelectorAll<HTMLElement>(".adv-hidden").forEach((cell) => {
    cell.style.removeProperty("display");
    cell.classList.remove("adv-hidden");
  });
}

function setColumnHidden(
  grid: HTMLElement,
  columnIndex: number,
  hidden: boolean,
) {
  const rows = grid.querySelectorAll<HTMLElement>("thead tr, tbody tr");

  rows.forEach((row) => {
    const cell = Array.from(row.children)[columnIndex - 1] as
      | HTMLElement
      | undefined;
    if (!cell) return;

    if (hidden) {
      cell.style.display = "none";
      cell.classList.add("adv-hidden");
    } else {
      cell.style.removeProperty("display");
      cell.classList.remove("adv-hidden");
    }
  });
}

// ─── Frozen Columns ──────────────────────────────────────────────────────────

function applyFrozenColumns(grid: HTMLElement, headerRow: HTMLElement) {
  // Clear only previously-frozen cells (not every cell)
  grid.querySelectorAll<HTMLElement>(".adv-frozen").forEach((cell) => {
    cell.style.removeProperty("position");
    cell.style.removeProperty("left");
    cell.style.removeProperty("z-index");
    cell.style.removeProperty("background");
    cell.classList.remove("adv-frozen");
  });

  if (currentPrefs.frozen.length === 0) return;

  const headers = getColumnHeaders(headerRow);
  let accumulatedWidth = 0;

  headers.forEach((th) => {
    const key = getColumnKey(th);
    if (!currentPrefs.frozen.includes(key)) return;

    const colIndex = getColumnIndex(th);
    const width = th.offsetWidth;
    const left = accumulatedWidth;

    setColumnFrozen(grid, colIndex, left);

    accumulatedWidth += width;
  });
}

function setColumnFrozen(grid: HTMLElement, columnIndex: number, left: number) {
  const rows = grid.querySelectorAll<HTMLElement>("thead tr, tbody tr");

  rows.forEach((row) => {
    const cell = Array.from(row.children)[columnIndex - 1] as
      | HTMLElement
      | undefined;
    if (!cell) return;

    cell.style.position = "sticky";
    cell.style.left = `${left}px`;
    cell.style.zIndex = cell.tagName === "TH" ? "11" : "10";
    cell.style.background = "inherit";
    cell.classList.add("adv-frozen");
  });
}

// ─── Description Column ──────────────────────────────────────────────────────

function injectDescriptionColumn(grid: HTMLElement, headerRow: HTMLElement) {
  const dailyActivityTh = headerRow.querySelector<HTMLElement>(
    `th[data-qa="${DAILY_ACTIVITY_QA}"]`,
  );

  let descTh = headerRow.querySelector<HTMLElement>(
    `th[data-qa="${DESCRIPTION_COL_KEY}"]`,
  );

  if (!descTh) {
    descTh = document.createElement("th");
    descTh.setAttribute("data-qa", DESCRIPTION_COL_KEY);
    descTh.setAttribute("role", "columnheader");
    descTh.setAttribute("scope", "col");
  }

  descTh.style.cssText =
    "padding: 4px 8px; white-space: nowrap; font-weight: bold;";
  descTh.textContent = DESCRIPTION_COL_LABEL;

  if (dailyActivityTh) {
    const nextHeader = dailyActivityTh.nextElementSibling;
    if (nextHeader !== descTh) {
      headerRow.insertBefore(descTh, nextHeader);
    }
  } else if (descTh.parentElement !== headerRow) {
    headerRow.appendChild(descTh);
  }

  updateDescriptionCells(grid);
}

function updateDescriptionCells(grid: HTMLElement) {
  const headerRow = grid.querySelector<HTMLElement>("thead tr");
  if (!headerRow) return;

  const dailyActivityIndex = Array.from(headerRow.children).findIndex(
    (el) => el.getAttribute("data-qa") === DAILY_ACTIVITY_QA,
  );

  if (dailyActivityIndex === -1) return;

  const bodyRows = grid.querySelectorAll<HTMLElement>("tbody tr");
  bodyRows.forEach((row) => {
    const activityCell = row.children[dailyActivityIndex] as
      | HTMLElement
      | undefined;
    if (!activityCell) return;

    const activityValue = getCellDisplayValue(activityCell);
    const hasMatch = activityValue.length > 0 && lookupMap.has(activityValue);
    const description = hasMatch ? (lookupMap.get(activityValue) ?? "") : "";

    if (activityValue.length > 0 && lookupMap.size > 0 && !hasMatch) {
      warnMissingTask(activityValue);
    }

    let descCell = row.querySelector<HTMLElement>(
      `td[data-qa="${DESCRIPTION_COL_KEY}"]`,
    );

    if (!descCell) {
      descCell = document.createElement("td");
      descCell.setAttribute("data-qa", DESCRIPTION_COL_KEY);
    }

    descCell.textContent = description;
    descCell.style.cssText =
      "padding: 4px 8px; color: #555; font-style: italic;";

    const nextCell = activityCell.nextElementSibling;
    if (nextCell !== descCell) {
      row.insertBefore(descCell, nextCell);
    }
  });
}

function getCellDisplayValue(cell: HTMLElement): string {
  const input = cell.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea",
  );
  if (input?.value) return input.value.trim();

  return cell.textContent?.trim() ?? "";
}

function warnMissingTask(taskCode: string) {
  if (warnedMissingTasks.has(taskCode)) return;

  warnedMissingTasks.add(taskCode);
  console.warn(
    `[ad-vantage] No description match found in lookup CSV for task "${taskCode}".`,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function simplifyDateHeaders(grid: HTMLElement, headerRow: HTMLElement) {
  const headers = getColumnHeaders(headerRow);
  headers.forEach((th) => {
    // Avoid Angular DOM update errors by doing visual simplification via CSS
    // rather than mutating text nodes directly.
    const titleEl = th.querySelector(
      '[data-qa-id$=".headerCellTitle"]',
    ) as HTMLElement | null;
    const text = (titleEl ?? th).textContent?.trim() ?? "";
    const match = text.match(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\d{1,2}\/\d{1,2}/i,
    );

    if (match) {
      if (titleEl && !titleEl.hasAttribute("data-adv-day")) {
        titleEl.setAttribute("data-adv-day", match[1]);
        titleEl.style.fontSize = "0";
      } else if (!titleEl && !th.hasAttribute("data-adv-day")) {
        th.setAttribute("data-adv-day", match[1]);
        th.style.fontSize = "0";
      }
    }
  });

  if (!document.getElementById("adv-day-styles")) {
    const style = document.createElement("style");
    style.id = "adv-day-styles";
    style.textContent = `
      [data-adv-day]::after {
        content: attr(data-adv-day);
        font-size: 13px;
        letter-spacing: normal;
        visibility: visible;
        display: inline-block;
      }
    `;
    document.head.appendChild(style);
  }
}

function getColumnHeaders(headerRow: HTMLElement): HTMLElement[] {
  return Array.from(headerRow.querySelectorAll<HTMLElement>("th"));
}

function getColumnKey(th: HTMLElement): string {
  const titleEl = th.querySelector(
    '[data-qa-id$=".headerCellTitle"]',
  ) as HTMLElement | null;
  const text = (titleEl ?? th).textContent?.trim() ?? "";

  // If the column is a date column, always group it strictly by its Day name
  // This ensures 1st and 2nd week columns share identical settings keys.
  const dateMatch = text.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i);
  if (dateMatch) return dateMatch[1];

  return th.getAttribute("data-qa") ?? text;
}

function getColumnIndex(th: HTMLElement): number {
  return Array.from(th.parentElement!.children).indexOf(th) + 1;
}

// ─── MutationObserver ────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let mutationObserver: MutationObserver | null = null;

function observeMutations() {
  mutationObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyEnhancements, 300);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

init().catch((error) => {
  console.error("[ad-vantage] Content script failed to initialize.", error);
});
