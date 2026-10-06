import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arc, pie, line, scaleLinear, sum, color } from 'd3';

export async function renderDashboard(data, assets) {
  const palettes = {
    dark: { bg:'#0d1117', panel:'#1b1d27', text:'#e6edf3', muted:'#919ba6', grid:'#303641', blue:'#58a6ff', teal:'#35d5bc', orange:'#ef9b56', empty:'#192332' },
    light: { bg:'#ffffff', panel:'#f6f8fa', text:'#24292f', muted:'#59636e', grid:'#d1d9e0', blue:'#0969da', teal:'#087f70', orange:'#bf611b', empty:'#dfe7ef' }
  };
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const entries = Object.entries(data.languages).sort((a,b)=>b[1]-a[1]);
  const bytes = sum(entries, d=>d[1]);
  const first = Date.parse(data.days[0].date);
  const start = first - new Date(first).getUTCDay()*86400000;
  const weeks = Array.from({length:Math.floor((Date.parse(data.days.at(-1).date)-start)/604800000)+1}, ()=>0);
  data.days.forEach(d=>weeks[Math.floor((Date.parse(d.date)-start)/604800000)]+=d.count);
  const active = data.days.filter(d=>d.count>0).length;
  const busiest = Math.max(...data.days.map(d=>d.count));
  for (const [theme,c] of Object.entries(palettes)) {
    const text=(x,y,value,size=13,fill=c.text,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
    const svg=(w,h,title,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><style>text{font-family:Consolas,Menlo,Arial,sans-serif;letter-spacing:0}</style>${body}</svg>`;
    const colors=[c.blue,c.teal,c.orange,'#d886b6','#dfcb5a'];
    let body=`<rect width="560" height="290" rx="6" fill="${c.panel}"/>`+text(20,28,"qaqms / GitHub Dashboard",15,c.text,'font-weight="600"');
    const stats=[[data.total,'Contributions'],[data.publicRepos,'Public repos'],[active,'Active days'],[busiest,'Best day']];
    stats.forEach(([value,label],i)=>{const y=66+i*38;body+=`<rect x="20" y="${y-10}" width="5" height="10" rx="1" fill="${colors[i]}"/>`+text(36,y,label,12,c.muted)+text(209,y,value,16,c.text,'text-anchor="end" font-weight="600"');});
    const x=scaleLinear().domain([0,weeks.length-1]).range([256,536]);
    const y=scaleLinear().domain([0,Math.max(1,...weeks)]).nice().range([202,70]);
    body+=text(256,52,'Contributions / week',10,c.teal);
    y.ticks(3).forEach(t=>{body+=`<line x1="256" x2="536" y1="${y(t)}" y2="${y(t)}" stroke="${c.grid}"/>`+text(536,y(t)-5,t,9,c.muted,'text-anchor="end"');});
    const path=line().x((d,i)=>x(i)).y(d=>y(d))(weeks);
    body+=`<path d="${path}L536 202L256 202Z" fill="${c.orange}" opacity=".08"/><path d="${path}" fill="none" stroke="${c.orange}" stroke-width="1.7"/>`;
    body+=text(256,218,data.days[0].date.slice(2,7),10,c.muted)+text(536,218,data.days.at(-1).date.slice(2,7),10,c.muted,'text-anchor="end"');
    let offset=20;
    entries.forEach(([name,value],i)=>{const width=value/bytes*520;body+=`<rect x="${offset}" y="239" width="${width}" height="4" fill="${colors[i%colors.length]}"/>`;offset+=width;});
    body+=text(20,269,`Joined ${data.joined}`,10,c.muted)+text(540,269,`Updated ${data.updated}`,10,c.muted,'text-anchor="end"');
    await writeFile(join(assets,`dashboard-${theme}.svg`),svg(560,290,`${data.total} contributions; ${data.publicRepos} public repositories; ${active} active days. Updated ${data.updated}.`,body));

    body=text(280,30,'Languages / Source bytes',15,c.teal,'text-anchor="middle"');
    const donut=arc().innerRadius(98).outerRadius(137).padAngle(.016);
    pie().sort(null).value(d=>d[1])(entries).forEach((segment,i)=>{body+=`<path transform="translate(331 206)" d="${donut(segment)}" fill="${colors[i%colors.length]}"/>`;const y=128+i*39;body+=`<rect x="20" y="${y-10}" width="9" height="9" fill="${colors[i%colors.length]}"/>`+text(36,y,segment.data[0],12)+text(36,y+16,`${(segment.data[1]/bytes*100).toFixed(1)}%`,11,c.muted);});
    body+=text(280,376,'Owned non-fork repositories / not coding time',10,c.muted,'text-anchor="middle"');
    await writeFile(join(assets,`language-orbit-${theme}.svg`),svg(560,400,'Language source bytes: '+entries.map(([k,v])=>`${k} ${(v/bytes*100).toFixed(1)}%`).join(', '),body));

    body=`<rect width="880" height="350" rx="6" fill="${c.bg}"/>`+text(22,28,'qaqms / Contribution Landscape',17,c.blue,'font-weight="600"')+text(858,28,`${data.days[0].date} / ${data.days.at(-1).date}`,10,c.muted,'text-anchor="end"');
    const polygon=(points,fill)=>`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="${c.bg}" stroke-width=".6"/>`;
    data.days.forEach(d=>{
      const date=new Date(d.date);const week=Math.floor((date.getTime()-start)/604800000);const day=date.getUTCDay();
      const x=110+week*12+day*16;const y=86+week*2.8-day*7;
      const h=d.count?5+Math.sqrt(d.count)*8:0;
      const fill=d.count?colors[Math.min(2,Math.floor(week/20))]:c.empty;
      if(h){body+=polygon([[x,y],[x+12,y+2.8],[x+12,y+2.8-h],[x,y-h]],color(fill).darker(.7).formatHex());body+=polygon([[x+12,y+2.8],[x+28,y-4.2],[x+28,y-4.2-h],[x+12,y+2.8-h]],color(fill).darker(.35).formatHex());}
      body+=`<g><title>${esc(d.date)}: ${d.count} contributions</title>`+polygon([[x,y-h],[x+12,y+2.8-h],[x+28,y-4.2-h],[x+16,y-7-h]],fill)+'</g>';
    });
    const summary=[[data.total,'CONTRIBUTIONS'],[active,'ACTIVE DAYS'],[busiest,'BEST DAY']];
    summary.forEach(([value,label],i)=>{const x=80+i*270;body+=text(x,294,value,27,colors[i],'font-weight="600"')+text(x+68,292,label,11,c.muted);});
    body+=text(22,332,`Height = daily contributions / Updated ${data.updated}`,10,c.muted);
    await writeFile(join(assets,`landscape-${theme}.svg`),svg(880,350,'Isometric contribution chart based on real daily counts; '+data.total+' contributions.',body));
  }
}
