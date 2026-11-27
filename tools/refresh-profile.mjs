import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import { sum } from 'd3';
import { renderDashboard } from './render-dashboard.mjs';
import { renderCards, badges, badgeColors } from './render-cards.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const userName = 'qaqms';
const headers = { 'User-Agent': 'qaqms-profile', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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

await renderCards(data, repos, assets);
await renderDashboard(data, assets);
for (const b of badges) for (const [theme, [bg, fg]] of Object.entries(badgeColors)) {
  const label = encodeURIComponent(b.label.replaceAll('-', '--').replaceAll('_', '__'));
  const badge = await get(`https://img.shields.io/badge/${label}-${bg}?style=flat&logo=${b.logo}&logoColor=${fg}`, false);
  if (!badge.startsWith('<svg')) throw new Error(`Bad badge: ${b.label}`);
  await writeFile(join(assets, `tag-${b.slug}-${theme}.svg`), badge);
}
console.log(JSON.stringify({ total, repos: data.publicRepos, languages, date: today }));
