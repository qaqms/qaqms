import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(join(root, 'profile-data.json'), 'utf8'));
assert.equal(data.user, 'qaqms');
assert.ok(data.days.length >= 350);
assert.equal(data.total, data.days.reduce((sum, day) => sum + day.count, 0));
assert.equal(new Set(data.days.map(day => day.date)).size, data.days.length);
for (const [i, day] of data.days.entries()) {
  assert.ok(Number.isInteger(day.count) && day.count >= 0);
  assert.ok(Number.isInteger(day.level) && day.level >= 0 && day.level <= 4);
  assert.equal(day.level === 0, day.count === 0);
  if (i) assert.equal(Date.parse(day.date) - Date.parse(data.days[i - 1].date), 86400000);
}
assert.ok(data.publicRepos >= data.sourceRepos);
assert.ok(Object.values(data.languages).every(value => Number.isInteger(value) && value > 0));
const $ = load(await readFile(join(root, 'README.md'), 'utf8'));
for (const element of $('img,source').toArray()) {
  const path = $(element).attr('src') || $(element).attr('srcset');
  if (path.startsWith('./assets/')) await access(join(root, path));
  else if (path.startsWith('https://count.getloli.com/')) {
    const counter = new URL(path);
    assert.equal(counter.pathname, '/@qaqms', 'Keep a stable, personal counter name');
    const expected = new URLSearchParams({ theme: 'moebooru', padding: '7', offset: '0', align: 'top', scale: '1', pixelated: '1', darkmode: 'auto' });
    assert.deepEqual([...counter.searchParams].sort(), [...expected].sort(), 'No fixed num, demo mode, or rotating counter identifiers');
  } else assert.fail(`Unexpected remote image: ${path}`);
  if (element.tagName === 'img') assert.ok($(element).attr('alt'));
}
assert.equal($('img[src^="https://count.getloli.com/"]').length, 1, 'Embed the live counter exactly once');
for (const picture of $('picture').toArray()) assert.ok($(picture).find('source[media*="dark"]').length, 'Every picture needs a dark variant');
for (const name of ['banner', 'stats', 'recent', 'console', 'landscape']) assert.equal($(`img[src="./assets/${name}-light.svg"]`).length, 1, name);
assert.equal($('img[src^="./assets/project-"]').length, 0, 'No per-repo cards: the profile shows capabilities, not star counts');
for (const element of $('a').toArray()) assert.ok($(element).attr('href')?.startsWith('https://github.com/qaqms'));
for (const file of await readdir(join(root, 'assets'))) {
  if (!file.endsWith('.svg')) continue;
  const source = await readFile(join(root, 'assets', file), 'utf8');
  const xml = load(source, { xmlMode: true });
  assert.equal(xml('svg').length, 1, file);
  if (!file.startsWith('tag-')) assert.ok(xml('svg').attr('viewBox'), file);
  assert.ok(!/NaN|undefined|Infinity|<script/i.test(source.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '')), file);
  if (!file.startsWith('tag-')) assert.ok(xml('title').length, file);
}
for (const theme of ['dark', 'light']) {
  const overview = await readFile(join(root, `assets/stats-${theme}.svg`), 'utf8');
  assert.ok(overview.includes(data.updated) && !/stars/i.test(overview));
  const activity = await readFile(join(root, `assets/recent-${theme}.svg`), 'utf8');
  assert.equal(load(activity, { xmlMode: true })('rect > title').length, 31);
  const landscape = await readFile(join(root, `assets/landscape-${theme}.svg`), 'utf8');
  assert.equal(load(landscape, { xmlMode: true })('g > title').length, data.days.length);
}
console.log(`PASS: ${data.days.length} calendar days, ${data.total} contributions, README links and all profile cards.`);
