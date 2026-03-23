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
   This will start the Vite dev server with Hot Module Replacement (HMR) enabled via `@crxjs/vite-plugin`. The extension files will be built to the `dist` folder and watched for changes.

## Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `dist` folder that was created in your project directory when you ran the dev server.

Now, whenever you make changes to the source code, Vite will automatically update the files in the `dist` directory, and the changes will be reflected in the browser (you may need to refresh the page you are testing the extension on).

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
