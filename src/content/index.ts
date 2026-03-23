import { getColumnPrefs, onColumnPrefsChanged, type ColumnPrefs } from '../shared/storage';
import { loadLookupMap } from '../shared/csv';

const DESCRIPTION_COL_KEY = 'adv-description';
const DESCRIPTION_COL_LABEL = 'Description';
const DAILY_ACTIVITY_QA = 'DACT_CD'; // data-qa value for the "Daily Activity" column

let lookupMap: Map<string, string> = new Map();
let currentPrefs: ColumnPrefs = { hidden: [], frozen: [] };

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  [lookupMap, currentPrefs] = await Promise.all([
    loadLookupMap(),
    getColumnPrefs(),
  ]);

  applyEnhancements();

  onColumnPrefsChanged((prefs) => {
    currentPrefs = prefs;
    applyEnhancements();
  });

  observeMutations();
}

// ─── Main enhancement entry point ────────────────────────────────────────────

function applyEnhancements() {
  const grids = document.querySelectorAll<HTMLElement>('div[role="grid"]');
  grids.forEach(enhanceGrid);
}

function enhanceGrid(grid: HTMLElement) {
  const headerRow = grid.querySelector<HTMLElement>('thead tr');
  if (!headerRow) return;

  applyColumnVisibility(grid, headerRow);
  applyFrozenColumns(grid, headerRow);
  injectDescriptionColumn(grid, headerRow);
}

// ─── Column Visibility ───────────────────────────────────────────────────────

function applyColumnVisibility(grid: HTMLElement, headerRow: HTMLElement) {
  const headers = getColumnHeaders(headerRow);
  headers.forEach((th) => {
    const key = getColumnKey(th);
    const isHidden = currentPrefs.hidden.includes(key);
    const colIndex = getColumnIndex(th);
    setColumnDisplay(grid, colIndex, isHidden ? 'none' : '');
  });
}

function setColumnDisplay(grid: HTMLElement, colIndex: number, display: string) {
  const selector = `th:nth-child(${colIndex}), td:nth-child(${colIndex})`;
  grid.querySelectorAll<HTMLElement>(selector).forEach((cell) => {
    cell.style.display = display;
  });
}

// ─── Frozen Columns ──────────────────────────────────────────────────────────

function applyFrozenColumns(grid: HTMLElement, headerRow: HTMLElement) {
  // First, clear all existing freeze styles
  grid.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    cell.style.removeProperty('position');
    cell.style.removeProperty('left');
    cell.style.removeProperty('z-index');
    cell.style.removeProperty('background');
    cell.classList.remove('adv-frozen');
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

    const cellSelector = `th:nth-child(${colIndex}), td:nth-child(${colIndex})`;
    grid.querySelectorAll<HTMLElement>(cellSelector).forEach((cell) => {
      cell.style.position = 'sticky';
      cell.style.left = `${left}px`;
      cell.style.zIndex = cell.tagName === 'TH' ? '11' : '10';
      cell.style.background = 'inherit';
      cell.classList.add('adv-frozen');
    });

    accumulatedWidth += width;
  });
}

// ─── Description Column ──────────────────────────────────────────────────────

function injectDescriptionColumn(grid: HTMLElement, headerRow: HTMLElement) {
  // Skip if already injected
  if (headerRow.querySelector(`[data-qa="${DESCRIPTION_COL_KEY}"]`)) {
    updateDescriptionCells(grid);
    return;
  }

  if (lookupMap.size === 0) return;

  // Add header cell after the Daily Activity column (or at end if not found)
  const dailyActivityTh = headerRow.querySelector<HTMLElement>(
    `th[data-qa="${DAILY_ACTIVITY_QA}"]`
  );

  const descTh = document.createElement('th');
  descTh.setAttribute('data-qa', DESCRIPTION_COL_KEY);
  descTh.setAttribute('role', 'columnheader');
  descTh.setAttribute('scope', 'col');
  descTh.style.cssText = 'padding: 4px 8px; white-space: nowrap; font-weight: bold;';
  descTh.textContent = DESCRIPTION_COL_LABEL;

  if (dailyActivityTh) {
    dailyActivityTh.insertAdjacentElement('afterend', descTh);
  } else {
    headerRow.appendChild(descTh);
  }

  updateDescriptionCells(grid);
}

function updateDescriptionCells(grid: HTMLElement) {
  const headerRow = grid.querySelector<HTMLElement>('thead tr');
  if (!headerRow) return;

  const descThIndex = Array.from(headerRow.children).findIndex(
    (el) => el.getAttribute('data-qa') === DESCRIPTION_COL_KEY
  );
  const dailyActivityIndex = Array.from(headerRow.children).findIndex(
    (el) => el.getAttribute('data-qa') === DAILY_ACTIVITY_QA
  );

  if (descThIndex === -1 || dailyActivityIndex === -1) return;

  const bodyRows = grid.querySelectorAll<HTMLElement>('tbody tr');
  bodyRows.forEach((row) => {
    const cells = Array.from(row.children);
    const activityCell = cells[dailyActivityIndex] as HTMLElement | undefined;
    const existingDescCell = cells[descThIndex] as HTMLElement | undefined;

    const activityValue = activityCell?.textContent?.trim() ?? '';
    const description = lookupMap.get(activityValue) ?? '';

    if (existingDescCell) {
      existingDescCell.textContent = description;
    } else {
      const td = document.createElement('td');
      td.textContent = description;
      td.style.cssText = 'padding: 4px 8px; color: #555; font-style: italic;';
      td.setAttribute('data-qa', DESCRIPTION_COL_KEY);

      if (cells[dailyActivityIndex + 1]) {
        row.insertBefore(td, cells[dailyActivityIndex + 1]);
      } else {
        row.appendChild(td);
      }
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColumnHeaders(headerRow: HTMLElement): HTMLElement[] {
  return Array.from(headerRow.querySelectorAll<HTMLElement>('th'));
}

function getColumnKey(th: HTMLElement): string {
  return th.getAttribute('data-qa') ?? th.textContent?.trim() ?? '';
}

function getColumnIndex(th: HTMLElement): number {
  return Array.from(th.parentElement!.children).indexOf(th) + 1;
}

// ─── MutationObserver ────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function observeMutations() {
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyEnhancements, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

init();
