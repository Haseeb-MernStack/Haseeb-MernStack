// Generates self-hosted, animated SVG widgets from live GitHub data.
// Usage: node scripts/generate.mjs [--mock | --empty]
import fs from "node:fs";

const USER = process.env.GH_USER || "Haseeb-MernStack";
const REPO = process.env.FEATURED_REPO || "commune";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const MODE = process.argv.includes("--mock") ? "mock" : process.argv.includes("--empty") ? "empty" : "live";
const OUT = "assets/generated";

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#563d7c", SCSS: "#c6538c",
  Python: "#3572A5", Shell: "#89e051", Dockerfile: "#384d54", Java: "#b07219", Go: "#00ADD8",
  EJS: "#a91e50", Vue: "#41b883", "C++": "#f34b7d", C: "#555555", PHP: "#4F5D95", Rust: "#dea584",
};

// ---------- data ----------
async function rest(path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "profile-widgets",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}
async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "profile-widgets", "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("graphql: " + JSON.stringify(j.errors || r.status));
  return j.data;
}

function emptyData() {
  return { followers: null, following: null, repos: null, stars: null, commits: null, prs: null, issues: null,
    contributions: null, streak: null, longest: null, langs: [], days: [],
    commune: { name: REPO, description: "Community-driven open source project", stars: null, forks: null, language: null, license: "MIT", topics: [] } };
}
function mockData() {
  const days = Array.from({ length: 371 }, (_, i) => Math.max(0, Math.round(3 + 3 * Math.sin(i / 6) + (i * 7 % 5) - 2)));
  return { followers: 128, following: 40, repos: 34, stars: 212, commits: 1480, prs: 96, issues: 41,
    contributions: days.reduce((a, b) => a + b, 0), streak: 12, longest: 47,
    langs: [["TypeScript", 520000], ["JavaScript", 410000], ["CSS", 120000], ["HTML", 90000], ["Shell", 30000], ["Dockerfile", 9000]],
    days, commune: { name: REPO, description: "Community-driven open source project built in public.", stars: 54, forks: 12, language: "TypeScript", license: "MIT", topics: ["open-source", "mern", "community"] } };
}

async function liveData() {
  const user = await rest(`/users/${USER}`);
  const repos = (await rest(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`)).filter((r) => !r.fork);
  const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);

  const langBytes = {};
  for (const r of repos) {
    try {
      const l = await rest(`/repos/${USER}/${r.name}/languages`);
      for (const [k, v] of Object.entries(l)) langBytes[k] = (langBytes[k] || 0) + v;
    } catch { /* skip */ }
  }
  const langs = Object.entries(langBytes).sort((a, b) => b[1] - a[1]);

  let commits = null, prs = null, issues = null, contributions = null, days = [], streak = null, longest = null;
  if (TOKEN) {
    const d = await gql(`{ user(login:"${USER}") { contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions
      contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } } } } }`);
    const c = d.user.contributionsCollection;
    commits = c.totalCommitContributions; prs = c.totalPullRequestContributions; issues = c.totalIssueContributions;
    contributions = c.contributionCalendar.totalContributions;
    days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays.map((x) => x.contributionCount));
    let run = 0, best = 0;
    for (const n of days) { run = n > 0 ? run + 1 : 0; best = Math.max(best, run); }
    longest = best;
    let i = days.length - 1;
    if (days[i] === 0) i--;               // today may not have contributions yet
    streak = 0;
    while (i >= 0 && days[i] > 0) { streak++; i--; }
  }

  let commune;
  try {
    const r = await rest(`/repos/${USER}/${REPO}`);
    commune = { name: r.name, description: r.description || "", stars: r.stargazers_count, forks: r.forks_count,
      language: r.language, license: r.license?.spdx_id || null, topics: r.topics || [] };
  } catch { commune = emptyData().commune; }

  return { followers: user.followers, following: user.following, repos: user.public_repos, stars, commits, prs, issues,
    contributions, streak, longest, langs, days, commune };
}

// ---------- svg helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const fmt = (n) => (n == null ? "–" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : Number(n).toLocaleString("en-US"));

function frame(w, h, title, body, extraCss = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<defs>
  <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0e75b6"/><stop offset="1" stop-color="#00c896"/></linearGradient>
  <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00c896" stop-opacity=".35"/><stop offset="1" stop-color="#0e75b6" stop-opacity="0"/></linearGradient>
  <clipPath id="c"><rect width="${w}" height="${h}" rx="14"/></clipPath>
</defs>
<style>
  text{font-family:'Segoe UI',Helvetica,Arial,sans-serif;fill:#e6edf7;font-size:13px}
  .m{font-family:'JetBrains Mono',Consolas,Menlo,monospace}
  .h{font-size:16px;font-weight:700;fill:#9fe9d2}
  .dim{fill:#7f98b6}
  .in{animation:in .7s ease backwards}
  @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  ${extraCss}
</style>
<g clip-path="url(#c)">
<rect width="${w}" height="${h}" fill="#0b1020"/>
${body}
</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="none" stroke="url(#ac)" stroke-opacity=".55"/>
</svg>
`;
}

// ---------- widgets ----------
function followers(d) {
  const w = 140, h = 28;
  const body = `
  <rect width="${w}" height="${h}" fill="#0f1a33"/>
  <circle cx="14" cy="14" r="4" fill="#00c896"><animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.5;1" dur="2s" repeatCount="indefinite"/></circle>
  <text x="26" y="18" style="font-size:10px;font-weight:700;letter-spacing:1.2px" class="dim">FOLLOWERS</text>
  <text class="m" x="${w - 10}" y="19" text-anchor="end" style="font-size:13px;font-weight:700">${fmt(d.followers)}</text>`;
  return frame(w, h, `Followers: ${fmt(d.followers)}`, body).replace('rx="14"', 'rx="6"').replace('rx="14"', 'rx="6"');
}

function commune(d) {
  const c = d.commune, w = 720, h = 170;
  const desc = esc((c.description || "").slice(0, 78));
  const lc = LANG_COLORS[c.language] || "#00c896";
  const topics = (c.topics || []).slice(0, 4).map((t, i) => {
    const x = 28 + i * 120;
    return `<g transform="translate(${x} 96)"><rect width="108" height="24" rx="12" fill="#0e75b6" fill-opacity=".18" stroke="#0e75b6" stroke-opacity=".6"/><text class="m" x="54" y="16" text-anchor="middle" style="font-size:11px;fill:#7fe3ff">${esc(t.slice(0, 14))}</text></g>`;
  }).join("");
  const body = `
  <g class="in">
    <text class="m h" x="28" y="40" style="font-size:20px">${esc(USER)} / <tspan style="fill:#00c896">${esc(c.name)}</tspan></text>
    <text x="28" y="68" class="dim" style="font-size:14px">${desc}</text>
    ${topics}
    <g transform="translate(28 152)" class="m" style="font-size:12px">
      ${c.language ? `<circle cx="5" cy="-4" r="5" fill="${lc}"/><text x="16" y="0">${esc(c.language)}</text>` : ""}
      <text x="150" y="0">★ ${fmt(c.stars)}</text>
      <text x="230" y="0">⑂ ${fmt(c.forks)}</text>
      ${c.license ? `<text x="310" y="0" class="dim">${esc(c.license)}</text>` : ""}
    </g>
  </g>
  <rect y="0" width="90" height="${h}" fill="#fff" opacity=".04" transform="skewX(-20)"><animate attributeName="x" values="-200;840" dur="6s" repeatCount="indefinite"/></rect>`;
  return frame(w, h, `${USER}/${c.name} repository`, body);
}

function stats(d) {
  const w = 495, h = 240;
  const rows = [["Total stars", d.stars], ["Commits (last year)", d.commits], ["Pull requests", d.prs], ["Issues", d.issues], ["Public repos", d.repos], ["Followers", d.followers]];
  const list = rows.map(([k, v], i) => `
    <g class="in" style="animation-delay:${0.15 + i * 0.1}s">
      <text x="28" y="${78 + i * 29}" class="dim">${k}</text>
      <text class="m" x="230" y="${78 + i * 29}" text-anchor="end" style="font-weight:700">${fmt(v)}</text>
    </g>`).join("");
  const r = 46, circ = 2 * Math.PI * r;
  const pct = d.streak == null || !d.longest ? 0 : Math.min(1, d.streak / Math.max(d.longest, 1));
  const body = `
  <text class="h" x="28" y="36">GitHub Stats</text>
  ${list}
  <g transform="translate(375 126)">
    <circle r="${r}" fill="none" stroke="#1d3350" stroke-width="7"/>
    <circle r="${r}" fill="none" stroke="url(#ac)" stroke-width="7" stroke-linecap="round" transform="rotate(-90)"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct)).toFixed(1)}">
      <animate attributeName="stroke-dashoffset" from="${circ.toFixed(1)}" to="${(circ * (1 - pct)).toFixed(1)}" dur="1.6s" fill="freeze" calcMode="spline" keySplines=".65 0 .35 1" keyTimes="0;1"/>
    </circle>
    <text class="m" y="4" text-anchor="middle" style="font-size:26px;font-weight:800">${fmt(d.streak)}</text>
    <text y="22" text-anchor="middle" class="dim" style="font-size:10px;letter-spacing:1px">DAY STREAK</text>
  </g>
  <text x="375" y="204" text-anchor="middle" class="dim m" style="font-size:10px">longest ${fmt(d.longest)}</text>`;
  return frame(w, h, "GitHub stats", body);
}

function languages(d) {
  const w = 495, h = 240;
  const total = d.langs.reduce((a, [, v]) => a + v, 0);
  let body = `<text class="h" x="28" y="36">Top Languages</text>`;
  if (!total) {
    body += `<text x="28" y="100" class="dim">Waiting for the first workflow run…</text>`;
    return frame(w, h, "Top languages", body);
  }
  const top = d.langs.slice(0, 6);
  const rest = d.langs.slice(6).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) top.push(["Other", rest]);
  const bw = w - 56;
  let x = 28, segs = "";
  top.forEach(([n, v]) => {
    const sw = (v / total) * bw;
    segs += `<rect x="${x.toFixed(1)}" y="54" width="${sw.toFixed(1)}" height="12" fill="${LANG_COLORS[n] || "#6f8aa8"}"/>`;
    x += sw;
  });
  body += `
  <clipPath id="bar"><rect x="28" y="54" width="${bw}" height="12" rx="6"><animate attributeName="width" from="0" to="${bw}" dur="1.4s" fill="freeze" calcMode="spline" keySplines=".65 0 .35 1" keyTimes="0;1"/></rect></clipPath>
  <g clip-path="url(#bar)">${segs}</g>`;
  top.forEach(([n, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    body += `<g class="in" style="animation-delay:${0.4 + i * 0.1}s" transform="translate(${28 + col * 225} ${112 + row * 38})">
      <circle cx="5" cy="-4" r="5" fill="${LANG_COLORS[n] || "#6f8aa8"}"/>
      <text x="16" y="0">${esc(n)}</text>
      <text class="m dim" x="195" y="0" text-anchor="end" style="font-size:12px">${((v / total) * 100).toFixed(1)}%</text></g>`;
  });
  return frame(w, h, "Top languages", body);
}

function activity(d) {
  const w = 1000, h = 260, padL = 40, padR = 24, top = 62, bottom = 36;
  const series = d.days.slice(-60);
  const total = series.reduce((a, b) => a + b, 0);
  let body = `<text class="h" x="28" y="36">Contribution Activity</text>
  <text class="m dim" x="${w - 28}" y="36" text-anchor="end" style="font-size:12px">${d.days.length ? fmt(total) : "–"} contributions in the last 60 days</text>`;
  const n = series.length;
  if (n < 2) {
    body += `<text x="${w / 2}" y="${h / 2 + 10}" text-anchor="middle" class="dim">Waiting for the first workflow run…</text>`;
    return frame(w, h, "Contribution activity", body);
  }
  const max = Math.max(...series, 1), iw = w - padL - padR, ih = h - top - bottom;
  const pts = series.map((v, i) => [padL + (i * iw) / (n - 1), top + ih - (v / max) * ih]);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2;
    line += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${line} L${pts[n - 1][0].toFixed(1)},${top + ih} L${pts[0][0].toFixed(1)},${top + ih} Z`;
  const pk = pts[series.indexOf(Math.max(...series))];
  const grid = [0, 0.5, 1].map((t) => `<line x1="${padL}" x2="${w - padR}" y1="${top + ih * t}" y2="${top + ih * t}" stroke="#1d3350" stroke-dasharray="3 6"/>`).join("");
  body += `${grid}
  <path d="${area}" fill="url(#fillg)"><animate attributeName="opacity" values="0;0;1" keyTimes="0;.4;1" dur="2.2s" fill="freeze"/></path>
  <path d="${line}" fill="none" stroke="url(#ac)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1">
    <animate attributeName="stroke-dashoffset" from="1" to="0" dur="2.2s" fill="freeze" calcMode="spline" keySplines=".65 0 .35 1" keyTimes="0;1"/></path>
  <circle cx="${pk[0].toFixed(1)}" cy="${pk[1].toFixed(1)}" r="4" fill="#00c896">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;.85;1" dur="2.6s" fill="freeze"/></circle>
  <circle cx="${pk[0].toFixed(1)}" cy="${pk[1].toFixed(1)}" r="4" fill="none" stroke="#00c896" opacity="0">
    <animate attributeName="r" values="4;14" dur="2s" begin="2.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values=".8;0" dur="2s" begin="2.4s" repeatCount="indefinite"/></circle>`;
  [["60 days ago", 0, "start"], ["30 days ago", 0.5, "middle"], ["today", 1, "end"]].forEach(([t, f, a]) => {
    body += `<text class="m dim" x="${(padL + f * iw).toFixed(1)}" y="${h - 12}" text-anchor="${a}" style="font-size:10px">${t}</text>`;
  });
  return frame(w, h, "Contribution activity", body);
}

// ---------- run ----------
const data = MODE === "mock" ? mockData() : MODE === "empty" ? emptyData() : await liveData();
fs.mkdirSync(OUT, { recursive: true });
const files = { "followers.svg": followers, "commune-card.svg": commune, "stats.svg": stats, "languages.svg": languages, "activity.svg": activity };
for (const [name, fn] of Object.entries(files)) fs.writeFileSync(`${OUT}/${name}`, fn(data));
console.log(`[${MODE}] wrote ${Object.keys(files).length} widgets to ${OUT}`);
