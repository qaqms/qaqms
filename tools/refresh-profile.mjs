import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import { scaleLinear, line, curveMonotoneX, pie, arc, sum } from 'd3';
import { renderDashboard } from './render-dashboard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const userName = 'qaqms';
const headers = { 'User-Agent': 'qaqms-profile', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
async function get(url, json = true) {
  const requestHeaders = url.startsWith('https://api.github.com/') ? headers : { 'User-Agent': 'qaqms-profile' };
  let body;
  const proxy = url.startsWith('https://api.github.com/') ? undefined : process.env.PROFILE_PROXY;
  if (process.platform === 'win32' || proxy) {
    const args = ['-sS', '-L', '--fail', '--max-time', '30', ...(proxy ? ['--proxy', proxy] : []), ...Object.entries(requestHeaders).flatMap(([key, value]) => ['-H', `${key}: ${value}`]), url];
    body = (await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { maxBuffer: 10 * 1024 * 1024 })).stdout;
  } else {
    const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    body = await response.text();
  }
  return json ? JSON.parse(body) : body;
}
await mkdir(assets, { recursive: true });
const user = await get(`https://api.github.com/users/${userName}`);
const repos = [];
for (let page = 1; ; page++) {
  const batch = await get(`https://api.github.com/users/${userName}/repos?per_page=100&type=owner&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const sourceRepos = repos.filter(r => !r.fork && r.name !== userName);
const languages = {};
for (const repo of sourceRepos) {
  const bytes = await get(repo.languages_url);
  for (const [language, count] of Object.entries(bytes)) languages[language] = (languages[language] || 0) + count;
}
const snapshotMode = process.argv.includes('--snapshot');
const html = snapshotMode ? '' : await get(`https://github.com/users/${userName}/contributions`, false);
const $ = load(html);
const tooltips = new Map($('tool-tip').toArray().map(e => [$(e).attr('for'), $(e).text().trim()]));
let days = $('[data-date][data-level]').toArray().map(e => {
  const tip = tooltips.get($(e).attr('id')) || $(e).attr('aria-label') || '';
  const count = tip.startsWith('No contributions') ? 0 : Number(tip.match(/^(\d+) contribution/)?.[1]);
  if (!Number.isFinite(count)) throw new Error(`Unknown contribution tooltip: ${tip}`);
  return { date: $(e).attr('data-date'), level: Number($(e).attr('data-level')), count };
}).sort((a, b) => a.date.localeCompare(b.date));
if (snapshotMode) {
  const snapshot = JSON.parse(await readFile(join(root, 'tools/calendar-snapshot.json'), 'utf8'));
  if (snapshot.captured !== today) throw new Error('Snapshot is not current; run refresh without --snapshot');
  const records = new Map(snapshot.nonzero.map(([date, count, level]) => [date, { count, level }]));
  days = [];
  for (let t = Date.parse(snapshot.start); t <= Date.parse(snapshot.end); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.push({ date, ...(records.get(date) || { count: 0, level: 0 }) });
  }
  if (sum(days, d => d.count) !== snapshot.total) throw new Error('Snapshot total mismatch');
  console.warn(`Using browser-verified contribution snapshot ${snapshot.captured}`);
}
if (days.length < 350 || days.some(d => d.level < 0 || d.level > 4)) throw new Error('Contribution calendar is incomplete');
const total = sum(days, d => d.count);
const declared = Number($('h2').text().replaceAll(',', '').match(/(\d+) contributions/)?.[1]);
if (declared && declared !== total) throw new Error(`Contribution count mismatch: ${declared} vs ${total}`);
const data = { user: userName, updated: today, joined: user.created_at.slice(0, 10), publicRepos: user.public_repos, sourceRepos: sourceRepos.length, stars: sum(repos, r => r.stargazers_count), forks: sum(repos, r => r.forks_count), languages, total, days, source: `https://github.com/${userName}` };
await writeFile(join(root, 'profile-data.json'), JSON.stringify(data, null, 2));

const palettes = {
  dark: { bg: '#161b22', text: '#e6edf3', muted: '#9ba6b2', grid: '#30363d', blue: '#58a6ff', teal: '#39d6be', orange: '#ef9b56', yellow: '#e9cc5f', pink: '#d98eaf', levels: ['#21262d', '#164e45', '#237d68', '#34b394', '#63e5c5'] },
  light: { bg: '#f6f8fa', text: '#24292f', muted: '#57606a', grid: '#d0d7de', blue: '#0969da', teal: '#087f70', orange: '#bf611b', yellow: '#98751a', pink: '#a74877', levels: ['#e9edf1', '#c5efdf', '#82d7bb', '#32ae89', '#087f70'] }
};
function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escape(title)}</title><style>text{font-family:Segoe UI,Arial,sans-serif;letter-spacing:0} @media(prefers-reduced-motion:reduce){.scan{animation:none!important;opacity:0}}</style>${body}</svg>`;
}
function text(x, y, value, color, size = 14, extra = '') { return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${escape(value)}</text>`; }
for (const [theme, c] of Object.entries(palettes)) {
  const panel = (w, h) => `<rect width="${w}" height="${h}" rx="6" fill="${c.bg}"/>`;
  let body = panel(430, 245) + text(24, 34, 'GitHub / Overview', c.blue, 19, 'font-weight="600"');
  const stats = [[data.total, 'Contributions / last year'], [data.publicRepos, 'Public repositories'], [days.filter(d => d.count > 0).length, 'Active days / last year']];
  stats.forEach(([value, label], i) => { const y = 83 + i * 52; body += text(24, y, value, i === 0 ? c.teal : c.text, 28, 'font-weight="600"') + text(95, y - 2, label, c.text, 14); });
  body += text(24, 230, `Joined ${data.joined}  |  Updated ${today}`, c.muted, 12);
  await writeFile(join(assets, `overview-${theme}.svg`), svg(430, 245, `GitHub overview: ${total} contributions, ${data.publicRepos} public repositories. Snapshot ${today}.`, body));

  const langEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const langTotal = sum(langEntries, d => d[1]);
  const shown = langEntries.length > 5 ? [...langEntries.slice(0, 4), ['Other', sum(langEntries.slice(4), d => d[1])]] : langEntries;
  const colors = [c.blue, c.teal, c.orange, c.yellow, c.pink];
  body = panel(430, 245) + text(24, 34, 'Languages / Source bytes', c.blue, 19, 'font-weight="600"');
  const donut = arc().innerRadius(54).outerRadius(74);
  pie().sort(null).value(d => d[1])(shown).forEach((segment, i) => {
    body += `<path transform="translate(110 137)" d="${donut(segment)}" fill="${colors[i]}"/>`;
    const y = 84 + i * 26;
    body += `<rect x="211" y="${y - 11}" width="9" height="9" rx="2" fill="${colors[i]}"/>` + text(229, y, segment.data[0], c.text, 13) + text(403, y, `${(segment.data[1] / langTotal * 100).toFixed(1)}%`, c.text, 13, 'text-anchor="end"');
  });
  body += text(110, 133, sourceRepos.length, c.text, 24, 'text-anchor="middle" font-weight="600"') + text(110, 153, 'source repos', c.muted, 12, 'text-anchor="middle"') + text(24, 230, 'Owned, non-fork repositories; not skill proficiency.', c.muted, 12);
  await writeFile(join(assets, `languages-${theme}.svg`), svg(430, 245, `Language distribution by source bytes: ${shown.map(([k, v]) => `${k} ${(v / langTotal * 100).toFixed(1)}%`).join(', ')}`, body));

  const monthly = new Map();
  days.forEach(d => monthly.set(d.date.slice(0, 7), (monthly.get(d.date.slice(0, 7)) || 0) + d.count));
  const points = Array.from(monthly, ([month, count]) => ({ month, count }));
  const x = scaleLinear().domain([0, points.length - 1]).range([62, 855]);
  const y = scaleLinear().domain([0, Math.max(1, ...points.map(d => d.count))]).nice().range([199, 64]);
  const path = line().x((d, i) => x(i)).y(d => y(d.count)).curve(curveMonotoneX)(points);
  body = panel(880, 260) + text(24, 34, 'Contribution Activity', c.blue, 19, 'font-weight="600"') + text(855, 34, `${days[0].date} / ${days.at(-1).date}`, c.muted, 12, 'text-anchor="end"');
  y.ticks(3).forEach(t => { body += `<line x1="62" y1="${y(t)}" x2="855" y2="${y(t)}" stroke="${c.grid}"/>` + text(51, y(t) + 4, t, c.muted, 12, 'text-anchor="end"'); });
  body += `<path d="${path} L855 199 L62 199 Z" fill="${c.teal}" opacity=".12"/><path d="${path}" fill="none" stroke="${c.teal}" stroke-width="2.5"/>`;
  points.forEach((p, i) => { body += `<circle cx="${x(i)}" cy="${y(p.count)}" r="3" fill="${c.teal}"><title>${p.month}: ${p.count} contributions</title></circle>`; if (i % 2 === 0 || i === points.length - 1) body += text(x(i), 221, p.month.slice(2), c.muted, 12, 'text-anchor="middle"'); });
  body += text(24, 249, 'Contributions / month · Calendar totals, including displayed private counts.', c.muted, 12);
  await writeFile(join(assets, `activity-${theme}.svg`), svg(880, 260, 'Monthly GitHub contributions. Counts reflect the public profile calendar.', body));

  body = panel(880, 216) + text(24, 34, 'Contribution Grid / last year', c.blue, 19, 'font-weight="600"');
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const start = first.getTime() - first.getUTCDay() * 86400000;
  const lastWeek = Math.floor((new Date(`${days.at(-1).date}T00:00:00Z`).getTime() - start) / 604800000);
  days.forEach(d => {
    const date = new Date(`${d.date}T00:00:00Z`);
    const week = Math.floor((date.getTime() - start) / 604800000);
    body += `<rect x="${24 + week * 15.6}" y="${65 + date.getUTCDay() * 16}" width="12" height="12" rx="2" fill="${c.levels[d.level]}"><title>${d.date}: ${d.count} contributions</title></rect>`;
  });
  body += `<style>@keyframes scan{from{transform:translateX(0)}to{transform:translateX(${lastWeek * 15.6}px)}}.scan{animation:scan 14s linear infinite;fill:${c.teal}}</style><rect class="scan" x="24" y="181" width="20" height="3" rx="1" opacity=".8"/>`;
  body += text(24, 204, `${total} contributions · ${today}`, c.muted, 12);
  body += text(720, 204, 'Less', c.muted, 12);
  c.levels.forEach((color, i) => { body += `<rect x="${752 + i * 15}" y="194" width="11" height="11" rx="2" fill="${color}"/>`; });
  body += text(838, 204, 'More', c.muted, 12);
  await writeFile(join(assets, `contributions-${theme}.svg`), svg(880, 216, 'Real GitHub contribution calendar with a decorative scanning indicator; the scan does not modify the data.', body));
}
await renderDashboard(data, assets);
const logos = { python: 'python', ts: 'typescript-icon', react: 'react', sqlite: 'sqlite', git: 'git-icon', github: 'github-icon' };
for (const [id, name] of Object.entries(logos)) {
  const path = join(assets, `logo-${id}.svg`);
  try { await access(path); } catch {
    const source = await get(`https://cdn.svgporn.com/logos/${name}.svg`, false);
    const logo = load(source, { xmlMode: true });
    if (id === 'sqlite') {
      logo('g > path').first().remove();
      logo('svg').attr({ width: '198px', viewBox: '0 0 198 228' });
    }
    if (id === 'github') logo('svg').prepend('<style>path{fill:#24292f}@media(prefers-color-scheme:dark){path{fill:#e6edf3}}</style>');
    await writeFile(path, logo.xml());
  }
}
console.log(JSON.stringify({ total, repos: data.publicRepos, languages, date: today }));
