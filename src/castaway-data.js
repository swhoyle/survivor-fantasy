import { episodeNumber } from "./data.js";

export function buildCastawayDetails(data, name) {
  const profile = data.contestants.find((row) => row.Name === name);
  if (!profile) return null;
  const scores = data.episodeScores.filter((row) => row.Player === name);
  const events = data.episodeRules.filter((row) => row.Player === name);
  const picks = data.userPicks.filter((row) => row.Contestant === name);
  const episodes = [...new Set([
    ...data.episodeScores.map((row) => row.Episode),
    ...events.map((row) => row.Episode),
    ...picks.map((row) => row.Episode),
  ])].sort((left, right) => episodeNumber(left) - episodeNumber(right));
  const episodeRows = episodes.map((Episode) => {
    const rules = new Map();
    for (const event of events.filter((row) => row.Episode === Episode)) {
      const total = rules.get(event.Rule) ?? { Rule: event.Rule, Count: 0, Point: 0 };
      total.Count += 1;
      total.Point += event.Point;
      rules.set(event.Rule, total);
    }
    const Members = [...new Set(picks.filter((row) => row.Episode === Episode).map((row) => row.User))]
      .sort((left, right) => left.localeCompare(right));
    return {
      Episode,
      Points: scores.find((row) => row.Episode === Episode)?.["Total Score"],
      Members,
      PickedBy: Members.join(", "),
      Rules: [...rules.values()],
    };
  });
  const scoredWeeks = episodeRows.filter((row) => Number.isFinite(row.Points));
  const rankedWeeks = [...scoredWeeks].sort((left, right) =>
    right.Points - left.Points || episodeNumber(left.Episode) - episodeNumber(right.Episode),
  );
  const bestWeeks = rankedWeeks.filter((week) => week.Points === rankedWeeks[0]?.Points);
  const worstWeeks = rankedWeeks.filter((week) => week.Points === rankedWeeks.at(-1)?.Points);
  const memberCounts = new Map();
  for (const episode of episodeRows) {
    for (const username of episode.Members) {
      memberCounts.set(username, (memberCounts.get(username) ?? 0) + 1);
    }
  }
  const rankedMembers = [...memberCounts].map(([Username, Count]) => ({ Username, Count }))
    .sort((left, right) => right.Count - left.Count || left.Username.localeCompare(right.Username));
  const mostPickedBy = rankedMembers.filter((member) => member.Count === rankedMembers[0]?.Count);
  return {
    profile,
    totalPoints: scores.length ? scores.reduce((sum, row) => sum + row["Total Score"], 0) : undefined,
    episodesScored: scoredWeeks.length,
    episodes: episodeRows,
    bestWeeks,
    worstWeeks,
    mostPickedBy,
  };
}