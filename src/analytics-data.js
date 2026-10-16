import { episodeNumber } from "./data";

export function groupAnalyticsPlayers(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = JSON.stringify([row.Rank, row[key]]);
    if (!groups.has(groupKey)) groups.set(groupKey, { ...row, Players: [] });
    groups.get(groupKey).Players.push(row);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    Player: group.Players.map((row) => row.Player).join(", "),
  }));
}

function buildMemberPlayerSummaries(data) {
  const members = new Map(data.members.map((member) => [member.Username, {
    Member: member.Username,
    Name: member.Name || member.Username,
    FavoritePlayers: new Map(),
    BestPlayerPoints: new Map(),
  }]));
  const pointsByEpisodePlayer = new Map();
  for (const score of data.episodeScores) {
    pointsByEpisodePlayer.set(JSON.stringify([score.Episode, score.Player]), score["Total Score"]);
  }
  const seen = new Set();
  for (const pick of data.userPicks) {
    const pickKey = JSON.stringify([pick.User, pick.Episode, pick.Contestant]);
    if (seen.has(pickKey)) continue;
    seen.add(pickKey);
    if (!members.has(pick.User)) members.set(pick.User, {
      Member: pick.User,
      Name: pick.User,
      FavoritePlayers: new Map(),
      BestPlayerPoints: new Map(),
    });
    const member = members.get(pick.User);
    member.FavoritePlayers.set(pick.Contestant, (member.FavoritePlayers.get(pick.Contestant) ?? 0) + 1);
    const pickPoints = pointsByEpisodePlayer.get(JSON.stringify([pick.Episode, pick.Contestant])) ?? 0;
    member.BestPlayerPoints.set(pick.Contestant, (member.BestPlayerPoints.get(pick.Contestant) ?? 0) + pickPoints);
  }
  const summarizeTies = (totals, valueKey) => {
    const entries = [...totals];
    if (!entries.length) return [];
    const max = Math.max(...entries.map(([, value]) => value));
    return entries.filter(([, value]) => value === max)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([Player, value]) => ({ Player, [valueKey]: value }));
  };
  const rows = [...members.values()].sort((left, right) => left.Name.localeCompare(right.Name) || left.Member.localeCompare(right.Member));
  return {
    favoritePlayers: rows.map(({ Member, Name, FavoritePlayers }) => ({ Member, Name, Players: summarizeTies(FavoritePlayers, "Count") })),
    bestPlayers: rows.map(({ Member, Name, BestPlayerPoints }) => ({ Member, Name, Players: summarizeTies(BestPlayerPoints, "Point") })),
  };
}

export function buildAnalytics(data, { activeOnly = false, episode = "" } = {}) {
  const eliminationEpisodes = new Map(data.episodeRules
    .filter((row) => row.Rule.trim().toLowerCase() === "castaway gets eliminated")
    .map((row) => [row.Player, row.Episode]));
  const eliminated = new Set(eliminationEpisodes.keys());
  const castaways = data.contestants.filter((row) => {
    if (activeOnly && eliminated.has(row.Name)) return false;
    const eliminatedIn = eliminationEpisodes.get(row.Name);
    return !episode || !eliminatedIn || episodeNumber(eliminatedIn) >= episodeNumber(episode);
  });
  const includedNames = new Set(castaways.map((row) => row.Name));
  const scoreTotals = new Map();
  for (const row of data.episodeScores) {
    if (episode && row.Episode !== episode) continue;
    if (!includedNames.has(row.Player)) continue;
    scoreTotals.set(row.Player, (scoreTotals.get(row.Player) ?? 0) + row["Total Score"]);
  }
  const pickCounts = new Map();
  const pickMembers = new Map();
  const seenPicks = new Set();
  for (const pick of data.userPicks) {
    if (episode && pick.Episode !== episode) continue;
    if (!includedNames.has(pick.Contestant)) continue;
    const key = JSON.stringify([pick.User, pick.Episode, pick.Contestant]);
    if (seenPicks.has(key)) continue;
    seenPicks.add(key);
    pickCounts.set(pick.Contestant, (pickCounts.get(pick.Contestant) ?? 0) + 1);
    if (!pickMembers.has(pick.Contestant)) pickMembers.set(pick.Contestant, new Map());
    const members = pickMembers.get(pick.Contestant);
    members.set(pick.User, (members.get(pick.User) ?? 0) + 1);
  }
  const players = castaways.map((row) => ({
    Player: row.Name,
    Point: scoreTotals.get(row.Name),
    Picks: pickCounts.get(row.Name) ?? 0,
    PickMembers: [...(pickMembers.get(row.Name) ?? new Map())].map(([Member, Count]) => ({ Member, Count })),
    Eliminated: eliminated.has(row.Name),
  }));
  const rules = new Map();
  for (const event of data.episodeRules) {
    if (episode && event.Episode !== episode) continue;
    if (!includedNames.has(event.Player)) continue;
    const total = rules.get(event.Rule) ?? { Rule: event.Rule, Point: 0, Count: 0 };
    total.Point += event.Point;
    total.Count += 1;
    rules.set(event.Rule, total);
  }
  const topPlayers = (key, direction) => {
    const sorted = players.filter((row) => Number.isFinite(row[key]))
      .sort((left, right) => direction * (left[key] - right[key]) || left.Player.localeCompare(right.Player));
    let rank = 0;
    return sorted.map((row, index) => {
      if (index === 0 || row[key] !== sorted[index - 1][key]) rank = index + 1;
      return { ...row, Rank: rank };
    }).filter((row) => row.Rank <= 3);
  };
  const ruleTotals = [...rules.values()];
  const memberPlayerSummaries = buildMemberPlayerSummaries(data);
  return {
    mostPoints: topPlayers("Point", -1),
    leastPoints: topPlayers("Point", 1),
    mostPicked: topPlayers("Picks", -1),
    leastPicked: topPlayers("Picks", 1),
    topRules: ruleTotals.filter((row) => row.Point > 0)
      .sort((left, right) => right.Point - left.Point || left.Rule.localeCompare(right.Rule)).slice(0, 3),
    bottomRules: ruleTotals.filter((row) => row.Point < 0)
      .sort((left, right) => left.Point - right.Point || left.Rule.localeCompare(right.Rule)).slice(0, 3),
    ...memberPlayerSummaries,
  };
}
