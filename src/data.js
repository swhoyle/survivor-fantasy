import Papa from "papaparse";
export const sheetId = "1NYTUuNl-grPuXVoCUrYx70AvBYBV_l7Xm5dpRS9xI9M";
export const sources = {
  contestants: [0, ["Name", "Tribe", "Age", "Hometown", "Occupation"]],
  rules: [2073912926, ["Category", "Subcategory", "Rule", "Point"]],
  episodeScores: [1393764310, ["Episode", "Player", "Total Score"]],
  episodeRules: [1898754754, ["Episode", "Player", "Rule", "Point"]],
  scoreboard: [1379550793, ["Username", "Rank", "Points"]],
  members: [1433697779, ["Username", "Name"]],
  userScores: [218496469, ["Episode", "User", "Points"]],
  userPicks: [865498409, ["Episode", "User", "Contestant"]],
};
export async function loadData() {
  const results = await Promise.allSettled(
    Object.entries(sources).map(async ([key, [gid, headers]]) => {
      const response = await fetch(
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
        {
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
      const parsed = Papa.parse(await response.text(), {
        header: true,
        skipEmptyLines: "greedy",
      });
      if (
        parsed.errors.length ||
        headers.some((h) => !parsed.meta.fields?.includes(h))
      )
        throw new Error(`${key}: unexpected columns`);
      return [
        key,
        parsed.data.map((row) =>
          Object.fromEntries(
            headers.map((header) => {
              const value = row[header];
              if (
                ["Age", "Rank", "Points", "Point", "Total Score"].includes(
                  header,
                )
              ) {
                if (value === "" || !Number.isFinite(Number(value)))
                  throw new Error(`${key}: invalid ${header}`);
                return [header, Number(value)];
              }
              return [header, value];
            }),
          ),
        ),
      ];
    }),
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length)
    throw new Error(
      `Could not refresh: ${failures.map((r) => r.reason.message).join("; ")}`,
    );
  return Object.fromEntries(results.map((r) => r.value));
}
export const episodeNumber = (label) => Number(label?.match(/\d+/)?.[0] || 0);
export const episodesFrom = (data) =>
  [...new Set(data.episodeScores.map((r) => r.Episode))].sort(
    (a, b) => episodeNumber(a) - episodeNumber(b),
  );

export function rankCastaways(contestants) {
  const ranksFor = (key) => {
    const sorted = contestants.filter((row) => Number.isFinite(row[key]))
      .sort((left, right) => right[key] - left[key]);
    const ranks = new Map();
    let rank = 0;
    sorted.forEach((row, index) => {
      if (index === 0 || row[key] !== sorted[index - 1][key]) rank = index + 1;
      ranks.set(row.Name, rank);
    });
    return ranks;
  };
  const pointRanks = ranksFor("PointTotal");
  const pickRanks = ranksFor("PickTotal");
  return contestants.map((row) => ({
    ...row,
    PointRank: pointRanks.get(row.Name),
    PickRank: pickRanks.get(row.Name),
  }));
}
