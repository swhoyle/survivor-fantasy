const pagePaths = {
  Scoreboard: "/scoreboard",
  "Weekly Scores": "/weekly-scores",
  Castaways: "/castaways",
  Scoring: "/scoring",
  Analytics: "/analytics",
};

const fields = {
  Member: {},
  Castaway: {},
  Scoreboard: {},
  Analytics: {
    analyticsPlayers: ["players", "all", ["all", "active"]],
    analyticsEpisode: ["episode", "total"],
  },
  "Weekly Scores": {
    weeklyView: ["view", "week", ["week", "all"]],
    week: ["episode", ""],
    selectedWeeklyMembers: ["member", []],
  },
  Castaways: {
    contestantMetric: ["view", "points", ["points", "picks", "both", "pickers"]],
    selectedPickerMembers: ["member", []],
    selectedContestants: ["castaway", []],
  },
  Scoring: {
    scoringView: ["view", "rules", ["rules", "events"]],
    selectedScoringEpisodes: ["episode", []],
    selectedScoringCastaways: ["castaway", []],
    selectedScoringMembers: ["member", []],
    selectedScoringSubcategories: ["category", []],
    search: ["q", ""],
  },
};

export function readViewState(url) {
  if (url.hash.startsWith("#/")) {
    url = new URL(url.hash.slice(1), url.origin);
  }
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  const memberPath = url.pathname.match(/^\/member\/([^/]+)\/?$/i);
  const castawayPath = url.pathname.match(/^\/castaway\/([^/]+)\/?$/i);
  let memberUsername = "";
  let castawayName = "";
  try {
    memberUsername = memberPath ? decodeURIComponent(memberPath[1]) : "";
  } catch {
    memberUsername = "";
  }
  try {
    castawayName = castawayPath ? decodeURIComponent(castawayPath[1]) : "";
  } catch {
    castawayName = "";
  }
  const page = memberUsername ? "Member" : castawayName ? "Castaway" : Object.keys(pagePaths).find((name) => pagePaths[name] === path) ?? "Scoreboard";
  const state = { page, memberUsername, castawayName };
  for (const pageFields of Object.values(fields)) {
    for (const [key, [, fallback]] of Object.entries(pageFields)) {
      state[key] = Array.isArray(fallback) ? [] : fallback;
    }
  }
  for (const [key, [parameter, fallback, options]] of Object.entries(fields[page])) {
    if (Array.isArray(fallback)) {
      state[key] = [...new Set(url.searchParams.getAll(parameter).filter(Boolean))];
    } else {
      const value = url.searchParams.get(parameter) ?? fallback;
      state[key] = options && !options.includes(value) ? fallback : value;
    }
  }
  return state;
}

export function createViewUrl(state) {
  if (state.page === "Member") return `/member/${encodeURIComponent(state.memberUsername)}`;
  if (state.page === "Castaway") return `/castaway/${encodeURIComponent(state.castawayName)}`;
  const parameters = new URLSearchParams();
  for (const [key, [parameter, fallback]] of Object.entries(fields[state.page])) {
    const value = state[key];
    if (Array.isArray(value)) {
      for (const item of value) parameters.append(parameter, item);
    } else if (value !== fallback) {
      parameters.set(parameter, value);
    }
  }
  const query = parameters.toString();
  return `${pagePaths[state.page]}${query ? `?${query}` : ""}`;
}

export function createBrowserViewUrl(state, url) {
  const route = createViewUrl(state);
  return url.hostname.endsWith(".github.io") || url.hash.startsWith("#/")
    ? `${url.pathname}${url.search}#${route}`
    : route;
}
