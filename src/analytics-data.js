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

export function buildAnalytics(data, { activeOnly = false } = {}) {
  const eliminated = new Set(data.episodeRules
    .filter((row) => row.Rule.trim().toLowerCase() === "castaway gets eliminated")
    .map((row) => row.Player));
  const castaways = data.contestants.filter((row) => !activeOnly || !eliminated.has(row.Name));
  const includedNames = new Set(castaways.map((row) => row.Name));
  const scoreTotals = new Map();
  for (const row of data.episodeScores) {
    if (!includedNames.has(row.Player)) continue;
    scoreTotals.set(row.Player, (scoreTotals.get(row.Player) ?? 0) + row["Total Score"]);
  }
  const pickCounts = new Map();
  const pickMembers = new Map();
  const seenPicks = new Set();
  for (const pick of data.userPicks) {
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
  return {
    mostPoints: topPlayers("Point", -1),
    leastPoints: topPlayers("Point", 1),
    mostPicked: topPlayers("Picks", -1),
    leastPicked: topPlayers("Picks", 1),
    topRules: ruleTotals.filter((row) => row.Point > 0)
      .sort((left, right) => right.Point - left.Point || left.Rule.localeCompare(right.Rule)).slice(0, 3),
    bottomRules: ruleTotals.filter((row) => row.Point < 0)
      .sort((left, right) => left.Point - right.Point || left.Rule.localeCompare(right.Rule)).slice(0, 3),
  };
}