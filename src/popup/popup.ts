import {
  getColumnPrefs,
  setColumnPrefs,
  type ColumnPrefs,
} from "../shared/storage";

interface ColumnInfo {
  key: string;
  label: string;
}

const DESCRIPTION_COL_KEY = "adv-description";
const DESCRIPTION_COL_LABEL = "Description";
const DAILY_ACTIVITY_QA = "DLY_ACTV_CD";

let prefs: ColumnPrefs = {
  hidden: [],
  frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
};
let columns: ColumnInfo[] = [];

async function init() {
  prefs = await getColumnPrefs();
  columns = await detectColumnsFromActiveTab();

  const emptyState = document.getElementById("empty-state")!;
  const columnList = document.getElementById("column-list")!;

  if (columns.length === 0) {
    emptyState.hidden = false;
    columnList.hidden = true;
    return;
  }

  emptyState.hidden = true;
  columnList.hidden = false;
  renderColumnList(columnList);

  document.getElementById("reset-btn")!.addEventListener("click", async () => {
    prefs = {
      hidden: [],
      frozen: [DAILY_ACTIVITY_QA, DESCRIPTION_COL_KEY],
    };
    await setColumnPrefs(prefs);
    renderColumnList(columnList);
  });
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
  if (!tab?.id || !tab.url?.includes("vantage.utah.gov")) return [];

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const grid = document.querySelector('div[role="grid"]');
        if (!grid) return [];
        const headers = grid.querySelectorAll<HTMLElement>(
          'thead th[role="columnheader"]',
        );
        return Array.from(headers)
          .map((th) => {
            const label =
              th
                .querySelector('[data-qa-id$=".headerCellTitle"]')
                ?.textContent?.trim() ??
              th.textContent?.trim() ??
              "";

            const dateMatch = label.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i);
            const key = dateMatch
              ? dateMatch[1]
              : (th.getAttribute("data-qa") ?? label);

            return { key, label };
          })
          .filter((c) => c.key);
      },
    });
    const rawColumns = (results?.[0]?.result as ColumnInfo[]) ?? [];

    // Normalize and deduplicate based on the simplified key
    const seen = new Set<string>();
    const columns = rawColumns.reduce<ColumnInfo[]>((acc, col) => {
      if (!seen.has(col.key)) {
        seen.add(col.key);
        // Clean up the label for display (e.g. 'Sat 03/14' -> 'Sat')
        const dateMatch = col.label.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i);
        acc.push({
          key: col.key,
          label: dateMatch ? dateMatch[1] : col.label,
        });
      }
      return acc;
    }, []);

    return ensureDescriptionColumn(columns);
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
