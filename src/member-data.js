import { episodeNumber } from "./data.js";

export function groupPicksByEpisode(picks) {
  const groups = new Map();
  for (const pick of picks) {
    const key = JSON.stringify([pick.Episode, pick.Point]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pick);
  }
  return [...groups.values()].sort((left, right) =>
    episodeNumber(left[0].Episode) - episodeNumber(right[0].Episode),
  );
}

export function buildMemberDetails(data, username) {
  const uniquePicks = new Map();
  for (const pick of data.userPicks.filter((row) => row.User === username)) {
    uniquePicks.set(JSON.stringify([pick.Episode, pick.Contestant]), pick);
  }
  const picks = [...uniquePicks.values()];
  const scores = data.userScores.filter((row) => row.User === username);
  const episodeNames = [...new Set([
    ...data.episodeScores.map((row) => row.Episode),
    ...scores.map((row) => row.Episode),
    ...picks.map((row) => row.Episode),
  ])].sort((left, right) => Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0));
  const events = data.episodeRules.filter((event) =>
    uniquePicks.has(JSON.stringify([event.Episode, event.Player])),
  );
  const castawayTotals = new Map();
  const pickRows = picks.map((pick) => {
    const score = data.episodeScores.find((row) =>
      row.Episode === pick.Episode && row.Player === pick.Contestant,
    )?.["Total Score"];
    const contestant = data.contestants.find((row) => row.Name === pick.Contestant);
    const row = { Episode: pick.Episode, Player: pick.Contestant, Point: score, Tribe: contestant?.Tribe ?? "" };
    const total = castawayTotals.get(row.Player) ?? { Player: row.Player, Tribe: row.Tribe, Count: 0, Point: undefined };
    total.Count += 1;
    if (score !== undefined) total.Point = (total.Point ?? 0) + score;
    castawayTotals.set(row.Player, total);
    return row;
  });
  const ruleTotals = new Map();
  const categories = new Map(data.rules.map((row) => [row.Rule, row.Subcategory]));
  for (const event of events) {
    const total = ruleTotals.get(event.Rule) ?? { Rule: event.Rule, Subcategory: categories.get(event.Rule) ?? "", Count: 0, Point: 0 };
    total.Count += 1;
    total.Point += event.Point;
    ruleTotals.set(event.Rule, total);
  }
  const castaways = [...castawayTotals.values()];
  const scoredCastaways = castaways.filter((row) => Number.isFinite(row.Point));
  const rankedFavorites = [...castaways].sort((left, right) =>
    right.Count - left.Count || left.Player.localeCompare(right.Player),
  );
  const mostPickedPlayers = rankedFavorites.filter((player) => player.Count === rankedFavorites[0]?.Count);
  const rankedPlayers = [...scoredCastaways].sort((left, right) =>
    right.Point - left.Point || left.Player.localeCompare(right.Player),
  );
  const bestPlayers = rankedPlayers.filter((player) => player.Point === rankedPlayers[0]?.Point);
  const worstPlayers = rankedPlayers.filter((player) => player.Point === rankedPlayers.at(-1)?.Point);
  const scoredPicks = pickRows.filter((row) => Number.isFinite(row.Point));
  const comparePickTies = (left, right) =>
    left.Player.localeCompare(right.Player) || left.Episode.localeCompare(right.Episode, undefined, { numeric: true });
  const rankedPicks = [...scoredPicks].sort((left, right) =>
    right.Point - left.Point || comparePickTies(left, right),
  );
  const bestPicks = rankedPicks.filter((pick) => pick.Point === rankedPicks[0]?.Point);
  const worstPicks = rankedPicks.filter((pick) => pick.Point === rankedPicks.at(-1)?.Point);
  return {
    episodes: episodeNames.map((Episode) => ({
      Episode,
      Points: scores.find((row) => row.Episode === Episode)?.Points,
      Picks: picks.filter((row) => row.Episode === Episode).length,
    })),
    picks: pickRows,
    castaways,
    mostPickedPlayers,
    bestPlayers,
    worstPlayers,
    bestPicks,
    worstPicks,
    rules: [...ruleTotals.values()],
    events: events.map((row) => ({ ...row, Subcategory: categories.get(row.Rule) ?? "" })),
  };
}