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

## Load a Production `.zip` in Chrome

Chrome does not load a local extension directly from a `.zip` file in `chrome://extensions/`. If you downloaded a production release archive, extract it first and then load the extracted folder as an unpacked extension.

1. Download the production `.zip` file from the GitHub release or other distribution source.
2. Extract the archive to a folder on disk.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted folder that contains the extension files, including `manifest.json` at the top level.

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

For local installation, Chrome still expects an unpacked folder. If you package `dist` as a `.zip`, unzip it before loading it from `chrome://extensions/`.

## Chrome Web Store

The release workflow can publish new versions to the Chrome Web Store after the first manual submission is created in the Chrome Web Store dashboard.

### First-Time Store Setup

1. Create or finish your Chrome Web Store developer account and enable 2-step verification.
2. Run `npm run build`.
3. Upload the packaged `dist` contents as a new item in the Chrome Web Store dashboard.
4. Complete the listing, privacy, and distribution sections in the dashboard.
5. Submit the item once so Google assigns a permanent extension ID.

The extension now includes packaged icons from `public/icons/icon16.png`, `public/icons/icon48.png`, and `public/icons/icon128.png` through `manifest.json`.

### GitHub Secrets For Automated Publishing

Add these repository secrets before expecting releases to publish to the Chrome Web Store automatically:

- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

If any of these secrets are missing, the release workflow will still upload the built zip to GitHub Releases and skip the Chrome Web Store publish step.

### Getting Chrome Web Store API Credentials

1. In Google Cloud, enable the Chrome Web Store API for a project you control.
2. Configure an OAuth consent screen.
3. Create an OAuth client.
4. Generate a refresh token with the `https://www.googleapis.com/auth/chromewebstore` scope.
5. Copy your publisher ID from the Chrome Web Store developer dashboard.
6. Copy the extension ID from the published store item.

Once those secrets are configured, each published GitHub release will:

1. Build the production extension.
2. Zip the `dist` contents.
3. Upload the archive to the GitHub release.
4. Upload the same archive to the Chrome Web Store.
5. Publish that uploaded version for review.

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
