import { getColumnPrefs, setColumnPrefs, type ColumnPrefs } from '../shared/storage';

interface ColumnInfo {
  key: string;
  label: string;
}

let prefs: ColumnPrefs = { hidden: [], frozen: [] };
let columns: ColumnInfo[] = [];

async function init() {
  prefs = await getColumnPrefs();
  columns = await detectColumnsFromActiveTab();

  const emptyState = document.getElementById('empty-state')!;
  const columnList = document.getElementById('column-list')!;

  if (columns.length === 0) {
    emptyState.hidden = false;
    columnList.hidden = true;
    return;
  }

  emptyState.hidden = true;
  columnList.hidden = false;
  renderColumnList(columnList);

  document.getElementById('reset-btn')!.addEventListener('click', async () => {
    prefs = { hidden: [], frozen: [] };
    await setColumnPrefs(prefs);
    renderColumnList(columnList);
  });
}

function renderColumnList(container: HTMLElement) {
  container.innerHTML = '';
  columns.forEach(({ key, label }) => {
    const isVisible = !prefs.hidden.includes(key);
    const isFrozen = prefs.frozen.includes(key);

    const row = document.createElement('div');
    row.className = 'column-row';

    row.innerHTML = `
      <span class="column-label" title="${label}">${label}</span>
      <div class="column-controls">
        <div class="control-group">
          <label>Visible</label>
          <label class="toggle">
            <input type="checkbox" data-key="${key}" data-type="visible" ${isVisible ? 'checked' : ''}/>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="control-group">
          <label>Freeze</label>
          <input type="checkbox" class="freeze-check" data-key="${key}" data-type="freeze" ${isFrozen ? 'checked' : ''}/>
        </div>
      </div>
    `;

    container.appendChild(row);
  });

  container.querySelectorAll<HTMLInputElement>('input[data-type="visible"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const key = input.dataset.key!;
      if (input.checked) {
        prefs.hidden = prefs.hidden.filter((k) => k !== key);
      } else {
        if (!prefs.hidden.includes(key)) prefs.hidden.push(key);
      }
      await setColumnPrefs(prefs);
    });
  });

  container.querySelectorAll<HTMLInputElement>('input[data-type="freeze"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const key = input.dataset.key!;
      if (input.checked) {
        if (!prefs.frozen.includes(key)) prefs.frozen.push(key);
      } else {
        prefs.frozen = prefs.frozen.filter((k) => k !== key);
      }
      await setColumnPrefs(prefs);
    });
  });
}

async function detectColumnsFromActiveTab(): Promise<ColumnInfo[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('vantage.utah.gov')) return [];

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const grid = document.querySelector('div[role="grid"]');
        if (!grid) return [];
        const headers = grid.querySelectorAll<HTMLElement>('thead th[role="columnheader"]');
        return Array.from(headers)
          .filter((th) => th.getAttribute('data-qa') !== 'adv-description')
          .map((th) => ({
            key: th.getAttribute('data-qa') ?? th.textContent?.trim() ?? '',
            label:
              th.querySelector('[data-qa-id$=".headerCellTitle"]')?.textContent?.trim() ??
              th.textContent?.trim() ??
              '',
          }))
          .filter((c) => c.key);
      },
    });
    return (results?.[0]?.result as ColumnInfo[]) ?? [];
  } catch {
    return [];
  }
}

init();
