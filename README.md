# Survivor sheet connection test

This minimal static page fetches a published Google Sheets CSV at runtime. Score edits do not require rebuilding or redeploying the site. This first test uses plain JavaScript; the same data connection can later be used in React.

## Connect a sheet

Run `node server.cjs` and open http://127.0.0.1:5173 for the local connection test.

1. In Google Sheets, choose **File → Share → Publish to web**.
2. Choose only the intended test tab and **Comma-separated values (.csv)**.
3. Publish it and leave **Automatically republish when changes are made** enabled. Published data is public; use test scores and display names.
4. Set the resulting URL in `config.js` as `window.SHEET_CSV_URL`. The page loads players automatically and provides a Refresh button.

## GitHub Pages

Create a public `survivor-fantasy` repository and upload `index.html`, `app.js`, `config.js`, and `.nojekyll` to the root of `main`. In **Settings → Pages**, choose **Deploy from a branch**, `main`, and `/ (root)`, then save. Open the published URL shown by GitHub.

## Verify automatic updates

1. Confirm the live page displays the same rows as the sheet.
2. Change one test score in the sheet and note the old and new values.
3. Leave the page open. It checks every 30 seconds; Google's published copy can take a few minutes to change.
4. Confirm the new value appears without another GitHub commit or deployment.

The successful-check timestamp is when the page fetched data, not when Google last published edits. If loading fails, previous results remain visible with an error message.
