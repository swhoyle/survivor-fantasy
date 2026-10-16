import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { loadData, episodesFrom, episodeNumber, rankCastaways } from "./data";
import { readViewState, createBrowserViewUrl } from "./navigation";
import { buildMemberDetails, groupPicksByEpisode } from "./member-data";
import { buildCastawayDetails } from "./castaway-data";
import { buildAnalytics, groupAnalyticsPlayers } from "./analytics-data";
import survivorLogo from "./images/SurivorLogo.png";
import "./styles.css";

const pages = ["Scoreboard", "Weekly Scores", "Castaways", "Scoring", "Analytics"];
const MemberNavigationContext = createContext(null);
function MemberTag({ username, hue = 0 }) {
  const navigation = useContext(MemberNavigationContext);
  const href = createBrowserViewUrl({ page: "Member", memberUsername: username }, new URL(window.location.href));
  return (
    <a
      className="member-tag"
      style={{ "--member-hue": hue }}
      href={href}
      onClick={(event) => {
        event.stopPropagation();
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigation.open(username);
      }}
      aria-label={`View ${username}'s member details`}
    >
      {username}
    </a>
  );
}
const castawayImages = import.meta.glob("./images/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
function Points({ value, seasonTotal = false, highlightPositive = false }) {
  return value === undefined ? (
    <span className="muted">—</span>
  ) : (
    <span
      className={`points ${value < 0 ? "negative" : (seasonTotal || highlightPositive) && value > 0 ? "positive" : ""}`}
    >
      {value}
    </span>
  );
}
function CastawayIdentity({ name, eliminated = false, linked = true }) {
  const navigation = useContext(MemberNavigationContext);
  const image = castawayImages[`./images/${name}.jpg`];
  const content = (
    <>
      {image && <img className="castaway-avatar" src={image} alt="" loading="lazy" />}
      <span className="castaway-identity-name">{name}</span>
      {eliminated && (
        <span className="eliminated-marker" title="Out" aria-label="Out">
          OUT
        </span>
      )}
    </>
  );
  return linked ? (
    <a
      className="castaway-identity castaway-identity-link"
      href={createBrowserViewUrl({ page: "Castaway", castawayName: name }, new URL(window.location.href))}
      aria-label={`View ${name}'s castaway details`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigation.openCastaway(name);
      }}
    >
      {content}
    </a>
  ) : (
    <span className="castaway-identity">{content}</span>
  );
}
function Select({ label, value, onChange, options, all }) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {all && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  memberHues,
  formatOption,
  onlyActiveOptions,
  eliminatedOptions,
}) {
  const filterRef = useRef(null);
  useEffect(() => {
    function closeOnOutsidePointer(event) {
      const filter = filterRef.current;
      if (filter && !filter.contains(event.target)) filter.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);
  function toggle(option) {
    onChange(
      selected.includes(option)
        ? selected.filter((value) => value !== option)
        : [...selected, option],
    );
  }
  const allLabel = "All";
  const groups = [
    { label: allLabel, options },
    ...(onlyActiveOptions
      ? [{ label: "Only Active", options: onlyActiveOptions }]
      : []),
    ...(eliminatedOptions
      ? [{ label: "Eliminated", options: eliminatedOptions }]
      : []),
  ];
  return (
    <details
      ref={filterRef}
      className={`multi-select-filter ${label === "Castaways" ? "contestant-filter" : ""}`}
    >
      <summary>
        <span>{label}</span>
        <span className={selected.length ? "filter-selection-active" : ""}>
          {!selected.length || selected.length === options.length
            ? allLabel
            : `${selected.length} selected`}
        </span>
      </summary>
      <div className="multi-select-filter-menu">
        <div className="multi-select-filter-actions">Choose {label.toLowerCase()}</div>
        <div className="multi-select-filter-groups">
          {groups.map((group) => (
            <label className="multi-select-group-option" key={group.label}>
              <input
                type="checkbox"
                checked={
                  group.options.length > 0 &&
                  group.options.length === selected.length &&
                  group.options.every((option) => selected.includes(option))
                }
                onChange={(event) =>
                  onChange(event.target.checked ? group.options : [])
                }
              />
              <span>{group.label}</span>
            </label>
          ))}
        </div>
        <div className="multi-select-filter-options">
          {options.map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
              />
              {memberHues ? (
                <span
                  className="member-tag"
                  style={{ "--member-hue": memberHues.get(option) }}
                >
                  {option}
                </span>
              ) : (
                <span>{formatOption ? formatOption(option) : option}</span>
              )}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
function Table({ rows, columns, initial, tableClass }) {
  const [sort, setSort] = useState(
    initial || { key: columns[0].key, direction: 1 },
  );
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key],
      y = b[sort.key];
    if (x === undefined) return y === undefined ? 0 : 1;
    if (y === undefined) return -1;
    return (
      sort.direction *
      (typeof x === "number"
        ? x - y
        : sort.key === "Episode"
          ? episodeNumber(x) - episodeNumber(y)
          : String(x).localeCompare(String(y)))
    );
  });
  return (
    <div
      className={
        tableClass === "weekly-table" ? "weekly-table-scroll" : "table-scroll"
      }
    >
      <table className={tableClass}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={[
                  c.numeric && "numeric",
                  c.key === "Rank" && "rank-column",
                  c.className,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-sort={
                  sort.key === c.key
                    ? sort.direction === 1
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  onClick={() =>
                    setSort({
                      key: c.key,
                      direction: sort.key === c.key ? -sort.direction : 1,
                    })
                  }
                >
                  {c.label || c.key}
                  <span>
                    {sort.key === c.key
                      ? sort.direction === 1
                        ? "↑"
                        : "↓"
                      : "↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={[
                    c.numeric && "numeric",
                    c.key === "Rank" && "rank-column",
                    c.className,
                    c.key === "Episode" && tableClass === "weekly-table"
                      ? "weekly-episode-label"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">No results.</p>}
    </div>
  );
}

function MobileEpisodePicker({ episodes, value, onChange, includeTotal = false }) {
  return (
    <div className="mobile-episode-picker" aria-label="Choose episode">
      {includeTotal && <button type="button" className={value === "total" ? "active" : ""} aria-pressed={value === "total"} onClick={() => onChange("total")}>Total</button>}
      {episodes.map((episode) => <button type="button" key={episode} className={value === episode ? "active" : ""} aria-pressed={value === episode} aria-label={"Episode " + episodeNumber(episode)} onClick={() => onChange(episode)}>EP {episodeNumber(episode)}</button>)}
    </div>
  );
}

function MobileNavigation({ page, onNavigate }) {
  const current = page === "Member" ? "Scoreboard" : page === "Castaway" ? "Castaways" : page;
  return <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{pages.map((item) => <button key={item} type="button" className={current === item ? "active" : ""} aria-current={current === item ? "page" : undefined} onClick={() => onNavigate(item)}>{item === "Weekly Scores" ? "Weekly" : item}</button>)}</nav>;
}

function MobileDashboard(props) {
  const {
    page, data, episodes, members, scoreboard, visibleCastaways, currentWeek,
    weekIndex, memberHues, memberDisplayNames, castawayInfo, eliminationEpisodes,
    memberDetails, memberProfile, memberUsername, castawayName, castawayDetails,
    analytics, analyticsPlayers, setAnalyticsPlayers, analyticsEpisode, setAnalyticsEpisode, setWeek,
    contestantMetric, setContestantMetric, scoringView,
    setScoringView, search, setSearch, scoringRuleRows, scoringEvents, scoringCastawayDetails, closeMember,
    closeCastaway,
  } = props;
  const [scorePeriod, setScorePeriod] = useState(() => sessionStorage.getItem("survivor-score-period") || "total");
  const [castawayQuery, setCastawayQuery] = useState("");
  const [eventEpisode, setEventEpisode] = useState(episodes.at(-1) || "");
  const [openWeeklyPlayer, setOpenWeeklyPlayer] = useState("");
  const [openScoreboardMember, setOpenScoreboardMember] = useState("");
  const [openCastaway, setOpenCastaway] = useState("");
  const [openScoringRule, setOpenScoringRule] = useState("");
  const [openMemberEpisode, setOpenMemberEpisode] = useState("");
  const [openCastawayEpisode, setOpenCastawayEpisode] = useState("");
  const pageTitle = page === "Weekly Scores" ? "Weekly Scores" : page;
  const activeScorePeriod = scorePeriod === "total" || episodes.includes(scorePeriod) ? scorePeriod : "total";
  const chooseScorePeriod = (value) => {
    setScorePeriod(value);
    sessionStorage.setItem("survivor-score-period", value);
  };

  if (page === "Scoreboard") {
    const rows = scoreboard.map((row) => ({ ...row, MobilePoints: activeScorePeriod === "total" ? row.Points : row[activeScorePeriod] }))
      .sort((a, b) => (b.MobilePoints ?? -Infinity) - (a.MobilePoints ?? -Infinity) || a.Username.localeCompare(b.Username));
    const latestEpisode = episodes.at(-1);
    const previousRanks = new Map();
    if (latestEpisode) {
      const previousRows = scoreboard.map((row) => ({
        Username: row.Username,
        Points: (row.Points ?? 0) - (row[latestEpisode] ?? 0),
      })).sort((left, right) => right.Points - left.Points || left.Username.localeCompare(right.Username));
      let previousRank = 0;
      let previousPoints;
      previousRows.forEach((row, index) => {
        if (index === 0 || row.Points !== previousPoints) previousRank = index + 1;
        previousPoints = row.Points;
        previousRanks.set(row.Username, previousRank);
      });
    }
    let rank = 0;
    let previous;
    return <section className="mobile-page">
      <div className="section-heading"><div><h1>Scoreboard</h1><p className="mobile-subtitle">League standings by points</p></div></div>
      <MobileEpisodePicker episodes={episodes} value={activeScorePeriod} includeTotal onChange={chooseScorePeriod} />
      <div className="mobile-card-list">{rows.map((row, index) => {
        if (index === 0 || row.MobilePoints !== previous) rank = index + 1;
        previous = row.MobilePoints;
        const picks = activeScorePeriod === "total" ? row.PickedSeasonDetails : row.PickedEpisodeDetails[activeScorePeriod] ?? [];
        const rankMovement = previousRanks.has(row.Username) ? previousRanks.get(row.Username) - rank : 0;
        const lastEpisodePoints = latestEpisode ? row[latestEpisode] ?? 0 : undefined;
        return <details className="mobile-card mobile-weekly-expander mobile-score-expander" key={row.Username} open={openScoreboardMember === row.Username} onToggle={(event) => {
          if (event.currentTarget.open) setOpenScoreboardMember(row.Username);
          else if (openScoreboardMember === row.Username) setOpenScoreboardMember("");
        }}>
          <summary className="mobile-weekly-summary">
            <span className="mobile-score-rank-group"><span className="mobile-rank">{rank}</span>{activeScorePeriod === "total" && rankMovement !== 0 && <span className={`mobile-rank-movement ${rankMovement > 0 ? "up" : "down"}`} aria-label={`${rankMovement > 0 ? "Up" : "Down"} ${Math.abs(rankMovement)} places`}>{rankMovement > 0 ? "↑" : "↓"}{Math.abs(rankMovement)}</span>}</span>
            <span className="mobile-score-member"><MemberTag username={row.Username} hue={memberHues.get(row.Username)} /><span className="mobile-score-display-name">{memberDisplayNames.get(row.Username) || row.Username}</span></span>
            <strong className="mobile-weekly-score"><Points value={row.MobilePoints} seasonTotal />{activeScorePeriod === "total" && <span className="mobile-last-episode-points" aria-label={`Last episode points: ${lastEpisodePoints > 0 ? "+" : ""}${lastEpisodePoints}`}>{lastEpisodePoints > 0 ? "+" : lastEpisodePoints < 0 ? "−" : ""}{Math.abs(lastEpisodePoints)}</span>}<span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span></strong>
          </summary>
          <div className="mobile-weekly-breakdown mobile-score-detail-grid">
            <section className="mobile-score-picks">
              <h2>{activeScorePeriod === "total" ? "Season picks" : "Episode " + episodeNumber(activeScorePeriod) + " picks"}</h2>
              {picks.length ? <>
                <div className="mobile-pick-grid-heading" aria-hidden="true"><span>Player</span><span>Picks</span><span>Points</span></div>
                <ul className="mobile-scoring-rules mobile-pick-grid">{[...picks].sort((a, b) => (b.Point ?? -Infinity) - (a.Point ?? -Infinity) || a.Player.localeCompare(b.Player)).map((pick) => <li key={pick.Player}><CastawayIdentity name={pick.Player} eliminated={castawayInfo.get(pick.Player)?.Eliminated} /><span className="mobile-pick-count">{pick.Count}</span><span className="mobile-pick-points"><Points value={pick.Point} highlightPositive /></span></li>)}</ul>
              </> : <p className="muted">No picks for this episode yet.</p>}
            </section>
            <section className="mobile-score-episode-breakdown">
              <h2>Episode points</h2>
              <ul>{episodes.map((episode) => <li key={episode}><span>EP {episodeNumber(episode)}</span><Points value={row[episode] ?? 0} /></li>)}</ul>
            </section>
          </div>
        </details>;
      })}</div>
    </section>;
  }

  if (page === "Weekly Scores") {
    const rows = data.contestants.map((contestant) => ({
      ...contestant,
      Episode: currentWeek,
      Score: data.episodeScores.find((score) => score.Player === contestant.Name && score.Episode === currentWeek)?.["Total Score"],
      Users: [...new Set(data.userPicks.filter((pick) => pick.Episode === currentWeek && pick.Contestant === contestant.Name).map((pick) => pick.User))],
      Eliminated: eliminationEpisodes.get(contestant.Name) === currentWeek,
    })).filter((row) => {
      const eliminatedIn = eliminationEpisodes.get(row.Name);
      return currentWeek && (!eliminatedIn || episodeNumber(eliminatedIn) >= episodeNumber(currentWeek));
    }).sort((a, b) => (b.Score ?? -Infinity) - (a.Score ?? -Infinity));
    const ranks = rows.map((row, index) => index === 0 || row.Score !== rows[index - 1].Score ? index + 1 : null);
    ranks.forEach((rank, index) => { if (rank === null) ranks[index] = ranks[index - 1]; });
    const eliminated = rows.filter((row) => row.Eliminated);
    return <section className="mobile-page">
      <div className="section-heading"><div><h1>Weekly Scores</h1><p className="mobile-subtitle">Contestant points and league picks</p></div></div>
      <div className="mobile-week-switch"><button type="button" aria-label="Previous episode" disabled={weekIndex <= 0} onClick={() => setWeek(episodes[weekIndex - 1])}>‹</button><strong>{currentWeek ? "Episode " + episodeNumber(currentWeek) : "No episodes"}</strong><button type="button" aria-label="Next episode" disabled={weekIndex >= episodes.length - 1} onClick={() => setWeek(episodes[weekIndex + 1])}>›</button></div>
      {eliminated.length > 0 && <aside className="mobile-eliminated-banner" aria-label="Eliminated this episode">
        <span className="mobile-eliminated-label">OUT THIS EPISODE</span>
        <div className="mobile-eliminated-players">{eliminated.map((row) => <CastawayIdentity key={row.Name} name={row.Name} eliminated={false} />)}</div>
      </aside>}
      <div className="mobile-card-list">{rows.map((row, index) => {
        const rules = data.episodeRules.filter((rule) => rule.Player === row.Name && rule.Episode === row.Episode);
        const rank = ranks[index];
        return <details className="mobile-card mobile-weekly-expander" key={row.Name} open={openWeeklyPlayer === row.Name} onToggle={(event) => {
          if (event.currentTarget.open) setOpenWeeklyPlayer(row.Name);
          else if (openWeeklyPlayer === row.Name) setOpenWeeklyPlayer("");
        }}>
          <summary className="mobile-weekly-summary">
            <span className="mobile-rank">{rank}</span>
            <span className="mobile-weekly-player"><CastawayIdentity name={row.Name} eliminated={false} /><span className={"tribe " + row.Tribe.toLowerCase()}>{row.Tribe}</span>{row.Eliminated && <span className="eliminated-marker" title="Out" aria-label="Out">OUT</span>}<span className="mobile-picked-count">{row.Users.length ? "Picked by " + row.Users.length + " " + (row.Users.length === 1 ? "person" : "people") : "Not picked"}</span></span>
            <strong className="mobile-weekly-score"><Points value={row.Score} highlightPositive /><span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span></strong>
          </summary>
          <div className="mobile-weekly-breakdown">
            <h2>How they scored</h2>
            {rules.length ? <ul className="mobile-scoring-rules">{rules.map((rule, index) => <li key={rule.Rule + index}><span>{rule.Rule}</span><Points value={rule.Point} highlightPositive /></li>)}</ul> : <p className="muted">No scoring details available.</p>}
            <div className="mobile-picked-by"><span className="muted">Picked by</span><div className="mobile-chip-list">{row.Users.length ? row.Users.map((user) => <MemberTag key={user} username={user} hue={memberHues.get(user)} />) : <span className="muted">Not picked</span>}</div></div>
          </div>
        </details>;
      })}</div>
    </section>;
  }

  if (page === "Castaways") {
    const query = castawayQuery.trim().toLowerCase();
    const rows = visibleCastaways.filter((row) => !query || (row.Name + " " + row.Tribe).toLowerCase().includes(query)).sort((left, right) => right.PointTotal - left.PointTotal || right.PickTotal - left.PickTotal || left.Name.localeCompare(right.Name));
    return <section className="mobile-page">
      <div className="section-heading"><div><h1>Castaways</h1><p className="mobile-subtitle">Season performance and picks</p></div></div>
      <input className="mobile-search" aria-label="Search castaways" placeholder="Search castaways" value={castawayQuery} onChange={(event) => setCastawayQuery(event.target.value)} />
      <div className="mobile-castaway-metric-head"><span aria-hidden="true"></span><span>Castaway</span><span>Points</span><span>Picks</span><span aria-hidden="true"></span></div>
      <div className="mobile-card-list">{rows.map((row, index) => <article className="mobile-card mobile-castaway-row" key={row.Name}>
        <button className="mobile-castaway-trigger" type="button" aria-expanded={openCastaway === row.Name} onClick={() => setOpenCastaway((current) => current === row.Name ? "" : row.Name)}>
          <span className="mobile-rank">{index + 1}</span>
          <span className="mobile-card-main"><CastawayIdentity name={row.Name} eliminated={eliminationEpisodes.has(row.Name)} /><span className={"tribe " + row.Tribe.toLowerCase()}>{row.Tribe}</span></span>
          <span className="mobile-castaway-value"><Points value={row.PointTotal} seasonTotal /></span>
          <span className="mobile-castaway-value mobile-castaway-picks">{row.PickTotal ?? 0}</span>
          <span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span>
        </button>
        {openCastaway === row.Name && <div className="mobile-castaway-breakdown">
          <section><h3>Points breakdown</h3>{row.RuleTotals.length ? <ul className="mobile-scoring-rules">{row.RuleTotals.slice().sort((a, b) => b.Point - a.Point).map((rule) => <li key={rule.Rule}><span>{rule.Rule}{rule.Count > 1 ? ` ×${rule.Count}` : ""}</span><Points value={rule.Point} highlightPositive /></li>)}</ul> : <p className="muted">No points scored.</p>}</section>
          <section><h3>Picked by ({row.PickTotal ?? 0})</h3>{row.MemberTotals.length ? <div className="mobile-chip-list">{row.MemberTotals.slice().sort((a, b) => b.Count - a.Count).map((member) => <span className="mobile-castaway-picker" key={member.Member}><MemberTag username={member.Member} hue={memberHues.get(member.Member)} /><span className="score-count">{member.Count}</span></span>)}</div> : <p className="muted">Not picked.</p>}</section>
        </div>}
      </article>)}</div>
    </section>;
  }

  if (page === "Scoring") {
    const rows = scoringRuleRows.slice().sort((left, right) => (right.Total ?? 0) - (left.Total ?? 0) || left.Rule.localeCompare(right.Rule));
    return <section className="mobile-page">
      <div className="section-heading"><div><h1>Scoring</h1><p className="mobile-subtitle">Season points by rule</p></div></div>
      <input className="mobile-search" aria-label="Search scoring rules" placeholder="Search scoring rules" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="mobile-card-list">{rows.slice(0, 120).map((row, index) => <details className="mobile-card mobile-weekly-expander" key={row.Rule} open={openScoringRule === row.Rule} onToggle={(event) => {
        if (event.currentTarget.open) setOpenScoringRule(row.Rule);
        else if (openScoringRule === row.Rule) setOpenScoringRule("");
      }}>
        <summary className="mobile-weekly-summary mobile-scoring-summary">
          <span className="mobile-rank">{index + 1}</span>
          <span className="mobile-weekly-player"><span className="mobile-scoring-rule-name">{row.Rule}</span></span>
          <span className="mobile-rule-value">{row.Point > 0 ? "+" : row.Point < 0 ? "−" : ""}{Math.abs(row.Point)}</span>
          <span className="mobile-scoring-total"><Points value={row.Total ?? 0} seasonTotal /></span>
          <span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span>
        </summary>
        <div className="mobile-weekly-breakdown"><h2>Castaways with points</h2>{row.SeasonDetails.length ? <ul className="mobile-scoring-rules">{row.SeasonDetails.slice().sort((left, right) => right.Point - left.Point || left.Player.localeCompare(right.Player)).map((detail) => <li key={detail.Player}><CastawayIdentity name={detail.Player} eliminated={castawayInfo.get(detail.Player)?.Eliminated} /><span className="mobile-rule-detail-score">{detail.Count > 1 && <span className="muted">×{detail.Count} </span>}<Points value={detail.Point} seasonTotal /></span></li>)}</ul> : <p className="muted">No points scored for this rule yet.</p>}</div>
      </details>)}{!rows.length && <p className="empty">No matching scoring rules.</p>}</div>
    </section>;
  }

  const activeAnalyticsEpisode = episodes.includes(analyticsEpisode) ? analyticsEpisode : "total";
  const mobileAnalytics = page === "Analytics" && data
    ? buildAnalytics(data, { activeOnly: analyticsPlayers === "active", episode: activeAnalyticsEpisode === "total" ? "" : activeAnalyticsEpisode })
    : analytics;
  if (page === "Analytics" && mobileAnalytics) {
    const groups = [
      { title: "Most Points", rows: groupAnalyticsPlayers(mobileAnalytics.mostPoints, "Point"), metric: "Point" },
      { title: "Least Points", rows: groupAnalyticsPlayers(mobileAnalytics.leastPoints, "Point"), metric: "Point" },
      { title: "Most Picked", rows: groupAnalyticsPlayers(mobileAnalytics.mostPicked, "Picks"), metric: "Picks" },
      { title: "Least Picked", rows: groupAnalyticsPlayers(mobileAnalytics.leastPicked, "Picks"), metric: "Picks" },
      { title: "Top Scoring Rules", rows: mobileAnalytics.topRules, metric: "Point", rules: true },
      { title: "Worst Scoring Rules", rows: mobileAnalytics.bottomRules, metric: "Point", rules: true },
      { title: "Favorite Player", rows: mobileAnalytics.favoritePlayers, memberSummaries: true, metric: "Count" },
      { title: "Best Player", rows: mobileAnalytics.bestPlayers, memberSummaries: true, metric: "Point" },
    ];
    return <section className="mobile-page">
      <div className="section-heading"><div><h1>Analytics</h1><p className="mobile-subtitle">Season leaders and trends</p></div></div>
      <MobileEpisodePicker episodes={episodes} value={activeAnalyticsEpisode} includeTotal onChange={setAnalyticsEpisode} />
      <label className="mobile-inline-toggle"><input type="checkbox" checked={analyticsPlayers === "active"} onChange={(event) => setAnalyticsPlayers(event.target.checked ? "active" : "all")} /> Active castaways only</label>
      <div className="mobile-analytics-grid">{groups.map((group) => <article className="mobile-card mobile-analytics-card" key={group.title}><h2>{group.title}</h2>
        {group.memberSummaries ? group.rows.map((row) => <div className="mobile-member-analytics-row" key={row.Member}>
          <div className="mobile-member-analytics-user"><MemberTag username={row.Member} hue={memberHues.get(row.Member)} /><span>{memberDisplayNames.get(row.Member) || row.Name || row.Member}</span></div>
          <div className="mobile-member-analytics-targets">{row.Players.length ? row.Players.map((player) => <span className="mobile-member-analytics-target" key={player.Player}><CastawayIdentity name={player.Player} eliminated={eliminationEpisodes.has(player.Player)} /><span className="mobile-member-analytics-value">{group.metric === "Count" ? `${player.Count} picks` : <Points value={player.Point} seasonTotal />}</span></span>) : <span className="muted">No picks yet</span>}</div>
        </div>) : group.rows.map((row, index) => <div className={`mobile-analytics-row${!group.rules && row.Players.length > 1 ? " mobile-analytics-tied-row" : ""}`} key={group.rules ? row.Rule : row.Rank + row.Player}><span className="mobile-rank">{row.Rank ?? index + 1}</span><div className="mobile-card-main">{group.rules ? <strong>{row.Rule}</strong> : row.Players.map((player) => <CastawayIdentity key={player.Player} name={player.Player} eliminated={player.Eliminated} />)}</div>{group.rules ? <ScoreDetailsWidget player={row.Rule} episode={activeAnalyticsEpisode === "total" ? "Season points" : `Episode ${episodeNumber(activeAnalyticsEpisode)} points`} score={row.Point} details={scoringCastawayDetails(data.episodeRules.filter((event) => event.Rule === row.Rule && (activeAnalyticsEpisode === "total" || event.Episode === activeAnalyticsEpisode) && (analyticsPlayers !== "active" || !eliminationEpisodes.has(event.Player))))} detailsMode="picked-castaways" seasonTotal showCount showChevron={false} /> : <Points value={row[group.metric]} seasonTotal={activeAnalyticsEpisode === "total"} highlightPositive={activeAnalyticsEpisode !== "total"} />}</div>)}
      </article>)}</div>
    </section>;
  }

  if (page === "Member") return <section className="mobile-page mobile-profile-page mobile-unboxed-profile">
    <button type="button" className="member-back-button" onClick={closeMember}><span aria-hidden="true">←</span> Back</button>
    <div className="mobile-profile-heading"><MemberTag username={memberUsername} hue={memberHues.get(memberUsername)} /><h1>{memberDetails?.profile?.Name || memberUsername}</h1></div>
    {!memberDetails ? <p className="empty">Member not found.</p> : <>
      <div className="mobile-profile-stats"><div><span>Rank</span><strong>{memberProfile?.Rank ?? "—"} / {members.length}</strong></div><div><span>Season points</span><strong><Points value={memberProfile?.Points} seasonTotal /></strong></div></div>
      <section className="mobile-member-highlights">
        <h2>Season highlights</h2>
        {[
          { label: "Favorite Player", players: memberDetails.mostPickedPlayers, kind: "favorite" },
          { label: "Best Player", players: memberDetails.bestPlayers, kind: "player" },
          { label: "Worst Player", players: memberDetails.worstPlayers, kind: "player" },
          { label: "Best Pick", players: memberDetails.bestPicks, kind: "pick" },
          { label: "Worst Pick", players: memberDetails.worstPicks, kind: "pick" },
        ].map((metric) => <div className="mobile-member-highlight" key={metric.label}>
          <strong>{metric.label}</strong>
          <div className="mobile-member-highlight-values">{metric.players.length ? metric.players.map((player) => <span className="mobile-member-highlight-item" key={`${player.Player}-${player.Episode || "season"}`}>
            <CastawayIdentity name={player.Player} eliminated={eliminationEpisodes.has(player.Player)} />
            {metric.kind === "favorite" ? <span className="muted">{player.Count} picks</span> : metric.kind === "pick" ? <><span className="muted">EP {episodeNumber(player.Episode)}</span><Points value={player.Point} highlightPositive /></> : <Points value={player.Point} seasonTotal />}
          </span>) : <span className="muted">—</span>}</div>
        </div>)}
      </section>
      <section className="mobile-member-episodes">
        <h2>Episode Scores</h2>
        <div className="mobile-card-list">{memberDetails.episodes.map((row) => {
          const picks = memberDetails.picks.filter((pick) => pick.Episode === row.Episode).sort((left, right) =>
            (right.Point ?? -Infinity) - (left.Point ?? -Infinity) || left.Player.localeCompare(right.Player),
          );
          return <details className="mobile-card mobile-weekly-expander mobile-member-episode-row" key={row.Episode} open={openMemberEpisode === row.Episode} onToggle={(event) => {
            if (event.currentTarget.open) setOpenMemberEpisode(row.Episode);
            else if (openMemberEpisode === row.Episode) setOpenMemberEpisode("");
          }}>
            <summary className="mobile-weekly-summary mobile-member-episode-summary">
              <strong>Episode {episodeNumber(row.Episode)}</strong>
              <strong className="mobile-weekly-score"><Points value={row.Points} highlightPositive /><span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span></strong>
            </summary>
            <div className="mobile-weekly-breakdown"><h2>Picked castaways</h2>{picks.length ? <ul className="mobile-scoring-rules">{picks.map((pick) => <li key={pick.Player}><CastawayIdentity name={pick.Player} eliminated={eliminationEpisodes.get(pick.Player) === row.Episode} /><Points value={pick.Point} highlightPositive /></li>)}</ul> : <p className="muted">No picks for this episode.</p>}</div>
          </details>;
        })}</div>
      </section>
    </>}
  </section>;

  if (page === "Castaway") {
    const memberPickCounts = new Map();
    for (const episode of castawayDetails?.episodes ?? []) {
      for (const username of episode.Members) memberPickCounts.set(username, (memberPickCounts.get(username) ?? 0) + 1);
    }
    const leagueMembers = data?.members ?? [];
    const leastPickCount = leagueMembers.length ? Math.min(...leagueMembers.map((member) => memberPickCounts.get(member.Username) ?? 0)) : 0;
    const leastPickedBy = leagueMembers
      .filter((member) => (memberPickCounts.get(member.Username) ?? 0) === leastPickCount)
      .map((member) => ({ Username: member.Username, Count: leastPickCount }))
      .sort((left, right) => left.Username.localeCompare(right.Username));
    return <section className="mobile-page mobile-profile-page mobile-unboxed-profile">
    <button type="button" className="member-back-button" onClick={closeCastaway}><span aria-hidden="true">←</span> Back</button>
    <div className="mobile-profile-heading"><CastawayIdentity name={castawayName} linked={false} eliminated={eliminationEpisodes.has(castawayName)} /></div>
    {!castawayDetails ? <p className="empty">Castaway not found.</p> : <>
      <p className="mobile-profile-bio">{[castawayDetails.profile.Age, castawayDetails.profile.Hometown, castawayDetails.profile.Occupation].filter(Boolean).join(" · ")}</p>
      <div className="mobile-profile-stats mobile-castaway-stats"><div><span>Season points</span><strong><Points value={castawayDetails.totalPoints} seasonTotal /></strong></div><div><span>Tribe</span><strong>{castawayDetails.profile.Tribe}</strong></div><div><span>Status</span><strong>{eliminationEpisodes.has(castawayName) ? "Out · Episode " + episodeNumber(eliminationEpisodes.get(castawayName)) : "Active"}</strong></div></div>
      <section className="mobile-member-highlights mobile-castaway-highlights">
        <h2>Season highlights</h2>
        {[
          { label: "Most points scored", episodes: castawayDetails.bestWeeks, kind: "episode" },
          { label: "Least points scored", episodes: castawayDetails.worstWeeks, kind: "episode" },
          { label: "Times picked", kind: "popularity" },
          { label: "Most picked by", members: castawayDetails.mostPickedBy, count: castawayDetails.mostPickedBy[0]?.Count, kind: "members" },
          { label: "Least picked by", members: leastPickedBy, count: leastPickCount, kind: "members" },
        ].map((metric) => <div className="mobile-member-highlight" key={metric.label}>
          <strong>{metric.label}</strong>
          <div className="mobile-member-highlight-values">{metric.kind === "episode" ? metric.episodes.length ? metric.episodes.map((week) => <span className="mobile-member-highlight-item" key={week.Episode}><Points value={week.Points} highlightPositive={metric.label === "Most points scored"} /><span className="muted">(Episode {episodeNumber(week.Episode)})</span></span>) : <span className="muted">—</span> : metric.kind === "popularity" ? <span className="mobile-member-highlight-item"><strong>{castawayDetails.totalPicks} picks</strong><span className="muted">(Rank #{castawayDetails.popularityRank} of {castawayDetails.castawayCount})</span></span> : metric.members.length ? <><span className="mobile-member-highlight-item">{metric.members.map((member) => <MemberTag key={member.Username} username={member.Username} hue={memberHues.get(member.Username)} />)}</span><span className="muted">{metric.count} {metric.count === 1 ? "time" : "times"}</span></> : <span className="muted">—</span>}</div>
        </div>)}
      </section>
      <section className="mobile-member-episodes">
        <h2>Episode Scores</h2>
        <div className="mobile-card-list">{castawayDetails.episodes.map((row) => <details className="mobile-card mobile-weekly-expander mobile-member-episode-row" key={row.Episode} open={openCastawayEpisode === row.Episode} onToggle={(event) => {
          if (event.currentTarget.open) setOpenCastawayEpisode(row.Episode);
          else if (openCastawayEpisode === row.Episode) setOpenCastawayEpisode("");
        }}>
          <summary className="mobile-weekly-summary mobile-member-episode-summary">
            <strong>Episode {episodeNumber(row.Episode)}</strong>
            <span className="mobile-castaway-episode-picked-count">{row.Members.length ? `Picked by ${row.Members.length} ${row.Members.length === 1 ? "player" : "players"}` : "Not picked"}</span>
            <strong className="mobile-weekly-score"><Points value={row.Points} highlightPositive /><span className="mobile-expand-control" aria-hidden="true"><span className="mobile-expand-open"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span><span className="mobile-expand-close"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></span></span></strong>
          </summary>
          <div className="mobile-weekly-breakdown">
            <h2>How they scored</h2>
            {row.Rules.length ? <ul className="mobile-scoring-rules">{row.Rules.slice().sort((left, right) => right.Point - left.Point || left.Rule.localeCompare(right.Rule)).map((rule) => <li key={rule.Rule}><span>{rule.Rule}{rule.Count > 1 ? ` ×${rule.Count}` : ""}</span><Points value={rule.Point} highlightPositive /></li>)}</ul> : <p className="muted">No scoring details for this episode.</p>}
            <div className="mobile-picked-by"><span className="muted">Picked by ({row.Members.length})</span><div className="mobile-chip-list">{row.Members.length ? row.Members.map((username) => <MemberTag key={username} username={username} hue={memberHues.get(username)} />) : <span className="muted">No picks</span>}</div></div>
          </div>
        </details>)}</div>
      </section>
    </>}
  </section>;
  }
  return <section className="mobile-page"><h1>{pageTitle}</h1></section>;
}
function RuleBreakdown({ details, showCount }) {
  if (!details.length)
    return <span className="muted">No scoring details are available.</span>;
  const sorted = showCount
    ? [...details].sort((a, b) => b.Point - a.Point)
    : details;
  return showCount ? (
    <table className="score-details-table">
      <thead>
        <tr>
          <th>Rule</th>
          <th>Times</th>
          <th>Total points</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((detail, index) => (
          <tr key={`${detail.Rule}-${index}`}>
            <td>{detail.Rule}</td>
            <td>{detail.Count}</td>
            <td>
              <Points value={detail.Point} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <ul className="score-details-list">
      {sorted.map((detail, index) => (
        <li key={`${detail.Rule}-${index}`}>
          <span>{detail.Rule}</span>
          <Points value={detail.Point} />
        </li>
      ))}
    </ul>
  );
}
function MemberBreakdown({ details, memberHues, seasonTotal }) {
  if (!details.length)
    return <span className="muted">No members picked this contestant.</span>;
  const sorted = [...details].sort((a, b) =>
    seasonTotal
      ? b.Count - a.Count || a.Member.localeCompare(b.Member)
      : a.Member.localeCompare(b.Member),
  );
  const memberTag = (member) => (
    <MemberTag username={member} hue={memberHues.get(member)} />
  );
  return seasonTotal ? (
    <table className="score-details-table">
      <thead>
        <tr>
          <th>Member</th>
          <th>Times picked</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((detail) => (
          <tr key={detail.Member}>
            <td>{memberTag(detail.Member)}</td>
            <td>{detail.Count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <ul className="score-details-list score-member-list">
      {sorted.map((detail) => (
        <li key={detail.Member}>{memberTag(detail.Member)}</li>
      ))}
    </ul>
  );
}
function PickedCastawayBreakdown({
  details,
  seasonTotal,
  showCount,
  countLabel,
  castawayInfo,
}) {
  if (!details.length)
    return <span className="muted">No picked castaways.</span>;
  const sorted = [...details].sort(
    (a, b) =>
      (b.Point ?? Number.NEGATIVE_INFINITY) -
        (a.Point ?? Number.NEGATIVE_INFINITY) ||
      a.Player.localeCompare(b.Player),
  );
  return (
    <table className="score-details-table">
      <thead>
        <tr>
          <th>Castaway</th>
          {castawayInfo && <th>Tribe</th>}
          <th>{seasonTotal ? "Total points" : "Points"}</th>
          {showCount && <th>{countLabel}</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((detail) => (
          <tr key={detail.Player}>
            <td>
              <CastawayIdentity
                name={detail.Player}
                eliminated={castawayInfo?.get(detail.Player)?.Eliminated}
              />
            </td>
            {castawayInfo && (
              <td>
                <span
                  className={`tribe ${castawayInfo.get(detail.Player)?.Tribe?.toLowerCase() ?? ""}`}
                >
                  {castawayInfo.get(detail.Player)?.Tribe || "—"}
                </span>
              </td>
            )}
            <td>
              <Points value={detail.Point} />
            </td>
            {showCount && <td>{detail.Count}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function ScoreDetailsWidget({
  player,
  episode,
  score,
  secondaryScore,
  details,
  ruleGroups = [],
  memberGroups = [],
  secondaryDetails = [],
  memberHues,
  castawayInfo,
  detailsMode = "rules",
  onScoreClick,
  showChevron = true,
  seasonTotal = false,
  highlightPositive = false,
  showCount = false,
  detailsIdSuffix = "",
  summaryLabel,
  castawayCountLabel = "Times picked",
}) {
  const widgetRef = useRef(null);
  const popoverRef = useRef(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const memberMode = detailsMode === "members";
  const bothMode = detailsMode === "both";
  const pickedCastawayMode = detailsMode === "picked-castaways"; 
  const shouldRenderWidget = !(
    score === undefined &&
    !onScoreClick &&
    (!bothMode || secondaryScore === undefined)
  );
  const countClass = (count, highlightPositive = false) =>
    `score-count ${count === 0 ? "negative" : seasonTotal || highlightPositive ? "positive" : ""}`;
  const detailsId = `score-details-${episodeNumber(episode)}-${player.replace(/\W/g, "-")}${detailsIdSuffix ? `-${detailsIdSuffix}` : ""}`;
  const pickScore = memberMode ? score : secondaryScore;
  function closeUnlessPointerStaysInside(event) {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget &&
      (widgetRef.current?.contains(nextTarget) ||
        popoverRef.current?.contains(nextTarget))
    )
      return;
    setPopoverOpen(false);
  }
  useLayoutEffect(() => {
    if (!popoverOpen || !shouldRenderWidget) {
      setPopoverPosition(null);
      return;
    }
    const trigger = widgetRef.current?.querySelector(".score-details-trigger");
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const spaceAbove = triggerRect.top - 12;
    const spaceBelow = window.innerHeight - triggerRect.bottom - 12;
    const fitsAbove = popoverRect.height <= spaceAbove;
    const fitsBelow = popoverRect.height <= spaceBelow;
    const placeAbove =
      (fitsAbove && !fitsBelow) ||
      (!fitsBelow &&
        !fitsAbove &&
        spaceAbove > spaceBelow &&
        triggerRect.top - popoverRect.height >= 12);
    const top = placeAbove
      ? triggerRect.top - popoverRect.height
      : triggerRect.bottom;
    const maxLeft = Math.max(12, window.innerWidth - popoverRect.width - 12);
    const left = Math.max(12, Math.min(triggerRect.left, maxLeft));
    setPopoverPosition({
      top: window.scrollY + top,
      left: window.scrollX + left,
    });
  }, [
    popoverOpen,
    player,
    episode,
    score,
    secondaryScore,
    shouldRenderWidget,
    details.length,
    secondaryDetails.length,
  ]);
  if (!shouldRenderWidget)
    return <Points value={score} seasonTotal={seasonTotal} />;
  return (
    <div
      ref={widgetRef}
      className={`score-details-widget ${bothMode ? "both-metric-widget" : ""}`}
      onPointerEnter={() => setPopoverOpen(true)}
      onPointerLeave={closeUnlessPointerStaysInside}
      onFocusCapture={() => setPopoverOpen(true)}
      onBlurCapture={closeUnlessPointerStaysInside}
    >
      <div
        className="score-details-trigger"
        tabIndex={onScoreClick ? undefined : 0}
        role="group"
        aria-label={`${player}: ${memberMode ? `${score} picks` : `${score} points${bothMode ? ` and ${secondaryScore} picks` : ""}`}. Hover or focus to see details.`}
        aria-describedby={detailsId}
      >
        {onScoreClick ? (
          <button
            className="score-link"
            aria-label={`View ${player} score for ${episode}`}
            onClick={onScoreClick}
          >
            <Points value={score} seasonTotal={seasonTotal} highlightPositive={highlightPositive} />
          </button>
        ) : memberMode ? (
          <span className={countClass(score)}>{score}</span>
        ) : (
          <Points value={score} seasonTotal={seasonTotal} highlightPositive={highlightPositive} />
        )}
        {bothMode && (
          <>
            <span className="metric-divider" aria-hidden="true">
              │
            </span>
            <span className={countClass(secondaryScore)}>{secondaryScore}</span>
          </>
        )}
        {showChevron && (
          <span className="score-details-chevron" aria-hidden="true">
            ▾
          </span>
        )}
      </div>
      {popoverOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="score-details-popover"
            id={detailsId}
            role="tooltip"
            style={
              popoverPosition
                ? { top: popoverPosition.top, left: popoverPosition.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
            onPointerEnter={() => setPopoverOpen(true)}
            onPointerLeave={closeUnlessPointerStaysInside}
          >
        <div className="score-details-heading">
          <strong>{player}</strong>
          <span className="muted">
            {summaryLabel ? (
              <>{summaryLabel}: <Points value={score} highlightPositive /></>
            ) : seasonTotal ? (
              memberMode ? (
                <>Season Picks: <span className={countClass(score, true)}>{score}</span></>
              ) : bothMode ? (
                <>Season Points: <Points value={score} seasonTotal /> <span className="metric-divider">│</span> Picks: <span className={countClass(secondaryScore, true)}>{secondaryScore}</span></>
              ) : (
                <>Season Points: <Points value={score} seasonTotal /></>
              )
            ) : memberMode ? (
              <>Episode {episodeNumber(episode)} Picks: <span className={countClass(score, true)}>{score}</span></>
            ) : bothMode ? (
              <>Episode {episodeNumber(episode)} Points: <Points value={score} highlightPositive /> <span className="metric-divider">│</span> Picks: <span className={countClass(secondaryScore, true)}>{secondaryScore}</span></>
            ) : (
              <>Episode {episodeNumber(episode)} Points: <Points value={score} highlightPositive /></>
            )}
          </span>
        </div>
        {pickedCastawayMode ? (
          <PickedCastawayBreakdown
            details={details}
            seasonTotal={seasonTotal}
            showCount={seasonTotal || showCount}
            countLabel={castawayCountLabel}
            castawayInfo={castawayInfo}
          />
        ) : bothMode ? (
          <div className="score-details-sections">
            <div className="score-details-section">
              <h3>Scoring rules</h3>
              <RuleBreakdown details={details} showCount={showCount} />
            </div>
            <div className="score-details-section">
              <h3>Picked by</h3>
              <MemberBreakdown
                details={secondaryDetails}
                memberHues={memberHues}
                seasonTotal={seasonTotal}
              />
            </div>
          </div>
        ) : memberMode ? (
          memberGroups.length ? (
            <div className="score-rule-groups">
              {memberGroups.map((group) => (
                <div key={group.Player}>
                  <div className="score-rule-group-heading">
                    <CastawayIdentity name={group.Player} eliminated={castawayInfo?.get(group.Player)?.Eliminated} />
                    <span className="score-count">{group.Count}</span>
                  </div>
                  <MemberBreakdown details={group.Details} memberHues={memberHues} seasonTotal={seasonTotal} />
                </div>
              ))}
            </div>
          ) : (
          <MemberBreakdown
            details={details}
            memberHues={memberHues}
            seasonTotal={seasonTotal}
          />
          )
        ) : ruleGroups.length ? (
          <div className="score-rule-groups">
            {ruleGroups.map((group) => (
              <div key={JSON.stringify([group.Player, group.Episode])}>
                <div className="score-rule-group-heading">
                  <CastawayIdentity name={group.Player} eliminated={castawayInfo?.get(group.Player)?.Eliminated} />
                  {group.Episode && <span className="muted">Episode {episodeNumber(group.Episode)}</span>}
                  <Points value={group.Point} seasonTotal />
                </div>
                <RuleBreakdown details={group.Details} showCount={showCount} />
              </div>
            ))}
          </div>
        ) : (
          <RuleBreakdown details={details} showCount={showCount} />
        )}
          </div>,
          document.body,
        )}
    </div>
  );
}
function RulesDialog({ rules, onClose }) {
  const dialog = useRef(null),
    [query, setQuery] = useState("");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="rules-title">
      <div className="dialog-heading">
        <h2 id="rules-title">Scoring rules</h2>
        <button aria-label="Close rules" onClick={() => dialog.current.close()}>
          ✕
        </button>
      </div>
      <input
        aria-label="Search rules"
        placeholder="Search rules…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="dialog-body">
        <Table
          rows={rules.filter((r) =>
            Object.values(r)
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase()),
          )}
          columns={[
            { key: "Category" },
            { key: "Subcategory" },
            { key: "Rule" },
            {
              key: "Point",
              label: "Points",
              numeric: true,
              render: (r) => <Points value={r.Point} />,
            },
          ]}
        />
      </div>
    </dialog>
  );
}
function App() {
  const [viewState, setViewState] = useState(() => readViewState(new URL(window.location.href)));
  const [mobileView, setMobileView] = useState(() => {
    const saved = localStorage.getItem("survivor-display-mode");
    return saved ? saved === "mobile" : window.matchMedia("(max-width: 700px)").matches;
  });
  function chooseDisplayMode(mode) {
    const isMobile = mode === "mobile";
    setMobileView(isMobile);
    localStorage.setItem("survivor-display-mode", isMobile ? "mobile" : "web");
  }
  const replaceUrl = useRef(true);
  const {
    page, memberUsername, castawayName, week, weeklyView, selectedWeeklyMembers, scoringView,
    selectedScoringEpisodes, selectedScoringCastaways, selectedScoringMembers,
    selectedScoringSubcategories, search, contestantMetric,
    selectedPickerMembers, selectedContestants, analyticsPlayers, analyticsEpisode,
  } = viewState;
  const setViewField = (key) => (value) =>
    setViewState((previous) => ({ ...previous, [key]: value }));
  const setPage = setViewField("page"),
    setWeek = setViewField("week"),
    setWeeklyView = setViewField("weeklyView"),
    setSelectedWeeklyMembers = setViewField("selectedWeeklyMembers"),
    setScoringView = setViewField("scoringView"),
    setSelectedScoringEpisodes = setViewField("selectedScoringEpisodes"),
    setSelectedScoringCastaways = setViewField("selectedScoringCastaways"),
    setSelectedScoringMembers = setViewField("selectedScoringMembers"),
    setSelectedScoringSubcategories = setViewField("selectedScoringSubcategories"),
    setSearch = setViewField("search"),
    setContestantMetric = setViewField("contestantMetric"),
    setSelectedPickerMembers = setViewField("selectedPickerMembers"),
    setSelectedContestants = setViewField("selectedContestants"),
    setAnalyticsPlayers = setViewField("analyticsPlayers"),
    setAnalyticsEpisode = setViewField("analyticsEpisode");
  useEffect(() => {
    const restoreView = () => {
      replaceUrl.current = true;
      setViewState(readViewState(new URL(window.location.href)));
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);
  useEffect(() => {
    const url = createBrowserViewUrl(viewState, new URL(window.location.href));
    const method = replaceUrl.current ? "replaceState" : "pushState";
    replaceUrl.current = false;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history[method](null, "", url);
    }
  }, [viewState]);
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const busy = useRef(false);
  const memberReturnView = useRef(null);
  const castawayReturnView = useRef(null);
  function openCastaway(name) {
    if (page === "Castaway" && castawayName === name) return;
    castawayReturnView.current = viewState;
    setViewState((previous) => ({ ...previous, page: "Castaway", castawayName: name }));
    window.scrollTo({ top: 0 });
  }
  function closeCastaway() {
    if (castawayReturnView.current) {
      window.history.back();
    } else {
      setViewState((previous) => ({ ...previous, page: "Castaways", castawayName: "" }));
    }
  }
  function openMember(username) {
    if (page !== "Member") memberReturnView.current = viewState;
    setViewState((previous) => ({ ...previous, page: "Member", memberUsername: username }));
    window.scrollTo({ top: 0 });
  }
  function closeMember() {
    if (memberReturnView.current) {
      window.history.back();
    } else {
      setViewState((previous) => ({ ...previous, page: "Scoreboard", memberUsername: "" }));
    }
  }
  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      setData(await loadData());
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const episodes = data ? episodesFrom(data) : [];
  const currentWeek = episodes.includes(week) ? week : episodes.at(-1);
  const currentWeekLabel = currentWeek
    ? `Episode ${episodeNumber(currentWeek)}`
    : "";
  const weekIndex = episodes.indexOf(currentWeek);
  const weeklyEpisodesToShow =
    weeklyView === "all" ? episodes : currentWeek ? [currentWeek] : [];
  const members = data
    ? [...data.scoreboard].sort((a, b) => a.Rank - b.Rank)
    : [];
  const memberDisplayNames = new Map(
    (data?.members ?? []).map((row) => [row.Username, row.Name]),
  );
  const lastRank = members.reduce(
    (highest, player) => Math.max(highest, player.Rank),
    0,
  );
  const memberHues = new Map(
    [...members]
      .sort((a, b) => a.Username.localeCompare(b.Username))
      .map((r, index) => [r.Username, Math.round((index * 360) / members.length)]),
  );
  const scoreboardEpisodes = Array.from({ length: 13 }, (_, index) =>
    episodes.find((ep) => episodeNumber(ep) === index + 1) ||
    `Episode ${index + 1}`,
  );
  const scoreFor = (name, ep) =>
    data.episodeScores.find((r) => r.Player === name && r.Episode === ep)?.[
      "Total Score"
    ];
  const memberPickBreakdowns = new Map();
  if (data) {
    for (const pick of data.userPicks) {
      let breakdown = memberPickBreakdowns.get(pick.User);
      if (!breakdown) {
        breakdown = { episodes: new Map(), season: new Map() };
        memberPickBreakdowns.set(pick.User, breakdown);
      }
      let episodeCastaways = breakdown.episodes.get(pick.Episode);
      if (!episodeCastaways) {
        episodeCastaways = new Map();
        breakdown.episodes.set(pick.Episode, episodeCastaways);
      }
      if (episodeCastaways.has(pick.Contestant)) continue;
      const points = scoreFor(pick.Contestant, pick.Episode);
      episodeCastaways.set(pick.Contestant, {
        Player: pick.Contestant,
        Point: points,
        Count: 1,
      });
      let seasonCastaway = breakdown.season.get(pick.Contestant);
      if (!seasonCastaway) {
        seasonCastaway = {
          Player: pick.Contestant,
          Point: 0,
          Count: 0,
          HasPoints: false,
        };
        breakdown.season.set(pick.Contestant, seasonCastaway);
      }
      if (points !== undefined) {
        seasonCastaway.Point += points;
        seasonCastaway.HasPoints = true;
      }
      seasonCastaway.Count += 1;
    }
  }
  const contestantPickStats = new Map();
  if (data) {
    for (const pick of data.userPicks) {
      let stats = contestantPickStats.get(pick.Contestant);
      if (!stats) {
        stats = { total: 0, members: new Map(), episodes: new Map() };
        contestantPickStats.set(pick.Contestant, stats);
      }
      const episodeKey = episodeNumber(pick.Episode);
      let episodeMembers = stats.episodes.get(episodeKey);
      if (!episodeMembers) {
        episodeMembers = new Map();
        stats.episodes.set(episodeKey, episodeMembers);
      }
      if (!episodeMembers.has(pick.User)) {
        episodeMembers.set(pick.User, 1);
        stats.total += 1;
        stats.members.set(pick.User, (stats.members.get(pick.User) || 0) + 1);
      }
    }
  }
  const memberFilterActive =
    selectedPickerMembers.length > 0 &&
    selectedPickerMembers.length < members.length;
  const includeMember = (user) =>
    !memberFilterActive || selectedPickerMembers.includes(user);
  const episodeColumns = scoreboardEpisodes.map((ep, index) => {
    const publishedEpisode = episodes.find(
      (episode) => episodeNumber(episode) === index + 1,
    );
    return {
      key: ep,
      label: `Ep ${index + 1}`,
      numeric: true,
      className: "episode-column",
      render: (r) => {
        const episodeStats = r.EpisodeStats[ep];
        const memberDetails = episodeStats.Members;
        if (contestantMetric === "pickers") {
          return (
            <div className="picker-tags">
              {memberDetails.length ? (
                memberDetails.map(({ Member }) => (
                  <MemberTag key={Member} username={Member} hue={memberHues.get(Member)} />
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          );
        }
        const memberMode = contestantMetric === "picks";
        const bothMode = contestantMetric === "both";
        const scoreWidget = (
          <ScoreDetailsWidget
            player={r.Name}
            episode={publishedEpisode || ep}
            score={memberMode ? episodeStats.PickCount : episodeStats.Points}
            secondaryScore={bothMode ? episodeStats.PickCount : undefined}
            details={
              memberMode
                ? memberDetails
                : publishedEpisode
                  ? data.episodeRules.filter(
                      (rule) =>
                        rule.Player === r.Name &&
                        rule.Episode === publishedEpisode,
                    )
                  : []
            }
            secondaryDetails={bothMode ? memberDetails : []}
            memberHues={memberHues}
            detailsMode={
              memberMode ? "members" : bothMode ? "both" : "rules"
            }
            showChevron={false}
          />
        );
        if (contestantMetric !== "points" || episodeStats.Points === undefined)
          return scoreWidget;
        const extremes = castawayEpisodeExtremes.get(ep);
        return (
          <div className="scoreboard-score-cell">
            <span className="score-extreme-indicators">
              {extremes && episodeStats.Points === extremes.highest && (
                <span
                  className="score-extreme-dot score-extreme-high"
                  title={`Green means most points in Episode ${index + 1}`}
                  aria-label={`Most points in Episode ${index + 1}`}
                />
              )}
              {extremes && episodeStats.Points === extremes.lowest && (
                <span
                  className="score-extreme-dot score-extreme-low"
                  title={`Red means least points in Episode ${index + 1}`}
                  aria-label={`Least points in Episode ${index + 1}`}
                />
              )}
            </span>
            {scoreWidget}
          </div>
        );
      },
    };
  });
  function navigate(next) {
    setPage(next);
    setSearch("");
  }
  const matches = (r) =>
    Object.values(r).join(" ").toLowerCase().includes(search.toLowerCase());
  const scoringSubcategories = [
    ...new Set((data?.rules ?? []).map((rule) => rule.Subcategory).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const scoringEpisodeFilterActive =
    selectedScoringEpisodes.length > 0 &&
    selectedScoringEpisodes.length < episodes.length;
  const scoringCastawayFilterActive =
    data &&
    selectedScoringCastaways.length > 0 &&
    selectedScoringCastaways.length < data.contestants.length;
  const scoringMemberFilterActive =
    selectedScoringMembers.length > 0 &&
    selectedScoringMembers.length < members.length;
  const scoringSubcategoryFilterActive =
    selectedScoringSubcategories.length > 0 &&
    selectedScoringSubcategories.length < scoringSubcategories.length;
  const scoringSubcategoryByRule = new Map(
    (data?.rules ?? []).map((rule) => [rule.Rule, rule.Subcategory]),
  );
  const scoringEvents = data
    ? data.episodeRules.filter(
        (row) =>
          (!scoringEpisodeFilterActive ||
            selectedScoringEpisodes.includes(row.Episode)) &&
          (!scoringCastawayFilterActive ||
            selectedScoringCastaways.includes(row.Player)) &&
          (!scoringMemberFilterActive ||
            selectedScoringMembers.some((user) =>
              memberPickBreakdowns
                .get(user)
                ?.episodes.get(row.Episode)
                ?.has(row.Player),
            )) &&
          (!scoringSubcategoryFilterActive ||
            selectedScoringSubcategories.includes(
              scoringSubcategoryByRule.get(row.Rule),
            )) &&
          (scoringView === "rules"
            ? row.Rule.toLowerCase().includes(search.toLowerCase())
            : matches(row) ||
              (scoringSubcategoryByRule.get(row.Rule) ?? "")
                .toLowerCase()
                .includes(search.toLowerCase())),
      )
        .map((row) => ({
          ...row,
          Subcategory: scoringSubcategoryByRule.get(row.Rule) ?? "",
        }))
    : [];
  const scoringCastawayDetails = (events) => {
    const castawayTotals = new Map();
    for (const event of events) {
      let total = castawayTotals.get(event.Player);
      if (!total) {
        total = { Player: event.Player, Point: 0, Count: 0 };
        castawayTotals.set(event.Player, total);
      }
      total.Point += event.Point;
      total.Count += 1;
    }
    return [...castawayTotals.values()];
  };
  const scoringSubcategoryHues = new Map(
    scoringSubcategories.map((subcategory, index) => [
      subcategory,
      Math.round((index * 360) / scoringSubcategories.length),
    ]),
  );
  const scoringRuleRows = data
    ? data.rules
        .filter((rule) =>
          (!scoringSubcategoryFilterActive ||
            selectedScoringSubcategories.includes(rule.Subcategory)) &&
          rule.Rule.toLowerCase().includes(search.toLowerCase()),
        )
        .map((rule) => {
          const matchingEvents = scoringEvents.filter(
            (event) => event.Rule === rule.Rule,
          );
          const seasonDetails = scoringCastawayDetails(matchingEvents);
          const episodeDetails = Object.fromEntries(
            scoreboardEpisodes.map((episode) => [
              episode,
              scoringCastawayDetails(
                matchingEvents.filter(
                  (event) =>
                    episodeNumber(event.Episode) === episodeNumber(episode),
                ),
              ),
            ]),
          );
          const episodeTotals = Object.fromEntries(
            scoreboardEpisodes.map((episode) => {
              const details = episodeDetails[episode];
              return [
                episode,
                details.length
                  ? details.reduce((sum, detail) => sum + detail.Point, 0)
                  : undefined,
              ];
            }),
          );
          return {
            ...rule,
            ...episodeTotals,
            Total: seasonDetails.length
              ? seasonDetails.reduce((sum, detail) => sum + detail.Point, 0)
              : undefined,
            SeasonDetails: seasonDetails,
            EpisodeDetails: episodeDetails,
          };
        })
    : [];
  const scoreboard = data
    ? members.map((r) => {
        const pickBreakdown = memberPickBreakdowns.get(r.Username);
        return {
          ...r,
          MemberName: memberDisplayNames.get(r.Username) ?? "",
          PickedEpisodeDetails: Object.fromEntries(
            scoreboardEpisodes.map((ep) => [
              ep,
              [...(pickBreakdown?.episodes.get(ep)?.values() ?? [])],
            ]),
          ),
          PickedSeasonDetails: [
            ...(pickBreakdown?.season.values() ?? []),
          ].map(({ HasPoints, ...detail }) => ({
            ...detail,
            Point: HasPoints ? detail.Point : undefined,
          })),
          ...Object.fromEntries(
          scoreboardEpisodes.map((ep) => [
            ep,
            data.userScores.find(
              (s) =>
                s.User === r.Username &&
                episodeNumber(s.Episode) === episodeNumber(ep),
            )?.Points,
          ]),
          ),
        };
      })
    : [];
  const scoreboardEpisodeExtremes = new Map(
    scoreboardEpisodes.map((episode) => {
      const scores = scoreboard
        .map((row) => row[episode])
        .filter((score) => Number.isFinite(score));
      return [
        episode,
        scores.length
          ? {
              highest: Math.max(...scores),
              lowest: Math.min(...scores),
            }
          : null,
      ];
    }),
  );
  const ruleTotalsByContestant = new Map();
  if (data) {
    for (const rule of data.episodeRules) {
      let contestantRules = ruleTotalsByContestant.get(rule.Player);
      if (!contestantRules) {
        contestantRules = new Map();
        ruleTotalsByContestant.set(rule.Player, contestantRules);
      }
      let ruleTotal = contestantRules.get(rule.Rule);
      if (!ruleTotal) {
        ruleTotal = { Rule: rule.Rule, Point: 0, Count: 0 };
        contestantRules.set(rule.Rule, ruleTotal);
      }
      ruleTotal.Point += rule.Point;
      ruleTotal.Count += 1;
    }
  }
  const contestants = data
    ? data.contestants.map((r) => {
        const pickStats = contestantPickStats.get(r.Name);
        const episodeStats = Object.fromEntries(
          scoreboardEpisodes.map((ep, index) => {
            const publishedEpisode = episodes.find(
              (episode) => episodeNumber(episode) === index + 1,
            );
            const memberDetails = [
              ...(pickStats?.episodes.get(index + 1) ?? new Map()),
            ]
              .filter(([user]) => includeMember(user))
              .map(([Member, Count]) => ({ Member, Count }));
            const hasSelectedPick = memberDetails.length > 0;
            const episodePoints = data.episodeScores.find(
              (score) =>
                score.Player === r.Name &&
                episodeNumber(score.Episode) === index + 1,
            )?.["Total Score"];
            return [
              ep,
              {
                Points:
                  memberFilterActive && !hasSelectedPick
                    ? undefined
                    : episodePoints,
                PickCount:
                  !publishedEpisode || (memberFilterActive && !hasSelectedPick)
                    ? undefined
                    : memberDetails.length,
                Members: memberDetails,
              },
            ];
          }),
        );
        const selectedMembers = [
          ...(pickStats?.members ?? new Map()),
        ].filter(([user]) => includeMember(user));
        const selectedPickTotal = selectedMembers.reduce(
          (sum, [, count]) => sum + count,
          0,
        );
        const selectedEpisodeScores = Object.values(episodeStats)
          .map((stats) => stats.Points)
          .filter((value) => value !== undefined);
        const totalPoints = memberFilterActive
          ? selectedEpisodeScores.length
            ? selectedEpisodeScores.reduce((sum, value) => sum + value, 0)
            : undefined
          : data.episodeScores
              .filter((score) => score.Player === r.Name)
              .reduce((sum, score) => sum + score["Total Score"], 0);
        const totalPicks =
          memberFilterActive && selectedPickTotal === 0
            ? undefined
            : selectedPickTotal;
        return {
          ...r,
          EpisodeStats: episodeStats,
          ...Object.fromEntries(
            Object.entries(episodeStats).map(([ep, stats]) => [
              ep,
              stats.Points,
            ]),
          ),
          RuleTotals: [...(ruleTotalsByContestant.get(r.Name)?.values() ?? [])],
          MemberTotals: selectedMembers.map(([Member, Count]) => ({
            Member,
            Count,
          })),
          PointTotal: totalPoints,
          PickTotal: totalPicks,
          Total: contestantMetric === "picks" ? totalPicks : totalPoints,
        };
      })
    : [];
  const eliminationEpisodes = new Map();
  if (data) {
    for (const rule of data.episodeRules) {
      if (
        rule.Point !== -8 ||
        rule.Rule.trim().toLowerCase() !== "castaway gets eliminated"
      )
        continue;
      const previousEpisode = eliminationEpisodes.get(rule.Player);
      if (
        !previousEpisode ||
        episodeNumber(rule.Episode) < episodeNumber(previousEpisode)
      ) {
        eliminationEpisodes.set(rule.Player, rule.Episode);
      }
    }
  }
  const castawayInfo = new Map(
    (data?.contestants ?? []).map((castaway) => [
      castaway.Name,
      {
        Tribe: castaway.Tribe,
        Eliminated: eliminationEpisodes.has(castaway.Name),
      },
    ]),
  );
  const visibleCastaways = rankCastaways(contestants).filter(
    (castaway) =>
      !selectedContestants.length ||
      selectedContestants.length === data.contestants.length ||
      selectedContestants.includes(castaway.Name),
  );
  const castawayEpisodeExtremes = new Map(
    scoreboardEpisodes.map((episode) => {
      const scores = visibleCastaways
        .map((castaway) => castaway.EpisodeStats[episode].Points)
        .filter(Number.isFinite);
      return [
        episode,
        scores.length
          ? { highest: Math.max(...scores), lowest: Math.min(...scores) }
          : null,
      ];
    }),
  );
  const activeCastawayNames = data
    ? data.contestants
        .filter((castaway) => !eliminationEpisodes.has(castaway.Name))
        .map((castaway) => castaway.Name)
    : [];
  const eliminatedCastawayNames = data
    ? data.contestants
        .filter((castaway) => eliminationEpisodes.has(castaway.Name))
        .map((castaway) => castaway.Name)
    : [];
  const weekly = data
    ? data.contestants
        .flatMap((contestant) =>
          weeklyEpisodesToShow
            .map((episode) => {
              const users = [
                ...new Set(
                  data.userPicks
                    .filter(
                      (pick) =>
                        pick.Episode === episode &&
                        pick.Contestant === contestant.Name,
                    )
                    .map((pick) => pick.User),
                ),
              ];
              return {
                ...contestant,
                Episode: episode,
                Score: scoreFor(contestant.Name, episode),
                Users: users,
                Eliminated: eliminationEpisodes.get(contestant.Name) === episode,
              };
            })
            .filter((row) => {
              const eliminationEpisode = eliminationEpisodes.get(row.Name);
              return (
                (!eliminationEpisode ||
                  episodeNumber(eliminationEpisode) >= episodeNumber(row.Episode)) &&
                (!selectedWeeklyMembers.length ||
                  selectedWeeklyMembers.length === members.length ||
                  selectedWeeklyMembers.some((user) => row.Users.includes(user)))
              );
            }),
        )
    : [];
  const memberProfile = data?.scoreboard.find((row) => row.Username === memberUsername);
  const memberExists = data && (memberProfile || data.members.some((row) => row.Username === memberUsername) || data.userPicks.some((row) => row.User === memberUsername) || data.userScores.some((row) => row.User === memberUsername));
  const memberDetails = page === "Member" && memberExists ? buildMemberDetails(data, memberUsername) : null;
  const castawayDetails = page === "Castaway" && data ? buildCastawayDetails(data, castawayName) : null;
  const analytics = page === "Analytics" && data ? buildAnalytics(data, {
    activeOnly: analyticsPlayers === "active",
  }) : null;
  const memberRuleDetails = (episode, player) => {
    const totals = new Map();
    for (const event of memberDetails?.events ?? []) {
      if ((episode && event.Episode !== episode) || (player && event.Player !== player)) continue;
      const total = totals.get(event.Rule) ?? { Rule: event.Rule, Count: 0, Point: 0 };
      total.Count += 1;
      total.Point += event.Point;
      totals.set(event.Rule, total);
    }
    return [...totals.values()];
  };
  return (
    <MemberNavigationContext.Provider value={{ open: openMember, openCastaway }}>
    <div className={mobileView ? "app mobile-view" : "app"}>
      <header>
        <div className="brand">
          <img className="brand-logo" src={survivorLogo} alt="Survivor logo" />
          <div>
            <strong>Hoyle Survivor 51</strong>
            <span className="league-note">
              Bracketology Surivor Fantasy · {data ? `${members.length} members` : "Loading"}
            </span>
          </div>
        </div>
        <div className="display-mode-toggle" role="group" aria-label="Display mode">
          <button type="button" className={!mobileView ? "active" : ""} aria-pressed={!mobileView} onClick={() => chooseDisplayMode("web")}>Web</button>
          <button type="button" className={mobileView ? "active" : ""} aria-pressed={mobileView} onClick={() => chooseDisplayMode("mobile")}>Mobile</button>
        </div>
      </header>
      {!mobileView && page !== "Member" && page !== "Castaway" && <nav aria-label="Main navigation">
        {pages.map((p) => (
          <button
            key={p}
            aria-current={page === p ? "page" : undefined}
            className={page === p ? "active" : ""}
            onClick={() => navigate(p)}
          >
            {p}
          </button>
        ))}
      </nav>}
      {mobileView && <MobileNavigation page={page} onNavigate={navigate} />}
      {error && (
        <div className="error" role="alert">
          {error} {data && "Previous data is still shown."}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {!data ? (
        <p className="empty">
          {loading
            ? "Loading league data…"
            : "Unable to load data."}
        </p>
      ) : (
        <main>
          {mobileView && <MobileDashboard
            page={page}
            data={data}
            episodes={episodes}
            members={members}
            scoreboard={scoreboard}
            visibleCastaways={visibleCastaways}
            currentWeek={currentWeek}
            weekIndex={weekIndex}
            memberHues={memberHues}
            memberDisplayNames={memberDisplayNames}
            castawayInfo={castawayInfo}
            eliminationEpisodes={eliminationEpisodes}
            memberDetails={memberDetails}
            memberProfile={memberProfile}
            memberUsername={memberUsername}
            castawayName={castawayName}
            castawayDetails={castawayDetails}
            analytics={analytics}
            analyticsPlayers={analyticsPlayers}
            setAnalyticsPlayers={setAnalyticsPlayers}
            analyticsEpisode={analyticsEpisode}
            setAnalyticsEpisode={setAnalyticsEpisode}
            setWeek={setWeek}
            contestantMetric={contestantMetric}
            setContestantMetric={setContestantMetric}
            scoringView={scoringView}
            setScoringView={setScoringView}
            search={search}
            setSearch={setSearch}
            scoringRuleRows={scoringRuleRows}
            scoringEvents={scoringEvents}
            scoringCastawayDetails={scoringCastawayDetails}
            closeMember={closeMember}
            closeCastaway={closeCastaway}
          />}
          {!mobileView && page === "Castaway" && (
            <div className="member-page castaway-page">
              <div className="member-page-heading">
                <button type="button" className="member-back-button" onClick={closeCastaway} aria-label="Back to previous view" title="Back to previous view"><span aria-hidden="true">←</span> Back</button>
                <div className="member-page-identity">
                  <h1><CastawayIdentity name={castawayName} eliminated={eliminationEpisodes.has(castawayName)} linked={false} /></h1>
                </div>
              </div>
              {!castawayDetails ? <p className="empty">Castaway not found.</p> : (
                <>
                  <dl className="member-summary castaway-bio">
                    <div><dt>Tribe</dt><dd><span className={`tribe ${castawayDetails.profile.Tribe?.toLowerCase() ?? ""}`}>{castawayDetails.profile.Tribe || "—"}</span></dd></div>
                    <div><dt>Age</dt><dd>{castawayDetails.profile.Age ?? "—"}</dd></div>
                    <div><dt>Hometown</dt><dd>{castawayDetails.profile.Hometown || "—"}</dd></div>
                    <div><dt>Occupation</dt><dd>{castawayDetails.profile.Occupation || "—"}</dd></div>
                    <div><dt>Status</dt><dd>{eliminationEpisodes.has(castawayName) ? `Out · Episode ${episodeNumber(eliminationEpisodes.get(castawayName))}` : "Active"}</dd></div>
                  </dl>
                  <dl className="member-summary">
                    <div><dt>Season Points</dt><dd><Points value={castawayDetails.totalPoints} seasonTotal /></dd></div>
                    <div><dt>Episodes Scored</dt><dd>{castawayDetails.episodesScored}</dd></div>
                    {[
                      { label: "Most Points Scored", description: "These are the castaway's highest scoring episodes. The members below picked them in one or more of those episodes.", weeks: castawayDetails.bestWeeks },
                      { label: "Least Points Scored", description: "These are the castaway's lowest scoring episodes. The members below picked them in one or more of those episodes.", weeks: castawayDetails.worstWeeks, worst: true },
                      { label: "Most Picked By", description: "These are the members who picked this castaway in the most episodes.", members: castawayDetails.mostPickedBy },
                    ].map(({ label, description, weeks, worst, members }) => {
                      const week = weeks?.[0];
                      const episodeLabel = weeks?.map((entry) => episodeNumber(entry.Episode)).join("/");
                      const pickers = [...new Set((weeks ?? []).flatMap((entry) => entry.Members))]
                        .sort((left, right) => left.localeCompare(right));
                      return (
                      <div className="member-player-metric" key={label}>
                        <dt>{label}
                          <span className="metric-help">
                            <button type="button" className="metric-help-button" aria-label={`About ${label}`} aria-describedby={`castaway-metric-${label.replaceAll(" ", "-")}`}><span aria-hidden="true">?</span></button>
                            <span className="metric-help-tooltip" role="tooltip" id={`castaway-metric-${label.replaceAll(" ", "-")}`}>{description}</span>
                          </span>
                        </dt>
                        <dd>{week ? (
                          <>
                            <div className={`member-player-metric-value ${worst ? "member-worst-player-points" : ""}`}>
                              <ScoreDetailsWidget
                                player={castawayName}
                                episode={week.Episode}
                                score={week.Points}
                                details={week.Rules}
                                ruleGroups={weeks.length > 1 ? weeks.map((entry) => ({ Player: castawayName, Episode: entry.Episode, Point: entry.Points, Details: entry.Rules })) : []}
                                summaryLabel={weeks.length > 1 ? `Episode ${episodeLabel} Points` : undefined}
                                showCount
                                showChevron={false}
                                highlightPositive
                                detailsIdSuffix={worst ? "worst-week" : "best-week"}
                              />
                              <span className="muted"> points in Episode {episodeLabel}</span>
                            </div>
                            <div className="chips" aria-label={`Picked by in Episode ${episodeLabel}`}>
                              {pickers.length ? pickers.map((username) => (
                                <MemberTag key={username} username={username} hue={memberHues.get(username)} />
                              )) : <span className="muted">No picks</span>}
                            </div>
                          </>
                        ) : members?.length ? (
                          <>
                            <span className="member-player-metric-value"><span className="muted">Picked </span>{members[0].Count}<span className="muted">{members[0].Count === 1 ? " episode" : " episodes"}{members.length > 1 ? " each" : ""}</span></span>
                            <div className="chips">
                              {members.map((member) => <MemberTag key={member.Username} username={member.Username} hue={memberHues.get(member.Username)} />)}
                            </div>
                          </>
                        ) : "—"}</dd>
                      </div>
                      );
                    })}
                  </dl>
                  <section>
                    <h2>Episode Scores</h2>
                    <Table rows={castawayDetails.episodes} tableClass="member-episode-table" initial={{ key: "Episode", direction: 1 }} columns={[
                      { key: "Episode", className: "member-episode-column", render: (row) => `Episode ${episodeNumber(row.Episode)}` },
                      { key: "Points", className: "member-points-column", numeric: true, render: (row) => <ScoreDetailsWidget player={castawayName} episode={row.Episode} score={row.Points} details={row.Rules} showCount showChevron={false} highlightPositive /> },
                      { key: "PickedBy", label: "Picked By", render: (row) => (
                        <div className="chips">
                          {row.Members.length ? row.Members.map((username) => <MemberTag key={username} username={username} hue={memberHues.get(username)} />) : <span className="muted">No picks</span>}
                        </div>
                      ) },
                    ]} />
                  </section>
                </>
              )}
            </div>
          )}
          {!mobileView && page === "Member" && (
            <div className="member-page">
              <div className="member-page-heading">
                <button type="button" className="member-back-button" onClick={closeMember} aria-label="Back to dashboard" title="Back to dashboard"><span aria-hidden="true">←</span> Back</button>
                <div className="member-profile-header">
                  <div className="member-page-identity member-profile-identity">
                    <MemberTag username={memberUsername} hue={memberHues.get(memberUsername)} />
                    <h1>{memberDisplayNames.get(memberUsername) || memberUsername}</h1>
                  </div>
                  {memberDetails && (
                    <dl className="member-summary member-header-stats">
                      <div><dt>Rank</dt><dd><span className="rank-value">
                        {memberProfile?.Rank === 1 && <span className="rank-emblem rank-emblem-crown" role="img" aria-label="First place" title="First place">👑</span>}
                        {memberProfile?.Rank === lastRank && memberProfile?.Rank !== 1 && <span className="rank-emblem" role="img" aria-label="Last place" title="Last place">😢</span>}
                        {memberProfile?.Rank ?? "—"}
                      </span><span className="muted"> / {members.length}</span></dd></div>
                      <div><dt>Season Points</dt><dd><Points value={memberProfile?.Points} seasonTotal /></dd></div>
                    </dl>
                  )}
                </div>
              </div>
              {!memberDetails ? <p className="empty">Member not found.</p> : (
                <>
                  <dl className="member-summary">
                    {[
                      { label: "Favorite Player", description: "These are your most picked players.", favorites: memberDetails.mostPickedPlayers, points: false },
                      { label: "Best Player", description: "These are the players that got you the most amount of total points across all episodes.", players: memberDetails.bestPlayers, points: true },
                      { label: "Worst Player", description: "These are the players that got you the least amount of total points across all episodes.", players: memberDetails.worstPlayers, points: true, worst: true },
                      { label: "Best Pick", description: "These are the players that got you the most points in an episode.", players: memberDetails.bestPicks, points: true, singleEpisodePicks: true },
                      { label: "Worst Pick", description: "These are the players that got you the least points in an episode.", players: memberDetails.worstPicks, points: true, worst: true, singleEpisodePicks: true },
                    ].map(({ label, description, players, favorites, points, worst, singleEpisodePicks }) => (
                      <div className="member-player-metric" key={label}>
                        <dt>{label}
                          <span className="metric-help">
                            <button type="button" className="metric-help-button" aria-label={`About ${label}`} aria-describedby={`metric-help-${label.replaceAll(" ", "-")}`}><span aria-hidden="true">?</span></button>
                            <span className="metric-help-tooltip" role="tooltip" id={`metric-help-${label.replaceAll(" ", "-")}`}>{description}</span>
                          </span>
                        </dt>
                        <dd>{points ? (players.length ? [singleEpisodePicks ? groupPicksByEpisode(players).flat() : players].map((group) => {
                          const player = group[0];
                          const pickEpisodeLabel = new Set(group.map((entry) => entry.Episode)).size === 1
                            ? `in Episode ${episodeNumber(player.Episode)}`
                            : "in an episode";
                          return (
                          <div className="member-player-metric-entry" key={JSON.stringify([player.Player, player.Episode])}>
                            <div className="member-player-metric-identity">
                              {[...new Map(group.map((entry) => [entry.Player, entry])).values()].map((entry) => <CastawayIdentity key={entry.Player} name={entry.Player} eliminated={eliminationEpisodes.has(entry.Player)} />)}
                            </div>
                            <div className={`member-player-metric-value ${worst ? "member-worst-player-points" : ""}`}>
                                  {singleEpisodePicks ? <Points value={player.Point} highlightPositive /> : <ScoreDetailsWidget
                                    player={group.length > 1 ? label : player.Player}
                                    episode={player.Episode || "Season points"}
                                    score={player.Point}
                                    details={memberRuleDetails(player.Episode, player.Player)}
                                    ruleGroups={group.length > 1 ? group.map((entry) => ({
                                      Player: entry.Player,
                                      Episode: entry.Episode,
                                      Point: entry.Point,
                                      Details: memberRuleDetails(entry.Episode, entry.Player),
                                    })) : []}
                                    castawayInfo={castawayInfo}
                                    seasonTotal={!player.Episode}
                                    highlightPositive
                                    showCount
                                    showChevron={false}
                                    detailsIdSuffix={label.replaceAll(" ", "-")}
                                  />}
                                  <span className="muted">{singleEpisodePicks ? ` points ${pickEpisodeLabel}` : ` total points${group.length > 1 ? " each" : ""}`}</span>
                            </div>
                          </div>
                          );
                        }) : "—") : favorites.length ? (
                          <>
                            <div className="member-player-metric-identity">
                              {favorites.map((favorite) => (
                                <CastawayIdentity key={favorite.Player} name={favorite.Player} eliminated={eliminationEpisodes.has(favorite.Player)} />
                              ))}
                            </div>
                            <div className="member-player-metric-value">
                              <span className="muted">Picked </span>
                              {favorites[0].Count}{" / "}{memberDetails.episodes.filter((row) => row.Picks > 0).length}
                              <span className="muted"> episodes</span>
                            </div>
                          </>
                        ) : "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <section>
                    <h2>Episode Scores</h2>
                    <Table rows={memberDetails.episodes.map((row) => ({
                      ...row,
                      Castaways: memberDetails.picks.filter((pick) => pick.Episode === row.Episode).map((pick) => pick.Player).join(", "),
                    }))} tableClass="member-episode-table" initial={{ key: "Episode", direction: 1 }} columns={[
                      { key: "Episode", className: "member-episode-column", render: (row) => `Episode ${episodeNumber(row.Episode)}` },
                      { key: "Points", className: "member-points-column", numeric: true, render: (row) => <ScoreDetailsWidget player={memberUsername} episode={row.Episode} score={row.Points} details={memberRuleDetails(row.Episode)} showCount showChevron={false} highlightPositive /> },
                      { key: "Castaways", label: "Picked Castaways", render: (row) => (
                        <div className="member-pick-list">
                          {row.Castaways ? memberDetails.picks.filter((pick) => pick.Episode === row.Episode).sort((left, right) =>
                            (right.Point ?? -Infinity) - (left.Point ?? -Infinity) || left.Player.localeCompare(right.Player),
                          ).map((pick) => (
                            <span className="member-episode-pick" key={pick.Player}>
                              <CastawayIdentity name={pick.Player} eliminated={eliminationEpisodes.get(pick.Player) === row.Episode} />
                              <ScoreDetailsWidget player={pick.Player} episode={row.Episode} score={pick.Point} details={memberRuleDetails(row.Episode, pick.Player)} showCount showChevron={false} />
                            </span>
                          )) : <span className="muted">No picks</span>}
                        </div>
                      ) },
                    ]} />
                  </section>
                </>
              )}
            </div>
          )}
          {!mobileView && page === "Scoreboard" && (
            <section>
              <div className="section-heading">
                <h1>Scoreboard</h1>
              </div>
              <Table
                rows={scoreboard}
                initial={{ key: "Rank", direction: 1 }}
                tableClass="scoreboard-table"
                columns={[
                  {
                    key: "Rank",
                    numeric: true,
                    render: (r) => (
                      <span className="rank-value">
                        {r.Rank === 1 && (
                          <span className="rank-emblem rank-emblem-crown" role="img" aria-label="First place" title="First place">
                            👑
                          </span>
                        )}
                        {r.Rank === lastRank && r.Rank !== 1 && (
                          <span className="rank-emblem" role="img" aria-label="Last place" title="Last place">
                            😢
                          </span>
                        )}
                        {r.Rank}
                      </span>
                    ),
                  },
                  {
                    key: "Username",
                    label: "Member",
                    className: "member-column",
                    render: (r) => (
                      <MemberTag username={r.Username} hue={memberHues.get(r.Username)} />
                    ),
                  },
                  {
                    key: "MemberName",
                    label: "Name",
                    className: "scoreboard-name-column",
                    render: (r) => (
                      <span className="scoreboard-name" title={r.MemberName || ""}>
                        {r.MemberName || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "Points",
                    label: "Season total",
                    numeric: true,
                    className: "season-total-column",
                    render: (r) => (
                      <ScoreDetailsWidget
                        player={r.Username}
                        episode="Season total"
                        score={r.Points}
                        details={r.PickedSeasonDetails}
                        detailsMode="picked-castaways"
                        onScoreClick={() => {
                          setSelectedWeeklyMembers([r.Username]);
                          setWeek("");
                          setWeeklyView("all");
                          setPage("Weekly Scores");
                        }}
                        seasonTotal
                        showChevron={false}
                      />
                    ),
                  },
                  ...scoreboardEpisodes.map((ep, index) => ({
                    key: ep,
                    label: `Ep ${index + 1}`,
                    numeric: true,
                    className: "episode-column",
                    render: (r) => {
                      const publishedEpisode = episodes.find(
                        (episode) => episodeNumber(episode) === index + 1,
                      );
                      if (!publishedEpisode) return <Points value={r[ep]} />;
                      const extremes = scoreboardEpisodeExtremes.get(ep);
                      const isHighest =
                        extremes && r[ep] === extremes.highest;
                      const isLowest = extremes && r[ep] === extremes.lowest;
                      return (
                        <div className="scoreboard-score-cell">
                          <span className="score-extreme-indicators">
                            {isHighest && (
                              <span
                                className="score-extreme-dot score-extreme-high"
                                title={`Green means most points in Episode ${index + 1}`}
                                aria-label={`Most points in Episode ${index + 1}`}
                              />
                            )}
                            {isLowest && (
                              <span
                                className="score-extreme-dot score-extreme-low"
                                title={`Red means least points in Episode ${index + 1}`}
                                aria-label={`Least points in Episode ${index + 1}`}
                              />
                            )}
                          </span>
                          <ScoreDetailsWidget
                            player={r.Username}
                            episode={publishedEpisode}
                            score={r[ep]}
                            details={r.PickedEpisodeDetails[ep]}
                            detailsMode="picked-castaways"
                            showChevron={false}
                            onScoreClick={() => {
                              setSelectedWeeklyMembers([r.Username]);
                              setWeek(publishedEpisode);
                              setWeeklyView("week");
                              setPage("Weekly Scores");
                            }}
                          />
                        </div>
                      );
                    },
                  })),
                ]}
              />
              <div className="scoreboard-legend">
                <span className="scoreboard-legend-item">
                  <span className="rank-emblem" aria-hidden="true">👑</span>
                  First place
                </span>
                <span className="scoreboard-legend-item">
                  <span className="rank-emblem" aria-hidden="true">😢</span>
                  Last place
                </span>
                <span className="scoreboard-legend-item">
                  <span className="score-extreme-dot score-extreme-high" />
                  Most points for the episode
                </span>
                <span className="scoreboard-legend-item">
                  <span className="score-extreme-dot score-extreme-low" />
                  Least points for the episode
                </span>
              </div>
            </section>
          )}
          {!mobileView && page === "Weekly Scores" && (
            <section>
              <div className="section-heading">
                <h1>Weekly Scores</h1>
              </div>
              <div className="filters">
                <div className="metric-toggle" role="group" aria-label="Weekly score view">
                  <button
                    type="button"
                    className={weeklyView === "week" ? "active" : ""}
                    aria-pressed={weeklyView === "week"}
                    onClick={() => setWeeklyView("week")}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    className={weeklyView === "all" ? "active" : ""}
                    aria-pressed={weeklyView === "all"}
                    onClick={() => setWeeklyView("all")}
                  >
                    All Episodes
                  </button>
                </div>
                <MultiSelectFilter
                  label="Members"
                  options={members.map((r) => r.Username)}
                  selected={selectedWeeklyMembers}
                  onChange={setSelectedWeeklyMembers}
                  memberHues={memberHues}
                />
                <button
                  type="button"
                  className="clear-filters-button"
                  onClick={() => setSelectedWeeklyMembers([])}
                >
                  Clear Filters
                </button>
                {weeklyView === "week" && (
                  <div className="week-switch">
                    <button
                      aria-label="Previous episode"
                      disabled={weekIndex <= 0}
                      onClick={() => setWeek(episodes[weekIndex - 1])}
                    >
                      ‹
                    </button>
                    <strong>{currentWeekLabel}</strong>
                    <button
                      aria-label="Next episode"
                      disabled={weekIndex >= episodes.length - 1}
                      onClick={() => setWeek(episodes[weekIndex + 1])}
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
              <Table
                key={weeklyView}
                rows={weekly}
                initial={
                  weeklyView === "all"
                    ? { key: "Episode", direction: -1 }
                    : { key: "Score", direction: -1 }
                }
                tableClass="weekly-table"
                columns={[
                  ...(weeklyView === "all"
                    ? [
                        {
                          key: "Episode",
                          label: "Episode",
                          className: "weekly-episode-column",
                          render: (r) => `Episode ${episodeNumber(r.Episode)}`,
                        },
                      ]
                    : []),
                  {
                    key: "Name",
                    label: "Castaway",
                    className: "weekly-contestant-column",
                    render: (r) => (
                      <CastawayIdentity name={r.Name} eliminated={r.Eliminated} />
                    ),
                  },
                  {
                    key: "Tribe",
                    className: "weekly-tribe-column",
                    render: (r) => (
                      <span className={`tribe ${r.Tribe.toLowerCase()}`}>
                        {r.Tribe}
                      </span>
                    ),
                  },
                  {
                    key: "Score",
                    label: "Points",
                    numeric: true,
                    className: "weekly-score-column",
                    render: (r) => {
                      return (
                        <ScoreDetailsWidget
                          player={r.Name}
                          episode={r.Episode}
                          score={r.Score}
                          details={data.episodeRules.filter(
                            (rule) =>
                              rule.Player === r.Name &&
                              rule.Episode === r.Episode,
                          )}
                          showChevron={false}
                        />
                      );
                    },
                  },
                  {
                    key: "Users",
                    label: "Picked by",
                    className: "weekly-users-column",
                    render: (r) => (
                      <div className="chips">
                        {r.Users.length ? (
                          r.Users
                            .filter(
                              (user) =>
                                !selectedWeeklyMembers.length ||
                                selectedWeeklyMembers.length === members.length ||
                                selectedWeeklyMembers.includes(user),
                            )
                            .map((user) => (
                            <MemberTag key={user} username={user} hue={memberHues.get(user)} />
                          ))
                        ) : (
                          <span className="muted">Not picked</span>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </section>
          )}
          {!mobileView && page === "Castaways" && (
            <section>
              <div className="section-heading">
                <h1>Castaways</h1>
              </div>
              <div className="filters">
                <div className="metric-toggle" role="group" aria-label="Contestant metric">
                  <button
                    type="button"
                    className={contestantMetric === "points" ? "active" : ""}
                    aria-pressed={contestantMetric === "points"}
                    onClick={() => setContestantMetric("points")}
                  >
                    Points
                  </button>
                  <button
                    type="button"
                    className={contestantMetric === "picks" ? "active" : ""}
                    aria-pressed={contestantMetric === "picks"}
                    onClick={() => setContestantMetric("picks")}
                  >
                    Picks
                  </button>
                  <button
                    type="button"
                    className={contestantMetric === "both" ? "active" : ""}
                    aria-pressed={contestantMetric === "both"}
                    onClick={() => setContestantMetric("both")}
                  >
                    Both
                  </button>
                  <button
                    type="button"
                    className={contestantMetric === "pickers" ? "active" : ""}
                    aria-pressed={contestantMetric === "pickers"}
                    onClick={() => setContestantMetric("pickers")}
                  >
                    Picked By
                  </button>
                </div>
                <MultiSelectFilter
                  label="Castaways"
                  options={data.contestants.map((row) => row.Name).sort()}
                  selected={selectedContestants}
                  onChange={setSelectedContestants}
                  onlyActiveOptions={activeCastawayNames}
                  eliminatedOptions={eliminatedCastawayNames}
                />
                <MultiSelectFilter
                  label="Members"
                  options={members.map((row) => row.Username)}
                  selected={selectedPickerMembers}
                  onChange={setSelectedPickerMembers}
                  memberHues={memberHues}
                />
                <button
                  type="button"
                  className="clear-filters-button"
                  onClick={() => {
                    setSelectedContestants([]);
                    setSelectedPickerMembers([]);
                  }}
                >
                  Clear Filters
                </button>
              </div>
              <Table
                key={JSON.stringify([
                  contestantMetric,
                  selectedPickerMembers,
                  selectedContestants,
                ])}
                initial={
                  contestantMetric === "pickers"
                    ? { key: "PickTotal", direction: -1 }
                    : { key: "Total", direction: -1 }
                }
                tableClass={`contestant-table ${contestantMetric === "both" ? "both-metric-table" : ""} ${contestantMetric === "pickers" ? "picker-grid" : ""}`}
                rows={visibleCastaways.map((row) => ({
                  ...row,
                  Rank: contestantMetric === "picks" ? row.PickRank : row.PointRank,
                }))}
                columns={[
                  ...(contestantMetric !== "pickers" ? [{
                    key: "Rank",
                    numeric: true,
                    className: "contestant-rank-column",
                    render: (row) => contestantMetric === "both" ? (
                      <span className="castaway-dual-rank" aria-label={`Points rank ${row.PointRank ?? "unranked"}, picks rank ${row.PickRank ?? "unranked"}`}>
                        <span title="Points rank">{row.PointRank ?? "—"}</span>
                        <span className="metric-divider" aria-hidden="true">│</span>
                        <span title="Picks rank">{row.PickRank ?? "—"}</span>
                      </span>
                    ) : <span>{row.Rank ?? "—"}</span>,
                  }] : []),
                  {
                    key: "Name",
                    className: "contestant-name-column",
                    render: (r) => (
                      <CastawayIdentity name={r.Name} eliminated={eliminationEpisodes.has(r.Name)} />
                    ),
                  },
                  {
                    key: "Tribe",
                    className: "contestant-tribe-column",
                    render: (r) => (
                      <span className={`tribe ${r.Tribe.toLowerCase()}`}>
                        {r.Tribe}
                      </span>
                    ),
                  },
                  ...(contestantMetric === "pickers"
                    ? [{
                        key: "PickTotal",
                        label: "Picks",
                        numeric: true,
                        className: "contestant-pick-total-column",
                        render: (r) =>
                          r.PickTotal > 0 ? (
                            <span className="score-count">{r.PickTotal}</span>
                          ) : (
                            <span className="muted">—</span>
                          ),
                      }]
                    : [{
                    key: "Total",
                    label: "Season Total",
                    numeric: true,
                    className: "contestant-total-column",
                    render: (r) => {
                      const memberMode = contestantMetric === "picks";
                      const bothMode = contestantMetric === "both";
                      return (
                        <ScoreDetailsWidget
                          player={r.Name}
                          episode="Season total"
                          score={r.Total}
                          secondaryScore={bothMode ? r.PickTotal : undefined}
                          details={
                            memberMode
                              ? r.MemberTotals
                              : r.RuleTotals
                          }
                          secondaryDetails={bothMode ? r.MemberTotals : []}
                          memberHues={memberHues}
                          detailsMode={
                            memberMode ? "members" : bothMode ? "both" : "rules"
                          }
                          showChevron={false}
                          seasonTotal
                          showCount={!memberMode}
                        />
                      );
                    },
                  }]),
                  ...episodeColumns,
                ]}
              />
              {contestantMetric === "points" && (
                <div className="scoreboard-legend">
                  <span className="scoreboard-legend-item">
                    <span className="score-extreme-dot score-extreme-high" />
                    Most points for the episode
                  </span>
                  <span className="scoreboard-legend-item">
                    <span className="score-extreme-dot score-extreme-low" />
                    Least points for the episode
                  </span>
                </div>
              )}
            </section>
          )}
          {!mobileView && page === "Analytics" && analytics && (
            <section className="analytics-page">
              <div className="section-heading analytics-heading">
                <h1>Analytics</h1>
                <label className="analytics-toggle">
                  <input type="checkbox" checked={analyticsPlayers === "active"} onChange={(event) => setAnalyticsPlayers(event.target.checked ? "active" : "all")} />
                  Active Players Only
                </label>
              </div>
              <div className="analytics-grid">
                {[
                  { title: "Most Points", rows: analytics.mostPoints, type: "points", positive: true },
                  { title: "Least Points", rows: analytics.leastPoints, type: "points" },
                  { title: "Most Picked", rows: analytics.mostPicked, type: "picks", positive: true },
                  { title: "Least Picked", rows: analytics.leastPicked, type: "picks" },
                  { title: "Top Scoring Rules", rows: analytics.topRules, type: "rules", positive: true },
                  { title: "Worst Scoring Rules", rows: analytics.bottomRules, type: "rules" },
                ].map(({ title, rows, type, positive }) => (
                  <article className="analytics-ranking" key={title}>
                    <h2><span className={`analytics-trend-icon ${positive ? "positive" : "negative"}`} aria-hidden="true">{positive ? "↑" : "↓"}</span>{title}</h2>
                    <Table rows={type === "rules" ? rows.map((row, index) => ({ ...row, Rank: index + 1 })) : groupAnalyticsPlayers(rows, type === "picks" ? "Picks" : "Point")} initial={{ key: "Rank", direction: 1 }} columns={[
                      { key: "Rank", label: "#", numeric: true },
                      ...(type === "rules" ? [
                        { key: "Rule", label: "Rule" },
                        { key: "Count", label: "Times", numeric: true, className: "analytics-value-column" },
                        { key: "Point", label: "Total Points", numeric: true, className: "analytics-value-column", render: (row) => (
                          <ScoreDetailsWidget player={row.Rule} episode="Season points" score={row.Point} seasonTotal showCount showChevron={false} detailsMode="picked-castaways" castawayCountLabel="Times scored" castawayInfo={castawayInfo} details={scoringCastawayDetails(data.episodeRules.filter((event) => event.Rule === row.Rule && (analyticsPlayers !== "active" || !eliminationEpisodes.has(event.Player))))} />
                        ) },
                      ] : [
                        { key: "Player", label: "Castaway", render: (row) => <div className="analytics-castaways">{row.Players.map((player) => <CastawayIdentity key={player.Player} name={player.Player} eliminated={player.Eliminated} />)}</div> },
                        type === "picks"
                          ? { key: "Picks", label: "Times Picked", numeric: true, className: "analytics-value-column", render: (row) => <ScoreDetailsWidget player={row.Player} episode="Season picks" score={row.Picks} details={row.PickMembers} memberGroups={row.Players.length > 1 ? row.Players.map((player) => ({ Player: player.Player, Count: player.Picks, Details: player.PickMembers })) : []} memberHues={memberHues} castawayInfo={castawayInfo} detailsMode="members" seasonTotal showChevron={false} detailsIdSuffix={title.replaceAll(" ", "-")} /> }
                          : { key: "Point", label: "Season Points", numeric: true, className: "analytics-value-column", render: (row) => <ScoreDetailsWidget player={row.Player} episode="Season points" score={row.Point} details={[...(ruleTotalsByContestant.get(row.Players[0].Player)?.values() ?? [])]} ruleGroups={row.Players.length > 1 ? row.Players.map((player) => ({ Player: player.Player, Point: player.Point, Details: [...(ruleTotalsByContestant.get(player.Player)?.values() ?? [])] })) : []} castawayInfo={castawayInfo} seasonTotal showCount showChevron={false} detailsIdSuffix={title.replaceAll(" ", "-")} /> },
                      ]),
                    ]} />
                  </article>
                ))}
              </div>
            </section>
          )}
          {!mobileView && page === "Scoring" && (
            <section>
              <div className="section-heading">
                <h1>Scoring</h1>
              </div>
              <div className="filters">
                <div className="metric-toggle" role="group" aria-label="Scoring view">
                  <button
                    type="button"
                    className={scoringView === "rules" ? "active" : ""}
                    aria-pressed={scoringView === "rules"}
                    onClick={() => setScoringView("rules")}
                  >
                    Rules
                  </button>
                  <button
                    type="button"
                    className={scoringView === "events" ? "active" : ""}
                    aria-pressed={scoringView === "events"}
                    onClick={() => setScoringView("events")}
                  >
                    Scoring Events
                  </button>
                </div>
                <MultiSelectFilter
                  label="Episodes"
                  options={episodes}
                  selected={selectedScoringEpisodes}
                  onChange={setSelectedScoringEpisodes}
                  formatOption={(episode) => `Episode ${episodeNumber(episode)}`}
                />
                <MultiSelectFilter
                  label="Castaways"
                  options={data.contestants.map((row) => row.Name).sort()}
                  selected={selectedScoringCastaways}
                  onChange={setSelectedScoringCastaways}
                  onlyActiveOptions={activeCastawayNames}
                  eliminatedOptions={eliminatedCastawayNames}
                />
                <MultiSelectFilter
                  label="Members"
                  options={members.map((row) => row.Username)}
                  selected={selectedScoringMembers}
                  onChange={setSelectedScoringMembers}
                  memberHues={memberHues}
                />
                <MultiSelectFilter
                  label="Categories"
                  options={scoringSubcategories}
                  selected={selectedScoringSubcategories}
                  onChange={setSelectedScoringSubcategories}
                />
                <input
                  aria-label="Search scoring"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="clear-filters-button"
                  onClick={() => {
                    setSelectedScoringEpisodes([]);
                    setSelectedScoringCastaways([]);
                    setSelectedScoringMembers([]);
                    setSelectedScoringSubcategories([]);
                    setSearch("");
                  }}
                >
                  Clear Filters
                </button>
              </div>
              <Table
                key={JSON.stringify([
                  scoringView,
                  selectedScoringEpisodes,
                  selectedScoringCastaways,
                  selectedScoringMembers,
                  selectedScoringSubcategories,
                ])}
                rows={scoringView === "rules" ? scoringRuleRows : scoringEvents}
                initial={
                  scoringView === "rules"
                    ? { key: "Total", direction: -1 }
                    : { key: "Episode", direction: -1 }
                }
                columns={
                  scoringView === "rules"
                    ? [
                        {
                          key: "Subcategory",
                          label: "Category",
                          className: "scoring-subcategory-column",
                          render: (r) => (
                            <span
                              className="subcategory-tag"
                              style={{
                                "--subcategory-hue":
                                  scoringSubcategoryHues.get(r.Subcategory) ?? 0,
                              }}
                            >
                              {r.Subcategory || "—"}
                            </span>
                          ),
                        },
                        { key: "Rule", label: "Rule" },
                        {
                          key: "Point",
                          label: "Rule points",
                          numeric: true,
                          render: (r) => <Points value={r.Point} />,
                        },
                        {
                          key: "Total",
                          label: "Season Total",
                          numeric: true,
                          className: "season-total-column",
                          render: (r) => (
                            <ScoreDetailsWidget
                              player={r.Rule}
                              episode="Season total"
                              score={r.Total}
                              details={r.SeasonDetails}
                              detailsMode="picked-castaways"
                              castawayInfo={castawayInfo}
                              seasonTotal
                              showCount
                              castawayCountLabel="Times scored"
                              showChevron={false}
                            />
                          ),
                        },
                        ...scoreboardEpisodes.map((episode, index) => ({
                          key: episode,
                          label: `Ep ${index + 1}`,
                          numeric: true,
                          className: "episode-column",
                          render: (r) => (
                            <ScoreDetailsWidget
                              player={r.Rule}
                              episode={episode}
                              score={r[episode]}
                              details={r.EpisodeDetails[episode]}
                              detailsMode="picked-castaways"
                              castawayInfo={castawayInfo}
                              showCount
                              castawayCountLabel="Times scored"
                              showChevron={false}
                            />
                          ),
                        })),
                      ]
                    : [
                        {
                          key: "Episode",
                          label: "Episode",
                          className: "scoring-event-episode",
                          render: (r) => `Episode ${episodeNumber(r.Episode)}`,
                        },
                        {
                          key: "Player",
                          label: "Castaway",
                          render: (r) => (
                            <CastawayIdentity
                              name={r.Player}
                              eliminated={castawayInfo.get(r.Player)?.Eliminated}
                            />
                          ),
                        },
                        {
                          key: "Tribe",
                          render: (r) => (
                            <span
                              className={`tribe ${castawayInfo.get(r.Player)?.Tribe?.toLowerCase() ?? ""}`}
                            >
                              {castawayInfo.get(r.Player)?.Tribe ?? "—"}
                            </span>
                          ),
                        },
                        {
                          key: "Subcategory",
                          label: "Category",
                          className: "scoring-subcategory-column",
                          render: (r) => (
                            <span
                              className="subcategory-tag"
                              style={{
                                "--subcategory-hue":
                                  scoringSubcategoryHues.get(r.Subcategory) ?? 0,
                              }}
                            >
                              {r.Subcategory || "—"}
                            </span>
                          ),
                        },
                        { key: "Rule", label: "Rule" },
                        {
                          key: "Point",
                          label: "Points",
                          numeric: true,
                          render: (r) => <Points value={r.Point} />,
                        },
                      ]
                }
              />
            </section>
          )}
        </main>
      )}
    </div>
    </MemberNavigationContext.Provider>
  );
}
const rootContainer = document.getElementById("root");
const root = import.meta.hot?.data.root ?? createRoot(rootContainer);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
