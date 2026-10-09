# Survivor Fantasy

Website: https://swhoyle.github.io/survivor-fantasy/

## React dashboard

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. The dashboard reads all eight Google Sheets tabs directly through public CSV links, including the `Members` tab that maps usernames to display names. Use Refresh data to fetch changes; refreshing the dashboard does not run the Bracketology scrapers. A failed refresh keeps the previous data visible with an error.

Five compact views use Bracketology's dark palette and green accent:

- Scoreboard: rank, member, each scored episode, and season total on the right.
- Weekly Picks: previous/next episode navigation, contestant scores, and who picked each contestant. Shared picks are highlighted and unpicked contestants remain visible. Filter by member to see a lineup.
- Contestants: bio fields plus episode columns and a total across published scores.
- Scoring: episode rule breakdowns, filters, and a View scoring rules popup.
- Analytics: top/bottom three castaways by season points and pick count, plus the highest-value and costliest scored rules.

Episode columns expand automatically as new episodes appear. Click score cells to inspect picks or scoring details. Missing episode scores display a dash instead of a made-up zero. The rules popup supports Escape and restores focus when closed.

Build with `npm.cmd run build` and preview with `npm.cmd run preview`. For GitHub Pages, deploy the contents of `dist` rather than the source files. Vite uses relative asset paths so the build works at `/survivor-fantasy/`. The Python credentials are not included in the frontend build. Deployment has not been performed as part of this change.

### Shareable dashboard URLs

Analytics uses `/analytics` locally or `#/analytics` on GitHub Pages. By default it includes all castaways and all scored rules, including Tribal Council penalties. Active Players Only sits beside the page title and scopes every ranking to castaways without an elimination event. The filter is shareable as `/analytics?players=active`. Pick counts deduplicate each member/castaway/episode; Times Picked hovers list each member and their pick count. The four player lists show ranks through third place, including everyone tied at the cutoff. Tied castaways share one row, portraits/names, competition rank, and metric value; hover sections retain each castaway's individual rules or member-pick counts. Rule rankings sum actual season scoring events, showing positive rules at the top and negative rules at the bottom, with up to three entries per list and name order for ties. Missing player scores are not treated as zero; zero picks are included.

Pages use `/scoreboard`, `/weekly-scores`, `/castaways`, and `/scoring` locally. Tabs and filters update query parameters automatically, and browser Back/Forward restores the corresponding view. For example, `/castaways?view=both` opens the combined metric view, and `/scoring?view=events&castaway=Ana` opens Ana's scoring events. Multiple filter selections use repeated parameters, such as `member=Alice&member=Bob`. Supported parameters are `view`, `episode`, `member`, `castaway`, `category`, and `q`, depending on the page.

On GitHub Pages, the app uses hash routes such as `/survivor-fantasy/#/castaways?view=both` so refreshing a shared link works without a server rewrite. Other production hosts using path routes must serve `index.html` for dashboard paths. Table sorting and temporary hover state are not stored in URLs.

Member tags link to `/member/<username>` (or `#/member/<username>` on GitHub Pages). The member detail page hides the main tabs and displays rank (including first/last-place icons), season points, Favorite Player with their episode pick frequency, and Best/Worst Player by cumulative points earned from that member's picks. Favorite Player shows all castaways tied for the highest pick count, in name order, regardless of points earned. Best/Worst Player group tied portraits/names together with one shared total points value; the hover shows rules separately for each player. Best/Worst Pick show unique tied player portraits/names together with one shared points value and no point-value hover. They name the episode when all tied picks come from one episode, otherwise say "X points in an episode". Rule breakdowns elsewhere are scoped to the member's picks, and missing scores are excluded from best/worst metrics. A single episode table shows points and picked castaway portraits/names with their episode scores, sorted from highest to lowest with missing scores last. Its back button returns to the previous view, or to the scoreboard when opened directly. Unknown members show a not-found state; missing scores display a dash rather than becoming zero.

Castaway portraits/names link to `/castaway/<name>` (or `#/castaway/<name>` on GitHub Pages). This detail page shows the portrait, tribe, age, hometown, occupation, elimination status, season points, and episodes scored. Highest/lowest scoring metrics retain all tied episodes and display a shared score with episode numbers such as "25 points in Episode 3/4/5". Their hovers show each episode's rules separately, with the combined unique picker tags beneath the metric. Most Picked By shows every tied member with their shared unique episode count, in name order. The episode table includes weekly points with scoring-rule hovers and clickable member tags for everyone who picked that castaway each week. Its back button returns to the previous view, or to Castaways when opened directly. Main tabs are hidden, unknown castaways show a not-found state, and missing episode scores remain a dash.

## Local Python rules scraper

The scraper logs in using BRACKETOLOGY_USERNAME and BRACKETOLOGY_PASSWORD from .env, selects Survivor, and captures all four Game Rules modes. No manual sign-in is needed for normal password login. Additional verification from the site may require user intervention.

Setup in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/browsers'
.venv\Scripts\python.exe -m playwright install chromium
```

Run:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/browsers'
.venv\Scripts\python.exe scripts/scrape_rules.py
```

Add --headed to watch the browser.

Refresh all league members' completed episode scores and picks:

```powershell
.venv\Scripts\python.exe scripts/scrape_user_picks.py --update-sheet
```

Writes `User Scores` (`Episode`, `User`, `Points`) and `User Picks` (`Episode`, `User`, `Contestant`). Every lineup's contestant points must sum to its episode score, and all episode scores must sum to the current leaderboard total. Future locked picks are excluded. The current league uses one lineup per user per episode; multiple lineups cause the script to stop before writing so their identity is not lost. JSON, CSV, and sheet backups are saved under `output/user-picks`. Other tabs are unchanged.

Refresh league 105275's current scoreboard:

```powershell
.venv\Scripts\python.exe scripts/scrape_scoreboard.py --update-sheet
```

Replaces `Scoreboard` with `Username`, `Rank`, and `Points`, sorted by rank. Duplicate pinned account rows are removed. The previous tab values are backed up under `output/scoreboard`, alongside the latest JSON and CSV snapshots. All written cells are verified; other tabs are unchanged.

Extract every available episode recap and update the two recap tabs:

```powershell
.venv\Scripts\python.exe scripts/scrape_recaps.py --update-sheet
```

- `Episode Scores`: `Episode`, `Player`, `Total Score`.
- `Episode Rules`: `Episode`, `Player`, `Rule`, `Point`.

Episode labels include the source's episode number and air date. Player names match `Contestants` without the tribe suffix. Each rule's Point is the contribution shown in that episode's breakdown; repeated occurrences are preserved as separate rows. Every breakdown must sum to its displayed total before Sheets are updated. Only contestants shown in each episode are included; the script does not invent zero rows for absent contestants. Existing recap tab values are backed up before replacement, and other tabs are unchanged. JSON and CSV copies are saved under `output/recaps`.

Extract contestants and replace the `Contestants` tab:

```powershell
.venv\Scripts\python.exe scripts/scrape_contestants.py --update-sheet
```

Writes `Name`, `Tribe`, `Age`, `Hometown`, and `Occupation`. Names match the source cards; ages are numeric. JSON, CSV, a screenshot, and a backup of previous sheet values are saved under `output/contestants`. The script verifies all written rows and does not change `Scoring`.

To scrape fresh rules and replace the Google Sheets `Scoring` tab using `google_credentials.json`:

```powershell
.venv\Scripts\python.exe scripts/scrape_rules.py --update-sheet
```

This writes `category`, `subcategory`, `rule`, and `point` columns for the 42 Advanced scoring rules. Section headings become category values. The other game modes remain in the local JSON as prose. Existing Scoring values are backed up locally before replacement, and all written rows are read back for verification. Other tabs are unchanged.

Output in output/rules:

- rules.json: source, timestamp, text for all four modes, and structured scoring rows.
- rules.csv: Advanced scoring rules with point values and marked category headings.
- page.txt: text for every mode.
- <mode>.png: a screenshot per mode.

Live extraction verified all four modes, including 42 Advanced scoring rules and 12 category headings. Other modes describe scoring in prose. Failures return a nonzero exit code and write sanitized local diagnostics; prior successful data remains available with its original extraction timestamp.

Credentials, output, and the virtual environment are excluded from Git. This script extracts game rules only; league picks and weekly scores are not implemented yet. GitHub Actions setup is deferred.
