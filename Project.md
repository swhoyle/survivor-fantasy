# Project Context

Website: https://swhoyle.github.io/survivor-fantasy/

## Architecture

- Python scrapers use Playwright to log into Bracketology and parse league data. python-dotenv loads local environment variables; gspread writes to Google Sheets.
- React and Vite render the dashboard. Papa Parse reads eight Google Sheets tabs through public CSV exports configured in `src/data.js`.
- The frontend never runs the scrapers. Reloading the app fetches current sheet data; updating sheet values does not require rebuilding the site.
- Castaway portraits and the Survivor logo live in `src/images/`. Theme conventions live in `src/Theme.md` and `src/styles.css`.

## Frontend Development

```powershell
npm.cmd install
npm.cmd run dev
```

Local URL: http://127.0.0.1:5173/

```powershell
npm.cmd run build
npm.cmd run preview
```

Prefer focused checks and a production build after changes. Do not open new app previews unless requested or needed to diagnose runtime issues. Existing shared browser tabs can be used for relevant smoke checks.

## Dashboard

- Scoreboard: member ranks, names, episode scores, season points, and score breakdowns.
- Weekly Scores: one week or all episodes, member filters, picked castaways, and scoring details.
- Castaways: Points, Picks, Both, and Picked By modes; member/castaway filters; elimination indicators; points/picks ranks; episode breakdowns.
- Scoring: rule totals or individual scoring events, filtered by episode, castaway, member, category, and search.
- Analytics: highest/lowest season points, most/least picked castaways, and top/worst scoring rules. Active Players Only scopes all lists to castaways without an elimination event.

Overview tables reserve 13 episode columns. Published episode labels determine which scores exist. Missing scores display a dash, never an invented zero. Negative scores stay red; positive highlighting is scoped to the relevant views. OUT markers derive from the elimination scoring event.

Analytics pick counts deduplicate member/castaway/episode combinations. Player rankings use competition ranks through third place, including ties at the cutoff. Tied castaways share portraits/names, rank, and a single metric value; their hover breakdowns remain separate. Rule rankings sum actual scoring-event contributions, include Tribal Council penalties, and show up to three positive or negative rules with name order for ties. Zero picks are included; missing player scores are excluded from point rankings.

## Routing and Drill-Through

`src/navigation.js` encodes page, tab, and filter state in URLs. Browser Back/Forward restores the corresponding view. Local pages use `/scoreboard`, `/weekly-scores`, `/castaways`, `/scoring`, and `/analytics`; GitHub Pages uses hash routes under `/survivor-fantasy/` so shared links can be refreshed without server rewrites.

Examples:

- `/castaways?view=both`
- `/scoring?view=events&castaway=Ana`
- `/analytics?players=active`
- Repeated parameters represent multiple selections: `member=Alice&member=Bob`.

Other parameters include `episode`, `category`, and `q`. Table sorting and temporary hover state are not stored in URLs. Member tags inside filter popups select checkboxes; tags elsewhere open member details.

Member pages use `/member/<username>`. They hide the main tabs and show the username tag/name, rank, season points, player metrics, and one episode table with picked castaway portraits/names and scores. Favorite Player includes every castaway tied for the highest pick count and shows `Picked X / X episodes`. Best/Worst Player use cumulative points from that member's picked episodes; tied portraits share a total with per-player rule hovers. Best/Worst Pick use single-episode scores, group unique tied players, and have no point-value hover. They name the episode if all ties come from one episode, otherwise say `points in an episode`. Worst metrics stay red even if positive. Missing scores are excluded from performance metrics.

Castaway pages use `/castaway/<name>`. They show a large portrait, tribe, age, hometown, occupation, elimination status, season points, episodes scored, and weekly points/pickers. Most/Least Points Scored retain every tied episode in numeric order, such as `25 points in Episode 3/4/5`, with per-episode rule hovers and combined unique picker tags. Most Picked By includes every member tied for the highest unique episode count. Member/castaway detail pages have back buttons, direct-link fallbacks, and not-found states.

Data calculations live in `src/member-data.js`, `src/castaway-data.js`, and `src/analytics-data.js`. Score popovers use portals to avoid clipping inside scrolling tables and support hover/focus.

## GitHub Pages Deployment

Set repository Settings > Pages > Build and deployment > Source to GitHub Actions.

`.github/workflows/deploy-pages.yml` installs dependencies with `npm ci`, builds the frontend, and uploads only `dist`. It runs on pushes to `main` or manually. Vite uses relative asset paths, and the deployed app uses hash routing on GitHub Pages.

Do not publish the repository root: its HTML references `/src/main.jsx`, which is unbuilt JSX and causes a blank page/404. Source pushes update the live app only after the deployment workflow succeeds. `dist` is generated and ignored by Git. Python credentials must never be included in the build or committed.

## Python Setup

The scrapers load `BRACKETOLOGY_USERNAME` and `BRACKETOLOGY_PASSWORD` from `.env`. Normal password login is automated; additional verification may require user intervention. Google Sheets writes use local `google_credentials.json`.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/browsers'
.venv\Scripts\python.exe -m playwright install chromium
```

Set `PLAYWRIGHT_BROWSERS_PATH` to the same local cache before running browser scrapers. Add `--headed` to watch supported scraping commands.

## Scraper Commands

### Rules

```powershell
.venv\Scripts\python.exe scripts/scrape_rules.py
.venv\Scripts\python.exe scripts/scrape_rules.py --update-sheet
```

Captures all four Game Rules modes. Advanced rules have structured scoring rows; other modes remain as prose. Previously verified extraction contained 42 Advanced scoring rules and 12 category headings. Writes the `Scoring` tab with category, subcategory, rule, and point values. Previous values are backed up and writes verified. Outputs under `output/rules` include JSON, CSV, page text, mode screenshots, and diagnostics.

### Contestants

```powershell
.venv\Scripts\python.exe scripts/scrape_contestants.py --update-sheet
```

Replaces `Contestants` with `Name`, `Tribe`, `Age`, `Hometown`, and `Occupation`. Names match source cards; ages are numeric. JSON, CSV, screenshots, and backups live under `output/contestants`. Writes are verified; other tabs are unchanged.

### Episode Recaps

```powershell
.venv\Scripts\python.exe scripts/scrape_recaps.py --update-sheet
```

Updates `Episode Scores` (`Episode`, `Player`, `Total Score`) and `Episode Rules` (`Episode`, `Player`, `Rule`, `Point`). Episode labels include episode number and air date. Castaway names match `Contestants` without tribe suffixes. Each rule point is its actual contribution; repeated occurrences are preserved. Rule contributions must sum to the episode score before Sheets are updated. Absent castaways do not receive fabricated zero rows. Backups and JSON/CSV output live under `output/recaps`.

### Scoreboard

```powershell
.venv\Scripts\python.exe scripts/scrape_scoreboard.py --update-sheet
```

Refreshes league 105275's `Scoreboard` (`Username`, `Rank`, `Points`), sorted by rank. Duplicate pinned account rows are removed. Writes are verified; backups and snapshots live under `output/scoreboard`.

### Member Scores and Picks

```powershell
.venv\Scripts\python.exe scripts/scrape_user_picks.py --update-sheet
```

Writes `User Scores` (`Episode`, `User`, `Points`) and `User Picks` (`Episode`, `User`, `Contestant`). Castaway points must sum to each member's episode score, and episode scores must sum to their leaderboard total. Future locked picks are excluded. The league uses one lineup per user per episode; multiple lineups stop the script rather than losing lineup identity. Backups and JSON/CSV output live under `output/user-picks`. Other tabs are unchanged.

The eighth tab, `Members`, maps `Username` to display `Name` and is read by the frontend.

## Safety and Validation

- `.env`, Google credentials, scraper output, authentication caches, the virtual environment, `node_modules`, and `dist` are ignored by Git.
- Scrapers preserve backups, validate score reconciliation, and verify Google Sheets writes. Failures should leave prior data intact and emit sanitized diagnostics.
- Frontend validation: production build, editor diagnostics, targeted aggregation/URL checks, and focused browser smoke checks when appropriate.
- A prior live-data check reconciled 7 members, 21 castaways, 60 castaway episode scores, and 237 scoring events with no discrepancies. These counts are a historical snapshot, not fixed requirements.
- GitHub Actions automates dashboard deployment only; scraper scheduling is not configured by the deployment workflow.