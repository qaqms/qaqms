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
  if (path?.startsWith('./assets/')) {
    await access(join(root, path));
  } else {
    assert.equal(element.tagName, 'img', 'Only the live counter may be remote');
    const counter = new URL(path);
    assert.equal(counter.origin, 'https://count.getloli.com');
    assert.equal(counter.pathname, '/@qaqms', 'Keep a stable, personal counter name');
    const expected = new URLSearchParams({ theme: 'moebooru', padding: '7', offset: '0', align: 'top', scale: '1', pixelated: '1', darkmode: 'auto' });
    assert.deepEqual([...counter.searchParams].sort(), [...expected].sort(), 'No fixed num, demo mode, or rotating counter identifiers');
    assert.equal($(element).attr('width'), '292');
    assert.equal($(element).attr('align'), 'right');
  }
  if (element.tagName === 'img') assert.ok($(element).attr('alt'));
}
assert.equal($('img[src^="https://count.getloli.com/"]').length, 1, 'Embed the live counter exactly once');
assert.equal($('img[src="./assets/pixel-characters.png"]').length, 0, 'A character illustration is not a visitor counter');
assert.equal($('picture').length, 3);
assert.equal($('table').length, 1);
assert.ok(!$('h3').toArray().some(e => $(e).text() === 'Selected Works'));
assert.ok(!$('img').toArray().some(e => ($(e).attr('src') || '').includes('snake')));
assert.equal($('img[src*="skill-"]').length, 0);
assert.equal($('code img[src*="logo-"]').length, 6);
for (const element of $('img[src*="logo-"]').toArray()) assert.equal($(element).attr('height'), '20');
const githubLogo = await readFile(join(root, 'assets/logo-github.svg'), 'utf8');
assert.ok(githubLogo.includes('prefers-color-scheme:dark'));
assert.equal($('img[src="./assets/typing.svg"]').length, 1);
const typing = load(await readFile(join(root, 'assets/typing.svg'), 'utf8'), { xmlMode: true });
assert.equal(typing('animate').attr('repeatCount'), 'indefinite');
assert.equal(typing('clipPath rect').attr('width'), '264');
assert.ok(typing('style').text().includes('prefers-reduced-motion'));
for (const element of $('a').toArray()) assert.ok($(element).attr('href')?.startsWith('https://github.com/qaqms'));
for (const file of await readdir(join(root, 'assets'))) {
  if (!file.endsWith('.svg')) continue;
  const source = await readFile(join(root, 'assets', file), 'utf8');
  const xml = load(source, { xmlMode: true });
  assert.equal(xml('svg').length, 1, file);
  assert.ok(xml('svg').attr('viewBox'), file);
  assert.ok(!/NaN|undefined|Infinity|<script/i.test(source), file);
  if (!file.startsWith('skill-') && !file.startsWith('logo-') && !file.startsWith('snake-')) assert.ok(xml('title').length, file);
}
for (const theme of ['dark', 'light']) {
  const dashboard = await readFile(join(root, `assets/dashboard-${theme}.svg`), 'utf8');
  assert.ok(dashboard.includes(data.updated));
  assert.ok(dashboard.includes(`${data.total} contributions`));
  const orbit = await readFile(join(root, `assets/language-orbit-${theme}.svg`), 'utf8');
  assert.ok(!load(orbit, { xmlMode: true })('text').toArray().some(e => /source repos|^\d+$/.test(load(orbit, { xmlMode: true })(e).text())));
  const landscape = await readFile(join(root, `assets/landscape-${theme}.svg`), 'utf8');
  assert.equal(load(landscape, { xmlMode: true })('g > title').length, data.days.length);
}
console.log(`PASS: ${data.days.length} calendar days, ${data.total} contributions, README links and all SVG assets.`);
