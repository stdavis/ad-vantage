# ad-vantage

Chrome extension to enhance the Vantage timesheet app with frozen columns, hidden columns, and an optional description lookup column powered by a user-uploaded CSV.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- Optional: A package manager like npm, yarn, or pnpm.

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

   _(or `yarn install` / `pnpm install` depending on your package manager)_

2. **Start the development server:**

   ```bash
   npm run dev
   ```

   This starts the Vite dev server with Hot Module Replacement (HMR) via `@crxjs/vite-plugin`. The dev extension files are written to the `dist-dev` folder and expect `http://localhost:5173` to remain running.

3. **Launch the dedicated debug browser:**

   ```bash
   npm run chrome:dev
   ```

   This opens Google Chrome Dev and enables the remote debugging port on `http://127.0.0.1:9223`. Keep this browser open while working with MCP-based browser inspection.

## Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `dist` folder that was created in your project directory when you ran the dev server.
   For live-reload development with `npm run dev`, load `dist-dev` instead.
   For a normal unpacked extension that does not depend on the Vite dev server, load `dist` after running `npm run build`.

When using `dist-dev`, Vite updates the files automatically while the dev server is running, and changes are reflected in the browser after refresh.

## MCP Browser Debugging

Use Chrome Dev for browser automation and inspection instead of your normal Chrome session.

1. Run `npm run chrome:dev`.
2. In that Chrome Dev window, open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Load the unpacked extension from `dist-dev` while `npm run dev` is running, or `dist` after `npm run build`.
5. Log in to `https://vantage.utah.gov/` in that same Chrome Dev window.
6. Reload VS Code after the browser is running so the MCP server in `.vscode/mcp.json` can connect.

You can verify the Chrome Dev remote debugging endpoint with:

```bash
curl http://127.0.0.1:9223/json/version
```

If the endpoint returns JSON, VS Code should be able to attach to the browser through the configured Chrome DevTools MCP server.

Without `--user-data-dir`, Chrome Dev will use its default profile. That is simpler, but if Chrome Dev is already running without the remote debugging flag, macOS may reuse the existing instance and ignore the new launch arguments. If that happens, quit Chrome Dev and run `npm run chrome:dev` again.

## Usage

1. **Navigate to Vantage:** After loading the extension, visit the Vantage timesheet application at `https://vantage.utah.gov/`.
2. **Upload lookup data if needed:** Open the extension popup and upload a CSV file if you want the optional Description column to display task descriptions.
3. **Interact with the Page:** The extension will automatically begin injecting enhancements like frozen columns and hidden columns based on its logic.
4. **Extension Popup:** Click the extension icon in your Chrome toolbar to view the popup interface, which lets you manage column settings and the optional lookup CSV while actively on the Vantage domain.

### Lookup CSV Requirements

- Upload the CSV from the popup. The extension does not bundle a default `lookup.csv` file.
- The CSV must include `Task#` or `Task #` and either `Task Name` or `Vantage` columns.
- Uploaded lookup data is stored in `chrome.storage.local`, so it stays on the current browser profile without consuming Chrome sync quota.
- Clearing the uploaded CSV from the popup disables description lookups until a new file is uploaded.

## Building for Production

To create a production-ready build:

```bash
npm run build
```

This will bundle and minify the extension into the `dist` folder, ready to be packaged as a `.zip` for the Chrome Web Store or distributed locally.

If Chrome shows errors about `localhost:5173`, remove the unpacked extension and reload it from `dist` after running `npm run build`.

## Releases

Releases are cut with `agrc/release-composite-action` from GitHub Actions.

- Pushes to `dev` create or update prerelease PRs and prerelease tags.
- Pushes to `main` create or update stable release PRs and stable tags.
- When a release PR is merged, GitHub publishes a release and uploads a built extension archive from `dist`.

The release workflow uses conventional commits to determine the next version and changelog entries.

- `feat`: minor release
- `fix`: patch release
- `docs`: patch release
- `style`: patch release
- `deps`: patch release

Prefer squash merges so the merged PR title becomes the release note entry seen by `release-please`.

The workflow also bumps the extension version in both `package.json` and `manifest.json`, so those files should not be edited manually just to cut a release.
