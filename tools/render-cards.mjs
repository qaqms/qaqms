// Profile cards in a soft sakura / lavender style (light + dark), generated from real public data.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arc, scaleLinear, sum } from 'd3';

export const palettes = {
  light: { bg: '#fbf5fa', bg2: '#f6eef8', border: '#ecdcea', text: '#2e2435', muted: '#7d6c84', faint: '#e9dcea', accent: '#b9467f', accent2: '#7b5fc0', bar: '#d47aa7', bar2: '#efd2e2', term: '#2c2233', termBar: '#3a2d43', termText: '#f2e8f0', termAccent: '#f4a6cd', termMuted: '#b9a7bf' },
  dark: { bg: '#231b29', bg2: '#2b2132', border: '#3d2f45', text: '#f4eaf2', muted: '#b6a5bc', faint: '#3b2e43', accent: '#f4a6cd', accent2: '#c4abf2', bar: '#e48bb8', bar2: '#4a3753', term: '#170f1c', termBar: '#2b2132', termText: '#f2e8f0', termAccent: '#f4a6cd', termMuted: '#a897ae' }
};
const langColors = ['#d47aa7', '#9681d4', '#6ea7d8', '#dfb25c', '#76c2a4', '#e58b70', '#a9a3bd', '#c7a3d9'];
const FONT = "'Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans CJK SC','Helvetica Neue',Arial,sans-serif";
const MONO = "Consolas,'SFMono-Regular',Menlo,'Microsoft YaHei',monospace";
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const fmt = n => Number(n).toLocaleString('en-US');
const svg = (w, h, title, body, extraStyle = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><style>text{font-family:${FONT};letter-spacing:0}.mono{font-family:${MONO}}${extraStyle}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>${body}</svg>`;
const t = (x, y, value, { size = 14, fill, weight, anchor, cls, extra = '' } = {}) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}${cls ? ` class="${cls}"` : ''} ${extra}>${esc(value)}</text>`;
const card = (w, h, c, fill = c.bg) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${fill}" stroke="${c.border}"/>`;

// Featured projects: short hand-written summaries (repos have no GitHub description).
export const featured = [
  { repo: 'n.e.k.o_plugin_forever_companion', name: '永远的陪伴', en: 'Forever Companion', lines: ['让猫娘拥有连续的生命状态：', '真实情绪、身体节律与三本属于她的日记。'] },
  { repo: 'n.e.k.o_plugin_love_with_you', name: '与你相恋', en: 'Love With You', lines: ['好感、恋爱关系、专属称呼与纪念日，', '还有一间能 360° 参观的 3D 小屋。'] },
  { repo: 'n.e.k.o_plugin_sticker_manager', name: '表情包管理', en: 'Sticker Manager', lines: ['让 YUI 在聊天里自己挑表情包发送，', '附带整理收藏的管理面板。'] },
  { repo: 'mcbot', name: 'mcbot', en: 'Minecraft Agent', lines: ['LLM 驱动的 Minecraft 同伴 agent 框架：', '用自然语言下任务，自主规划并执行。'] }
];

// Badges are downloaded from shields.io at refresh time and served from ./assets (no camo / third-party dependency at view time).
export const badges = [
  ['GitHub', 'github'], ['N.E.K.O. Plugins', 'github'], ['Repositories', 'bookstack'],
  ['Python', 'python'], ['TypeScript', 'typescript'], ['JavaScript', 'javascript'], ['React', 'react'], ['Java', 'openjdk'], ['SQLite', 'sqlite'],
  ['pytest', 'pytest'], ['Ruff', 'ruff'], ['Git', 'git'], ['GitHub Actions', 'githubactions'], ['Blender', 'blender']
].map(([label, logo]) => ({ label, logo, slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
export const badgeColors = { light: ['F6E9F2', 'B9467F'], dark: ['3D2F45', 'F4A6CD'] };

export function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (days[i]?.count === 0) i--; // today may simply not have a contribution yet
  let current = 0;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  return { current, longest };
}

function paw(x, y, s, fill, opacity = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${opacity}"><ellipse cx="0" cy="6" rx="7" ry="6"/><circle cx="-8" cy="-3" r="3.2"/><circle cx="-3" cy="-8" r="3.2"/><circle cx="3" cy="-8" r="3.2"/><circle cx="8" cy="-3" r="3.2"/></g>`;
}
function sparkle(x, y, r, fill, delay) {
  return `<path class="tw" style="animation-delay:${delay}s;transform-origin:${x}px ${y}px" d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${fill}"/>`;
}
function avatarBlock(cx, cy, r, c, img, id) {
  const ear = (dir) => {
    const bx = cx + dir * r * 0.62, by = cy - r * 0.72;
    return `<path d="M${bx - dir * r * 0.34} ${by + r * 0.14}L${bx + dir * r * 0.18} ${by - r * 0.62}L${bx + dir * r * 0.42} ${by + r * 0.3}Z" fill="${c.accent}" stroke="${c.bg}" stroke-width="5" stroke-linejoin="round"/>`
      + `<path d="M${bx - dir * r * 0.14} ${by + r * 0.08}L${bx + dir * r * 0.16} ${by - r * 0.36}L${bx + dir * r * 0.28} ${by + r * 0.2}Z" fill="${c.bar2}"/>`;
  };
  return ear(-1) + ear(1)
    + `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`
    + `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="${c.bg}" stroke="${c.accent}" stroke-width="3"/>`
    + `<image href="${img}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
}
const twinkle = '@keyframes tw{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}.tw{animation:tw 3.2s ease-in-out infinite}';

function hero(c, img, data, mobile) {
  const w = mobile ? 440 : 880, h = mobile ? 330 : 280;
  let b = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>`;
  b += `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="16" fill="url(#g)" stroke="${c.border}"/>`;
  if (!mobile) {
    b += `<circle cx="720" cy="140" r="118" fill="${c.faint}" opacity=".7"/><circle cx="820" cy="40" r="46" fill="${c.faint}" opacity=".6"/>`;
    b += paw(560, 228, 1.1, c.accent, .25) + paw(845, 238, .9, c.accent2, .25) + paw(600, 60, .8, c.accent2, .2);
    b += sparkle(612, 132, 9, c.accent, 0) + sparkle(838, 120, 7, c.accent2, 1.1) + sparkle(800, 222, 6, c.accent, 2);
    b += avatarBlock(720, 150, 82, c, img, 'av');
    b += t(56, 82, '$ whoami', { size: 17, fill: c.accent, weight: 700, cls: 'mono' });
    b += t(54, 138, 'Hi there,', { size: 48, fill: c.text, weight: 800 });
    b += `<text x="54" y="194" font-size="48" font-weight="800" fill="${c.text}">I'm <tspan fill="${c.accent}">qaqms</tspan></text>`;
    b += t(56, 232, '二次元爱好者 / N.E.K.O. 插件开发', { size: 18, fill: c.muted, weight: 600 });
  } else {
    b += `<circle cx="340" cy="92" r="74" fill="${c.faint}" opacity=".7"/>`;
    b += paw(404, 168, .8, c.accent, .25) + sparkle(270, 50, 7, c.accent, 0) + sparkle(410, 40, 6, c.accent2, 1.2);
    b += avatarBlock(340, 98, 54, c, img, 'av');
    b += t(30, 52, '$ whoami', { size: 15, fill: c.accent, weight: 700, cls: 'mono' });
    b += t(28, 196, 'Hi there,', { size: 38, fill: c.text, weight: 800 });
    b += `<text x="28" y="242" font-size="38" font-weight="800" fill="${c.text}">I'm <tspan fill="${c.accent}">qaqms</tspan></text>`;
    b += t(30, 284, '二次元爱好者 / N.E.K.O. 插件开发', { size: 16, fill: c.muted, weight: 600 });
  }
  return svg(w, h, "Hi there, I'm qaqms. 二次元爱好者 / N.E.K.O. 插件开发", b, twinkle);
}

const icons = {
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  pulse: 'M3 12h4l2.5-6 5 12 2.5-6h4',
  repo: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  fork: 'M7 4a2 2 0 1 0 0 .1M17 4a2 2 0 1 0 0 .1M12 20a2 2 0 1 0 0 .1M7 6v2a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V6M12 12v6'
};
const icon = (x, y, d, color, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="${d}" fill="none" stroke="${color}" stroke-width="${(1.9 / k).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>`;

function overview(c, data) {
  const w = 880, h = 300;
  const active = data.days.filter(d => d.count > 0).length;
  let b = card(w, h, c) + `<path d="M520 1V${h - 1}" stroke="${c.border}"/>`;
  b += t(36, 50, 'GitHub Stats', { size: 22, fill: c.text, weight: 700 });
  const rows = [[icons.star, 'Total Stars Earned', data.stars], [icons.pulse, 'Contributions (last year)', data.total], [icons.repo, 'Public Repositories', data.publicRepos], [icons.fork, 'Original Projects', data.sourceRepos], [icons.cal, 'Active Days (last year)', active]];
  rows.forEach(([d, label, value], i) => {
    const y = 96 + i * 40;
    b += icon(36, y - 17, d, c.accent2) + t(72, y, label, { size: 16, fill: c.text, weight: 600 }) + t(330, y, fmt(value), { size: 16, fill: c.text, weight: 700 });
  });
  // activity ring: share of active days in the last year
  const share = active / data.days.length;
  const ring = arc().innerRadius(52).outerRadius(62).cornerRadius(5);
  b += `<path transform="translate(436 160)" d="${ring({ startAngle: 0, endAngle: Math.PI * 2 })}" fill="${c.faint}"/>`;
  b += `<path transform="translate(436 160)" d="${ring({ startAngle: 0, endAngle: Math.max(.05, share) * Math.PI * 2 })}" fill="${c.bar}"/>`;
  b += t(436, 164, `${Math.round(share * 100)}%`, { size: 26, fill: c.text, weight: 800, anchor: 'middle' }) + t(436, 186, 'active days', { size: 12, fill: c.muted, anchor: 'middle' });

  b += t(552, 50, 'Most used languages', { size: 20, fill: c.text, weight: 700 });
  const entries = Object.entries(data.languages).sort((a, b) => b[1] - a[1]);
  const total = sum(entries, d => d[1]);
  const shown = entries.length > 6 ? [...entries.slice(0, 5), ['Other', sum(entries.slice(5), d => d[1])]] : entries;
  let x = 552; const barW = 296;
  b += `<clipPath id="lb"><rect x="552" y="70" width="${barW}" height="10" rx="5"/></clipPath><g clip-path="url(#lb)">`;
  shown.forEach(([, v], i) => { const bw = v / total * barW; b += `<rect x="${x}" y="70" width="${Math.max(bw - 2, 0.5)}" height="10" fill="${langColors[i]}"/>`; x += bw; });
  b += '</g>';
  shown.forEach(([name, v], i) => {
    const y = 114 + i * 30;
    b += `<circle cx="558" cy="${y - 5}" r="5" fill="${langColors[i]}"/>` + t(574, y, name, { size: 15, fill: c.muted }) + t(848, y, `${(v / total * 100).toFixed(2)}%`, { size: 15, fill: c.text, weight: 700, anchor: 'end' });
  });
  b += t(552, 282, 'by source bytes in original repos · not proficiency', { size: 11, fill: c.muted });
  b += t(36, 282, `Joined ${data.joined} · updated ${data.updated}`, { size: 11, fill: c.muted });
  return svg(w, h, `GitHub stats: ${data.stars} stars, ${data.total} contributions in the last year, ${data.publicRepos} public repositories. Languages: ${shown.map(([k, v]) => `${k} ${(v / total * 100).toFixed(1)}%`).join(', ')}. Updated ${data.updated}.`, b);
}

function activity(c, data) {
  const w = 880, h = 290;
  const last = data.days.slice(-31);
  const { current, longest } = streaks(data.days);
  const month = sum(last, d => d.count);
  let b = card(w, h, c);
  const stats = [[fmt(month), 'Contributions in 31 days'], [`${current} day${current === 1 ? '' : 's'}`, 'Current streak'], [`${longest} day${longest === 1 ? '' : 's'}`, 'Longest streak'], [fmt(data.total), 'Contributions in the last year']];
  stats.forEach(([v, l], i) => { const x = 32 + i * 212; b += t(x, 58, v, { size: 34, fill: c.accent, weight: 800 }) + t(x, 86, l, { size: 14, fill: c.muted }); });
  const x0 = 70, x1 = 850, yTop = 122, yBot = 238;
  const y = scaleLinear().domain([0, Math.max(4, ...last.map(d => d.count))]).nice(3).range([yBot, yTop]);
  y.ticks(3).forEach(v => { b += `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" stroke="${c.faint}"/>` + t(x0 - 12, y(v) + 4, v, { size: 12, fill: c.muted, anchor: 'end' }); });
  const step = (x1 - x0) / last.length;
  last.forEach((d, i) => {
    const bh = Math.max(2, yBot - y(d.count));
    b += `<rect x="${(x0 + i * step + step * .14).toFixed(1)}" y="${(yBot - bh).toFixed(1)}" width="${(step * .72).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${d.count ? c.bar : c.faint}"><title>${d.date}: ${d.count} contributions</title></rect>`;
  });
  const label = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  [0, 10, 20, 30].forEach(i => { b += t(x0 + i * step + step / 2, 262, label(last[i].date), { size: 12, fill: c.muted, anchor: i === 0 ? 'start' : i === 30 ? 'end' : 'middle' }); });
  return svg(w, h, `Daily contributions over the last 31 days: ${month}. Current streak ${current} days, longest streak ${longest} days, ${data.total} contributions in the last year.`, b);
}

function project(c, p, repo) {
  const w = 430, h = 156;
  let b = card(w, h, c);
  b += paw(398, 30, .7, c.accent, .3);
  b += t(24, 40, p.name, { size: 19, fill: c.accent, weight: 700 }) + t(24 + [...p.name].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 19 : 11), 0) + 10, 40, p.en, { size: 13, fill: c.muted, weight: 600 });
  p.lines.forEach((line, i) => { b += t(24, 74 + i * 22, line, { size: 14, fill: c.text }); });
  const lang = repo?.language || '—';
  b += `<circle cx="30" cy="131" r="5" fill="${c.accent2}"/>` + t(42, 136, lang, { size: 12, fill: c.muted });
  let x = 42 + lang.length * 7.5 + 22;
  b += icon(x, 124, icons.star, c.muted, .62) + t(x + 18, 136, repo?.stargazers_count ?? 0, { size: 12, fill: c.muted });
  x += 44;
  b += icon(x, 124, icons.fork, c.muted, .62) + t(x + 18, 136, repo?.forks_count ?? 0, { size: 12, fill: c.muted });
  if (repo?.pushed_at) b += t(406, 136, `updated ${repo.pushed_at.slice(0, 10)}`, { size: 12, fill: c.muted, anchor: 'end' });
  return svg(w, h, `${p.name} (${p.repo}): ${p.lines.join('')} ${lang}, ${repo?.stargazers_count ?? 0} stars.`, b);
}

function terminal(c, data, repos) {
  const w = 880, h = 250;
  const own = repos.filter(r => !r.fork && r.name !== data.user);
  const neko = own.filter(r => r.name.startsWith('n.e.k.o_plugin_')).map(r => r.name.replace('n.e.k.o_plugin_', ''));
  const years = ((Date.parse(data.updated) - Date.parse(data.joined)) / 31557600000).toFixed(1);
  let b = `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${c.term}" stroke="${c.border}"/><path d="M14 .5h852a14 14 0 0 1 13.5 13.5V34H.5V14A14 14 0 0 1 14 .5z" fill="${c.termBar}"/>`;
  b += ['#f4a6cd', '#e9cc8a', '#a8dcc0'].map((f, i) => `<circle cx="${24 + i * 20}" cy="17" r="6" fill="${f}"/>`).join('');
  b += t(440, 22, 'qaqms@neko: ~', { size: 13, fill: c.termMuted, anchor: 'middle', cls: 'mono' });
  const prompt = (y, cmd) => `<text x="24" y="${y}" font-size="15" class="mono"><tspan fill="${c.termAccent}">qaqms@neko</tspan><tspan fill="${c.termMuted}">:~$ </tspan><tspan fill="${c.termText}">${esc(cmd)}</tspan></text>`;
  const out = (y, s, fill = c.termText) => t(24, y, s, { size: 15, fill, cls: 'mono' });
  b += prompt(66, 'whoami');
  b += out(90, `qaqms  joined=${data.joined} (${years}y)  repos=${data.publicRepos}  stars=${data.stars}`);
  b += out(112, '  likes: 二次元 · 猫娘 · 写点让她更像她的插件', c.termMuted);
  b += prompt(146, 'ls ~/n.e.k.o/plugins');
  b += out(170, neko.join('   ') || '—');
  b += prompt(204, 'echo $MOTTO');
  b += out(228, '"code & little worlds" ✿');
  b += `<rect class="cur" x="236" y="216" width="9" height="16" fill="${c.termAccent}"/>`;
  return svg(w, h, `Terminal: qaqms joined ${data.joined}, ${data.publicRepos} public repositories; N.E.K.O. plugins: ${neko.join(', ')}.`, b, '@keyframes bl{50%{opacity:0}}.cur{animation:bl 1.1s steps(1) infinite}');
}

export async function renderCards(data, repos, assets) {
  const avatar = await readFile(join(assets, 'avatar.png'));
  const img = `data:image/png;base64,${avatar.toString('base64')}`;
  const byName = new Map(repos.map(r => [r.name, r]));
  for (const [theme, c] of Object.entries(palettes)) {
    await writeFile(join(assets, `hero-${theme}.svg`), hero(c, img, data, false));
    await writeFile(join(assets, `hero-mobile-${theme}.svg`), hero(c, img, data, true));
    await writeFile(join(assets, `overview-${theme}.svg`), overview(c, data));
    await writeFile(join(assets, `activity-${theme}.svg`), activity(c, data));
    await writeFile(join(assets, `terminal-${theme}.svg`), terminal(c, data, repos));
    for (const p of featured) await writeFile(join(assets, `project-${p.repo}-${theme}.svg`), project(c, p, byName.get(p.repo)));
  }
}
