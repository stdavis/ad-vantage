import {
  getColumnPrefs,
  onColumnPrefsChanged,
  onLookupDataChanged,
  type ColumnPrefs,
} from "../shared/storage";
import {
  loadLookupEntries,
  loadLookupMap,
  type LookupSearchEntry,
} from "../shared/csv";

const DESCRIPTION_COL_KEY = "adv-description";
const DESCRIPTION_COL_LABEL = "Description";
const DAILY_ACTIVITY_QA = "DLY_ACTV_CD"; // data-qa value for the "Daily Activity" column
const MODAL_ANCESTOR_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
const GET_COLUMNS_MESSAGE_TYPE = "adv:get-columns";
const AUTOCOMPLETE_STYLES_ID = "adv-autocomplete-styles";
const TIME_WARN_STYLES_ID = "adv-time-warn-styles";
const AUTOCOMPLETE_BOUND_ATTR = "data-adv-autocomplete-bound";
const MAX_AUTOCOMPLETE_RESULTS = 8;

interface ColumnInfo {
  key: string;
  label: string;
}

interface AutocompleteLookupEntry extends LookupSearchEntry {
  normalizedTaskCode: string;
  normalizedDescription: string;
  normalizedSearchText: string;
}

interface ActiveAutocompleteState {
  input: HTMLInputElement | HTMLTextAreaElement;
  menu: HTMLDivElement;
  suggestions: AutocompleteLookupEntry[];
  highlightedIndex: number;
  reposition: () => void;
  cleanup: () => void;
}

let lookupMap: Map<string, string> = new Map();
let lookupEntries: AutocompleteLookupEntry[] = [];
let currentPrefs: ColumnPrefs = {
  hidden: [],
  frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
};
let hasLoggedMissingGrid = false;
const warnedMissingTasks = new Set<string>();
let activeAutocomplete: ActiveAutocompleteState | null = null;

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  console.info("[ad-vantage] Content script initializing.");

  const [initialLookupMap, initialLookupEntries] = await Promise.all([
    loadLookupMap(),
    loadLookupEntries(),
  ]);

  lookupMap = initialLookupMap;
  lookupEntries = buildAutocompleteEntries(initialLookupEntries);

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
    autocompleteEntries: lookupEntries.length,
    hidden: currentPrefs.hidden,
    frozen: currentPrefs.frozen,
  });

  applyEnhancements();

  onColumnPrefsChanged((prefs) => {
    currentPrefs = prefs;
    console.info("[ad-vantage] Column preferences changed.", prefs);
    applyEnhancements();
  });

  onLookupDataChanged(async () => {
    try {
      const [nextLookupMap, nextLookupEntries] = await Promise.all([
        loadLookupMap(),
        loadLookupEntries(),
      ]);

      lookupMap = nextLookupMap;
      lookupEntries = buildAutocompleteEntries(nextLookupEntries);
      warnedMissingTasks.clear();
      console.info("[ad-vantage] Lookup data changed.", {
        lookupEntries: lookupMap.size,
        autocompleteEntries: lookupEntries.length,
      });
      applyEnhancements();
    } catch (error) {
      console.warn("[ad-vantage] Failed to refresh lookup data.", error);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== GET_COLUMNS_MESSAGE_TYPE) {
      return;
    }

    sendResponse({ columns: getColumnsForPopup() });
  });

  observeMutations();
}

// ─── Main enhancement entry point ────────────────────────────────────────────

function applyEnhancements() {
  mutationObserver?.disconnect();
  try {
    ensureAutocompleteStyles();
    ensureTimeWarnStyles();
    closeAutocompleteIfStale();

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

  const headerRows = getHeaderRows(grid);
  const mainHeaderRow = getMainHeaderRow(grid);
  const layoutHeaderRow = headerRows[0];

  if (!layoutHeaderRow || !mainHeaderRow) return;

  prepareGridForFrozenColumns(grid);
  syncDescriptionColumns(grid, headerRows, mainHeaderRow);
  applyColumnVisibility(grid, layoutHeaderRow);
  applyFrozenColumns(grid, layoutHeaderRow);
  bindDailyActivityAutocomplete(grid, mainHeaderRow);
  applyTimeWarnings(grid, mainHeaderRow);
}

function isEnhanceableGrid(grid: HTMLElement): boolean {
  return !grid.closest(MODAL_ANCESTOR_SELECTOR);
}

function getColumnsForPopup(): ColumnInfo[] {
  const mainHeaderRow = Array.from(
    document.querySelectorAll<HTMLElement>('div[role="grid"]'),
  )
    .filter(isEnhanceableGrid)
    .map((grid) => getMainHeaderRow(grid))
    .find((headerRow): headerRow is HTMLElement => Boolean(headerRow));

  if (!mainHeaderRow) {
    return [];
  }

  const seen = new Set<string>();

  return getColumnHeaders(mainHeaderRow).reduce<ColumnInfo[]>((acc, th) => {
    const key = getColumnKey(th);
    if (!key || seen.has(key)) {
      return acc;
    }

    seen.add(key);
    acc.push({
      key,
      label: getColumnLabel(th),
    });

    return acc;
  }, []);
}

function getColumnLabel(th: HTMLElement): string {
  const label =
    th.querySelector('[data-qa-id$=".headerCellTitle"]')?.textContent?.trim() ??
    th.textContent?.trim() ??
    "";

  const dateMatch = label.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i);
  return dateMatch ? dateMatch[1] : label;
}

// ─── Column Visibility ───────────────────────────────────────────────────────

function applyColumnVisibility(grid: HTMLElement, headerRow: HTMLElement) {
  resetHiddenColumns(grid);

  const headers = getColumnHeaders(headerRow);
  const headerColumnCount = headers.length;
  unhideExpandedDetailCells(grid, headerColumnCount);

  headers.forEach((th) => {
    const key = getColumnKey(th);
    if (currentPrefs.hidden.includes(key)) {
      setColumnHidden(grid, getColumnIndex(th), true, headerColumnCount);
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
  headerColumnCount: number,
) {
  const rows = getRowsForCellMutations(grid, headerColumnCount);

  rows.forEach((row) => {
    const cell = getRowCell(row, columnIndex);
    if (!cell) return;
    if (isExpandedDetailCell(cell, row, headerColumnCount)) return;

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
    cell.style.removeProperty("top");
    cell.style.removeProperty("z-index");
    cell.style.removeProperty("background");
    cell.style.removeProperty("background-color");
    cell.classList.remove("adv-frozen");
  });

  if (currentPrefs.frozen.length === 0) return;

  const headers = getColumnHeaders(headerRow);
  const headerColumnCount = headers.length;
  let accumulatedWidth = 0;

  headers.forEach((th) => {
    const key = getColumnKey(th);
    if (!currentPrefs.frozen.includes(key)) return;

    const colIndex = getColumnIndex(th);
    const width = th.offsetWidth;
    const left = accumulatedWidth;

    setColumnFrozen(grid, colIndex, left, headerColumnCount);

    accumulatedWidth += width;
  });
}

function setColumnFrozen(
  grid: HTMLElement,
  columnIndex: number,
  left: number,
  headerColumnCount: number,
) {
  const rows = getRowsForCellMutations(grid, headerColumnCount);

  rows.forEach((row) => {
    const cell = getRowCell(row, columnIndex);
    if (!cell) return;
    if (isExpandedDetailCell(cell, row, headerColumnCount)) return;

    cell.style.position = "sticky";
    cell.style.left = `${left}px`;
    cell.style.zIndex = cell.tagName === "TH" ? "3" : "1";
    cell.style.backgroundColor = getStickyCellBackground(cell, row, grid);
    cell.classList.add("adv-frozen");
  });
}

function prepareGridForFrozenColumns(grid: HTMLElement) {
  grid.style.position = "relative";
  grid.style.isolation = "isolate";
}

function getStickyCellBackground(
  cell: HTMLElement,
  row: HTMLElement,
  grid: HTMLElement,
): string {
  const backgrounds = [cell, row, grid, document.body];

  for (const element of backgrounds) {
    const backgroundColor = window.getComputedStyle(element).backgroundColor;
    if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)") {
      return backgroundColor;
    }
  }

  return "#fff";
}

// ─── Description Column ──────────────────────────────────────────────────────

function syncDescriptionColumns(
  grid: HTMLElement,
  headerRows: HTMLElement[],
  mainHeaderRow: HTMLElement,
) {
  let descriptionColumnIndex = -1;

  headerRows.forEach((headerRow) => {
    const descTh = syncDescriptionHeaderCell(headerRow);
    if (!descTh) return;

    if (headerRow === mainHeaderRow) {
      descriptionColumnIndex = getColumnIndex(descTh);
    }
  });

  if (descriptionColumnIndex !== -1) {
    updateDescriptionCells(grid, descriptionColumnIndex);
  }
}

function syncDescriptionHeaderCell(
  headerRow: HTMLElement,
): HTMLElement | undefined {
  const dailyActivityTh = headerRow.querySelector<HTMLElement>(
    `th[data-qa="${DAILY_ACTIVITY_QA}"]`,
  );
  if (!dailyActivityTh) return undefined;

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

  const nextHeader = dailyActivityTh.nextElementSibling;
  if (nextHeader !== descTh) {
    headerRow.insertBefore(descTh, nextHeader);
  }

  return descTh;
}

function updateDescriptionCells(
  grid: HTMLElement,
  descriptionColumnIndex: number,
) {
  const mainHeaderRow = getMainHeaderRow(grid);
  const headerColumnCount = mainHeaderRow
    ? getColumnHeaders(mainHeaderRow).length
    : 0;
  const bodyRows = getPrimaryAndSummaryBodyRows(grid, headerColumnCount);
  bodyRows.forEach((row) => {
    if (isSummaryRow(row)) {
      syncSummaryDescriptionCell(row, descriptionColumnIndex);
      return;
    }

    let descCell = row.querySelector<HTMLElement>(
      `td[data-qa="${DESCRIPTION_COL_KEY}"]`,
    );

    if (!descCell) {
      descCell = document.createElement("td");
      descCell.setAttribute("data-qa", DESCRIPTION_COL_KEY);
    } else if (descCell.parentElement === row) {
      row.removeChild(descCell);
    }

    const activityCell = row.children[descriptionColumnIndex - 2] as
      | HTMLElement
      | undefined;

    const activityValue = activityCell ? getCellDisplayValue(activityCell) : "";
    const hasMatch = activityValue.length > 0 && lookupMap.has(activityValue);
    const description = hasMatch ? (lookupMap.get(activityValue) ?? "") : "";

    if (activityValue.length > 0 && lookupMap.size > 0 && !hasMatch) {
      warnMissingTask(activityValue);
    }

    descCell.textContent = description;
    descCell.style.cssText = "padding: 4px 8px;";
    descCell.classList.add("adv-description");

    const nextCell = row.children[descriptionColumnIndex - 1] ?? null;
    row.insertBefore(descCell, nextCell);
  });
}

function isSummaryRow(row: HTMLElement): boolean {
  return Array.from(row.children).some((cell) => {
    if (!(cell instanceof HTMLTableCellElement)) return false;
    const text = cell.textContent?.trim() ?? "";
    return text === "Total Hours";
  });
}

function isExpandedDetailRow(
  row: HTMLElement,
  headerColumnCount: number,
): boolean {
  if (isSummaryRow(row)) return false;

  // Expanded detail panels render as a single full-width cell in their own row.
  const cells = Array.from(row.children).filter(
    (child): child is HTMLTableCellElement =>
      child instanceof HTMLTableCellElement,
  );

  if (cells.length !== 1) {
    return false;
  }

  const [cell] = cells;
  const spansFullWidth = cell.colSpan >= Math.max(2, headerColumnCount - 1);

  if (!spansFullWidth) {
    return false;
  }

  return Boolean(
    cell.querySelector(
      '[role="tabpanel"], [role="tablist"], [data-qa-id*="cardGrid"], input, textarea, select, button',
    ),
  );
}

function isExpandedDetailCell(
  cell: HTMLElement,
  row: HTMLElement,
  headerColumnCount: number,
): boolean {
  if (!(cell instanceof HTMLTableCellElement)) {
    return false;
  }

  if (isExpandedDetailRow(row, headerColumnCount)) {
    return true;
  }

  if (isSummaryRow(row)) {
    return false;
  }

  const spansFullWidth = cell.colSpan >= Math.max(2, headerColumnCount - 1);
  if (!spansFullWidth) {
    return false;
  }

  return Boolean(
    cell.querySelector(
      '[role="tabpanel"], [role="tablist"], [data-qa-id*="cardGrid"], input, textarea, select, button',
    ),
  );
}

function unhideExpandedDetailCells(
  grid: HTMLElement,
  headerColumnCount: number,
) {
  grid
    .querySelectorAll<HTMLElement>("tbody td[colspan], tbody th[colspan]")
    .forEach((cell) => {
      const row = cell.parentElement;
      if (!(row instanceof HTMLElement)) return;
      if (!isExpandedDetailCell(cell, row, headerColumnCount)) return;

      cell.style.removeProperty("display");
      cell.classList.remove("adv-hidden");
      cell.style.removeProperty("position");
      cell.style.removeProperty("left");
      cell.style.removeProperty("top");
      cell.style.removeProperty("z-index");
      cell.style.removeProperty("background");
      cell.style.removeProperty("background-color");
      cell.classList.remove("adv-frozen");
    });
}

function getRowsForCellMutations(
  grid: HTMLElement,
  headerColumnCount: number,
): HTMLElement[] {
  const headerRows = Array.from(grid.querySelectorAll<HTMLElement>("thead tr"));
  const bodyRows = getPrimaryAndSummaryBodyRows(grid, headerColumnCount);

  return [...headerRows, ...bodyRows];
}

function getPrimaryAndSummaryBodyRows(
  grid: HTMLElement,
  headerColumnCount: number,
): HTMLElement[] {
  return Array.from(grid.querySelectorAll<HTMLElement>("tbody tr")).filter(
    (row) => !isExpandedDetailRow(row, headerColumnCount),
  );
}

function syncSummaryDescriptionCell(
  row: HTMLElement,
  descriptionColumnIndex: number,
) {
  let descCell = row.querySelector<HTMLTableCellElement>(
    `td[data-qa="${DESCRIPTION_COL_KEY}"]`,
  );

  if (!descCell) {
    descCell = document.createElement("td");
    descCell.setAttribute("data-qa", DESCRIPTION_COL_KEY);

    const nextCell = getRowCell(row, descriptionColumnIndex);
    if (nextCell?.parentElement === row) {
      descCell.className = nextCell.className;
      row.insertBefore(descCell, nextCell);
    } else {
      const fallbackCell = row.lastElementChild;
      descCell.className =
        fallbackCell instanceof HTMLElement ? fallbackCell.className : "";
      row.appendChild(descCell);
    }
  }

  descCell.textContent = "";
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
    `[ad-vantage] No description match found in uploaded lookup data for task "${taskCode}".`,
  );
}

// ─── Daily Activity Autocomplete ────────────────────────────────────────────

function bindDailyActivityAutocomplete(
  grid: HTMLElement,
  headerRow: HTMLElement,
) {
  if (lookupEntries.length === 0) {
    return;
  }

  const dailyActivityTh = headerRow.querySelector<HTMLElement>(
    `th[data-qa="${DAILY_ACTIVITY_QA}"]`,
  );
  if (!dailyActivityTh) {
    return;
  }

  const dailyActivityColumnIndex = getColumnIndex(dailyActivityTh);
  const headerColumnCount = getColumnHeaders(headerRow).length;
  const rows = getPrimaryAndSummaryBodyRows(grid, headerColumnCount);

  rows.forEach((row) => {
    if (isSummaryRow(row)) {
      return;
    }

    const activityCell = getRowCell(row, dailyActivityColumnIndex);
    if (!activityCell) {
      return;
    }

    const input = activityCell.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >('input:not([type="checkbox"]):not([type="hidden"]), textarea');
    if (!input || input.getAttribute(AUTOCOMPLETE_BOUND_ATTR) === "true") {
      return;
    }

    bindDailyActivityInput(input);
  });
}

function bindDailyActivityInput(input: HTMLInputElement | HTMLTextAreaElement) {
  input.setAttribute(AUTOCOMPLETE_BOUND_ATTR, "true");
  input.setAttribute("autocomplete", "off");

  input.addEventListener("focus", () => {
    updateAutocompleteSuggestions(input, input.value);
  });

  input.addEventListener("input", () => {
    updateAutocompleteSuggestions(input, input.value);
  });

  input.addEventListener("keydown", (event) => {
    handleAutocompleteKeydown(event as KeyboardEvent, input);
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (activeAutocomplete?.input === input) {
        closeAutocomplete();
      }
    }, 150);
  });
}

function updateAutocompleteSuggestions(
  input: HTMLInputElement | HTMLTextAreaElement,
  query: string,
) {
  if (!document.contains(input)) {
    closeAutocomplete();
    return;
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    closeAutocomplete(input);
    return;
  }

  const suggestions = getAutocompleteSuggestions(trimmedQuery);
  if (suggestions.length === 0) {
    closeAutocomplete(input);
    return;
  }

  const state = ensureAutocompleteState(input);
  state.suggestions = suggestions;
  state.highlightedIndex = Math.min(
    state.highlightedIndex,
    suggestions.length - 1,
  );
  renderAutocompleteMenu(state);
  state.reposition();
}

function getAutocompleteSuggestions(query: string): AutocompleteLookupEntry[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  return lookupEntries
    .map((entry) => ({
      entry,
      score: getAutocompleteScore(entry, normalizedQuery),
    }))
    .filter((result) => result.score !== Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.entry.description.length !== right.entry.description.length) {
        return left.entry.description.length - right.entry.description.length;
      }

      return left.entry.taskCode.localeCompare(right.entry.taskCode);
    })
    .slice(0, MAX_AUTOCOMPLETE_RESULTS)
    .map((result) => result.entry);
}

function getAutocompleteScore(
  entry: AutocompleteLookupEntry,
  normalizedQuery: string,
): number {
  if (entry.normalizedDescription === normalizedQuery) return 0;
  if (entry.normalizedTaskCode === normalizedQuery) return 1;
  if (entry.normalizedDescription.startsWith(normalizedQuery)) return 2;
  if (entry.normalizedTaskCode.startsWith(normalizedQuery)) return 3;

  const descriptionIndex = entry.normalizedDescription.indexOf(normalizedQuery);
  if (descriptionIndex !== -1) {
    return 10 + descriptionIndex;
  }

  const searchIndex = entry.normalizedSearchText.indexOf(normalizedQuery);
  if (searchIndex !== -1) {
    return 100 + searchIndex;
  }

  return Number.POSITIVE_INFINITY;
}

function ensureAutocompleteState(
  input: HTMLInputElement | HTMLTextAreaElement,
): ActiveAutocompleteState {
  if (activeAutocomplete?.input === input) {
    return activeAutocomplete;
  }

  closeAutocomplete();

  const menu = document.createElement("div");
  menu.className = "adv-autocomplete-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Daily Activity suggestions");
  menu.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>("[data-adv-suggestion-index]");
    if (!option) {
      return;
    }

    event.preventDefault();

    const optionIndex = Number(option.dataset.advSuggestionIndex);
    if (!Number.isInteger(optionIndex)) {
      return;
    }

    selectAutocompleteSuggestion(input, optionIndex, { keepFocus: true });
  });

  document.body.appendChild(menu);

  const reposition = () => {
    positionAutocompleteMenu(input, menu);
  };

  const cleanup = () => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
  };

  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  activeAutocomplete = {
    input,
    menu,
    suggestions: [],
    highlightedIndex: 0,
    reposition,
    cleanup,
  };

  return activeAutocomplete;
}

function renderAutocompleteMenu(state: ActiveAutocompleteState) {
  state.menu.innerHTML = "";

  state.suggestions.forEach((entry, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "adv-autocomplete-option";
    option.dataset.advSuggestionIndex = String(index);
    option.setAttribute("role", "option");
    option.setAttribute(
      "aria-selected",
      index === state.highlightedIndex ? "true" : "false",
    );

    if (index === state.highlightedIndex) {
      option.classList.add("is-active");
    }

    const code = document.createElement("span");
    code.className = "adv-autocomplete-code";
    code.textContent = entry.taskCode;

    const description = document.createElement("span");
    description.className = "adv-autocomplete-description";
    description.textContent = entry.description || "No description available";

    option.append(code, description);
    state.menu.appendChild(option);
  });
}

function positionAutocompleteMenu(
  input: HTMLInputElement | HTMLTextAreaElement,
  menu: HTMLDivElement,
) {
  if (!document.contains(input)) {
    closeAutocomplete();
    return;
  }

  const rect = input.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    closeAutocomplete();
    return;
  }

  const maxWidth = Math.min(420, window.innerWidth - 16);
  const width = Math.min(Math.max(rect.width, 280), maxWidth);

  menu.style.width = `${width}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;

  const top = rect.bottom + 4;
  const menuHeight = menu.offsetHeight || 0;
  const preferredTop =
    top + menuHeight > window.innerHeight - 8
      ? Math.max(8, rect.top - menuHeight - 4)
      : top;

  menu.style.top = `${preferredTop}px`;
}

function handleAutocompleteKeydown(
  event: KeyboardEvent,
  input: HTMLInputElement | HTMLTextAreaElement,
) {
  const state = activeAutocomplete;

  if (event.key === "ArrowDown") {
    if (!state || state.input !== input) {
      updateAutocompleteSuggestions(input, input.value);
    }

    if (
      activeAutocomplete?.input === input &&
      activeAutocomplete.suggestions.length > 0
    ) {
      event.preventDefault();
      moveAutocompleteHighlight(1);
    }
    return;
  }

  if (event.key === "ArrowUp") {
    if (state?.input === input && state.suggestions.length > 0) {
      event.preventDefault();
      moveAutocompleteHighlight(-1);
    }
    return;
  }

  if (event.key === "Escape") {
    if (state?.input === input) {
      event.preventDefault();
      closeAutocomplete();
    }
    return;
  }

  if (event.key === "Enter") {
    if (state?.input === input && state.suggestions.length > 0) {
      event.preventDefault();
      selectAutocompleteSuggestion(input, state.highlightedIndex, {
        keepFocus: true,
      });
    }
    return;
  }

  if (event.key === "Tab") {
    if (state?.input === input && state.suggestions.length > 0) {
      selectAutocompleteSuggestion(input, state.highlightedIndex, {
        keepFocus: false,
      });
    }
  }
}

function moveAutocompleteHighlight(delta: number) {
  if (!activeAutocomplete || activeAutocomplete.suggestions.length === 0) {
    return;
  }

  const nextIndex =
    (activeAutocomplete.highlightedIndex +
      delta +
      activeAutocomplete.suggestions.length) %
    activeAutocomplete.suggestions.length;
  activeAutocomplete.highlightedIndex = nextIndex;
  renderAutocompleteMenu(activeAutocomplete);

  const activeOption = activeAutocomplete.menu.querySelector<HTMLElement>(
    `[data-adv-suggestion-index="${nextIndex}"]`,
  );
  activeOption?.scrollIntoView({ block: "nearest" });
}

function selectAutocompleteSuggestion(
  input: HTMLInputElement | HTMLTextAreaElement,
  suggestionIndex: number,
  options: { keepFocus: boolean },
) {
  const state = activeAutocomplete;
  if (!state || state.input !== input) {
    return;
  }

  const selectedEntry = state.suggestions[suggestionIndex];
  if (!selectedEntry) {
    return;
  }

  setFormControlValue(input, selectedEntry.taskCode);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  closeAutocomplete();

  if (options.keepFocus) {
    input.focus();

    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(
        selectedEntry.taskCode.length,
        selectedEntry.taskCode.length,
      );
    }
  }

  window.requestAnimationFrame(() => {
    applyEnhancements();
  });
}

function closeAutocomplete(
  targetInput?: HTMLInputElement | HTMLTextAreaElement,
) {
  if (!activeAutocomplete) {
    return;
  }

  if (targetInput && activeAutocomplete.input !== targetInput) {
    return;
  }

  activeAutocomplete.cleanup();
  activeAutocomplete.menu.remove();
  activeAutocomplete = null;
}

function closeAutocompleteIfStale() {
  if (!activeAutocomplete) {
    return;
  }

  if (!document.contains(activeAutocomplete.input)) {
    closeAutocomplete();
    return;
  }

  if (activeAutocomplete.input.closest(MODAL_ANCESTOR_SELECTOR)) {
    closeAutocomplete();
  }
}

function ensureTimeWarnStyles() {
  if (document.getElementById(TIME_WARN_STYLES_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = TIME_WARN_STYLES_ID;
  style.textContent = `
    td.adv-time-warn {
      outline: 6px solid orange;
      outline-offset: -6px;
    }
  `;
  document.head.appendChild(style);
}

function applyTimeWarnings(
  grid: HTMLElement,
  mainHeaderRow: HTMLElement,
): void {
  const headers = getColumnHeaders(mainHeaderRow);
  const headerColumnCount = headers.length;

  // Collect column indices for day-of-week (time-entry) columns.
  const dayColumnIndices: number[] = [];
  headers.forEach((th) => {
    if (/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/i.test(getColumnKey(th))) {
      dayColumnIndices.push(getColumnIndex(th));
    }
  });

  if (dayColumnIndices.length === 0) return;

  // Reset warnings from the previous pass.
  grid
    .querySelectorAll<HTMLElement>(".adv-time-warn")
    .forEach((cell) => cell.classList.remove("adv-time-warn"));

  const rows = getPrimaryAndSummaryBodyRows(grid, headerColumnCount);
  rows.forEach((row) => {
    if (isSummaryRow(row) || isExpandedDetailRow(row, headerColumnCount))
      return;

    dayColumnIndices.forEach((colIndex) => {
      const cell = getRowCell(row, colIndex);
      if (!cell) return;

      const value = getCellDisplayValue(cell);
      if (value === "" || value === "0" || value === "-") return;

      if (!/:(?:00|15|30|45)$/.test(value)) {
        cell.classList.add("adv-time-warn");
      }
    });
  });
}

function ensureAutocompleteStyles() {
  if (document.getElementById(AUTOCOMPLETE_STYLES_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = AUTOCOMPLETE_STYLES_ID;
  style.textContent = `
    .adv-autocomplete-menu {
      position: fixed;
      z-index: 9999;
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
    }

    .adv-autocomplete-option {
      display: flex;
      width: 100%;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #0f172a;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .adv-autocomplete-option:hover,
    .adv-autocomplete-option.is-active {
      background: #e0f2fe;
    }

    .adv-autocomplete-code {
      flex: 0 0 auto;
      font-weight: 700;
      white-space: nowrap;
    }

    .adv-autocomplete-description {
      flex: 1 1 auto;
      color: #475569;
      line-height: 1.35;
    }

    td.adv-description {
      color: color-mix(in srgb, currentColor 60%, transparent);
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

function buildAutocompleteEntries(
  entries: LookupSearchEntry[],
): AutocompleteLookupEntry[] {
  return entries
    .filter((entry) => entry.taskCode.trim().length > 0)
    .map((entry) => ({
      ...entry,
      normalizedTaskCode: normalizeSearchValue(entry.taskCode),
      normalizedDescription: normalizeSearchValue(entry.description),
      normalizedSearchText: normalizeSearchValue(entry.searchText),
    }));
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function setFormControlValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (valueSetter) {
    valueSetter.call(input, value);
    return;
  }

  input.value = value;
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

function getHeaderRows(grid: HTMLElement): HTMLElement[] {
  return Array.from(grid.querySelectorAll<HTMLElement>("thead tr"));
}

function getMainHeaderRow(grid: HTMLElement): HTMLElement | null {
  return grid.querySelector<HTMLElement>('table[data-qa="tableGrid"] thead tr');
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

function getRowCell(
  row: HTMLElement,
  columnIndex: number,
): HTMLElement | undefined {
  if (columnIndex < 1) {
    return undefined;
  }

  let currentColumn = 1;

  for (const child of Array.from(row.children)) {
    if (!(child instanceof HTMLElement)) continue;

    const span =
      child instanceof HTMLTableCellElement && child.colSpan > 0
        ? child.colSpan
        : 1;

    if (columnIndex >= currentColumn && columnIndex < currentColumn + span) {
      return child;
    }

    currentColumn += span;
  }

  return undefined;
}

// ─── MutationObserver ────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let mutationObserver: MutationObserver | null = null;

function observeMutations() {
  mutationObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyEnhancements();
      window.requestAnimationFrame(() => {
        applyEnhancements();
      });
    }, 300);
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
