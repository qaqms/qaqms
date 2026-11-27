// Profile cards in a soft light-blue style (light + dark), generated from real public data.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arc, scaleLinear, sum } from 'd3';

export const palettes = {
  light: { bg: '#f4f9fe', bg2: '#eaf3fc', border: '#d6e6f5', text: '#1f2d3d', muted: '#62758a', faint: '#dceaf7', accent: '#2f7fc1', accent2: '#5a6fd0', bar: '#5fa8e0', bar2: '#cfe4f6', term: '#1d2a38', termBar: '#2a3a4c', termText: '#e8f1fa', termAccent: '#8ccaf5', termMuted: '#9fb3c7' },
  dark: { bg: '#16212d', bg2: '#1b2836', border: '#2c3e52', text: '#e8f1fa', muted: '#9fb3c7', faint: '#26384b', accent: '#8ccaf5', accent2: '#a9b8f5', bar: '#6db7ec', bar2: '#2f4860', term: '#0f1822', termBar: '#1b2836', termText: '#e8f1fa', termAccent: '#8ccaf5', termMuted: '#8ea3b8' }
};
const langColors = ['#5fa8e0', '#8a8fe0', '#5cc4c0', '#e8b65c', '#e48fae', '#9cc76e', '#a7b4c4', '#b9a3e3'];
const FONT = "'Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans CJK SC','Helvetica Neue',Arial,sans-serif";
const MONO = "Consolas,'SFMono-Regular',Menlo,'Microsoft YaHei',monospace";
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const fmt = n => Number(n).toLocaleString('en-US');
const svg = (w, h, title, body, extraStyle = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><style>text{font-family:${FONT};letter-spacing:0}.mono{font-family:${MONO}}${extraStyle}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>${body}</svg>`;
const t = (x, y, value, { size = 14, fill, weight, anchor, cls, extra = '' } = {}) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}${cls ? ` class="${cls}"` : ''} ${extra}>${esc(value)}</text>`;
const card = (w, h, c, fill = c.bg) => `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${fill}" stroke="${c.border}"/>`;

// "What I build": capability tiles drawn from the work in the N.E.K.O. plugins and mcbot (no star counts).
export const capabilities = [
  { icon: 'heart', title: 'AI 角色陪伴系统', en: 'Companion AI', lines: ['情绪模型、身体节律、日记式长期记忆，', '好感与关系阶段，让角色像在“生活”。'], chips: ['Python', 'LLM', 'SQLite'] },
  { icon: 'prompt', title: 'LLM Agent 工程', en: 'Agents', lines: ['自然语言下任务 → 自主拆解、规划、调用工具，', '通过 HTTP / SSE / MCP 任务桥接入宿主。'], chips: ['Java', 'Minecraft', 'MCP'] },
  { icon: 'layers', title: '插件全栈交付', en: 'Full-stack Plugins', lines: ['Python 后端 + TS/TSX 面板 + 宿主存储，', '从数据模型到交互界面一个人交付。'], chips: ['TypeScript', 'React', 'Python'] },
  { icon: 'cube', title: '3D 交互场景', en: 'Interactive 3D', lines: ['角色行走、坐下、转身的细节动画，', 'Blender 布料模拟烘焙进可漫游的小屋。'], chips: ['Blender', '3D', 'Animation'] }
];

// Badges are downloaded from shields.io at refresh time and served from ./assets (no camo / third-party dependency at view time).
export const badges = [
  ['GitHub', 'github'], ['N.E.K.O. Plugins', 'github'], ['Repositories', 'bookstack'],
  ['Python', 'python'], ['TypeScript', 'typescript'], ['JavaScript', 'javascript'], ['React', 'react'], ['Java', 'openjdk'], ['SQLite', 'sqlite'],
  ['pytest', 'pytest'], ['Ruff', 'ruff'], ['Git', 'git'], ['GitHub Actions', 'githubactions'], ['Blender', 'blender']
].map(([label, logo]) => ({ label, logo, slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
export const badgeColors = { light: ['E4F0FB', '2F7FC1'], dark: ['233547', '8CCAF5'] };

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
function nowPanel(x, y, w, c, rows) {
  const h = 54 + rows.length * 48;
  const ear = (ex, dir) => `<path d="M${ex - 22 * dir} ${y + 2}L${ex - 6 * dir} ${y - 30}L${ex + 12 * dir} ${y + 2}Z" fill="${c.accent}" stroke="${c.accent}" stroke-width="4" stroke-linejoin="round"/><path d="M${ex - 12 * dir} ${y}L${ex - 5 * dir} ${y - 16}L${ex + 3 * dir} ${y}Z" fill="${c.bar2}"/>`;
  let b = ear(x + 46, 1) + ear(x + w - 46, -1);
  b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${c.bg}" stroke="${c.accent}" stroke-width="2"/>`;
  b += t(x + 22, y + 30, 'NOW BUILDING', { size: 12, fill: c.accent2, weight: 700, cls: 'mono', extra: 'letter-spacing="2"' });
  rows.forEach(([title, sub], i) => {
    const ry = y + 66 + i * 48;
    b += `<circle cx="${x + 28}" cy="${ry - 5}" r="5" fill="${langColors[i]}"/>` + t(x + 44, ry, title, { size: 16, fill: c.text, weight: 700 }) + t(x + 44, ry + 19, sub, { size: 12, fill: c.muted });
  });
  return b;
}
const twinkle = '@keyframes tw{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}.tw{animation:tw 3.2s ease-in-out infinite}';

const nowRows = [['AI 角色陪伴', '情绪 · 记忆 · 关系系统'], ['LLM Agent', 'Minecraft 同伴 · 任务规划'], ['3D 交互', '角色动画 · 可漫游小屋']];
function hero(c, data, mobile) {
  const w = mobile ? 440 : 880, h = mobile ? 250 : 280;
  let b = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs>`;
  b += `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="16" fill="url(#g)" stroke="${c.border}"/>`;
  const sub = 'AI 角色陪伴 · LLM Agent · N.E.K.O. 插件';
  if (!mobile) {
    b += `<circle cx="840" cy="34" r="60" fill="${c.faint}" opacity=".6"/><circle cx="560" cy="262" r="40" fill="${c.faint}" opacity=".5"/>`;
    b += paw(520, 70, .9, c.accent, .22) + paw(500, 210, 1.1, c.accent2, .2) + paw(858, 250, .8, c.accent, .22);
    b += sparkle(528, 140, 8, c.accent, 0) + sparkle(856, 140, 7, c.accent2, 1.1) + sparkle(470, 40, 6, c.accent2, 2);
    b += nowPanel(560, 50, 270, c, nowRows);
    b += t(56, 82, '$ whoami', { size: 17, fill: c.accent, weight: 700, cls: 'mono' });
    b += t(54, 138, 'Hi there,', { size: 48, fill: c.text, weight: 800 });
    b += `<text x="54" y="194" font-size="48" font-weight="800" fill="${c.text}">I'm <tspan fill="${c.accent}">qaqms</tspan></text>`;
    b += t(56, 232, sub, { size: 17, fill: c.muted, weight: 600 });
  } else {
    b += paw(400, 50, .8, c.accent, .25) + paw(380, 214, .9, c.accent2, .2) + sparkle(360, 70, 7, c.accent, 0) + sparkle(410, 120, 6, c.accent2, 1.2);
    b += t(30, 60, '$ whoami', { size: 15, fill: c.accent, weight: 700, cls: 'mono' });
    b += t(28, 112, 'Hi there,', { size: 38, fill: c.text, weight: 800 });
    b += `<text x="28" y="160" font-size="38" font-weight="800" fill="${c.text}">I'm <tspan fill="${c.accent}">qaqms</tspan></text>`;
    b += t(30, 200, sub, { size: 14, fill: c.muted, weight: 600 });
  }
  return svg(w, h, `Hi there, I'm qaqms. ${sub}. Now building: ${nowRows.map(r => r.join(' – ')).join('; ')}.`, b, twinkle);
}

const icons = {
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  pulse: 'M3 12h4l2.5-6 5 12 2.5-6h4',
  repo: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 1.5 2 2.5 2C12 8 11 6 12 3z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  fork: 'M7 4a2 2 0 1 0 0 .1M17 4a2 2 0 1 0 0 .1M12 20a2 2 0 1 0 0 .1M7 6v2a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V6M12 12v6'
};
const icon = (x, y, d, color, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="${d}" fill="none" stroke="${color}" stroke-width="${(1.9 / k).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"/>`;

export function momentum(days) {
  const first = days.findIndex(d => d.count > 0);
  const span = first < 0 ? [] : days.slice(first);
  const active = span.filter(d => d.count > 0).length;
  const total = sum(span, d => d.count);
  return { since: span[0]?.date ?? days[0].date, spanDays: span.length, active, total, best: Math.max(0, ...span.map(d => d.count)), perActive: active ? total / active : 0 };
}

function overview(c, data) {
  const w = 880, h = 300;
  const m = momentum(data.days);
  const langs = Object.keys(data.languages).length;
  let b = card(w, h, c) + `<path d="M520 1V${h - 1}" stroke="${c.border}"/>`;
  b += t(36, 48, 'Momentum', { size: 22, fill: c.text, weight: 700 }) + t(36, 72, `since ${m.since}`, { size: 13, fill: c.muted, cls: 'mono' });
  const rows = [[icons.pulse, 'Contributions', fmt(m.total)], [icons.cal, 'Active days', `${m.active} / ${m.spanDays}`], [icons.flame, 'Best single day', m.best], [icons.star, 'Avg per active day', m.perActive.toFixed(1)], [icons.code, 'Languages shipped', langs]];
  rows.forEach(([d, label, value], i) => {
    const y = 108 + i * 36;
    b += icon(36, y - 17, d, c.accent2) + t(72, y, label, { size: 16, fill: c.text, weight: 600 }) + t(282, y, value, { size: 16, fill: c.text, weight: 700 });
  });
  const share = m.active / Math.max(1, m.spanDays);
  const ring = arc().innerRadius(52).outerRadius(62).cornerRadius(5);
  b += `<path transform="translate(452 160)" d="${ring({ startAngle: 0, endAngle: Math.PI * 2 })}" fill="${c.faint}"/>`;
  b += `<path transform="translate(452 160)" d="${ring({ startAngle: 0, endAngle: Math.max(.05, share) * Math.PI * 2 })}" fill="${c.bar}"/>`;
  b += t(452, 164, `${Math.round(share * 100)}%`, { size: 26, fill: c.text, weight: 800, anchor: 'middle' }) + t(452, 186, 'days active', { size: 12, fill: c.muted, anchor: 'middle' });

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
  b += t(36, 282, `Updated ${data.updated} · ${data.total} contributions in the last year`, { size: 11, fill: c.muted });
  return svg(w, h, `Momentum since ${m.since}: ${m.total} contributions, ${m.active} of ${m.spanDays} days active, best day ${m.best}. Languages: ${shown.map(([k, v]) => `${k} ${(v / total * 100).toFixed(1)}%`).join(', ')}. Updated ${data.updated}.`, b);
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

const glyph = {
  heart: (x, y, f) => `<path transform="translate(${x} ${y})" d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z" fill="${f}"/>`,
  prompt: (x, y, f) => `<path transform="translate(${x} ${y})" d="M4 7l6 5-6 5M12 18h8" fill="none" stroke="${f}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  layers: (x, y, f) => `<path transform="translate(${x} ${y})" d="M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5" fill="none" stroke="${f}" stroke-width="2.2" stroke-linejoin="round"/>`,
  cube: (x, y, f) => `<path transform="translate(${x} ${y})" d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3zM3.5 7.3L12 12l8.5-4.7M12 12v9.5" fill="none" stroke="${f}" stroke-width="2.2" stroke-linejoin="round"/>`
};
function capabilitiesCard(c) {
  const w = 880, h = 448, tw = 400, th = 160;
  let b = card(w, h, c);
  b += t(32, 46, 'What I build', { size: 22, fill: c.text, weight: 700 }) + t(176, 46, '能力方向，而不是项目列表', { size: 13, fill: c.muted });
  capabilities.forEach((p, i) => {
    const x = 32 + (i % 2) * (tw + 16), y = 70 + Math.floor(i / 2) * (th + 16), col = langColors[i];
    b += `<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="12" fill="${c.bg2}" stroke="${c.border}"/>`;
    b += `<rect x="${x + 18}" y="${y + 18}" width="40" height="40" rx="10" fill="${col}" opacity=".18"/>` + glyph[p.icon](x + 26, y + 26, col);
    b += t(x + 72, y + 36, p.title, { size: 17, fill: c.text, weight: 700 }) + t(x + 72, y + 55, p.en, { size: 12, fill: c.muted, weight: 600 });
    p.lines.forEach((line, j) => { b += t(x + 20, y + 88 + j * 21, line, { size: 13, fill: c.text }); });
    let cx = x + 20;
    p.chips.forEach(chip => { const cw = chip.length * 7.2 + 18; b += `<rect x="${cx}" y="${y + 124}" width="${cw}" height="22" rx="11" fill="${c.faint}"/>` + t(cx + cw / 2, y + 139, chip, { size: 11, fill: c.accent, weight: 600, anchor: 'middle' }); cx += cw + 8; });
  });
  b += t(32, 432, '每个插件都按版本持续发布，用 pytest / Ruff / GitHub Actions 把关。', { size: 12, fill: c.muted });
  return svg(w, h, 'What I build: ' + capabilities.map(p => `${p.title} (${p.en}): ${p.lines.join('')}`).join(' '), b);
}

function terminal(c, data, repos) {
  const w = 880, h = 250;
  const own = repos.filter(r => !r.fork && r.name !== data.user);
  const neko = own.filter(r => r.name.startsWith('n.e.k.o_plugin_')).map(r => r.name.replace('n.e.k.o_plugin_', ''));
  const years = ((Date.parse(data.updated) - Date.parse(data.joined)) / 31557600000).toFixed(1);
  let b = `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${c.term}" stroke="${c.border}"/><path d="M14 .5h852a14 14 0 0 1 13.5 13.5V34H.5V14A14 14 0 0 1 14 .5z" fill="${c.termBar}"/>`;
  b += ['#f29b9b', '#e9cc8a', '#a8dcc0'].map((f, i) => `<circle cx="${24 + i * 20}" cy="17" r="6" fill="${f}"/>`).join('');
  b += t(440, 22, 'qaqms@neko: ~', { size: 13, fill: c.termMuted, anchor: 'middle', cls: 'mono' });
  const prompt = (y, cmd) => `<text x="24" y="${y}" font-size="15" class="mono"><tspan fill="${c.termAccent}">qaqms@neko</tspan><tspan fill="${c.termMuted}">:~$ </tspan><tspan fill="${c.termText}">${esc(cmd)}</tspan></text>`;
  const out = (y, s, fill = c.termText) => t(24, y, s, { size: 15, fill, cls: 'mono' });
  b += prompt(66, 'whoami');
  const m = momentum(data.days);
  b += out(90, `qaqms  since=${m.since}  contributions=${m.total}  active_days=${m.active}/${m.spanDays}`);
  b += out(112, '  likes: 二次元 · 猫娘 · 写点让她更像她的插件', c.termMuted);
  b += prompt(146, 'ls ~/n.e.k.o/plugins');
  b += out(170, neko.join('   ') || '—');
  b += prompt(204, 'echo $MOTTO');
  b += out(228, '"code & little worlds" ✿');
  b += `<rect class="cur" x="236" y="216" width="9" height="16" fill="${c.termAccent}"/>`;
  return svg(w, h, `Terminal: qaqms joined ${data.joined}, ${data.publicRepos} public repositories; N.E.K.O. plugins: ${neko.join(', ')}.`, b, '@keyframes bl{50%{opacity:0}}.cur{animation:bl 1.1s steps(1) infinite}');
}

export async function renderCards(data, repos, assets) {
  for (const [theme, c] of Object.entries(palettes)) {
    await writeFile(join(assets, `hero-${theme}.svg`), hero(c, data, false));
    await writeFile(join(assets, `hero-mobile-${theme}.svg`), hero(c, data, true));
    await writeFile(join(assets, `stats-${theme}.svg`), overview(c, data));
    await writeFile(join(assets, `recent-${theme}.svg`), activity(c, data));
    await writeFile(join(assets, `build-${theme}.svg`), capabilitiesCard(c));
    await writeFile(join(assets, `terminal-${theme}.svg`), terminal(c, data, repos));
  }
}
