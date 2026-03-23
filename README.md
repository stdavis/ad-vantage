# ad-vantage

Chrome extension to enhance the Vantage timesheet app with frozen columns, hidden columns, and a description lookup column.

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

## Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `dist` folder that was created in your project directory when you ran the dev server.
   For live-reload development with `npm run dev`, load `dist-dev` instead.
   For a normal unpacked extension that does not depend on the Vite dev server, load `dist` after running `npm run build`.

When using `dist-dev`, Vite updates the files automatically while the dev server is running, and changes are reflected in the browser after refresh.

## Usage

1. **Navigate to Vantage:** After loading the extension, visit the Vantage timesheet application at `https://vantage.utah.gov/`.
2. **Interact with the Page:** The extension will automatically begin injecting enhancements like frozen columns and hidden columns based on its logic.
3. **Extension Popup:** Click the extension icon in your Chrome toolbar to view the popup interface, which will be available while actively on the Vantage domain.

## Building for Production

To create a production-ready build:

```bash
npm run build
```

This will bundle and minify the extension into the `dist` folder, ready to be packaged as a `.zip` for the Chrome Web Store or distributed locally.

If Chrome shows errors about `localhost:5173`, remove the unpacked extension and reload it from `dist` after running `npm run build`.
