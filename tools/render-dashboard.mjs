import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { color } from 'd3';

// Isometric contribution landscape (the older dashboard / language-orbit cards were replaced by render-cards.mjs).
export async function renderDashboard(data, assets) {
  const palettes = {
    dark: { bg:'#231b29', border:'#3d2f45', text:'#f4eaf2', muted:'#b6a5bc', blue:'#f4a6cd', teal:'#c4abf2', orange:'#e48bb8', empty:'#33263b' },
    light: { bg:'#fbf5fa', border:'#ecdcea', text:'#2e2435', muted:'#7d6c84', blue:'#b9467f', teal:'#7b5fc0', orange:'#d47aa7', empty:'#efe3ee' }
  };
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const first = Date.parse(data.days[0].date);
  const start = first - new Date(first).getUTCDay()*86400000;
  const weeks = Array.from({length:Math.floor((Date.parse(data.days.at(-1).date)-start)/604800000)+1}, ()=>0);
  data.days.forEach(d=>weeks[Math.floor((Date.parse(d.date)-start)/604800000)]+=d.count);
  const active = data.days.filter(d=>d.count>0).length;
  const busiest = Math.max(...data.days.map(d=>d.count));
  for (const [theme,c] of Object.entries(palettes)) {
    const text=(x,y,value,size=13,fill=c.text,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
    const svg=(w,h,title,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><style>text{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;letter-spacing:0}</style>${body}</svg>`;
    const colors=[c.teal,c.orange,c.blue];
    let body;
    body=`<rect x=".5" y=".5" width="879" height="349" rx="14" fill="${c.bg}" stroke="${c.border}"/>`+text(24,34,'Contribution Landscape',18,c.text,'font-weight="700"')+text(856,34,`${data.days[0].date} / ${data.days.at(-1).date}`,10,c.muted,'text-anchor="end"');
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
