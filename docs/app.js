(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='cycle-terminal-v2-'+(window.__CT_ACCOUNT_ID__||'guest'),OLD='cycle-terminal-v1-'+(window.__CT_ACCOUNT_ID__||'guest'),HALVINGS=[['2012','2012-11-28','#8fb7fd'],['2016','2016-07-09','#f3ba6b'],['2020','2020-05-11','#49d5ac'],['2024','2024-04-20','#c998fd']],DAYS=86400000;
const presets={crypto:[['BINANCE:BTCUSDT','D'],['BINANCE:ETHUSDT','D'],['CRYPTOCAP:BTC.D','D'],['CRYPTOCAP:USDT.D','D'],['CRYPTOCAP:TOTAL3','D'],['BINANCE:SOLUSDT','D']],macro:[['BINANCE:BTCUSDT','D'],['TVC:DXY','D'],['TVC:US10Y','D'],['NASDAQ:NDX','D'],['OANDA:XAUUSD','D'],['SP:SPX','D']],cycle:[['BINANCE:BTCUSDT','W'],['BINANCE:BTCUSDT','M'],['CRYPTOCAP:BTC.D','W'],['CRYPTOCAP:TOTAL','W'],['TVC:DXY','W'],['NASDAQ:NDX','W']]};
const defaults=()=>({charts:presets.crypto.map(([symbol,interval])=>({symbol,interval})),cols:2,height:360,preset:'crypto',light:false,macroMemo:'',strategy:{phase:'Not configured',mood:'Not configured',riskExposure:'',reviewDate:'',thesis:'',invalidations:'',riskPlan:'',rules:[{phase:'Early Expansion',mood:'Extreme Fear',action:'Review gradual entry (example)'},{phase:'Late Expansion',mood:'Extreme Greed',action:'Review risk reduction (example)'},{phase:'Bear Market',mood:'Extreme Fear',action:'Manage liquidity and observe basing (example)'}]},journal:[],checks:{},history:[],historySource:''});
let state=defaults(),price=null,fear=[],funding=null,oi=null,oiObservedAt=0,history=[],historySource='',fetched={},lastHistoryRefresh=0,refreshBusy=false;
function readStorage(){try{const parsed=JSON.parse(localStorage.getItem(KEY));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){const initial=defaults();state={...initial,...parsed,strategy:{...initial.strategy,...(parsed.strategy||{})}};if(!Array.isArray(state.charts)||!state.charts.length||state.charts.length>16)state.charts=initial.charts;if(!Array.isArray(state.journal))state.journal=[];if(!Array.isArray(state.strategy.rules))state.strategy.rules=initial.strategy.rules;if(!Array.isArray(state.history))state.history=[]}else{const old=JSON.parse(localStorage.getItem(OLD));if(old&&Array.isArray(old.charts)&&old.charts.length<=16&&old.charts.length>0){state.charts=old.charts;state.cols=old.cols||2;state.height=old.height||360;state.preset=old.preset||'custom';state.light=!!old.light;const memo=localStorage.getItem('cycle-terminal-journal-'+(window.__CT_ACCOUNT_ID__||'guest'));if(memo)state.journal=[{id:String(Date.now()),date:new Date().toISOString().slice(0,16),title:'Imported V1 note',phase:'Wait and observe',price:'',horizon:'30',evidence:memo,action:'',review:''}]}}}catch(e){console.warn('Unable to read saved settings:',e)}// Translate only known legacy sample defaults; never rewrite free-form user notes.
 const terms={
  '\ucd08\uae30 \uc0c1\uc2b9':'Early Expansion','\uc0c1\uc2b9 \uc911\ubc18':'Mid Expansion','\uc0c1\uc2b9 \ud6c4\ubc18':'Late Expansion',
  '\ud558\ub77d \uad6d\uba74':'Bear Market','\ud310\ub2e8 \uc720\ubcf4':'Wait and Observe','\uadf9\ub2e8\uc801 \uacf5\ud3ec':'Extreme Fear',
  '\uadf9\ub2e8\uc801 \ud0d0\uc695':'Extreme Greed','\uacf5\ud3ec':'Fear','\ud0d0\uc695':'Greed','\uc911\ub9bd':'Neutral',
  '\ubbf8\uc124\uc815':'Not configured','\ubd84\ud560 \ub9e4\uc218 \ud6c4\ubcf4 \uac80\ud1a0 (\uc608\uc2dc)':'Review gradual entry (example)',
  '\uc704\ud5d8 \ucd95\uc18c \ud6c4\ubcf4 \uac80\ud1a0 (\uc608\uc2dc)':'Review risk reduction (example)',
  '\ud604\uae08 \uad00\ub9ac \ubc0f \uc800\uc810 \ud615\uc131 \uad00\ucc30 (\uc608\uc2dc)':'Manage liquidity and observe basing (example)'
 };
 const norm=x=>terms[x]||x;
 if(state.strategy){
  state.strategy.phase=norm(state.strategy.phase);
  state.strategy.mood=norm(state.strategy.mood);
  if(Array.isArray(state.strategy.rules))state.strategy.rules.forEach(rule=>{
   for(const k of ['phase','mood','action'])if(typeof rule[k]==='string')rule[k]=norm(rule[k]);
  });
 }
 // Migrate only the unchanged legacy Crypto Market preset's last Nasdaq slot.
 // User-modified / custom configurations remain untouched.
 if(state.preset==='crypto'&&Array.isArray(state.charts)&&state.charts.length===6
   &&state.charts.slice(0,5).every((c,i)=>c.symbol===presets.crypto[i][0])
   &&state.charts[5].symbol==='NASDAQ:NDX'){
   state.charts[5]={...state.charts[5],symbol:'BINANCE:SOLUSDT'};
 }
 history=normalizeHistory(state.history);historySource=state.historySource||''}
function persist(notify=false){try{localStorage.setItem(KEY,JSON.stringify(state));if(notify)toast('Saved to this browser.');return true}catch(e){toast('Unable to save. Check browser permissions or export a JSON backup.');return false}}
function toast(message){const node=$('toast');node.textContent=message;node.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.style.display='none',3100)}
const fmt=(v,d=0)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';const money=v=>Number.isFinite(Number(v))?'$'+fmt(v,0):'—';const dayNum=d=>Math.floor(Date.parse(d+'T00:00:00Z')/DAYS);const dayIso=n=>new Date(n*DAYS).toISOString().slice(0,10);const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const validSymbol=v=>/^[A-Za-z0-9_.!\-^]+:[A-Za-z0-9_.!\-^]+$/.test(v);
function setPage(page){if(page==='journal')page='strategy';document.querySelectorAll('.page').forEach(el=>el.classList.toggle('hidden',el.id!==page+'Page'));document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));document.body.classList.toggle('chart-focus',page==='charts');window.scrollTo({top:0,behavior:'instant'});if(page==='overview'){mountOverview();renderOverview()}if(page==='charts')renderCharts();if(page==='cycle')renderCycle();if(page==='sentiment')renderSentiment();if(page==='macro')mountMacro();if(page==='strategy'){renderStrategy();renderJournal()};if(page==='journal')renderJournal();if(page==='settings')renderSources();if(page==='community')renderCommunity()}
function initNav(){document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.goto)));$('exportAll').onclick=downloadBackup;$('backupBtn').onclick=downloadBackup;$('restoreInput').onchange=restoreBackup;$('clearLocal').onclick=()=>{if(confirm('Delete all saved chart layouts, strategies, decision records, and cached prices?')){localStorage.removeItem(KEY);location.reload()}}}
function applyTheme(){state.light=false;document.body.classList.remove('light');const b=$('themeBtn');if(b)b.textContent='☾ Dark Mode'}
function tv(target,chart){target.replaceChildren();let wrapper=document.createElement('div');wrapper.className='tradingview-widget-container';let inner=document.createElement('div');inner.className='tradingview-widget-container__widget';let credit=document.createElement('div');credit.className='tv-attribution';let link=document.createElement('a');link.href='https://www.tradingview.com/';link.target='_blank';link.rel='noopener nofollow';link.textContent='Chart by TradingView';credit.append(link);wrapper.append(inner,credit);target.append(wrapper);const sc=document.createElement('script');sc.async=true;sc.type='text/javascript';sc.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';sc.textContent=JSON.stringify({autosize:true,symbol:chart.symbol,interval:chart.interval,timezone:'Asia/Seoul',theme:'dark',style:'1',locale:'en',allow_symbol_change:chart.allowSymbolChange??!!chart.mini,hide_side_toolbar:!!chart.mini,hide_top_toolbar:!!chart.mini,hide_volume:false,withdateranges:!chart.mini,save_image:true,support_host:'https://www.tradingview.com'});wrapper.append(sc)}
let overviewMounted=false,macroMounted=false,overviewObserver=null;
function mountOverview(force=false){
 const target=$('overviewTv');if(!target)return;
 if(force){overviewMounted=false;overviewObserver?.disconnect();overviewObserver=null;target.replaceChildren();}
 if(overviewMounted||overviewObserver)return;
 const load=()=>{if(overviewMounted)return;overviewMounted=true;overviewObserver?.disconnect();overviewObserver=null;tv(target,{symbol:'COINBASE:BTCUSD',interval:'1',mini:true})};
 if('IntersectionObserver' in window){
  overviewObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load()},{rootMargin:'450px 0px'});
  overviewObserver.observe(target);
 }else{
  target.innerHTML='<div class="plot-placeholder">The TradingView chart will load when you reach this section.</div>';
  setTimeout(load,2500);
 }
}function mountMacro(force=false){
 const grid=$('macroGrid');if(!grid)return;
 if(macroMounted&&!force)return;
 if(window.macroChartObserver){window.macroChartObserver.disconnect();window.macroChartObserver=null}
 // Public widget data and underlying exchange indices are not interchangeable.
 // Four external-chart-restricted instruments use broker CFDs / cash proxies.
 // The US10Y yield uses source-labelled FRED daily observations, not a surrogate ETF.
 const data=[
  {name:'S&P 500 · Cash CFD',symbol:'FOREXCOM:SPXUSD',category:'US EQUITIES',description:'FOREX.com cash CFD · indicative, not official index prints',original:'SP:SPX'},
  {name:'Nasdaq 100 · Cash CFD',symbol:'FOREXCOM:NSXUSD',category:'US TECHNOLOGY',description:'FOREX.com cash CFD · may differ from official NDX',original:'NASDAQ:NDX'},
  {name:'Gold / XAUUSD',symbol:'OANDA:XAUUSD',category:'SAFE-HAVEN ASSET',description:'OANDA spot-gold quote'},
  {name:'Brent Crude · Cash CFD',symbol:'OANDA:BCOUSD',category:'ENERGY',description:'OANDA Brent crude CFD · not BR1! continuous futures',original:'ICEEUR:BRN1!'},
  {name:'Silver / XAGUSD',symbol:'OANDA:XAGUSD',category:'PRECIOUS METALS',description:'OANDA silver spot price · USD per troy ounce'},
  {name:'USD / KRW',symbol:'FX_IDC:USDKRW',category:'FOREIGN EXCHANGE',description:'FX_IDC indicative USD/KRW quote'}
 ];
 grid.replaceChildren();
 const targets=[];
 data.forEach(item=>{
  const card=document.createElement('article');card.className='macro-card';
  const head=document.createElement('div');head.className='macro-head';
  const heading=document.createElement('div');heading.className='macro-identity';
  const eyebrow=document.createElement('span');eyebrow.className='macro-category';eyebrow.textContent=item.category;
  const label=document.createElement('strong');label.textContent=item.name;
  const desc=document.createElement('small');desc.className='macro-data-note';desc.textContent=item.description;
  heading.append(eyebrow,label,desc);
  const tools=document.createElement('div');tools.className='macro-actions';
  const code=document.createElement('span');code.className='macro-symbol';code.textContent=item.native==='kospi'?'KOSPI / KS11':(item.native?'FRED · DGS10':item.symbol);
  const link=document.createElement('a');link.textContent='Open source ↗';
  link.href=item.native==='kospi'?'https://www.tradingview.com/symbols/KRX-KOSPI/':(item.native?'https://fred.stlouisfed.org/series/DGS10':'https://www.tradingview.com/chart/?symbol='+encodeURIComponent(item.original||item.symbol));
  link.rel='noopener noreferrer';link.target='_blank';link.className='macro-external';
  tools.append(code,link);head.append(heading,tools);
  const slot=document.createElement('div');slot.className='tv-slot';
  const loading=document.createElement('div');loading.className='macro-load-note';loading.textContent='Loading '+item.name+'…';slot.append(loading);
  card.append(head,slot);grid.append(card);targets.push({slot,item,done:false});
 });
 macroMounted=true;
 const load=entry=>{
  if(entry.done)return;entry.done=true;
  if(entry.item.native==='kospi'){renderKospiIndex(entry.slot);return}if(entry.item.native){renderTreasuryYield(entry.slot);return}
  // Avoid pop-up failures from exchanges that TradingView does not license for third-party widgets.
  tv(entry.slot,{symbol:entry.item.symbol,interval:'D',mini:true,allowSymbolChange:false});
 };
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   for(const e of entries){if(!e.isIntersecting)continue;const row=targets.find(r=>r.slot===e.target);if(row){load(row);observer.unobserve(e.target)}}
  },{rootMargin:'240px 0px',threshold:0.01});
  window.macroChartObserver=observer;
  targets.forEach(t=>observer.observe(t.slot));
 }else targets.forEach((t,i)=>setTimeout(()=>load(t),i*350));
}
async function renderKospiIndex(slot){
 const url='https://www.tradingview.com/symbols/KRX-KOSPI/';
 const errCard=message=>{
  slot.replaceChildren();
  const box=document.createElement('div');box.className='macro-native-error';
  const title=document.createElement('strong');title.textContent='KOSPI data is temporarily unavailable';
  const desc=document.createElement('p');desc.textContent=message+' No unrelated stock chart will be shown.';
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open actual KOSPI index ↗';
  box.append(title,desc,link);slot.append(box);
 };
 try{
  const response=await fetch('data/kospi.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Historical KOSPI dataset not published yet.');
  const data=await response.json();
  if(data.symbol!=='KS11')throw Error('Unexpected data source.');
  const rows=(Array.isArray(data.rows)?data.rows:[]).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&Number.isFinite(Number(row.close))&&Number(row.close)>100).slice(-255);
  if(rows.length<40)throw Error('Insufficient KOSPI observations.');
  const W=850,H=355,L=65,R=22,T=25,B=45,ns='http://www.w3.org/2000/svg';
  const values=rows.map(row=>Number(row.close)),low=Math.min(...values),high=Math.max(...values);
  const range=Math.max(high-low,50),min=Math.max(0,low-range*.13),max=high+range*.13;
  const X=i=>L+(i/(rows.length-1))*(W-L-R),Y=v=>T+(max-v)/(max-min)*(H-T-B);
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Actual KOSPI closing index levels; historical daily data, not an intraday price');
  svg.setAttribute('preserveAspectRatio','none');
  const node=(tag,attrs,label)=>{
   const el=document.createElementNS(ns,tag);for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));
   if(label!==undefined)el.textContent=label;svg.append(el);return el;
  };
  for(let k=0;k<=4;k++){
   const level=min+(max-min)*k/4,y=Y(level);
   node('line',{x1:L,y1:y,x2:W-R,y2:y,stroke:'#7b5638','stroke-opacity':'.40','stroke-dasharray':'3 5'});
   node('text',{x:L-10,y:y+4,'text-anchor':'end','font-size':'12',fill:'#c4a58d'},fmt(level,0));
  }
  for(let k=0;k<=4;k++){
   const i=Math.round(k*(rows.length-1)/4);
   node('text',{x:X(i),y:H-18,'text-anchor':'middle','font-size':12,fill:'#c4a58d'},rows[i].date.slice(0,7));
  }
  const line=values.map((value,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(value).toFixed(1)).join(' ');
  node('path',{d:line,stroke:'#f7931a','stroke-width':3,fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});
  node('circle',{cx:X(values.length-1),cy:Y(values.at(-1)),r:5,fill:'#ffc079'});
  const wrap=document.createElement('div');wrap.className='macro-native-chart';
  const header=document.createElement('div');header.className='macro-native-summary';
  const level=document.createElement('strong');level.textContent=fmt(values.at(-1),2);
  const timestamp=document.createElement('span');timestamp.textContent='KOSPI close · '+rows.at(-1).date+' · daily / delayed';
  header.append(level,timestamp);wrap.append(header,svg);
  slot.replaceChildren();slot.append(wrap);
 }catch(e){errCard(String(e.message||e))}
}
async function renderTreasuryYield(slot){
 const officialUrl='https://fred.stlouisfed.org/series/DGS10';
 function showFREDChart(reason){
  slot.replaceChildren();
  const wrap=document.createElement('div');wrap.className='macro-fred-visual';
  const heading=document.createElement('div');heading.className='macro-fred-label';
  heading.textContent='US 10Y Treasury Yield · FRED DGS10';
  const image=document.createElement('img');image.className='macro-fred-image';
  image.alt='Official Federal Reserve Economic Data graph of the US 10-year Treasury constant-maturity yield (DGS10).';
  image.loading='eager';image.decoding='async';image.referrerPolicy='no-referrer';
  image.src='https://fred.stlouisfed.org/graph/fredgraph.png?id=DGS10&cosd=2025-01-01';
  const caption=document.createElement('div');caption.className='macro-fred-caption';
  caption.textContent='Official FRED chart · daily observations · not a live TradingView quote';
  const link=document.createElement('a');link.href=officialUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open interactive FRED chart ↗';
  image.onerror=()=>{
   image.remove();
   const error=document.createElement('p');error.className='macro-fred-error';
   error.textContent='The source chart is blocked by your browser or network. Open the original FRED chart below.';
   wrap.insertBefore(error,caption);
  };
  wrap.append(heading,image,caption,link);
  slot.append(wrap);
 }
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  let response;
  try{response=await fetch('data/us10y.json',{cache:'no-cache',signal:controller.signal})}
  finally{clearTimeout(timeout)}
  if(!response.ok)throw Error('No published yield dataset');
  const data=await response.json(),rows=(Array.isArray(data?.rows)?data.rows:[]).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Number(r.value))).slice(-400);
  if(rows.length<60)throw Error('Not enough valid observations');
  const W=850,H=360,L=66,R=22,T=30,B=46;
  const vals=rows.map(r=>Number(r.value)),lo=Math.min(...vals),hi=Math.max(...vals),spread=Math.max(.25,hi-lo),min=Math.max(0,lo-spread*.13),max=hi+spread*.13;
  const X=i=>L+i/Math.max(1,rows.length-1)*(W-L-R),Y=v=>T+(max-v)/(max-min)*(H-T-B);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','US ten-year Treasury daily yield observations supplied by FRED, percent');
  const element=(tag,attrs,txt)=>{const n=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));if(txt!==undefined)n.textContent=txt;svg.append(n);return n};
  for(let j=0;j<5;j++){
   const value=min+(max-min)*j/4,y=Y(value);
   element('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#6b4a32','stroke-opacity':'.42','stroke-dasharray':'3 5'});
   element('text',{x:L-12,y:y+4,fill:'#c5aa91','font-size':12,'text-anchor':'end'},value.toFixed(2)+'%');
  }
  for(let j=0;j<5;j++){const i=Math.round(j*(rows.length-1)/4);element('text',{x:X(i),y:H-18,fill:'#c5aa91','font-size':12,'text-anchor':'middle'},rows[i].date.slice(0,7))}
  const path=vals.map((v,i)=>(i?'L':'M')+X(i).toFixed(2)+' '+Y(v).toFixed(2)).join(' ');
  element('path',{d:path,fill:'none',stroke:'#f7931a','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
  const last=vals.at(-1);
  element('circle',{cx:X(vals.length-1),cy:Y(last),r:5,fill:'#ffc27a',stroke:'#f7931a','stroke-width':2});
  const wrapper=document.createElement('div');wrapper.className='macro-native-chart';
  const summary=document.createElement('div');summary.className='macro-native-summary';
  const value=document.createElement('strong');value.textContent=last.toFixed(2)+'%';
  const date=document.createElement('span');date.textContent='Last FRED observation: '+rows.at(-1).date+' · not live';
  summary.append(value,date);wrapper.append(summary,svg);
  slot.replaceChildren();slot.append(wrapper);
 }catch(e){showFREDChart(e.message||'FRED feed unavailable')}
}
function renderCharts(){const grid=$('chartGrid');grid.replaceChildren();$('preset').value=state.preset;$('layout').value=String(state.cols);$('chartHeight').value=String(state.height);grid.style.setProperty('--cols',String(state.cols));grid.style.setProperty('--chart-height',state.height+'px');$('chartCount').textContent=state.charts.length+' CHARTS';state.charts.forEach((entry,i)=>{const card=document.createElement('article');card.className='chart-card';const head=document.createElement('div');head.className='chart-head';const symbol=document.createElement('input');symbol.type='text';symbol.value=entry.symbol;symbol.setAttribute('aria-label','Chart '+(i+1)+' Symbol');const interval=document.createElement('select');for(const [value,label] of [['15','15 min'],['60','1 hour'],['240','4 hours'],['D','Daily'],['W','Weekly'],['M','Monthly']]){interval.add(new Option(label,value))}interval.value=entry.interval;const apply=btn('Apply',()=>{const val=symbol.value.trim().toUpperCase();if(!validSymbol(val))return toast('Use a symbol such as BINANCE:BTCUSDT.');state.charts[i]={symbol:val,interval:interval.value};state.preset='custom';$('preset').value='custom';tv(body,state.charts[i]);persist()});symbol.addEventListener('keydown',e=>{if(e.key==='Enter')apply.click()});symbol.addEventListener('change',()=>apply.click());interval.addEventListener('change',()=>apply.click());const before=btn('←',()=>swap(i,i-1),'secondary');before.disabled=i===0;const after=btn('→',()=>swap(i,i+1),'secondary');after.disabled=i===state.charts.length-1;const remove=btn('×',()=>{state.charts.splice(i,1);state.preset='custom';renderCharts();persist()},'secondary remove');remove.disabled=state.charts.length===1;const body=document.createElement('div');body.className='chart-body tv-slot';head.append(symbol,interval,apply,before,after,remove);card.append(head,body);grid.append(card);tv(body,entry)});function swap(a,b){[state.charts[a],state.charts[b]]=[state.charts[b],state.charts[a]];state.preset='custom';renderCharts();persist()}}
function btn(text,action,cls='secondary'){const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=text;b.onclick=action;return b}
function initCharts(){ $('preset').onchange=e=>{const name=e.target.value;state.preset=name;if(presets[name])state.charts=presets[name].map(([symbol,interval])=>({symbol,interval}));renderCharts();persist()};$('layout').onchange=e=>{state.cols=Number(e.target.value);$('chartGrid').style.setProperty('--cols',state.cols);persist()};$('chartHeight').onchange=e=>{state.height=Number(e.target.value);$('chartGrid').style.setProperty('--chart-height',state.height+'px');persist()};$('applyAllInterval').onclick=()=>{const interval=$('allInterval').value;state.charts.forEach(c=>c.interval=interval);state.preset='custom';renderCharts();persist()};$('addChart').onclick=()=>{if(state.charts.length>=16)return toast('You can have up to 16 charts.');state.charts.push({symbol:'BINANCE:BTCUSDT',interval:'D'});state.preset='custom';renderCharts();persist()};$('resetCharts').onclick=()=>{if(confirm('Reset all charts to the default layout?')){Object.assign(state,{charts:defaults().charts,cols:2,height:360,preset:'crypto'});renderCharts();persist()}};$('saveCharts').onclick=()=>persist(true)}
function normalizeHistory(rows){const m=new Map();for(const r of Array.isArray(rows)?rows:[]){if(!r)continue;let date=String(r.date||'');const value=Number(r.price??r.close);if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(value)&&value>0)m.set(date,value)}return [...m].map(([date,price])=>({date,price})).sort((a,b)=>a.date.localeCompare(b.date))}
function setHistory(rows,source){const normalized=normalizeHistory(rows);if(normalized.length<5)throw Error('At least five price observations are required.');history=normalized;historySource=source;state.history=normalized;state.historySource=source;persist();renderCycle();renderOverview();renderPsychologyEngine()}
async function jsonGet(url,timeout=13000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const res=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);return await res.json()}finally{clearTimeout(timer)}}
async function fetchHistory(notify=false){
 const tag=$('historySource');if(tag)tag.textContent='Loading verified historical BTC closes…';
 const errors=[];
 function applyRows(rows,source){
  const normalized=normalizeHistory(rows);
  if(normalized.length<350)throw Error('Fewer than 350 valid observation dates');
  setHistory(normalized,source);
  renderSentiment();
  fetched.history='Connected ('+history.length+' days · '+history.at(-1).date+')';
  if(notify)toast('Historic prices: '+history.length+' observations imported');
  renderSources();return true;
 }
 // First-party same-origin proxy avoids CORS failures on iOS Safari.
 if(location.protocol==='https:'||location.protocol==='http:'){
  try{
   const data=await jsonGet('data/btc-history.json',14000);
   if(data?.status!=='ok'||!Array.isArray(data.rows))throw Error('Invalid server response');
   return applyRows(data.rows,data.source+' · GitHub Pages daily data refresh');
  }catch(e){errors.push('Server: '+e.message)}
 }
 try{
  let toTs=Math.floor(Date.now()/1000),all=[];
  for(let page=0;page<4;page++){
   const d=await jsonGet('https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000&toTs='+toTs,12500);
   const rows=d?.Data?.Data;
   if(!Array.isArray(rows)||rows.length<50)throw Error('Insufficient records');
   all=rows.concat(all);
   const oldest=Number(rows[0].time);
   if(oldest<1353283200)break;
   toTs=oldest-86400;
  }
  return applyRows(all.map(r=>({date:new Date(Number(r.time)*1000).toISOString().slice(0,10),price:Number(r.close)})),'CryptoCompare · BTC/USD daily close');
 }catch(e){errors.push('CryptoCompare '+e.message)}
 try{
  const data=await jsonGet('https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=true&cors=true',15000);
  if(!Array.isArray(data?.values))throw Error('No observations returned');
  return applyRows(data.values.map(r=>({date:new Date(Number(r.x)*1000).toISOString().slice(0,10),price:Number(r.y)})),'Blockchain.com · sampled market price');
 }catch(e){errors.push('Blockchain.com '+e.message)}
 // CoinGecko public history does not cover full 4-year cycles; useful only for
 // near-term sentiment divergence if both full-history sources are down.
 try{
  const data=await jsonGet('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365',13000);
  if(!Array.isArray(data?.prices))throw Error('No observations returned');
  return applyRows(data.prices.map(r=>({date:new Date(Number(r[0])).toISOString().slice(0,10),price:Number(r[1])})),'CoinGecko · most recent 365 days only');
 }catch(e){errors.push('CoinGecko '+e.message)}
 fetched.history='Automatic fetch failed ('+errors.join(' / ')+')';
 if(tag)tag.textContent=historySource||'External API restricted · CSV upload available';
 if(notify)toast('Historical price sources unavailable. Check the provider dates or import CSV.');
 renderSources();
}
function interpolateNearest(rows,target,window=5){let best=null,dist=Infinity;for(const r of rows){const delta=Math.abs(dayNum(r.date)-target);if(delta<dist){best=r;dist=delta}}return dist<=window?best:null}
function cycleSeries(year,base,maxDays){const origin=dayNum(base),start=interpolateNearest(history,origin,7);if(!start)return null;const x0=dayNum(start.date);const series=history.filter(r=>{const x=dayNum(r.date)-origin;return x>=0&&x<=maxDays}).map(r=>({x:dayNum(r.date)-origin,y:r.price/start.price*100}));if(!series.length)return null;return {year,start,series,origin,availableDays:series[series.length-1].x}}

function renderEmissionChart(){
 const root=$('cyclePlot'),legend=$('cycleLegend');
 if(!root||!legend)return;
 // Historical halving dates are actual calendar dates; dates from 2028 onward are illustrative estimates.
 // Cumulative issuance is calculated from the Bitcoin block-subsidy schedule (210,000 blocks/epoch).
 const milestones=[
  {date:'2009-01-03',height:0,name:'Genesis',actual:true},
  {date:'2012-11-28',height:210000,name:'1st halving',actual:true},
  {date:'2016-07-09',height:420000,name:'2nd halving',actual:true},
  {date:'2020-05-11',height:630000,name:'3rd halving',actual:true},
  {date:'2024-04-20',height:840000,name:'4th halving',actual:true},
  {date:'2028-04-17',height:1050000,name:'5th halving',actual:false},
  {date:'2032-04-17',height:1260000,name:'6th halving',actual:false},
  {date:'2036-04-17',height:1470000,name:'7th halving',actual:false},
  {date:'2040-04-17',height:1680000,name:'8th halving',actual:false},
  {date:'2044-04-17',height:1890000,name:'9th halving',actual:false},
  {date:'2048-04-17',height:2100000,name:'10th halving',actual:false},
  {date:'2052-04-17',height:2310000,name:'11th halving',actual:false}
 ];
 const cap=21000000,subsidyAt=epoch=>Math.floor((50e8)/Math.pow(2,epoch))/1e8;
 function issuanceAtHeight(height){
  let total=0,remaining=Math.max(0,height);
  for(let epoch=0;epoch<33&&remaining>0;epoch++){
   const count=Math.min(210000,remaining);
   total+=count*subsidyAt(epoch);remaining-=count;
  }
  return total;
 }
 const t0=Date.parse('2009-01-03T00:00:00Z'),t1=Date.parse('2049-01-01T00:00:00Z'),today=Date.now();
 const asTime=d=>Date.parse(d+'T00:00:00Z');
 const supplyAtTime=t=>{
  let i=0;while(i<milestones.length-2&&t>asTime(milestones[i+1].date))i++;
  const left=milestones[i],right=milestones[i+1];
  const frac=Math.max(0,Math.min(1,(t-asTime(left.date))/(asTime(right.date)-asTime(left.date))));
  return issuanceAtHeight(left.height+(right.height-left.height)*frac);
 };
 const W=1150,H=410,L=78,R=34,T=53,B=66;
 const chartWidth=W-L-R,chartHeight=H-T-B;
 const X=t=>L+(t-t0)/(t1-t0)*chartWidth,Y=s=>T+(1-s/cap)*chartHeight;
 const pathFor=(from,to,count)=>{
  const points=[];for(let i=0;i<=count;i++){const t=from+(to-from)*i/count;points.push((i?'L':'M')+X(t).toFixed(2)+' '+Y(supplyAtTime(t)).toFixed(2))}
  return points.join(' ');
 };
 const split=Math.max(t0,Math.min(t1,today));
 const historic=pathFor(t0,split,180),future=split<t1?pathFor(split,t1,190):'';
 const grid=[0,5,10,15,20,21].map(v=>{
  const y=Y(v*1e6);return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="'+(v===21?'#d9913860':'#72503945')+'" stroke-dasharray="'+(v===21?'6 5':'2 6')+'"/><text x="'+(L-14)+'" y="'+(y+4)+'" fill="#bda68e" text-anchor="end" font-size="12">'+v+'M</text>';
 }).join('');
 const years=[2009,2014,2019,2024,2029,2034,2039,2044,2049].map(yr=>{
  const x=X(asTime(yr+'-01-01'));return '<text x="'+x+'" y="'+(H-28)+'" text-anchor="middle" fill="#bfa78f" font-size="12">'+yr+'</text>';
 }).join('');
 const checkpoints=[0,1,2,3,4,5,6,8,10].map(i=>{
  const d=milestones[i],t=asTime(d.date);if(t>t1)return '';
  const s=issuanceAtHeight(d.height),x=X(t),y=Y(s),actual=d.actual;
  return '<circle cx="'+x+'" cy="'+y+'" r="'+(i===4?5:3.6)+'" fill="'+(actual?'#ffc279':'#342015')+'" stroke="#f5a544" stroke-width="1.5"><title>'+d.date+' · '+(s/1e6).toFixed(3)+'M BTC · block '+d.height.toLocaleString('en-US')+(actual?'':' · estimated')+'</title></circle>';
 }).join('');
 const asMillions=n=>(n/1e6).toFixed(3)+'M BTC';
 const at2024=issuanceAtHeight(840000),at2028=issuanceAtHeight(1050000),at2049=supplyAtTime(t1);
 const futureStart=X(split),futureY=Y(supplyAtTime(split));
 root.innerHTML='<div class="issuance-key"><span><i class="key-line actual"></i>Modeled issuance to date</span><span><i class="key-line projected"></i>Projected issuance</span><span><i class="key-line maximum"></i>21M theoretical cap</span></div>'+
 '<svg class="emission-svg issuance-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Bitcoin cumulative issuance grows from zero in 2009 and gradually approaches the 21 million supply cap through 2049. Forecast dates are estimates." preserveAspectRatio="xMidYMid meet">'+
 '<defs><linearGradient id="btcSupplyStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c4792e"/><stop offset=".58" stop-color="#f7931a"/><stop offset="1" stop-color="#ffc471"/></linearGradient><linearGradient id="btcSupplyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7931a" stop-opacity=".23"/><stop offset="1" stop-color="#f7931a" stop-opacity=".015"/></linearGradient></defs>'+
 '<text x="'+L+'" y="22" font-size="12" fill="#efb579" font-weight="700">TOTAL ISSUED / MILLION BTC</text>'+
 grid+years+
 '<path d="'+historic+' L '+X(split).toFixed(2)+' '+(H-B)+' L '+L+' '+(H-B)+' Z" fill="url(#btcSupplyFill)" opacity=".7"/>'+
 '<path d="'+historic+'" fill="none" stroke="url(#btcSupplyStroke)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>'+
 (future?'<path d="'+future+'" fill="none" stroke="#ffb256" stroke-width="3.5" stroke-dasharray="10 7" stroke-linecap="round" stroke-linejoin="round"/>':'')+
 (future?'<circle cx="'+futureStart+'" cy="'+futureY+'" r="5" stroke="#ffcf90" stroke-width="2" fill="#f7931a"/>':'')+
 checkpoints+
 '<text x="'+(W-R-2)+'" y="'+(Y(cap)-13)+'" fill="#ffbd69" text-anchor="end" font-size="14" font-weight="800">21,000,000 BTC MAX</text>'+
 '<text x="'+(W-R-2)+'" y="'+(Y(at2049)+24)+'" fill="#ffd9ad" text-anchor="end" font-size="12">2049 projection: '+(at2049/1e6).toFixed(3)+'M</text>'+
 '<text x="'+L+'" y="'+(H-5)+'" fill="#9b8575" font-size="11">2009 · NETWORK LAUNCH</text><text x="'+(W-R)+'" y="'+(H-5)+'" text-anchor="end" fill="#9b8575" font-size="11">2049 · PROJECTION</text></svg>';
 legend.innerHTML=[
  ['2009 · Genesis','0 BTC','Start of scheduled issuance'],
  ['2024 · 4th halving',asMillions(at2024),'93.75% of theoretical cap'],
  ['2028 · estimated',asMillions(at2028),'Block 1,050,000'],
  ['2049 · projection',asMillions(at2049),(at2049/cap*100).toFixed(2)+'% of 21M cap']
 ].map(([year,value,note])=>'<div class="emission-era"><small>'+year+'</small><strong>'+value+'</strong><span>'+note+'</span></div>').join('');
}

// Live countdown is based on the latest observed block height and a 10-minute-per-block estimate.
const HALVING_TARGET=1050000;
const HALVING_2024_UTC=Date.parse('2024-04-20T00:00:00Z');
let projectedHalvingAt=Date.parse('2028-04-17T00:00:00+09:00');
let countdownInterval=null,cycleElapsedAnimated=false;
const two=n=>String(Math.max(0,Math.floor(n))).padStart(2,'0');
function projectedKoreanDate(d){
 return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Seoul'}).format(d);
}
function shiftedProjectDate(ms,months){
 const d=new Date(ms+9*3600000);
 const day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
 return projectedKoreanDate(new Date(d.getTime()-9*3600000));
}
function syncHalvingBanner(){
 const now=Date.now(),diff=Math.max(0,projectedHalvingAt-now),days=Math.floor(diff/86400000);
 const hours=Math.floor(diff%86400000/3600000),minutes=Math.floor(diff%3600000/60000),seconds=Math.floor(diff%60000/1000);
 if($('nextHalvingHeroDate'))$('nextHalvingHeroDate').textContent=projectedKoreanDate(new Date(projectedHalvingAt));
 for(const [id,value] of [['halvingTimerDays',String(days)],['halvingTimerHours',two(hours)],['halvingTimerMinutes',two(minutes)],['halvingTimerSeconds',two(seconds)]]){
  if($(id)&&$(id).textContent!==value)$(id).textContent=value;
 }
 if($('halvingBeforeDate'))$('halvingBeforeDate').textContent=shiftedProjectDate(projectedHalvingAt,-18);
 if($('halvingAfterDate'))$('halvingAfterDate').textContent=shiftedProjectDate(projectedHalvingAt,18);
 if($('halvingHeightHero'))$('halvingHeightHero').textContent=chainTip?fmt(chainTip)+' / '+fmt(HALVING_TARGET):'Live block data pending';
 if($('halvingProgress'))$('halvingProgress').style.width=Math.max(0,Math.min(100,chainTip?(chainTip-840000)/(HALVING_TARGET-840000)*100:0))+'%';
}
function beginHalvingCountdown(){
 syncHalvingBanner();
 if(countdownInterval===null)countdownInterval=setInterval(()=>{if(!document.hidden)syncHalvingBanner()},1000);
}
function animateElapsedDays(){
 const target=$('cycleDays');if(!target)return;
 const days=Math.max(0,Math.floor((Date.now()-HALVING_2024_UTC)/86400000));
 if(cycleElapsedAnimated||!window.requestAnimationFrame){target.textContent=fmt(days)+' days';return}
 cycleElapsedAnimated=true;
 const beginning=performance.now(),duration=1150;
 const step=t=>{
  const n=Math.min(1,(t-beginning)/duration),ease=1-(1-n)**4;
  target.textContent=fmt(Math.round(days*ease))+' days';
  if(n<1)requestAnimationFrame(step);else target.textContent=fmt(days)+' days';
 };
 requestAnimationFrame(step);
}
let chainTip=null,chainFetchedAt=0;
async function refreshBlockHeight(){const el=$('liveBlockHeight'),count=$('nextHalvingBlocks'),eta=$('nextHalvingEstimate'),source=$('blockHeightStatus');if(!el)return;try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),11000);let response;try{response=await fetch('https://mempool.space/api/blocks/tip/height',{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer)}if(!response.ok)throw Error('HTTP '+response.status);const height=Number((await response.text()).trim());if(!Number.isInteger(height)||height<840000||height>1049999)throw Error('Block height validation failed');chainTip=height;chainFetchedAt=Date.now();const remaining=1050000-height;projectedHalvingAt=Date.now()+remaining*600000;syncHalvingBanner();if($('halvingEstimateSource'))$('halvingEstimateSource').textContent='mempool.space · last updated '+new Date(chainFetchedAt).toLocaleTimeString('en-US');el.textContent=fmt(height)+' blocks';count.textContent=fmt(remaining)+' blocks';const est=new Date(projectedHalvingAt);eta.textContent=projectedKoreanDate(est);source.textContent='mempool.space · fetched at '+new Date(chainFetchedAt).toLocaleTimeString('en-US')+' · forecast assumes 10 minutes per block';source.dataset.status='ok';fetched.block='Connected · '+new Date(chainFetchedAt).toLocaleTimeString('en-US');}catch(e){if(!chainTip){el.textContent='Unavailable';count.textContent='Unavailable';eta.textContent='Estimated 2028';}if($('halvingEstimateSource'))$('halvingEstimateSource').textContent='Block API unavailable · reference estimate shown';source.textContent='Network block API unavailable · '+e.message;source.dataset.status='stale';fetched.block='Connection failed ('+e.message+')'}renderSources()}

function renderHalvingPriceHistory(){
 const tbody=$('halvingPriceRows'),note=$('halvingPriceNote');if(!tbody)return;
 tbody.replaceChildren();
 const events=[
  {date:'2024-04-20',reward:'6.25 → 3.125 BTC'},
  {date:'2020-05-11',reward:'12.5 → 6.25 BTC'},
  {date:'2016-07-09',reward:'25 → 12.5 BTC'},
  {date:'2012-11-28',reward:'50 → 25 BTC'}
 ];
 const shift=(date,months)=>{
  const d=new Date(date+'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth()+months);
  return d.toISOString().slice(0,10);
 };
 const observation=(date)=>{
  const target=Date.parse(date+'T00:00:00Z');
  const result=history.reduce((best,p)=>{
   const offset=Math.abs(Date.parse(p.date+'T00:00:00Z')-target)/DAYS;
   return offset<=3&&(!best||offset<best.offset)?{date:p.date,price:p.price,offset}:best;
  },null);
  return result;
 };
 const addCell=(row,date,emphasis)=>{
  const td=document.createElement('td');
  const observed=observation(date);
  const main=document.createElement('strong');main.textContent=observed?money(observed.price):'—';
  if(emphasis)main.className='ct-halving-price';
  const label=document.createElement('small');label.textContent=observed&&observed.date!==date?'Observed '+observed.date+' · sampled':observed?'Observed '+observed.date:'Price unavailable';
  if(!emphasis){const requested=document.createElement('span');requested.className='ct-halving-date';requested.textContent=date;td.append(requested)}
  td.append(main,label);row.append(td);
 };
 for(const event of events){
  const tr=document.createElement('tr');
  const day=document.createElement('td');day.className='ct-halving-date';day.textContent=event.date;
  const reward=document.createElement('td');reward.textContent=event.reward;
  tr.append(day,reward);
  addCell(tr,event.date,true);addCell(tr,shift(event.date,-18),false);addCell(tr,shift(event.date,18),false);
  tbody.append(tr);
 }
 if(note)note.textContent=history.length?
  'Source: '+historySource+' · '+history.length+' BTC/USD observations. Prices use the nearest actual observation within ±3 days; sampled dates are explicitly shown. No interpolation.':
  'Loading BTC/USD history. No values are estimated when observations are unavailable.';
}
function renderCycle(){const days=Math.max(0,dayNum(new Date().toISOString().slice(0,10))-dayNum('2024-04-20'));$('halvingDays').textContent=fmt(days)+' days';animateElapsedDays();beginHalvingCountdown();$('cycleYear').textContent='Since the halving: '+(days/365.25).toFixed(2)+' years';$('historyCount').textContent=history.length?fmt(history.length)+' records':'None';$('historySource').textContent=historySource||'API request or CSV upload required';const range=Number($('cycleRange').value),rows=[],chart=[];const current=cycleSeries('2024','2024-04-20',Math.max(range,days));if(current){const observed=interpolateNearest(history,dayNum(new Date().toISOString().slice(0,10)),7)||history[history.length-1];const y=observed.price/current.start.price*100-100;$('cycleReturn').textContent=(y>=0?'+':'')+fmt(y,1)+'%';$('cycleReturn').className='stat-value '+(y<0?'negative':'positive')}else{$('cycleReturn').textContent='—';$('cycleReturn').className='stat-value'}
for(const [year,date,color] of HALVINGS){const s=cycleSeries(year,date,range);if(s&&s.series.length>1)chart.push({label:year,color,points:s.series});if(!s){rows.push(`<tr><td>${year}</td><td>—</td><td>—</td><td>—</td><td>Data unavailable</td></tr>`);continue}const elapsed=Math.min(days,range);const comparable=s.series.filter(r=>r.x<=elapsed);const at=comparable[comparable.length-1];const max=s.series.reduce((acc,item)=>Math.max(acc,item.y),0);rows.push(`<tr><td>${year}</td><td>${money(s.start.price)}</td><td>${at?(at.y-100>=0?'+':'')+fmt(at.y-100,1)+'%':'—'}</td><td>+${fmt(max-100,1)}%</td><td>${s.series.length} observations</td></tr>`)}$('cycleTable').innerHTML=rows.join('');renderEmissionChart();renderSeasonality();renderHalvingPriceHistory();renderCyclePerformance();renderV11Cycle();}
function parseCsv(content){const lines=content.trim().split(/\r?\n/);if(lines.length<2)throw Error('Not enough CSV rows');let cols=lines[0].replace(/^\uFEFF/,'').split(',').map(s=>s.trim().toLowerCase().replaceAll('"',''));const ix=cols.findIndex(x=>['date','timestamp','time'].includes(x)),iy=cols.findIndex(x=>['close','price','value'].includes(x));if(ix===-1||iy===-1)throw Error('Required columns: date,close or timestamp,price');const output=[];for(const line of lines.slice(1)){const c=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));let date=c[ix];if(/^\d{10,13}$/.test(date))date=new Date(Number(date)*(date.length===10?1000:1)).toISOString().slice(0,10);else if(/^\d{4}\/\d{2}\/\d{2}$/.test(date))date=date.replaceAll('/','-');output.push({date,price:Number(c[iy])})}return normalizeHistory(output)}
function initCycle(){$('loadHistory').onclick=()=>fetchHistory(true);$('cycleRange').onchange=renderCycle;$('historyFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{setHistory(parseCsv(await file.text()),'CSV: '+file.name);toast('Imported '+history.length+' CSV observations.')}catch(err){toast('CSV read failed: '+err.message)}e.target.value=''};$('downloadCsvTemplate').onclick=()=>download('btc-price-template.csv','date,close\n','text/csv');$('exportHistory').onclick=()=>{if(!history.length)return toast('There is no historical data to export.');download('btc-history.csv','date,close\n'+history.map(r=>r.date+','+r.price).join('\n'),'text/csv')}}
function drawPlot(node,sets,opts={}){node.replaceChildren();if(!sets.some(s=>s.points?.length)){node.innerHTML='<div class="plot-placeholder">No observations available. Load an external feed or import CSV.</div>';return}const W=900,H=415,pad={l:58,r:22,t:24,b:45};const all=sets.flatMap(s=>s.points),xs=all.map(p=>p.x),ys=all.map(p=>p.y);let xMin=opts.xMin??Math.min(...xs),xMax=opts.xMax??Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);if(opts.normalizeY){yMin=Math.max(0,yMin*.87);yMax*=1.07}else{const d=Math.max(1,yMax-yMin);yMin-=d*.11;yMax+=d*.11}if(yMax<=yMin)yMax=yMin+1;if(xMax<=xMin)xMax=xMin+1;const px=x=>pad.l+(x-xMin)/(xMax-xMin)*(W-pad.l-pad.r),py=y=>pad.t+(yMax-y)/(yMax-yMin)*(H-pad.t-pad.b);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','Time series graph');function el(tag,attrs={},text=''){const x=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>x.setAttribute(k,v));if(text)x.textContent=text;svg.append(x);return x}for(let i=0;i<5;i++){const y=yMin+(yMax-yMin)*(i/4),yp=py(y);el('line',{x1:pad.l,y1:yp,x2:W-pad.r,y2:yp,stroke:'#73503b','stroke-opacity':'.46','stroke-width':'1'});el('text',{x:pad.l-9,y:yp+4,fill:'#d4b69a','fill-opacity':'.95','text-anchor':'end','font-size':'11'},fmt(y,opts.normalizeY?0:1))}for(let i=0;i<6;i++){const x=xMin+(xMax-xMin)*(i/5),xp=px(x);el('text',{x:xp,y:H-17,fill:'#d4b69a','fill-opacity':'.9','text-anchor':'middle','font-size':'11'},opts.xFormat?opts.xFormat(x):fmt(x,0))}if(opts.horizontalLine!==undefined&&opts.horizontalLine>=yMin&&opts.horizontalLine<=yMax)el('line',{x1:pad.l,y1:py(opts.horizontalLine),x2:W-pad.r,y2:py(opts.horizontalLine),stroke:'#92a1b9','stroke-dasharray':'5 5','stroke-opacity':'.6'});sets.forEach(s=>{const values=s.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=xMin&&p.x<=xMax);if(values.length<2)return;const d=values.map((p,i)=>(i?'L':'M')+px(p.x).toFixed(2)+' '+py(p.y).toFixed(2)).join(' ');el('path',{d,fill:'none',stroke:s.color||'#5c9eff','stroke-width':'2.6','stroke-linejoin':'round','stroke-linecap':'round'})});svg.style.color='#d4b69a';svg.style.background='transparent';node.append(svg)}
function setFear(data){fear=data.filter(d=>Number.isFinite(Number(d.value))&&Number.isFinite(Number(d.timestamp))).map(d=>({x:Number(d.timestamp)*1000,y:Number(d.value)})).sort((a,b)=>a.x-b.x);renderSentiment();renderOverview()}
async function fetchFear(){try{const res=await jsonGet('https://api.alternative.me/fng/?limit=0');if(!Array.isArray(res.data)||!res.data.length)throw Error('Response data unavailable');setFear(res.data);fetched.fear='Connected ('+fear.length+' records)'}catch(e){fetched.fear='Connection failed ('+e.message+')';renderSentiment();renderOverview()}renderSources()}
async function fetchPrice(){try{const data=await jsonGet('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');if(!Number.isFinite(Number(data?.bitcoin?.usd)))throw Error('Price unavailable');price={value:Number(data.bitcoin.usd),change:Number(data.bitcoin.usd_24h_change),source:'CoinGecko'};fetched.price='Connected (CoinGecko)'}catch(e){try{const data=await jsonGet('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');if(!Number.isFinite(Number(data.lastPrice)))throw Error('Price unavailable');price={value:Number(data.lastPrice),change:Number(data.priceChangePercent),source:'Binance BTCUSDT'};fetched.price='Connected (Binance fallback)'}catch(e2){fetched.price='Connection failed ('+e2.message+')'}}renderOverview();renderJournal();renderSources()}
// Exchange market ticker is pushed whenever Coinbase publishes an update.
// If streaming is unavailable, the existing five-second REST fallback runs.
let livePriceConnected=false;
let livePriceSocket=null;
let livePriceRetry=0;
function connectLivePrice(){
 if(typeof WebSocket!=='function'||(livePriceSocket&&[0,1].includes(livePriceSocket.readyState)))return;
 try{
  const ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');
  livePriceSocket=ws;
  ws.onopen=()=>{ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker']}));};
  ws.onmessage=event=>{
   try{
    const tick=JSON.parse(event.data);
    if(tick.type!=='ticker'||tick.product_id!=='BTC-USD')return;
    const value=Number(tick.price);
    if(!Number.isFinite(value)||value<=0)return;
    livePriceConnected=true;livePriceRetry=0;
    price={value,change:price?.change??NaN,source:'Coinbase BTC-USD · LIVE'};
    fetched.price='Connected (Coinbase WebSocket live ticks)';
    renderPriceCard();animateLiveUpdate();
   }catch(e){}
  };
  ws.onclose=()=>{
   if(livePriceSocket!==ws)return;
   livePriceConnected=false;
   livePriceSocket=null;
   fetched.price='Stream disconnected · 5-second fallback';
   livePriceRetry=Math.min(livePriceRetry+1,5);
   setTimeout(()=>{if(!document.hidden)connectLivePrice()},Math.min(60000,2000*Math.pow(2,livePriceRetry)));
  };
  ws.onerror=()=>{try{ws.close()}catch(e){}};
 }catch(e){livePriceConnected=false;}
}
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!livePriceConnected)connectLivePrice();
});
// Fast public price polling: do not request CoinGecko at a five-second pace.
// Coinbase Exchange is the primary USD feed; Binance BTCUSDT is a fallback.
// Older cards and independent market data keep their slower refresh cycles.
let quickPricePending=false;
async function fetchQuickPrice(){
  if(quickPricePending||document.hidden||livePriceConnected)return;
  quickPricePending=true;
  try{
    let last,source;
    try{
      const data=await jsonGet('https://api.exchange.coinbase.com/products/BTC-USD/ticker',4000);
      last=Number(data?.price);source='Coinbase BTC-USD';
      if(!Number.isFinite(last)||last<=0)throw Error('Price unavailable');
    }catch(firstError){
      const data=await jsonGet('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',4000);
      last=Number(data?.price);source='Binance BTCUSDT';
      if(!Number.isFinite(last)||last<=0)throw Error('Price unavailable');
    }
    // Preserve the last 24-hour percentage calculation from the slower feed.
    price={value:last,change:price?.change??NaN,source};
    fetched.price='Connected ('+source+' · 5-second polling · '+new Date().toLocaleTimeString('en-US')+')';
    renderPriceCard();animateLiveUpdate();
  }catch(e){
    fetched.price='Fast price feed unavailable · showing last valid quote';
    if(!price)renderOverview();
  }finally{quickPricePending=false}
}
async function fetchDerivatives(){const base='https://fapi.binance.com';const requests=await Promise.allSettled([jsonGet(base+'/fapi/v1/premiumIndex?symbol=BTCUSDT'),jsonGet(base+'/fapi/v1/openInterest?symbol=BTCUSDT')]);if(requests[0].status==='fulfilled'&&Number.isFinite(Number(requests[0].value.lastFundingRate))){funding={value:Number(requests[0].value.lastFundingRate)*100,time:Number(requests[0].value.time||Date.now())};fetched.funding='Connected'}else fetched.funding='Connection failed / regional restrictions possible';if(requests[1].status==='fulfilled'&&Number.isFinite(Number(requests[1].value.openInterest))){oi=Number(requests[1].value.openInterest);oiObservedAt=Number(requests[1].value.time)||0;fetched.oi='Connected'}else {oiObservedAt=0;fetched.oi='Connection failed / regional restrictions possible'};renderSentiment();renderSources()}
function fearLabel(x){return x<=24?'Extreme Fear':x<=44?'Fear':x<=54?'Neutral':x<=74?'Greed':'Extreme Greed'}function renderPriceCard(){const p=$('btcPrice'),s=$('btcSource'),c=$('btcChange');if(!p||!s||!c)return;p.textContent=price?money(price.value):'—';s.textContent=price?.source||'Not connected';c.textContent=price&&Number.isFinite(price.change)?'24h '+(price.change>=0?'+':'')+fmt(price.change,2)+'%':'Price unavailable / awaiting connection';c.className='stat-sub '+(price?.change>=0?'positive':'negative');}
function renderOverview(){const last=fear.at(-1);renderPriceCard();$('fearScore').textContent=last?last.y+'/100':'—';$('fearName').textContent=last?fearLabel(last.y):'Sentiment feed unavailable';const s=state.strategy;$('currentFramework').textContent=s.phase==='Not configured'?'Not configured':s.phase;$('overviewStrategy').innerHTML=`<div>Cycle view: <b>${escapeHTML(s.phase)}</b> · Sentiment: <b>${escapeHTML(s.mood)}</b></div><div class="tiny muted">${escapeHTML(s.thesis?s.thesis.slice(0,190):'No supporting rationale entered yet.')}</div>`;const entries=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||Number(b.id?.split('-')[0])||0)-(Number(a.createdAt)||Number(a.id?.split('-')[0])||0)).slice(0,3);$('recentJournal').innerHTML=entries.length?entries.map(e=>`<div><b>${escapeHTML(e.title)}</b><div class="tiny muted">${escapeHTML(e.date)} · ${escapeHTML(e.phase)}</div></div>`).join(''):'No entries';const current=fear.slice(-90);drawPlot($('overviewFearChart'),current.length?[{label:'Fear & Greed',color:'#f3bb72',points:current.map((p,i)=>({x:i,y:p.y}))}]:[],{xMin:0,xMax:Math.max(1,current.length-1),xFormat:i=>{const item=current[Math.min(current.length-1,Math.round(i))];return item?new Date(item.x).toISOString().slice(5,10):''}});$('fearUpdated').textContent=last?'Latest observation: '+new Date(last.x).toLocaleDateString('en-US')+' · Alternative.me':'Waiting for Alternative.me';renderV11Overview()}
function computedBtcMeasures(){
 const result={};
 if(history.length<25)return result;
 const latest=history.at(-1);
 const index=new Map(history.map(r=>[r.date,r.price]));
 function nearDays(days){
  const target=dayNum(latest.date)-days;
  let best=null,dist=Infinity;
  for(let i=history.length-1;i>=0;i--){
   const r=history[i],gap=Math.abs(dayNum(r.date)-target);
   if(gap<dist){dist=gap;best=r}
   if(dayNum(r.date)<target-8)break;
  }
  return dist<=8?best:null;
 }
 for(const days of [7,30,90]){
  const base=nearDays(days);if(base&&base.price>0)result['return'+days]=(latest.price/base.price-1)*100;
 }
 const recent=history.slice(-31),daily=[];
 for(let i=1;i<recent.length;i++){
  const dateGap=dayNum(recent[i].date)-dayNum(recent[i-1].date);
  if(dateGap===1&&recent[i-1].price>0)daily.push(Math.log(recent[i].price/recent[i-1].price));
 }
 if(daily.length>=19){
  const mean=daily.reduce((a,b)=>a+b,0)/daily.length;
  result.volatility30=Math.sqrt(daily.reduce((a,b)=>a+(b-mean)**2,0)/daily.length)*Math.sqrt(365)*100;
 }
 const close=history.slice(-15);
 if(close.length===15&&dayNum(close.at(-1).date)-dayNum(close[0].date)<=18){
  let gain=0,loss=0;
  for(let i=1;i<close.length;i++){const difference=close[i].price-close[i-1].price;gain+=Math.max(0,difference);loss+=Math.max(0,-difference)}
  result.rsi14=loss===0?100:100-100/(1+gain/loss);
 }
 const tailDay=dayNum(latest.date),weekly=[];
 const byDay=new Map(history.map(r=>[dayNum(r.date),r.price]));
 for(let week=199;week>=0;week--){
  const target=tailDay-7*week;let value=null;
  for(let gap=0;gap<=3;gap++){if(byDay.has(target-gap)){value=byDay.get(target-gap);break}if(byDay.has(target+gap)){value=byDay.get(target+gap);break}}
  if(value!==null)weekly.push(value);
 }
 if(weekly.length===200){
  result.ma200w=weekly.reduce((a,b)=>a+b,0)/200;
  result.maGap=(latest.price/result.ma200w-1)*100;
 }
 result.latest=latest.date;
 return result;
}

/* V9 — Evidence-first market psychology: freshness gates, conflicting signals, no fabricated predictions. */
function renderPsychologyEngine(){
 const root=$('psychHeadline');if(!root)return;
 const now=Date.now(),day=86400000;
 const latestFear=fear.at(-1),measures=computedBtcMeasures();
 const recentFear=!!latestFear&&now-latestFear.x>=-day&&now-latestFear.x<=3*day;
 const priceDate=measures.latest?Date.parse(measures.latest+'T00:00:00Z'):NaN;
 const recentPrice=Number.isFinite(priceDate)&&now-priceDate>=-day&&now-priceDate<=4*day;
 const freshFunding=false; // Removed from the dashboard's active analysis.
 const freshOI=false;
 const etfSeries=liveInstitution?.etf?.length?liveInstitution.etf:(etfExternal||etfAuto?.rows||[]);
 const etfLastDate=etfSeries.length?Date.parse(String(etfSeries.at(-1)[0])+'T00:00:00Z'):NaN;
 const freshEtf=Number.isFinite(etfLastDate)&&now-etfLastDate<=7*day&&now-etfLastDate>=-day;
 const fresh=[recentFear,recentPrice,freshEtf];
 const sources=fresh.filter(Boolean).length;
 const support=[],counter=[],labels=[];
 const add=(type,title,detail)=>{(type==='support'?support:counter).push({title,detail})};
 let mood='insufficient';
 if(recentFear){
  const value=latestFear.y;
  if(value<=24){labels.push('극단적 공포');add('counter','공포만으로 저점을 판단할 수 없음','공포·탐욕 '+value+'/100. 상승 사이클의 조정과 장기 하락 국면에서 모두 나타날 수 있습니다. 사이클 위치 및 추세를 별도로 확인해야 합니다.')}
  else if(value>=75){labels.push('극단적 탐욕');add('counter','대중의 낙관론이 과도함','공포·탐욕 지수 '+value+'/100. 낙관론은 상승 추세나 과열 국면 모두에서 나타날 수 있습니다.')}
  else{labels.push('시장 심리 '+value+'/100');add('counter','중립 심리의 방향성은 미확정','지수 '+value+'/100. 중립값은 투자 방향을 지지하거나 반박하는 독립 신호가 아닙니다.')}
  if(fear.length>=8){
   const prior=fear.at(-8),gap=latestFear.y-prior.y,spacing=latestFear.x-prior.x;
   if(spacing>=5*day&&spacing<=10*day){
    if(gap<=-15)add('counter','최근 7일간 공포 심리 심화','지수 변화 '+gap+'포인트. 가격 하락 추세와 일치하는지 확인해야 합니다.');
    if(gap>=15)add('counter','심리 지수가 빠르게 회복','지수 상승 '+gap+'포인트(약 7일). 가격과 독립적인 자금 흐름을 함께 검증해야 합니다.');
   }
  }
 }else add('counter','심리 지수가 누락되었거나 오래됨','Alternative.me의 최근 3일 이내 관측 데이터가 필요합니다.');
 if(recentPrice&&Number.isFinite(measures.return30)){
  const change=measures.return30;
  labels.push('BTC 30일 '+(change>=0?'+':'')+fmt(change,1)+'%');
  if(change>=10)add('support','BTC 30일 가격 추세 상승','일일 종가 기준 수익률: +'+fmt(change,1)+'%. 상승세의 지속 가능성은 별도 근거로 확인해야 합니다.');
  else if(change<=-10)add('counter','BTC 30일 가격 추세 약세','일일 종가 기준 수익률: '+fmt(change,1)+'%. 낮은 심리 점수는 실제 하락 위험을 반영할 수 있습니다.');
  else add('support','BTC 30일 가격 횡보','30일 가격 변화: '+(change>=0?'+':'')+fmt(change,1)+'%. 이 기간만으로 뚜렷한 방향을 단정할 수 없습니다.');
  if(recentFear&&latestFear.y<=24&&change>5)add('support','가격과 투자 심리의 괴리 가능성','극단적 공포와 BTC의 30일 가격 상승이 공존합니다. 심리가 가격을 따라가는지 관찰해야 합니다.');
  if(recentFear&&latestFear.y>=75&&change<0)add('counter','낙관적 심리와 실제 가격이 충돌','탐욕 지수가 높지만 BTC의 30일 수익률은 음수입니다. 두 지표가 엇갈립니다.');
 }else add('counter','최근 가격 추세 확인 불가','BTC 과거 일일 종가가 없거나 너무 오래됐거나 30일 비교 구간이 부족합니다.');
 if(recentPrice&&v11PriceQuality().daily&&Number.isFinite(measures.rsi14)){
  const rsi=measures.rsi14;
  if(rsi>=70)add('counter','일일 RSI 과열 가능성','14일 RSI '+fmt(rsi,1)+'; 강한 추세에서는 과매수 구간이 지속될 수 있습니다.');
  else if(rsi<=30)add('support','일일 RSI 과매도 가능성','14일 RSI '+fmt(rsi,1)+'; 과매도 상태만으로 반등을 보장할 수 없습니다.');
 }
 if(freshEtf){
  const last=etfSeries.at(-1);
  if(last&&Number.isFinite(Number(last[1]))){
   const val=Number(last[1]),session=String(last[0]);(val>=0?add('support','기관 ETF 자금 순유입','관측된 ETF 순유입: +'+fmt(val,1)+'백만 달러 · 관측일 '+session+'.'):add('counter','기관 ETF 자금 순유출','관측된 ETF 순유출: '+fmt(val,1)+'백만 달러 · 관측일 '+session+'.'));
  }
 }else add('counter','ETF 순유입 데이터가 과거 스냅샷임','2026년 11월의 예시나 검증되지 않은 CSV를 현재 자금 흐름의 증거로 사용하지 않습니다.');
 let headline,summary;
 if(sources<2){headline='최신 분석 근거 부족';summary='최신 데이터를 연결하면 여러 지표를 함께 해석할 수 있습니다. 오래된 자료로 시장 국면을 단정하지 않습니다.';mood='insufficient'}
 else if(recentFear&&latestFear.y<=24&&recentPrice&&measures.return30>0){headline='공포 심리와 BTC 가격 상승의 괴리';summary='대중은 비관적이지만 BTC 가격은 상승하고 있습니다. 자금 흐름과 장기 가격 추세를 함께 확인해야 하며 매수 신호는 아닙니다.';mood='divergence'}
 else if(recentFear&&latestFear.y>=75&&recentPrice&&measures.return30<0){headline='낙관론과 포지션 위험 동반';summary='탐욕이 높은 가운데 BTC 가격 약세가 관측됩니다. 현물 수급과 가격 추세를 확인해야 합니다.';mood='caution'}
 else if(recentFear&&latestFear.y<=24){headline='공포가 우세한 시장';summary='위험 회피 심리가 높습니다. 구조적 하락 추세와 단기 청산 충격을 추가 자료로 구분해야 합니다.';mood='fear'}
 else if(recentFear&&latestFear.y>=75){headline='탐욕이 우세한 시장';summary='낙관적 심리가 높습니다. 가격과 포지션 수급이 같은 방향인지 확인하세요.';mood='caution'}
 else{headline='혼재된 시장 심리';summary='현재 지표만으로 단일 국면을 확정하기 어렵습니다. 지지 근거와 반대 근거를 함께 살펴보세요.';mood='mixed'}
 root.textContent=headline;$('psychSummary').textContent=summary;
 $('psychCoverage').textContent=sources+' / 3개 최신 데이터 소스';
 $('psychScore').textContent=String(sources);
 $('psychProgress').style.width=(sources/3*100)+'%';
 $('psychAsOf').textContent='분석 시각 '+new Date(now).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})+' · 현지 시각';
 $('psychReadiness').textContent=sources<3?'근거 제한적 · 일부 시장 데이터 연결 필요':'데이터 확보율은 예측 정확도를 나타내지 않습니다.';
 const tags=$('psychTags');tags.replaceChildren();
 for(const item of labels.slice(0,4)){const span=document.createElement('span');span.textContent=item;tags.append(span)}
 const render=(id,items,empty)=>{
  const target=$(id);target.replaceChildren();
  if(!items.length){const row=document.createElement('p');row.className='ct-psych-empty';row.textContent=empty;target.append(row);return}
  for(const item of items.slice(0,5)){
   const row=document.createElement('div');row.className='ct-psych-evidence-row';
   const title=document.createElement('strong');title.textContent=item.title;
   const detail=document.createElement('p');detail.textContent=item.detail;
   row.append(title,detail);target.append(row);
  }
 };
 render('psychSupporting',support,'관측 시점이 유효한 지지 근거가 아직 없습니다.');
 render('psychCounter',counter,'현재 반대 근거가 없다고 위험이 없는 것은 아닙니다.');
 const elapsed=Math.floor((now-Date.parse('2024-04-20T00:00:00Z'))/day);
 $('psychCycleNote').textContent='반감기 사이클 참고: '+fmt(Math.max(0,elapsed),0)+'일 경과(2024년 4월 20일 기준). 과거 패턴의 반복을 전제하지 않습니다.';
}
function sentimentLabelKo(value){return value<=24?'극단적 공포':value<=44?'공포':value<=54?'중립':value<=74?'탐욕':'극단적 탐욕'}
function renderSentiment(){const last=fear.at(-1),prev=fear.at(-2);$('sentFear').textContent=last?last.y+'/100':'—';$('sentFearLabel').textContent=last?sentimentLabelKo(last.y):'데이터 연결 대기';$('sentDelta').textContent=last&&prev?(last.y-prev.y>=0?'+':'')+(last.y-prev.y)+'p':'—';const n=Number($('fearRange').value),data=n===0?fear:fear.slice(-n);drawPlot($('sentimentPlot'),data.length?[{label:'Fear·Greed',color:'#f0b95e',points:data.map((d,i)=>({x:i,y:d.y}))}]:[],{xMin:0,xMax:Math.max(1,data.length-1),xFormat:i=>{const d=data[Math.min(data.length-1,Math.round(i))];return d?new Date(d.x).toISOString().slice(5,10):''}});const interpretations=[];
const observation=(label,value,note,wide=false)=>`<div class="sentiment-observation${wide?' wide':''}"><span class="obs-label">${label}</span><strong>${value}</strong><span class="obs-note">${note}</span></div>`;
if(last){
const mood=sentimentLabelKo(last.y);
const d7=fear.length>=8?last.y-fear.at(-8).y:null;
const d30=fear.length>=31?last.y-fear.at(-31).y:null;
const sign=n=>n>0?'+':'';
interpretations.push(observation('현재 시장 심리',`${last.y} / 100 · ${mood}`,`${new Date(last.x).toLocaleDateString('en-US')} 관측일`));
interpretations.push(observation('최근 7일 심리 변화',d7===null?'데이터 부족':`${sign(d7)}${d7}p`,d7===null?'최소 8개의 관측값 필요':d7>0?'심리 지수 상승':d7<0?'심리 지수 하락':'지수 변화 없음'));
interpretations.push(observation('최근 30일 심리 변화',d30===null?'데이터 부족':`${sign(d30)}${d30}p`,d30===null?'최소 31개의 관측값 필요':d30>0?'중기 심리 회복':d30<0?'중기 심리 악화':'지수 변화 없음'));
const interpretation=last.y<=24?'극단적 공포 자체가 매수 신호는 아닙니다. 가격 추세와 레버리지 감소 여부를 확인해야 합니다.':last.y>=75?'극단적 탐욕 자체가 매도 신호는 아닙니다. 현물 자금 흐름과 장기 추세를 확인하세요.':'심리 지수가 중간 범위에 있습니다. 가격 추세와 함께 지수의 변화 속도를 관찰하세요.';
interpretations.push(observation('시장 심리 종합 해석','주요 관측 내용',interpretation+' 4년 사이클 가설과 충돌하는 근거도 함께 확인하세요.',true));
}else{
interpretations.push(observation('심리 지수 데이터','연결 대기 중','실제 공포·탐욕 관측값이 연결되면 표시됩니다.',true));
}
$('sentimentInterpretation').innerHTML=interpretations.join('');
const m=computedBtcMeasures();
 const btcSummary=$('ctCleanBtc30'),btcLabel=$('ctCleanBtc30Date');
 if(btcSummary){
  btcSummary.textContent=Number.isFinite(m.return30)?(m.return30>=0?'+':'')+fmt(m.return30,1)+'%':'—';
  btcLabel.textContent=m.latest?'Observed '+m.latest:'Historical price data required';
 }
 const etfSummary=$('ctCleanEtf5'),etfLabel=$('ctCleanEtf5Date');
 if(etfSummary){
  const observations=etfAuto?.rows||[],lastFive=observations.slice(-5);
  const flow=lastFive.length===5?lastFive.reduce((n,r)=>n+Number(r[1]),0):null;
  etfSummary.textContent=flow===null?'—':(flow>=0?'+':'')+fmt(flow,1)+'M USD';
  etfLabel.textContent=observations.length?'Observed '+observations.at(-1)[0]+' · historical':'ETF observation unavailable';
 }
 const signed=(n,d=1)=>Number.isFinite(n)?(n>=0?'+':'')+fmt(n,d)+'%':'데이터 확인 중';
 const metric=(label,value,note,available=true)=>({label,value,note,available});
 const etfFlows=liveInstitution?.etf?.length?liveInstitution.etf:(etfExternal||etfAuto?.rows||ETF_SEED);
 const etfWindow=etfFlows.slice(-5),fiveDayFlow=etfWindow.length===5?etfWindow.reduce((sum,row)=>sum+Number(row[1]),0):null;
 const etfAsOf=liveInstitution?.etf?.length?liveInstitution.etf.at(-1)[0]:etfExternal?etfExternal.at(-1)[0]:etfAuto?.rows?.length?etfAuto.rows.at(-1)[0]:'2026-11-06 과거 스냅샷';
 const indicators=[
  metric('공포·탐욕 지수',last?last.y+'/100 · '+fearLabel(last.y):'데이터 확인 중',last?new Date(last.x).toLocaleDateString('en-US')+' 관측일':'Alternative.me 데이터 연동',!!last),
  metric('BTC 7일 수익률',signed(m.return7),m.latest?'BTC 일일 종가 · '+m.latest:'과거 종가 불러오는 중',Number.isFinite(m.return7)),
  metric('BTC 30일 수익률',signed(m.return30),m.latest?'BTC 일일 종가 · '+m.latest:'과거 종가 불러오는 중',Number.isFinite(m.return30)),
  metric('30일 실현 변동성',Number.isFinite(m.volatility30)?fmt(m.volatility30,1)+'%':'가격 데이터 확인 중','일일 로그수익률의 연율화 표준편차',Number.isFinite(m.volatility30)),
  metric('14일 RSI',Number.isFinite(m.rsi14)?fmt(m.rsi14,1):'가격 데이터 확인 중','14일 종가 변동으로 계산한 RSI',Number.isFinite(m.rsi14)),
  metric('200주 이동평균선 대비 괴리',signed(m.maGap),Number.isFinite(m.ma200w)?'200주 평균: '+money(m.ma200w):'200주 가격 데이터 필요',Number.isFinite(m.maGap)),
  metric('BTC ETF 5일 순유입',Number.isFinite(fiveDayFlow)?(fiveDayFlow>=0?'+':'')+fmt(fiveDayFlow,1)+'M USD':'Checking ETF connection','기준일: '+etfAsOf+' · 과거 자금 흐름 (실시간 아님)',Number.isFinite(fiveDayFlow))
 ];
 $('indicators').innerHTML=indicators.filter(item=>item.available).map(item=>'<div class="indicator"><strong>'+escapeHTML(item.label)+'</strong><span class="tag '+(item.available?'ok':'off')+'">'+(item.available?'관측값 확보':'대기')+'</span><div class="indicator-value">'+escapeHTML(item.value)+'</div><small class="indicator-note">'+escapeHTML(item.note)+'</small></div>').join('');
 renderPsychologyEngine();renderV11Assessment();
}
function initSentiment(){$('refreshSentiment').onclick=()=>Promise.allSettled([fetchFear(),loadMarketSeries(true)]).then(()=>toast('시장 심리 지표를 갱신했습니다.'));$('fearRange').onchange=renderSentiment}
function initMacro(){ /* Macro charts are read-only; journal features live in Strategy. */ }
function strategyKoDisplay(value){
 const translations={
  'Early Expansion':'상승 초기','Mid Expansion':'상승 중반','Late Expansion':'상승 후반',
  'Bear Market':'하락 국면','Wait and Observe':'관망',
  'Extreme Fear':'극단적 공포','Extreme Greed':'극단적 탐욕',
  'Fear':'공포','Neutral':'중립','Greed':'탐욕',
  'Review gradual entry (example)':'분할 매수 검토 (예시)',
  'Review risk reduction (example)':'위험 비중 축소 검토 (예시)',
  'Manage liquidity and observe basing (example)':'현금 비중 관리 및 저점 형성 관찰 (예시)',
  'Not configured':'선택 안 함'
 };
 return translations[value]||value||'';
}
function renderStrategy(){
 const s=state.strategy;
 for(const f of ['phase','mood','riskExposure','reviewDate','thesis','invalidations','riskPlan']){const el=$(f);el.value=s[f]??'';if((f==='phase'||f==='mood')&&!el.value)el.value='Not set'}
 const matrix=$('strategyMatrix');matrix.replaceChildren();
 s.rules.forEach((r,i)=>{
  const item=document.createElement('div');item.className='rule';
  const line=document.createElement('div');line.className='rule-row';
  const a=document.createElement('input');a.value=strategyKoDisplay(r.phase);a.placeholder='사이클 국면';
  const b=document.createElement('input');b.value=strategyKoDisplay(r.mood);b.placeholder='시장 심리';
  const c=document.createElement('input');c.value=strategyKoDisplay(r.action);c.placeholder='대응 전략';
  const drop=btn('삭제',()=>{if(!confirm('이 판단 기준을 삭제할까요?'))return;s.rules.splice(i,1);renderStrategy();persist()},'secondary remove');
  [a,b,c].forEach((input,j)=>input.addEventListener('input',()=>{r[['phase','mood','action'][j]]=input.value}));
  line.append(a,b);const line2=document.createElement('div');line2.className='rule-row';line2.append(c,drop);
  item.append(line,line2);matrix.append(item)
 })
}
function initStrategy(){$('addRule').onclick=()=>{state.strategy.rules.push({phase:'',mood:'',action:''});renderStrategy();persist()};$('saveStrategy').onclick=()=>{for(const k of ['phase','mood','riskExposure','reviewDate','thesis','invalidations','riskPlan'])state.strategy[k]=$(k).value;persist();toast('투자 전략을 저장했습니다.');renderOverview()}}
function journalForm(record){const r=record||{id:'',date:localDateTime(),phase:'Wait and Observe',price:'',horizon:'30',title:'',evidence:'',action:'',review:''};for(const k of ['id','date','phase','price','horizon','title','evidence','action','review'])$('journal'+k[0].toUpperCase()+k.slice(1)).value=r[k]??'';if(!$('journalPhase').value)$('journalPhase').value='Wait and observe';$('journalDirection').value=r.direction||'';$('journalEditorTitle').textContent=record?'판단 기록 수정':'새 판단 기록'}
function localDateTime(){const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function renderJournal(){const sorted=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||Number(b.id?.split('-')[0])||0)-(Number(a.createdAt)||Number(a.id?.split('-')[0])||0));$('journalCount').textContent=sorted.length+'건';$('journalList').replaceChildren();if(!sorted.length){$('journalList').innerHTML='<div class="plot-placeholder">아직 판단 기록이 없습니다. 첫 번째 기록을 작성해 보세요.</div>';return}sorted.forEach(r=>{const node=document.createElement('div');node.className='journal-entry';const title=document.createElement('strong');title.textContent=r.title||'제목 없음';const meta=document.createElement('div');meta.className='meta';meta.textContent=r.date+' · '+strategyKoDisplay(r.phase)+(Number(r.price)>0?' · '+money(r.price):'');const p=document.createElement('p');p.textContent=(r.evidence||'').slice(0,260)||'작성된 판단 근거가 없습니다';const actions=document.createElement('div');actions.className='actions';actions.append(btn('수정',()=>{journalForm(r);window.scrollTo({top:0,behavior:'smooth'})}),btn('삭제',()=>{if(confirm('이 판단 기록을 삭제할까요?')){state.journal=state.journal.filter(e=>e.id!==r.id);persist();renderJournal();renderOverview()}},'secondary remove'));node.append(title,meta,p,actions);$('journalList').append(node)});renderV11Journal()}
function initJournal(){journalForm();$('saveJournal').onclick=()=>{const r={};for(const k of ['id','date','phase','price','horizon','title','evidence','action','review'])r[k]=$('journal'+k[0].toUpperCase()+k.slice(1)).value;if(!r.title.trim())return toast('분석 제목을 입력해 주세요.');if(!r.date)return toast('판단 날짜와 시간을 선택해 주세요.');r.direction=$('journalDirection').value;if(!r.id){
 r.id=String(Date.now())+'-'+Math.floor(Math.random()*10000);r.createdAt=Date.now();
 r.assessmentSnapshot=state.v11Assessment?.savedAt?JSON.parse(JSON.stringify(state.v11Assessment)):null;
 r.originalEvidence=r.evidence; // Preserve the initial hypothesis on subsequent edits.
}else{
 const previous=state.journal.find(e=>e.id===r.id);
 r.createdAt=previous?.createdAt||Number(r.id.split('-')[0])||Date.now();
 r.assessmentSnapshot=previous?.assessmentSnapshot||null;r.originalEvidence=previous?.originalEvidence??previous?.evidence??r.evidence;
}if(state.journal.some(e=>e.id===r.id))state.journal=state.journal.map(e=>e.id===r.id?r:e);else state.journal.push(r);persist();toast('판단 기록을 저장했습니다.');renderJournal();renderOverview();journalForm()};$('cancelJournal').onclick=()=>journalForm();$('useCurrentPrice').onclick=()=>{if(!price)return toast('BTC 시세를 불러올 수 없습니다. 기준 가격을 직접 입력해 주세요.');$('journalPrice').value=price.value;toast('현재 BTC 가격을 입력했습니다.')};$('exportJournal').onclick=()=>{const keys=['date','title','phase','price','horizon','evidence','action','review'];const headers=['판단일시','분석제목','사이클국면','BTC기준가격','관측기간','판단근거','대응계획','사후분석'];const csv=[headers.join(','),...state.journal.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');download('cycle-journal.csv','\uFEFF'+csv,'text/csv')}}
function renderSources(){
 const root=$('dataSources');if(!root)return;
 // Show fetch/connectivity separately from observations; a dated snapshot is never marked live.
 const datasets=[
  {name:'TradingView charts',description:'Third-party charts',value:'Available as embeds',kind:'info'},
  {name:'Bitcoin spot price',description:'Live websocket / 5-second fallback',value:fetched.price||'Not checked',kind:/Connected|live|stream/i.test(fetched.price||'')?'ok':'check'},
  {name:'Fear & Greed Index',description:'Alternative.me · daily publication',value:fetched.fear||'Not checked',kind:/Connected|cache/i.test(fetched.fear||'')?'ok':'check'},
  {name:'BTC daily history',description:'Historical close observations',value:fetched.history||(history.length?'Cached '+history.length+' observations':'Not checked'),kind:/Connected|cached|local/i.test(fetched.history||(history.length?'cached':''))?'ok':'check'},
  {name:'Bitcoin block height',description:'mempool.space',value:fetched.block||'Not checked',kind:/Connected/i.test(fetched.block||'')?'ok':'check'},
  {name:'ETF & institutional holdings',description:'Dated snapshot or external API',value:fetched.institution||'Historical snapshot',kind:/Connected/i.test(fetched.institution||'')?'ok':'snapshot'},
  ...([
   ['btcHistory','BTC historical price collection'],
   ['etfFlows','ETF flow collection'],
  ].map(([id,name])=>{
   const v=collectionStatus?.sources?.[id];
   const observed=v?.lastSavedObservation||'No saved observation';
   const attempted=v?.lastAttemptAt?String(v.lastAttemptAt).slice(0,16).replace('T',' ')+' UTC':'No collection attempt';
   const lastDay=v?.lastSavedObservation?Date.parse(v.lastSavedObservation+'T00:00:00Z'):NaN;
   const ageDays=Number.isFinite(lastDay)?(Date.now()-lastDay)/86400000:Infinity;
   const freshLimit=id==='etfFlows'?7:id==='btcHistory'?4:3;
   const fresh=ageDays>=-1&&ageDays<=freshLimit;
   const healthy=!!v?.lastAttemptSucceeded&&fresh;
   return {name,description:'Last collection: '+attempted,
    value:(healthy?'Current · ':v?.lastSavedObservation?'Stale / review · ':'No observation · ')+observed+(v?.observations?' · '+v.observations+' records':'')+(v?.error?' · '+String(v.error).slice(0,75):''),
    kind:healthy?'ok':v?.lastSavedObservation?'snapshot':'check'};
  })),
   {name:'On-chain & liquidations',description:'MVRV, SOPR, liquidation metrics',value:'Separate API required',kind:'missing'}
 ];
 const captions={ok:'CONNECTED',check:'CHECK SOURCE',snapshot:'SNAPSHOT',missing:'NOT CONNECTED',info:'EXTERNAL'};
 root.replaceChildren();
 datasets.filter(row=>['Bitcoin spot price','Fear & Greed Index','BTC daily history','ETF & institutional holdings'].includes(row.name)).forEach(row=>{
  const card=document.createElement('article');card.className='ct-source-card ct-source-'+row.kind;
  const heading=document.createElement('div');heading.className='ct-source-heading';
  const title=document.createElement('strong');title.textContent=row.name;
  const badge=document.createElement('span');badge.className='ct-source-badge';badge.textContent=captions[row.kind];
  heading.append(title,badge);
  const desc=document.createElement('div');desc.className='ct-source-desc';desc.textContent=row.description;
  const status=document.createElement('p');status.className='ct-source-value';status.textContent=row.value;
  card.append(heading,desc,status);root.append(card)
 });renderV11Quality()
}
async function refreshAll(notify=false){if(refreshBusy)return;refreshBusy=true;$('networkStatus').textContent='Fetching market data…';try{const shouldHistory=Date.now()-lastHistoryRefresh>(history.length?12*3600000:15*60000);const jobs=[livePriceConnected?Promise.resolve():fetchPrice(),fetchFear(),refreshBlockHeight(),refreshInstitutional(),loadMarketSeries()];if(shouldHistory){lastHistoryRefresh=Date.now();jobs.push(fetchHistory(false))}await Promise.allSettled(jobs);$('networkStatus').textContent='Checked at '+new Date().toLocaleTimeString('en-US')+' · according to provider frequency';$('networkStatus').classList.add('ok');renderSources();animateLiveUpdate();if(notify)toast('Source refresh completed. Check each card for observation dates.')}finally{refreshBusy=false}}
function download(name,content,mime){const blob=new Blob([content],{type:mime+';charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}function downloadBackup(){download('cycle-terminal-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'cycle-terminal',version:2,savedAt:new Date().toISOString(),state},null,2),'application/json')}
async function restoreBackup(e){const f=e.target.files?.[0];if(!f)return;try{const raw=JSON.parse(await f.text());if(raw.app!=='cycle-terminal'||raw.version!==2||!raw.state||!Array.isArray(raw.state.charts)||!Array.isArray(raw.state.journal)||!Array.isArray(raw.state.history))throw Error('Unsupported backup file.');if(!confirm('Replace existing local data with this backup?'))return;state={...defaults(),...raw.state,strategy:{...defaults().strategy,...raw.state.strategy}};history=normalizeHistory(state.history);historySource=state.historySource||'';if(!persist())return;location.reload()}catch(err){toast('Restore failed: '+err.message)}finally{e.target.value=''}}
function restoreChecks(){document.querySelectorAll('[data-check]').forEach(x=>{x.checked=!!state.checks?.[x.dataset.check];x.addEventListener('change',()=>{state.checks[x.dataset.check]=x.checked;persist()})})}

// Community: verified public profiles through the official X embed, plus live-source RSS.
const LEADERS=[['Michael Saylor','saylor'],['Cathie Wood','CathieDWood'],['Balaji Srinivasan','balajis'],['Eric Balchunas','EricBalchunas'],['Paolo Ardoino','paoloardoino'],['Bitcoin Magazine','BitcoinMagazine'],['Davinci Jeremie','Davincij15'],['Cameron Winklevoss','cameron'],['Tyler Winklevoss','tyler'],['Grant Cardone','GrantCardone'],['Vitalik Buterin','VitalikButerin'],['Justin Sun','justinsuntron'],['Elon Musk','elonmusk'],['Jeff Yan · Hyperliquid','chameleon_jeff']];
let activeLeader='saylor',communityTab='all',newsItems=[],newsPending=false,newsEverLoaded=false;
function renderCommunity(){
 const x=$('xTimeline');if(!x)return;
 x.replaceChildren();x.classList.remove('community-profile-card');x.classList.add('ct-leader-grid');
 const roles={
  saylor:'Bitcoin treasury strategy',CathieDWood:'Innovation & investment',balajis:'Technology & macro',EricBalchunas:'ETF research',
  paoloardoino:'CEO · Tether',BitcoinMagazine:'Bitcoin news & analysis',Davincij15:'Bitcoin market commentary',cameron:'Digital assets',tyler:'Digital assets',
  GrantCardone:'Business & investing',VitalikButerin:'Ethereum & research',justinsuntron:'Crypto markets',elonmusk:'Technology',chameleon_jeff:'DeFi market structure'
 };
 for(const [name,handle] of LEADERS){
  const card=document.createElement('article');card.className='ct-leader-card';
  const monogram=document.createElement('div');monogram.className='ct-leader-monogram';monogram.textContent=name.split(' ').map(v=>v[0]).slice(0,2).join('').toUpperCase();
  const portrait=document.createElement('div');portrait.className='ct-leader-portrait';
  const img=document.createElement('img');img.className='ct-leader-photo';
  img.alt=name+' · public X profile photo';img.loading='lazy';img.decoding='async';
  img.referrerPolicy='no-referrer';img.src='https://unavatar.io/x/'+encodeURIComponent(handle);
  img.addEventListener('error',()=>{img.remove();portrait.classList.add('ct-avatar-failed')},{once:true});
  portrait.append(img,monogram);
  const body=document.createElement('div');body.className='ct-leader-body';
  const title=document.createElement('h3');title.textContent=name;
  const detail=document.createElement('p');detail.textContent=roles[handle]||'Market commentary';
  const tag=document.createElement('small');tag.textContent='@'+handle;
  const actions=document.createElement('div');actions.className='ct-leader-actions';
  const profile=document.createElement('a');profile.href='https://x.com/'+encodeURIComponent(handle);profile.target='_blank';profile.rel='noopener noreferrer';profile.textContent='X Profile ↗';
  const search=document.createElement('a');search.href='https://www.google.com/search?q='+encodeURIComponent('site:x.com/'+handle+' bitcoin market');search.target='_blank';search.rel='noopener noreferrer';search.textContent='Recent Posts ↗';
  actions.append(profile,search);body.append(title,detail,tag,actions);card.append(portrait,body);x.append(card);
 }
 const xOn=communityTab!=='news',newsOn=communityTab!=='x';
 $('communityXPanel').classList.toggle('hidden',!xOn);
 $('communityNewsPanel').classList.toggle('hidden',!newsOn);
 document.querySelectorAll('[data-community-tab]').forEach(b=>b.classList.toggle('active',b.dataset.communityTab===communityTab));
 renderNews();if(!newsEverLoaded&&!newsPending)fetchCommunityNews();
}

function renderNews(){const list=$('newsTimeline');if(!list)return;list.replaceChildren();if(!newsItems.length){const empty=document.createElement('div');empty.className='community-empty';empty.textContent=newsPending?'Loading verified headlines and publication times…':'News feed unavailable. Open the original publications below.';list.append(empty);return}for(const item of newsItems){const a=document.createElement('a');a.className='news-entry';a.href=item.link;a.target='_blank';a.rel='noopener noreferrer';const meta=document.createElement('div');meta.className='news-meta';meta.textContent=item.source+' · '+(item.date?new Date(item.date).toLocaleString('en-US'):'Publication time unavailable');const title=document.createElement('strong');title.textContent=item.title;const more=document.createElement('span');more.textContent='Read original ↗';a.append(meta,title,more);list.append(a)}}
async function fetchCommunityNews(){if(newsPending)return;newsPending=true;newsEverLoaded=true;$('newsStatus').textContent='Fetching';renderNews();try{const feeds=[['Cointelegraph','https://cointelegraph.com/rss'],['CoinDesk','https://www.coindesk.com/arc/outboundfeeds/rss/']];const results=await Promise.allSettled(feeds.map(async ([source,url])=>{const response=await fetch('https://proxy.cors.dev/'+url,{cache:'no-store'});if(!response.ok)throw Error('RSS '+response.status);const xml=new DOMParser().parseFromString(await response.text(),'application/xml');if(xml.querySelector('parsererror'))throw Error('Invalid RSS response');return [...xml.querySelectorAll('item')].slice(0,18).map(node=>({title:node.querySelector('title')?.textContent?.trim()||'',link:node.querySelector('link')?.textContent?.trim()||'',date:node.querySelector('pubDate')?.textContent?.trim()||'',source}))}));newsItems=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(x=>x.title&&/^https:\/\//.test(x.link)).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,30);if(!newsItems.length)throw Error('News providers are unavailable');$('newsStatus').textContent=newsItems.length+' stories · public RSS'}catch(e){newsItems=[];$('newsStatus').textContent='External RSS access restricted'}finally{newsPending=false;renderNews()}}

function initCommunity(){document.querySelectorAll('[data-community-tab]').forEach(b=>b.onclick=()=>{communityTab=b.dataset.communityTab;renderCommunity()});}
// A subtle value-update motion, never a simulated tick/price.
function animateLiveUpdate(){for(const id of ['btcPrice','btcChange','fearScore','sentFear','sentDelta','fundingValue','oiValue','cycleDays','cycleReturn']){const el=$(id);if(!el)continue;const value=el.textContent;if(el.dataset.previousLiveValue!==value){if(el.dataset.previousLiveValue!==undefined){el.classList.remove('value-updated');void el.offsetWidth;el.classList.add('value-updated')}el.dataset.previousLiveValue=value}}}



let liveInstitution=null;
function safeMetric(v){return Number.isFinite(Number(v))?Number(v):null}
function readInstitutionSettings(){try{const u=localStorage.getItem('ct-institution-endpoint-'+(window.__CT_ACCOUNT_ID__||'guest'));const f=$('institutionEndpoint');if(f)f.value=u||'';return u||''}catch(e){return ''}}
async function refreshInstitutional(){const url=readInstitutionSettings();if(!url){fetched.institution='Dated snapshot · custom API not connected';renderInstitutional();return}try{const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('HTTPS endpoints only');const d=await jsonGet(parsed.href,14000);if(!d||typeof d!=='object'||typeof d.asOf!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(d.asOf))throw Error('Missing asOf field');const etf=Array.isArray(d.etfFlows)?d.etfFlows.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))&&safeMetric(x.netMillionUsd)!==null).map(x=>[x.date,Number(x.netMillionUsd)]).sort((a,b)=>a[0].localeCompare(b[0])).slice(-120):null;const categories=d.treasuryCategories&&typeof d.treasuryCategories==='object'?Object.entries(d.treasuryCategories).filter(([,n])=>safeMetric(n)!==null&&Number(n)>=0).map(([k,n])=>[k,Number(n)]):null;const weekly=d.weeklyChanges&&typeof d.weeklyChanges==='object'?Object.entries(d.weeklyChanges).filter(([,n])=>safeMetric(n)!==null).map(([k,n])=>[k,Number(n)]):null;if(!etf?.length&&!categories?.length&&!weekly?.length)throw Error('No valid ETF or treasury data');liveInstitution={etf,categories,weekly,asOf:d.asOf,receivedAt:Date.now(),source:d.source||parsed.hostname};fetched.institution='Connected · source date '+d.asOf;renderInstitutional()}catch(e){fetched.institution='Connection failed · '+e.message;renderInstitutional()}renderSources()}
function initInstitutionEndpoint(){const input=$('institutionEndpoint'),save=$('saveInstitutionEndpoint');if(!input||!save)return;input.value=readInstitutionSettings();save.onclick=()=>{const value=input.value.trim();if(value){try{const u=new URL(value);if(u.protocol!=='https:')throw Error('HTTPS');}catch(e){toast('Enter an HTTPS JSON endpoint.');return}}try{if(value)localStorage.setItem('ct-institution-endpoint-'+(window.__CT_ACCOUNT_ID__||'guest'),value);else localStorage.removeItem('ct-institution-endpoint-'+(window.__CT_ACCOUNT_ID__||'guest'));liveInstitution=null;toast('Institutional endpoint saved.');refreshInstitutional()}catch(e){toast('Unable to save.')}}}

// Institutional data cards: source-dated snapshots, NOT live scraping.
const ETF_SEED=[['2026-10-20',23.2],['2026-10-21',524.8],['2026-10-22',-635.6],['2026-10-23',-137.9],['2026-10-26',110.3],['2026-10-27',176],['2026-10-28',137.3],['2026-10-29',17.2],['2026-10-30',-643.2],['2026-11-02',-398.6],['2026-11-03',-115.6],['2026-11-04',74.6],['2026-11-05',-430.2],['2026-11-06',-411.9]];
const TREASURY_CATEGORY=[['ETF',1468734],['Sovereigns',518526],['Public Companies',1228717],['Private Companies',439005],['Miners',98422],['DeFi',267236]];
const WEEKLY_TREASURY=[['ETF',-14077],['Public Companies',934],['Sovereigns',0],['Private Companies',0],['Miners',0],['DeFi',0]];
/* GitHub Pages source data: dated daily observations, never synthetic live readings. */
let etfAuto=null,fundingSeries=[],oiSeries=[],marketSeriesLastFetch=0,collectionStatus=null;
function normalizedMarketRows(data,key){
 if(!data||data.status!=='ok'||!Array.isArray(data.rows))throw Error('자료 형식 또는 출처가 유효하지 않습니다.');
 const rows=data.rows.filter(r=>r&&/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))&&Number.isFinite(Number(r[key])))
  .map(r=>({date:String(r.date),value:Number(r[key])})).sort((a,b)=>a.date.localeCompare(b.date));
 if(rows.length<5)throw Error('확인된 관측값이 부족합니다.');
 return [...new Map(rows.map(row=>[row.date,row])).values()];
}
async function loadMarketSeries(force=false){
 if(!force&&Date.now()-marketSeriesLastFetch<20*60000)return;
 marketSeriesLastFetch=Date.now();
 try{
  const manifest=await jsonGet('data/collection-status.json',9000);
  if(manifest?.version==='10'&&typeof manifest.sources==='object'&&manifest.sources)collectionStatus=manifest;
 }catch(e){collectionStatus=null}
 const feeds=[['ETF','data/etf-flows.json','netMillionUsd']];
 const results=await Promise.allSettled(feeds.map(async ([name,url,key])=>{
  const response=await jsonGet(url,13000);
  return {name,source:response.source,rows:normalizedMarketRows(response,key)};
 }));
 for(let i=0;i<results.length;i++){
  const result=results[i];
  if(result.status!=='fulfilled')continue;
  const info=result.value;
  if(info.name==='ETF')etfAuto={rows:info.rows.map(r=>[r.date,r.value]),source:info.source};
  if(info.name==='FUNDING')fundingSeries=info.rows;
  if(info.name==='OI')oiSeries=info.rows;
 }
 renderInstitutional();
 renderMarketResearch();
 renderSentiment();
 renderSources();
}
function marketMiniPlot(node,rows,color){
 if(!node)return;
 node.replaceChildren();
 if(rows.length<2){node.textContent='이력 데이터가 연결되면 추세가 나타납니다.';return}
 const ns='http://www.w3.org/2000/svg',W=650,H=128,pad=12;
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 650 128');svg.setAttribute('preserveAspectRatio','none');
 svg.setAttribute('role','img');svg.setAttribute('aria-label','날짜별 실측값 추이');
 const values=rows.map(r=>r.value),lo=Math.min(...values),hi=Math.max(...values);
 const range=Math.max(hi-lo,Math.max(Math.abs(lo),Math.abs(hi))*.04,1e-9);
 const yMin=lo-range*.17,yMax=hi+range*.17;
 const t0=Date.parse(rows[0].date+'T00:00:00Z'),t1=Date.parse(rows.at(-1).date+'T00:00:00Z');
 const x=r=>pad+(Date.parse(r.date+'T00:00:00Z')-t0)/Math.max(1,t1-t0)*(W-pad*2);
 const y=v=>H-pad-(v-yMin)/(yMax-yMin)*(H-pad*2);
 const path=document.createElementNS(ns,'path');
 const gapDays=rows.length>5?4:8;
 path.setAttribute('d',rows.map((r,i)=>{
  const prev=i>0?Date.parse(rows[i-1].date+'T00:00:00Z'):0;
  const d=Date.parse(r.date+'T00:00:00Z')-prev;
  return (i&&d<=gapDays*86400000?'L':'M')+x(r).toFixed(1)+','+y(r.value).toFixed(1);
 }).join(' '));
 path.setAttribute('fill','none');path.setAttribute('stroke',color);
 path.setAttribute('stroke-width','3');path.setAttribute('vector-effect','non-scaling-stroke');
 svg.append(path);node.append(svg);
}
function renderMarketResearch(){
 if(!$('historicalAnalogResults'))return;
 const utcNow=Date.now();
 const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d));
 const rowAge=rows=>rows.length?Math.floor((utcNow-Date.parse(rows.at(-1).date+'T00:00:00Z'))/86400000):null;
 const status=[];
 if(etfAuto?.rows?.length)status.push('ETF '+etfAuto.rows.at(-1)[0]);else status.push('ETF 연결 대기');
 $('researchDataStatus').textContent=status.join(' · ');
 const etfRows=etfAuto?.rows||[],lastFive=etfRows.slice(-5);
 const flow=lastFive.length===5?lastFive.reduce((sum,r)=>sum+Number(r[1]),0):null;
 const etfDate=etfRows.length?etfRows.at(-1)[0]:null;
 const etfOld=etfDate&&(utcNow-Date.parse(etfDate+'T00:00:00Z'))/86400000>7;
 $('etfTrendValue').textContent=flow===null?'—':(flow>=0?'+':'')+fmt(flow,1)+'M USD';
 $('etfTrendNote').textContent=etfDate?'마지막 관측 '+etfDate+(etfOld?' · 이전 거래일 자료, 최신 아님':' · 최근 5거래일 합계'):'검증된 ETF 공개 자료가 없으면 과거 스냅샷을 최신값으로 표시하지 않습니다.';
 marketMiniPlot($('etfTrendPlot'),etfRows.slice(-60).map(r=>({date:r[0],value:Number(r[1])})),'#d8b36c');
 const root=$('historicalAnalogResults');root.replaceChildren();
 const latest=fear.at(-1);
 const prices=new Map(history.filter(r=>validDate(r.date)&&Number(r.price)>0).map(r=>[r.date,Number(r.price)]));
 if(!latest||prices.size<120){
  root.textContent='공포·탐욕 이력과 충분한 BTC 일일 종가가 있어야 과거 유사 구간을 계산할 수 있습니다.';
  return;
 }
 const current=Number(latest.y),cutoff=utcNow-90*86400000;
 const observations=fear.filter(r=>r.x<cutoff&&Math.abs(Number(r.y)-current)<=5).sort((a,b)=>b.x-a.x);
 const cycleDays=x=>{
  const candidates=HALVINGS.map(h=>dayNum(h[1])).filter(d=>d<=dayNum(new Date(x).toISOString().slice(0,10)));
  return candidates.length?dayNum(new Date(x).toISOString().slice(0,10))-candidates.at(-1):null;
 };
 const currentElapsed=cycleDays(latest.x);
 const phaseAligned=observations.filter(r=>{
  const elapsed=cycleDays(r.x);
  return currentElapsed!==null&&elapsed!==null&&Math.abs(elapsed-currentElapsed)<=180;
 });
 const qualified=phaseAligned.length?phaseAligned:observations;
 const picked=[];
 for(const candidate of qualified){
  if(picked.every(p=>Math.abs(p.x-candidate.x)>=30*86400000))picked.push(candidate);
  if(picked.length>=30)break;
 }
 const closest=(d)=>{
  const time=Date.parse(d+'T00:00:00Z');if(!Number.isFinite(time))return null;
  for(const offset of [0,-1,1,-2,2]){
   const date=new Date(time+offset*86400000).toISOString().slice(0,10);
   if(prices.has(date))return {price:prices.get(date),date,offset};
  }
  return null;
 };
 const calc=(d,days)=>{
  const p0=closest(d);if(!p0)return null;
  const target=new Date(Date.parse(d+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const p1=closest(target);
  return p1?(p1.price/p0.price-1)*100:null;
 };
 const cases=picked.map(p=>{
  const date=new Date(p.x).toISOString().slice(0,10);
  return {date,score:p.y,r30:calc(date,30),r90:calc(date,90)}
 }).filter(c=>Number.isFinite(c.r30)&&Number.isFinite(c.r90));
 if(!cases.length){
  root.textContent='해당 조건에 맞는 과거 관측 사례가 없습니다. 일별 자료 확보와 표본 확대가 필요합니다.';
  return;
 }
 const med=values=>{
  const x=values.slice().sort((a,b)=>a-b),mid=Math.floor(x.length/2);
  return x.length%2?x[mid]:(x[mid-1]+x[mid])/2;
 };
 const score=(r)=>(r>=0?'+':'')+fmt(r,1)+'%';
 const stats=document.createElement('div');stats.className='ct-analog-stats';
 const warning=document.createElement('p');warning.className='ct-v11-inline-warning';
 warning.textContent='표본 '+cases.length+'개 · '+(phaseAligned.length?'사이클 경과일 ±180일 우선 비교':'같은 사이클 단계에 해당하는 표본 부족 · 심리 점수 기준만 사용')+
 ' · '+v11PriceQuality().label+'. '+(cases.length<5?'표본 수가 적어 통계적 예측에 부적합합니다.':'과거 사례는 미래를 보증하지 않습니다.');
 root.append(warning);
 for(const [name,value] of [['독립 사례',cases.length+'개'],['이후 30일 중위수',cases.length>=3?score(med(cases.map(c=>c.r30))):'표본 부족'],['이후 90일 중위수',cases.length>=3?score(med(cases.map(c=>c.r90))):'표본 부족']]){
  const cell=document.createElement('div');const label=document.createElement('small');label.textContent=name;
  const strong=document.createElement('strong');strong.textContent=value;
  cell.append(label,strong);stats.append(cell);
 }
 const list=document.createElement('div');list.className='ct-analog-list';
 for(const item of cases.slice(0,4)){
  const line=document.createElement('div');line.className='ct-analog-row ct-analog-card';
  const identity=document.createElement('div');
  const title=document.createElement('div');title.className='ct-analog-primary';title.textContent=item.date;
  const detail=document.createElement('div');detail.className='ct-analog-secondary';detail.textContent='공포·탐욕 '+item.score+'/100';
  const returns=document.createElement('div');returns.className='ct-analog-returns';
  for(const [label,value] of [['30D',item.r30],['90D',item.r90]]){
   const token=document.createElement('span');token.textContent=label+' '+score(value);
   token.style.color=value>=0?'#a5e3c2':'#ffb0af';returns.append(token);
  }
  identity.append(title,detail);
  const chart=document.createElementNS('http://www.w3.org/2000/svg','svg');
  chart.setAttribute('viewBox','0 0 240 68');chart.setAttribute('class','ct-analog-spark');
  chart.setAttribute('role','img');chart.setAttribute('aria-label','실제 BTC 가격 관측값, 관측일 전후 최대 120일');
  const t0=Date.parse(item.date+'T00:00:00Z');
  const observed=history.filter(r=>{
   const t=Date.parse(r.date+'T00:00:00Z');
   return Number.isFinite(t)&&t>=t0-30*86400000&&t<=t0+90*86400000&&Number.isFinite(r.price)&&r.price>0;
  });
  if(observed.length>=3){
   const values=observed.map(r=>Number(r.price)),low=Math.min(...values),high=Math.max(...values);
   const x=r=>10+(Date.parse(r.date+'T00:00:00Z')-(t0-30*86400000))/(120*86400000)*220;
   const y=v=>58-(v-low)/Math.max(high-low,1)*48;
   const vertical=document.createElementNS('http://www.w3.org/2000/svg','line');
   vertical.setAttribute('x1','65');vertical.setAttribute('x2','65');vertical.setAttribute('y1','6');vertical.setAttribute('y2','62');
   vertical.setAttribute('stroke','#86624a');vertical.setAttribute('stroke-dasharray','3 4');chart.append(vertical);
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');
   let d='';
   for(let i=0;i<observed.length;i++){
    const r=observed[i],gap=i?Date.parse(r.date)-Date.parse(observed[i-1].date):Infinity;
    d+=(i&&gap<=10*86400000?' L':' M')+x(r).toFixed(1)+' '+y(r.price).toFixed(1);
   }
   path.setAttribute('d',d);
   path.setAttribute('fill','none');path.setAttribute('stroke',item.r90>=0?'#a5e3c2':'#f2aa63');
   path.setAttribute('stroke-width','2.2');path.setAttribute('stroke-linejoin','round');path.setAttribute('stroke-linecap','round');
   chart.append(path);
  }else{
   const message=document.createElementNS('http://www.w3.org/2000/svg','text');
   message.setAttribute('x','120');message.setAttribute('y','36');message.setAttribute('text-anchor','middle');
   message.setAttribute('fill','#c7b6a8');message.setAttribute('font-size','11');message.textContent='Limited price samples';chart.append(message);
  }
  line.append(identity,returns,chart);list.append(line);
 }
 root.append(stats,list);
 $('historicalAnalogNote').textContent='조건: 최근 심리 점수 ±5점, 가능한 경우 사이클 경과일 ±180일, 사례 간 최소 30일 간격. 이후 90일 가격이 관측된 사례 '+cases.length+'개. 차트는 실제 BTC 관측값만 연결하며 10일 이상 공백은 끊습니다. 과거 사례는 예측 신호가 아닙니다.';
}
let etfExternal=null;
function readEtfLocal(){try{const v=JSON.parse(localStorage.getItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest')));if(Array.isArray(v)&&v.length)etfExternal=v}catch(e){}}
function barSvg(data){const w=900,h=215,L=50,R=18,T=25,B=34,low=Math.min(-750,...data.map(x=>x[1])),high=Math.max(600,...data.map(x=>x[1]));const y=v=>T+(high-v)/(high-low)*(h-T-B),zero=y(0);let s=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily ETF net flows (USD millions)"><line x1="${L}" y1="${zero}" x2="${w-R}" y2="${zero}" stroke="#8d7b63" stroke-width="1"/>`;const bw=(w-L-R)/data.length;data.forEach(([date,val],i)=>{const x=L+i*bw+bw*.18,yr=y(val),rectY=Math.min(zero,yr),rectH=Math.max(1,Math.abs(zero-yr));s+=`<rect x="${x.toFixed(1)}" y="${rectY.toFixed(1)}" width="${(bw*.64).toFixed(1)}" height="${rectH.toFixed(1)}" fill="${val>=0?'#6eae8c':'#c98076'}"><title>${escapeHTML(date)}: ${fmt(val,1)}M USD</title></rect>`;if(i%Math.ceil(data.length/6)===0)s+=`<text x="${(x+bw*.32).toFixed(1)}" y="${h-10}" text-anchor="middle" font-size="12" fill="#a99a86">${escapeHTML(date.slice(5))}</text>`});s+='</svg>';return s;}
function institutionalCategoryKo(name){return ({'Sovereigns':'국가·정부','Public Companies':'상장기업','Private Companies':'비상장기업','Miners':'채굴기업','DeFi':'탈중앙금융','ETF':'ETF'})[name]||String(name)}
function renderInstitutional(){const data=liveInstitution?.etf?.length?liveInstitution.etf:(etfExternal||etfAuto?.rows||ETF_SEED);const last=data[data.length-1];$('etfFlowDate').textContent=last[0];$('etfFlowLatest').textContent=(last[1]>=0?'+':'')+fmt(last[1],1)+'M';$('etfFlowLatest').style.color=last[1]<0?'#d48c88':'#8bc3a0';$('etfFlowPlot').innerHTML=barSvg(data.slice(-40));$('etfFlowCaption').textContent=liveInstitution?.etf?.length?'외부 연결 자료 · 기준일 '+liveInstitution.asOf+' · 출처 '+liveInstitution.source:etfExternal?'업로드된 ETF CSV입니다. 관측일을 확인하세요.':etfAuto?.rows?.length?'TFTC 일별 공개 데이터 (CC BY 4.0) · 최근 관측 '+etfAuto.rows.at(-1)[0]+' · 실시간 시세 아님':'Farside 과거 기록 (2026-11-06 기준). 실시간 데이터는 아닙니다.';
const categoryData=liveInstitution?.categories?.length?liveInstitution.categories:TREASURY_CATEGORY;const weekData=liveInstitution?.weekly?.length?liveInstitution.weekly:WEEKLY_TREASURY;const asOf=liveInstitution?.categories?.length?liveInstitution.asOf:'2026-11-06 (과거 자료)';$('treasuryAsOf').textContent=asOf;const sum=categoryData.reduce((a,[,v])=>a+v,0);$('treasuryTotal').textContent=liveInstitution?.categories?.length?'항목별 보유량 참고':'3,922,216 BTC (과거 자료)';const mx=Math.max(1,...categoryData.map(x=>x[1]));$('treasuryCategoryBars').innerHTML=categoryData.map(([name,value])=>`<div class="treasury-line"><span>${escapeHTML(institutionalCategoryKo(name))}</span><div class="treasury-track"><i style="width:${(value/mx*100).toFixed(2)}%"></i></div><b>${fmt(value)} BTC</b></div>`).join('');$('treasuryWeeklyBars').innerHTML=weekData.map(([name,value])=>`<div class="weekly-item"><span>${escapeHTML(institutionalCategoryKo(name))}</span><strong style="color:${value<0?'#d48c88':value>0?'#8bc3a0':'#a99a86'}">${value>0?'+':''}${fmt(value)} BTC</strong></div>`).join('');}
function parseEtfCsv(txt){const lines=txt.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.length<2)throw Error('CSV records: None');const cols=lines.shift().split(',').map(x=>x.trim().toLowerCase());const dateIx=cols.findIndex(x=>['date','day'].includes(x));const vIx=cols.findIndex(x=>['total','flow','netflow','net_flow','net'].includes(x));if(dateIx<0||vIx<0)throw Error('Expected CSV headers: date,total');const rows=[];for(const line of lines){const a=line.split(',');if(a.length<=Math.max(dateIx,vIx))continue;const date=a[dateIx].trim(),val=Number(a[vIx].trim().replace(/[()]/g,''));if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(val))continue;rows.push([date,/^\s*\(/.test(a[vIx])?-Math.abs(val):val]);}rows.sort((a,b)=>a[0].localeCompare(b[0]));if(!rows.length)throw Error('No valid data in file.');return rows.slice(-500)}
function initInstitutional(){readEtfLocal();$('etfCsv').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{etfExternal=parseEtfCsv(await f.text());localStorage.setItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest'),JSON.stringify(etfExternal));renderInstitutional();toast('ETF CSV 업로드가 완료됐습니다.')}catch(err){toast('CSV error: '+err.message)}e.target.value='';});$('etfReset').onclick=()=>{etfExternal=null;localStorage.removeItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest'));renderInstitutional();toast('기본 과거 자료로 복원했습니다.')};renderInstitutional()}
// Monthly seasonality computed solely from verified imported/fetched BTC closes.
function renderSeasonality(){const holder=$('btcSeasonHeatmap');if(!holder)return;const byMonth=new Map();for(const row of history){const key=row.date.slice(0,7);if(/^\d{4}-\d{2}$/.test(key)&&Number.isFinite(row.price)){
 const a=byMonth.get(key)||{first:row.date,last:row.date,count:0,close:row.price};a.count++;if(row.date>a.last){a.last=row.date;a.close=row.price}byMonth.set(key,a)}}
 const months=[...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0]));const result=new Map();for(let i=1;i<months.length;i++){const [key,v]=months[i], [prevKey,prev]=months[i-1];const yyyy=Number(key.slice(0,4)),mm=Number(key.slice(5));const lastDate=new Date(Date.UTC(yyyy,mm,0)).toISOString().slice(0,10);const previousLast=new Date(Date.UTC(yyyy,mm-1,0)).toISOString().slice(0,10);if((Date.parse(lastDate)-Date.parse(v.last))/86400000>7||(Date.parse(previousLast)-Date.parse(prev.last))/86400000>7||v.count<2||prev.count<2)continue;if(v.close>0&&prev.close>0)result.set(key,(v.close/prev.close-1)*100)}
 const years=[...new Set([...result.keys()].map(k=>Number(k.slice(0,4))))].sort((a,b)=>b-a).filter(y=>$('seasonYears').value==='all'||y>=new Date().getUTCFullYear()-7);$('seasonStatus').textContent=result.size?`${result.size} valid months · ${historySource||'Price history'}`:'Price history required';if(!years.length){holder.innerHTML='<div class="heatmap-empty">Monthly returns require verified historical BTC closes. Import a CSV if your feeds are unavailable.<div><a href="https://www.coinglass.com/today" target="_blank" rel="noopener noreferrer">View historical monthly returns and halving paths on CoinGlass ↗</a></div></div>';return}
 const labels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];let markup='<table class="season-table"><thead><tr><th>Year</th>'+labels.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>';for(const yr of years){markup+=`<tr><th>${yr}</th>`;for(let m=1;m<=12;m++){const v=result.get(`${yr}-${String(m).padStart(2,'0')}`);markup+=v===undefined?'<td class="empty">—</td>':`<td class="${v>=0?'good':'bad'}" title="${yr}-${String(m).padStart(2,'0')}: ${fmt(v,2)}%">${v>=0?'+':''}${fmt(v,1)}%</td>`}markup+='</tr>'}markup+='</tbody><tfoot><tr><th>Positive months</th>';for(let m=1;m<=12;m++){const x=[...result.entries()].filter(([key])=>Number(key.slice(5))===m).map(([,val])=>val);markup+=`<th>${x.length?fmt(x.filter(v=>v>0).length/x.length*100,0)+'%':'—'}</th>`}markup+='</tr></tfoot></table>';holder.innerHTML=markup;}
function initSeasonality(){$('seasonYears').addEventListener('change',renderSeasonality);renderSeasonality()}


// V4: strict date-aligned analysis; never synthesize missing observations.
const V4_FEED_CACHE='cycle-terminal-v4-fng-cache';
function v4ISO(ms){return new Date(ms).toISOString().slice(0,10)}
function v4DateUTC(day){return Date.parse(day+'T00:00:00Z')}
function v4PriceAt(day,tolerance=3){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const target=v4DateUTC(day);let best=null,bestDiff=Infinity;for(const r of history){const diff=Math.abs(v4DateUTC(r.date)-target)/DAYS;if(diff<bestDiff){best=r;bestDiff=diff}}return bestDiff<=tolerance?best:null}
function v4Metric(label,value,detail){return `<div class="v4-metric"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong><span>${escapeHTML(detail)}</span></div>`}
function v4SetEmpty(id,text){const el=$(id);if(el)el.innerHTML=`<div class="v4-empty">${escapeHTML(text)}</div>`}
function renderV4Cycle(){if(!$('cycleMetricCards'))return;const rows=[],metrics=[];for(const [label,start] of HALVINGS){const begin=dayNum(start);const prices=history.filter(r=>{const dd=dayNum(r.date)-begin;return dd>=0&&dd<=1460});const base=v4PriceAt(start,7);if(!base||prices.length<15){rows.push(`<tr><td>${label}</td><td colspan="5" class="v4-muted">Insufficient price data · load verified daily closes</td></tr>`);continue}let max=-Infinity,peak=null,mdd=0;for(const r of prices){if(r.price>max){max=r.price;peak=r}mdd=Math.min(mdd,(r.price/max-1)*100)}const last=prices.at(-1),returns=(last.price/base.price-1)*100;const range=prices[0].date+' ~ '+last.date;rows.push(`<tr><td>${label}</td><td>${escapeHTML(range)}</td><td>${peak.date}</td><td>${money(peak.price)}</td><td class="negative">${fmt(mdd,1)}%</td><td class="${returns>=0?'positive':'negative'}">${returns>=0?'+':''}${fmt(returns,1)}%</td></tr>`)}
const latest=history.at(-1);const lastDay=latest?dayNum(latest.date):null;let weeks=[];if(latest){const dayMap=new Map(history.map(r=>[dayNum(r.date),r.price]));for(let i=199;i>=0;i--){const t=lastDay-7*i;let found=null;for(let d=0;d<=3;d++){if(dayMap.has(t-d)){found=dayMap.get(t-d);break}if(dayMap.has(t+d)){found=dayMap.get(t+d);break}}if(found!==null)weeks.push(found)}}
const ma=weeks.length===200?weeks.reduce((a,b)=>a+b,0)/200:null;const ratio=ma&&latest?(latest.price/ma-1)*100:null;const current=history.filter(r=>r.date>='2024-04-20');let peak=null,mdd=null;if(current.length){peak=current.reduce((a,b)=>a.price>b.price?a:b);mdd=Math.min(...current.map((r,i)=>{const top=Math.max(...current.slice(0,i+1).map(x=>x.price));return (r.price/top-1)*100}))}
metrics.push(v4Metric('Latest BTC Historical Observation',latest?.date||'—',history.length?historySource:'Historical series required'));
metrics.push(v4Metric('200-Week Moving Average',ma?money(ma):'—',ma?`Difference from latest price: ${ratio>=0?'+':''}${fmt(ratio,1)}%`:'200 weekly price observations required'));
metrics.push(v4Metric('2024 Cycle Peak',peak?money(peak.price):'—',peak?peak.date:'Historical prices not loaded'));
metrics.push(v4Metric('2024 Cycle Maximum Drawdown',mdd!==null?fmt(mdd,1)+'%':'—','Since the April 2024 peak'));
$('cycleMetricCards').innerHTML=metrics.join('');$('cycleMetricsBody').innerHTML=rows.join('');$('cycleMetricStatus').textContent=history.length?`${fmt(history.length)} records · ${historySource}`:'Historical price data required';}
function renderV4Divergence(){
 const target=$('divergencePlot');if(!target)return;
 const days=Number($('divergenceRange').value||90);
 // The public BTC backup may contain sampled observations rather than a daily close.
 // Pair each sentiment observation with the nearest *actual* BTC observation (max 2 days apart).
 // No prices are interpolated or manufactured.
 const validPrices=history.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))&&Number.isFinite(Number(r.price))&&Number(r.price)>0);
 const priceMap=new Map(validPrices.map(r=>[r.date,Number(r.price)]));
 const paired=fear.map(x=>{
  const date=v4ISO(x.x),time=Date.parse(date+'T00:00:00Z');
  let observedDate=date,actual=priceMap.get(date),offset=0;
  if(actual===undefined){
   for(const days of [1,-1,2,-2]){
    const candidate=new Date(time+days*86400000).toISOString().slice(0,10);
    if(priceMap.has(candidate)){observedDate=candidate;actual=priceMap.get(candidate);offset=Math.abs(days);break}
   }
  }
  return {date,fear:Number(x.y),price:Number(actual),observedDate,offset};
 }).filter(x=>Number.isFinite(x.price)&&x.price>0&&Number.isFinite(x.fear)&&x.fear>=0&&x.fear<=100);
 const anchor=paired.length?Date.parse(paired.at(-1).date+'T00:00:00Z'):0;
 const pair=days?paired.filter(p=>Date.parse(p.date+'T00:00:00Z')>=anchor-(days-1)*86400000):paired;
 if(pair.length<5){
  $('divergenceCards').innerHTML=[
   v4Metric('일치하는 관측일',pair.length+'일','BTC 가격과 심리 지수가 모두 있는 날짜'),
   v4Metric('비교 상태','데이터 부족','동일 날짜의 BTC 종가와 공포·탐욕 기록이 필요합니다')
  ].join('');
  v4SetEmpty('divergencePlot','두 자료가 동일한 날짜로 10개 이상 필요합니다. BTC 과거 가격을 가져오거나 CSV를 업로드하세요.');
  $('divergenceNote').textContent='임의 보간이나 가상의 가격 관측값은 사용하지 않습니다.';
  return;
 }
 const first=pair[0],last=pair.at(-1);
 const btcChange=(last.price/first.price-1)*100,fearChange=last.fear-first.fear;
 const divergent=(btcChange>0&&fearChange<0)||(btcChange<0&&fearChange>0);
 $('divergenceCards').innerHTML=[
  v4Metric('공통 관측일',pair.length+'일',first.date+' ~ '+last.date),
  v4Metric('BTC 가격 변화',(btcChange>=0?'+':'')+fmt(btcChange,1)+'%','기간 첫 종가 대비'),
  v4Metric('공포·탐욕 변화',(fearChange>=0?'+':'')+fmt(fearChange,0)+'p',fmt(first.fear,0)+' → '+fmt(last.fear,0)),
  v4Metric('방향의 괴리',divergent?'관측됨':'관측되지 않음','기간 처음과 끝의 방향 비교')
 ].join('');
 target.replaceChildren();
 const ns='http://www.w3.org/2000/svg',W=1000,H=400,L=79,R=115,T=44,B=53;
 const plotW=W-L-R,plotH=H-T-B;
 const prices=pair.map(p=>p.price),rawMin=Math.min(...prices),rawMax=Math.max(...prices);
 const pad=Math.max((rawMax-rawMin)*.12,rawMax*.018,1);
 const priceMin=Math.max(0,rawMin-pad),priceMax=rawMax+pad;
 const firstTime=Date.parse(first.date+'T00:00:00Z'),lastTime=Date.parse(last.date+'T00:00:00Z');
 const positions=pair.map(p=>L+(Date.parse(p.date+'T00:00:00Z')-firstTime)/Math.max(1,lastTime-firstTime)*plotW);
 const X=i=>positions[i];
 const YFear=v=>T+(100-v)/100*plotH;
 const YPrice=v=>T+(priceMax-v)/(priceMax-priceMin)*plotH;
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 1000 400');
 svg.setAttribute('preserveAspectRatio','xMidYMid meet');
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label','이중 Y축 차트: 공포·탐욕 지수는 왼쪽 0에서 100까지, BTC 달러 가격은 오른쪽');
 const append=(name,attrs,content)=>{
  const el=document.createElementNS(ns,name);
  for(const [key,val] of Object.entries(attrs))el.setAttribute(key,String(val));
  if(content!==undefined)el.textContent=content;
  svg.append(el);return el
 };
 for(let t=0;t<=5;t++){
  const score=t*20,y=YFear(score),priceVal=priceMin+(priceMax-priceMin)*(score/100);
  append('line',{x1:L,y1:y,x2:W-R,y2:y,stroke:'#70513b','stroke-opacity':'.46','stroke-dasharray':'3 6'});
  append('text',{x:L-15,y:y+5,'text-anchor':'end',fill:'#d8b36c','font-size':14},String(score));
  append('text',{x:W-R+14,y:y+5,'text-anchor':'start',fill:'#91b7a0','font-size':14},'$'+Math.round(priceVal).toLocaleString('en-US'));
 }
 append('text',{x:L,y:22,fill:'#d8b36c','font-size':14,'font-weight':'700'},'공포·탐욕 지수 (0–100)');
 append('text',{x:W-R,y:22,'text-anchor':'end',fill:'#91b7a0','font-size':14,'font-weight':'700'},'BTC 가격 (USD)');
 for(let k=0;k<=5;k++){
  const tick=firstTime+(lastTime-firstTime)*k/5;
  append('text',{x:L+plotW*k/5,y:H-16,'text-anchor':'middle',fill:'#bda28d','font-size':13},new Date(tick).toISOString().slice(5,10));
 }
 const stroke=(yMap,color)=>{
  const d=pair.map((p,i)=>{
   const contiguous=i>0&&(Date.parse(p.date+'T00:00:00Z')-Date.parse(pair[i-1].date+'T00:00:00Z'))<=10*86400000;
   return (contiguous?'L':'M')+X(i).toFixed(2)+' '+yMap(p).toFixed(2)
  }).join(' ');
  append('path',{d,fill:'none',stroke:color,'stroke-width':2.9,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'})
 };
 stroke(p=>YPrice(p.price),'#91b7a0');
 stroke(p=>YFear(p.fear),'#d8b36c');
 const guide=append('line',{x1:L,y1:T,x2:L,y2:H-B,stroke:'#f7d8b3','stroke-width':1,'stroke-opacity':'.68','stroke-dasharray':'4 5',visibility:'hidden'});
 const btcDot=append('circle',{cx:0,cy:0,r:5,fill:'#91b7a0',stroke:'#1b1511','stroke-width':2,visibility:'hidden'});
 const fearDot=append('circle',{cx:0,cy:0,r:5,fill:'#d8b36c',stroke:'#1b1511','stroke-width':2,visibility:'hidden'});
 target.classList.add('ct-dual-axis');
 const tooltip=document.createElement('div');
 tooltip.className='ct-dual-tooltip';
 tooltip.setAttribute('role','status');
 tooltip.hidden=true;
 target.append(svg,tooltip);
 const update=ev=>{
  const bounds=svg.getBoundingClientRect();
  if(!bounds.width)return;
  const px=(ev.clientX-bounds.left)/bounds.width*W;
  let left=0,right=pair.length-1;
  while(right-left>1){const mid=(left+right)>>1;if(positions[mid]<px)left=mid;else right=mid}
  const index=Math.abs(positions[left]-px)<=Math.abs(positions[right]-px)?left:right;
  const point=pair[index],cx=X(index);
  guide.setAttribute('x1',cx);guide.setAttribute('x2',cx);guide.setAttribute('visibility','visible');
  btcDot.setAttribute('cx',cx);btcDot.setAttribute('cy',YPrice(point.price));btcDot.setAttribute('visibility','visible');
  fearDot.setAttribute('cx',cx);fearDot.setAttribute('cy',YFear(point.fear));fearDot.setAttribute('visibility','visible');
  tooltip.textContent=point.date+' (BTC observed '+point.observedDate+')   |   BTC USD '+point.price.toLocaleString('en-US',{maximumFractionDigits:2})+'   |   공포·탐욕 '+point.fear+'/100';
  tooltip.hidden=false;
  const xPct=Math.min(74,Math.max(5,cx/W*100));
  tooltip.style.left=xPct+'%';
 };
 svg.addEventListener('pointermove',update);
 svg.addEventListener('pointerdown',update);
 svg.addEventListener('pointerleave',()=>{
  guide.setAttribute('visibility','hidden');btcDot.setAttribute('visibility','hidden');
  fearDot.setAttribute('visibility','hidden');tooltip.hidden=true;
 });
 $('divergenceNote').textContent='관측일 기준 '+(days?days+'일':'전체 기간')+'에서 공통 자료 '+pair.length+'개 · '+first.date+' ~ '+last.date+' · 왼쪽: 공포·탐욕 0~100 · 오른쪽: BTC 실제 종가(USD). BTC는 실제 관측일 기준 ±2일 이내 가장 가까운 표본을 사용하며 보간하지 않습니다. 10일 초과 공백은 선을 끊습니다.';
}
function v4JournalResult(r){const start=String(r.date||'').slice(0,10),days=Number(r.horizon)||30;if(!/^\d{4}-\d{2}-\d{2}$/.test(start))return {status:'Date invalid'};const target=v4ISO(v4DateUTC(start)+days*DAYS);const recentDay=v4ISO(Date.now());const manual=Number(r.price);const inferred=v4PriceAt(start,3);const base=manual>0?{price:manual,date:start,manual:true}:inferred;if(!base)return {status:'Reference price unavailable',target};if(recentDay<target)return {status:'Awaiting verification',target,base};const end=v4PriceAt(target,3);if(!end||end.date>recentDay)return {status:'End-price unavailable',target,base};return {status:'Verification available',target,base,end,change:(end.price/base.price-1)*100}}
function renderV4Journal(){const statusKo={'Date invalid':'날짜 오류','Reference price unavailable':'기준 가격 없음','Awaiting verification':'검증 대기','End-price unavailable':'결과 가격 없음','Verification available':'검증 완료'};if(!$('journalReviewRows'))return;const sorted=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||0)-(Number(a.createdAt)||0));let ready=0,pending=0,positive=0,changes=[],scored=0,hits=0;const rows=sorted.map(r=>{const ev=v4JournalResult(r);if(ev.status==='Verification available'&&['up','down','flat'].includes(r.direction)){scored++;const c=ev.change;if((r.direction==='up'&&c>0)||(r.direction==='down'&&c<0)||(r.direction==='flat'&&Math.abs(c)<=5))hits++}if(ev.status==='Verification available'){ready++;if(ev.change>0)positive++;changes.push(ev.change)}else pending++;const v=ev.change;return `<tr><td><b>${escapeHTML(r.date||'')}</b><div class="v4-muted">${escapeHTML(r.title||'제목 없음')}</div></td><td>${escapeHTML(String(r.horizon||30))}일</td><td>${ev.base?money(ev.base.price):'—'}</td><td>${ev.end?`${ev.end.date} / ${money(ev.end.price)}`:'—'}</td><td class="${Number.isFinite(v)?v>=0?'positive':'negative':''}">${Number.isFinite(v)?(v>=0?'+':'')+fmt(v,2)+'%':'—'}</td><td>${escapeHTML(statusKo[ev.status]||ev.status)}</td></tr>`});
$('journalReviewRows').innerHTML=rows.join('')||'<tr><td colspan="6" class="v4-muted">No decisions yet. Add your first research entry above.</td></tr>';
$('journalReviewStats').innerHTML=[v4Metric('전체 판단 기록',sorted.length+'건','현재 브라우저에 저장됨'),v4Metric('검증 가능 기록',ready+'건','결과 확인일의 가격 확보'),v4Metric('방향 예측 적중률',scored?fmt(hits/scored*100,0)+'%':'—',scored?hits+' / '+scored+'건 방향 예측':'방향 예측 기록 없음'),v4Metric('평균 BTC 가격 변동률',changes.length?(changes.reduce((a,b)=>a+b,0)/changes.length>=0?'+':'')+fmt(changes.reduce((a,b)=>a+b,0)/changes.length,2)+'%':'—','검증 완료 기록의 단순 평균 · 실제 매매 수익률 아님')].join('');renderV11Calibration();}
function v4DataStatus(name,value,note){const ok=/Connected|Fallback connected/.test(value),stale=/snapshot|not connected|separate/.test(value);return `<tr><td>${escapeHTML(name)}</td><td><span class="v4-tag ${ok?'ok':stale?'stale':'bad'}">${ok?'Connected':stale?'Limited':'Check required'}</span></td><td>${escapeHTML(value)}</td><td class="v4-muted">${escapeHTML(note)}</td></tr>`}
function renderV4Health(){if(!$('dataHealthRows'))return;const lastPrice=price?'Current price · observed at fetch time':'Price unavailable';const lastFear=fear.length?'Latest observation date: '+v4ISO(fear.at(-1).x):'Source refresh required';const lastHistory=history.length?'Last historical observation: '+history.at(-1).date:'CSV import available';$('dataHealthRows').innerHTML=[v4DataStatus('BTC Spot',fetched.price||'Not fetched',lastPrice),v4DataStatus('Fear·Greed',fetched.fear||'Not fetched',lastFear),v4DataStatus('BTC Price History',fetched.history||(history.length?'Local saved history':'Not fetched'),lastHistory),v4DataStatus('Block Height',fetched.block||'Not fetched','Block production times can vary'),v4DataStatus('ETF and institutional holdings',fetched.institution||'Snapshot shown · no API connected','Historical snapshot or custom HTTPS API')].join('')}
function renderV4All(){renderV4Cycle();renderV4Divergence();renderV4Journal();renderV4Health()}
function initV4(){const divergence=$('divergenceRange');if(divergence)divergence.addEventListener('change',renderV4Divergence);$('recalcJournal')?.addEventListener('click',()=>{renderV4Journal();toast('판단 결과를 실제 BTC 관측 가격으로 다시 계산했습니다.')});renderV4All();
// Keep fallback fear index history on the same browser without silently replacing newer values.
try{const raw=JSON.parse(localStorage.getItem(V4_FEED_CACHE)||'null');if(raw?.data?.length&&!fear.length){setFear(raw.data);fetched.fear='Local cache ('+raw.data.length+' records · '+String(raw.saved||'')+')';renderV4All()}}catch(e){}
const oldSetHistory=setHistory;setHistory=function(...args){const r=oldSetHistory(...args);renderV4All();renderMarketResearch();return r};
const oldSetFear=setFear;setFear=function(data){const r=oldSetFear(data);try{localStorage.setItem(V4_FEED_CACHE,JSON.stringify({saved:new Date().toISOString(),data:data.slice(0,4000)}))}catch(e){}renderV4All();renderMarketResearch();return r};
const oldRenderJournal=renderJournal;renderJournal=function(...args){const r=oldRenderJournal(...args);renderV4Journal();return r};
const oldRenderSources=renderSources;renderSources=function(...args){const r=oldRenderSources(...args);renderV4Health();return r};
const oldRenderCycle=renderCycle;renderCycle=function(...args){const r=oldRenderCycle(...args);renderV4Cycle();return r};
const oldRenderSentiment=renderSentiment;renderSentiment=function(...args){const r=oldRenderSentiment(...args);renderV4Divergence();return r};
window.addEventListener('focus',()=>{if(!document.hidden&&Date.now()-v4LastCheck>180000){v4LastCheck=Date.now();refreshAll(false)}});let v4LastCheck=Date.now();
}


/* V10.3 FINAL CLEANUP — presentation-only DOM reorganization.
   Preserve all existing element IDs and localStorage keys for backwards compatibility. */
function initFinalCleanup(){
 const cycle=$('cyclePage'),sentiment=$('sentimentPage'),strategy=$('strategyPage'),settings=$('settingsPage');
 if(!cycle||!sentiment||!strategy||!settings)return;
 const hide=(node)=>{if(node)node.classList.add('ct-cleanup-hidden')};
 const details=(title,location,open=false)=>{
  const el=document.createElement('details');el.className='ct-clean-details';
  el.open=open;
  const summary=document.createElement('summary');summary.textContent=title;el.append(summary);
  location.append(el);return el;
 };
 const firstDirect=(root,selector)=>[...root.children].find(el=>el.matches(selector));
 // Cycle: one countdown, one halving history, one performance summary/chart, one seasonality chart.
 const countdown=firstDirect(cycle,'.halving-dashboard');
 const halving=firstDirect(cycle,'.ct-halving-history');
 if(countdown&&halving)countdown.after(halving);
 const season=$('coinglassSection'),research=$('cycleResearch');
 if(research&&season){season.before(research);research.classList.add('ct-clean-research')}
 const performance=document.createElement('section');performance.className='card ct-clean-performance';
 performance.innerHTML='<div class="card-head"><div><div class="eyebrow">CYCLE PERFORMANCE</div><h2>Post-Halving Returns</h2><p>Observed BTC price change indexed to the halving date. Compare cycles on the same elapsed-day axis.</p></div></div><div class="ct-clean-chart" id="cyclePerformancePlot"></div><p class="muted tiny">Historical observations only. Different cycles and missing samples do not imply a repeatable return path.</p>';
 if(research)research.before(performance);else if(season)season.before(performance);
 const metricsTable=research?.querySelector('.v4-table-wrap');
 const metricsNotes=research?.querySelector('.v4-footnote');
 if(research){
  const extra=details('Detailed cycle metrics',research);
  if(metricsTable)extra.append(metricsTable);
  if(metricsNotes)extra.append(metricsNotes);
  const heading=research.querySelector('.v4-heading h2');if(heading)heading.textContent='Cycle Peaks & Drawdowns';
  const desc=research.querySelector('.v4-heading p');if(desc)desc.textContent='Key price observations by historical cycle';
 }
 const supply=[...cycle.querySelectorAll('.card')].find(el=>el.querySelector('h2')?.textContent?.includes('Bitcoin Supply Convergence'));
 hide(supply);
 hide(cycle.querySelector('.halving-facts'));
 const oldComparison=[...cycle.querySelectorAll('.content-columns')].find(el=>el.querySelector('#cycleTable'));
 hide(oldComparison);
 const upload=[...cycle.querySelectorAll('.card')].find(el=>el.querySelector('#historyFile'));
 // Sentiment: concise analysis, comparison chart, historical analogs, eight questions.
 const psych=sentiment.querySelector('.ct-psych-engine');
 const psychEvidence=psych?.querySelector('.ct-psych-detail-grid');
 if(psych&&psychEvidence){
  const evidence=details('근거 및 반대 시나리오 자세히 보기',psych);
  evidence.append(psychEvidence);
  const headline=psych.querySelector('.ct-psych-head h2');if(headline)headline.textContent='현재 시장 해석';
  hide(psych.querySelector('.ct-psych-foot'));
 }
 const summaryGrid=sentiment.querySelector('.stats-grid');
 if(summaryGrid){
  hide($('sentDelta')?.closest('.stat'));
  for(const [id,label] of [['ctCleanBtc30','BTC 30D RETURN'],['ctCleanEtf5','ETF 5-DAY FLOW']]){
   if($(id))continue;
   const card=document.createElement('div');card.className='stat ct-clean-summary-card';
   const heading=document.createElement('div');heading.className='stat-label';heading.textContent=label;
   const number=document.createElement('div');number.className='stat-value';number.id=id;number.textContent='—';
   const foot=document.createElement('div');foot.className='stat-sub';foot.id=id+'Date';
   foot.textContent='Waiting for verified observations';
   card.append(heading,number,foot);summaryGrid.append(card);
  }
 }
 const divergence=$('divergenceSection'),marketResearch=sentiment.querySelector('.ct-data-research');
 if(divergence&&marketResearch)marketResearch.before(divergence);
 const standalone=sentiment.querySelector('.sentiment-analysis-card');
 const checks=standalone?.querySelector('.ct-eight-checks');
 if(checks){
  const holder=document.createElement('section');holder.className='card ct-clean-sentiment-checks';
  const heading=document.createElement('div');heading.className='card-head';
  heading.innerHTML='<div><h2>시장 심리 점검 질문</h2><p>시장에 대한 확신과 준비 상태를 확인하는 8개 질문</p></div>';
  const fold=details('8개 질문 펼쳐보기',holder);
  fold.append(checks);
  holder.prepend(heading);
  if(marketResearch)marketResearch.after(holder);else sentiment.append(holder);
 }
 hide(sentiment.querySelector('.sentiment-columns'));
 const extraIndicators=[...sentiment.children].find(el=>el.classList.contains('card')&&el.querySelector('#indicators'));
 hide(extraIndicators);
 hide($('institutionalSection'));
 // Journal: existing forms, rules and history stay editable; verification is grouped with saved records.
 const ruleChecks=strategy.querySelector('.content-columns .checklist');
 const ruleContainer=ruleChecks?.parentElement;
 if(ruleChecks){hide(ruleChecks);const title=ruleChecks.previousElementSibling;if(title?.tagName==='H3')hide(title)}
 const journal=strategy.querySelector('.journal-integrated'),review=$('journalVerification');
 const journalCards=journal?.querySelectorAll('.content-columns > .card');
 const journalHistory=journalCards?.[1];
 if(journalHistory&&review){
  const status=$('journalReviewStats');
  if(status){status.classList.add('ct-clean-review-stats');journalHistory.append(status)}
  const fold=details('상세 결과 검토 · 가격 변화 및 방향 적중률',journalHistory);
  fold.append(review);
  review.classList.add('ct-clean-embedded-review');
 }
 const reviewField=$('journalReview')?.closest('label');if(reviewField){
  const more=details('사후 분석 메모 (선택)',reviewField.parentElement);
  more.append(reviewField);
 }
 // Settings: data health + local backups are primary; technical controls tucked into Advanced.
 const settingsColumns=firstDirect(settings,'.content-columns');
 const sourceCard=settingsColumns?.querySelector('.card:first-child');
 const storageCard=settingsColumns?.querySelector('.card:nth-child(2)');
 const quality=$('dataQuality');
 if(sourceCard&&quality){
  const fold=details('Detailed source diagnostics',sourceCard);
  fold.append(quality);
 }
 const advanced=details('Advanced Settings',settings);
 const api=sourceCard?.querySelector('.data-endpoint-box');
 if(api)advanced.append(api);
 if(upload)advanced.append(upload);
 const etfControls=$('etfCsv')?.closest('.intel-inline');
 if(etfControls)advanced.append(etfControls);
 const deleteRow=$('clearLocal')?.closest('.actions');
 if(deleteRow)advanced.append(deleteRow);
 const limitations=[...settings.querySelectorAll('.card')].find(el=>el.querySelector('h2')?.textContent==='Sources & technical limitations');
 if(limitations)advanced.append(limitations);
 if(storageCard)storageCard.classList.add('ct-clean-storage');
 if(sourceCard)sourceCard.classList.add('ct-clean-sources');
 settings.classList.add('ct-clean-settings');
 sentiment.classList.add('ct-clean-sentiment');
 cycle.classList.add('ct-clean-cycle');
 strategy.classList.add('ct-clean-strategy');
}
function renderCyclePerformance(){
 const node=$('cyclePerformancePlot');if(!node)return;
 const range=Number($('cycleRange')?.value||1460);
 const series=[];
 for(const [year,date,color] of [...HALVINGS].reverse()){
  const result=cycleSeries(year,date,range);
  if(result?.series?.length>1)series.push({label:year,color,points:result.series.filter(point=>point.y>0).map(point=>({x:point.x,y:Math.log10(point.y/100)}))});
 }
 if(!series.length){node.textContent='Historical BTC observations are required for cycle comparisons.';return}
 const values=series.flatMap(s=>s.points.map(p=>p.y)).filter(Number.isFinite);
 drawPlot(node,series,{xMin:0,xMax:range,xFormat:v=>Math.round(v)+'d',horizontalLine:0});
}


/* V11 — four-year cycle conviction framework, evidence quality, and investor workflow. */
function v11PriceQuality(){
 if(history.length<2)return {daily:false,ratio:0,interval:null,label:'No historical BTC prices'};
 const recent=history.slice(-Math.min(92,history.length));
 const gaps=recent.slice(1).map((r,i)=>dayNum(r.date)-dayNum(recent[i].date)).filter(Number.isFinite);
 const daily=gaps.filter(n=>n===1).length/Math.max(1,gaps.length);
 const sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 const last=history.at(-1).date,age=dayNum(new Date().toISOString().slice(0,10))-dayNum(last);
 return {daily:daily>=0.85,ratio:daily,interval:median,age,last,
  label:daily>=0.85?'Daily observations':'Sampled every '+median+' days (NOT daily)'};
}
function v11CycleFacts(){
 const halving='2024-04-20';
 const days=dayNum(new Date().toISOString().slice(0,10))-dayNum(halving);
 const latest=history.at(-1)||null;
 const since=history.filter(r=>r.date>=halving&&(!latest||r.date<=latest.date));
 let peak=null;
 for(const r of since)if(!peak||r.price>peak.price)peak=r;
 const drawdown=peak&&latest?(latest.price/peak.price-1)*100:null;
 const fromPeak=peak?dayNum(latest.date)-dayNum(peak.date):null;
 const year=days<365?'Year 1':days<730?'Year 2':days<1095?'Year 3':'Year 4+';
 return {days,year,peak,drawdown,fromPeak,latest,quality:v11PriceQuality()};
}
function v11CreatePanel(title,description,className){
 const panel=document.createElement('section');panel.className='ct-v11-panel '+(className||'');
 const h=document.createElement('div');h.className='ct-v11-head';
 const text=document.createElement('div');const tag=document.createElement('span');tag.className='ct-v11-kicker';tag.textContent='CYCLE TERMINAL / V11';
 const heading=document.createElement('h2');heading.textContent=title;const sub=document.createElement('p');sub.textContent=description;
 text.append(tag,heading,sub);h.append(text);panel.append(h);return panel;
}
function v11Metric(label,id){
 const block=document.createElement('div');block.className='ct-v11-metric';
 const heading=document.createElement('small');heading.textContent=label;
 const value=document.createElement('strong');value.id=id;value.textContent='—';
 block.append(heading,value);return block;
}
function v11InitCycle(){
 const page=$('cyclePage');if(!page)return;
 const panel=v11CreatePanel('Cycle Position','Time since halving is an observation, not a forecast.','ct-v11-cycle');
 const metrics=document.createElement('div');metrics.className='ct-v11-metrics';
 for(const [label,id] of [['TIME SINCE HALVING','v11CycleElapsed'],['CYCLE WINDOW','v11CycleWindow'],['DRAWDOWN FROM PEAK','v11CycleDrawdown'],['LAST OBSERVED PRICE','v11CycleLastPrice']])metrics.append(v11Metric(label,id));
 const summary=document.createElement('p');summary.className='ct-v11-foot';summary.id='v11CycleQuality';
 const context=document.createElement('div');context.className='ct-v11-context';context.id='v11CycleContext';
 panel.append(metrics,summary,context);
 const halving=page.querySelector('.ct-halving-history');
 if(halving)halving.before(panel);else page.querySelector('.halving-dashboard')?.after(panel);
 // A logarithmic multiple of initial halving price avoids hiding later cycles behind 2012.
 const chart=page.querySelector('.ct-clean-performance');
 const title=chart?.querySelector('h2');if(title)title.textContent='Post-Halving Growth · Log Multiples';
 const foot=chart?.querySelector('p.muted');if(foot)foot.textContent='Vertical axis: log10 of observed BTC price / observed halving-date price; 0 = 1×, 1 = 10×, 2 = 100×. Not a prediction. '+v11PriceQuality().label;
}
function renderV11Cycle(){
 const root=$('v11CycleElapsed');if(!root)return;
 const f=v11CycleFacts(),q=f.quality;
 root.textContent=f.days+' days';
 $('v11CycleWindow').textContent=f.year+' / 2024 epoch';
 $('v11CycleDrawdown').textContent=f.drawdown===null?'—':fmt(f.drawdown,1)+'%';
 $('v11CycleLastPrice').textContent=f.latest?money(f.latest.price):'—';
 $('v11CycleQuality').textContent=(f.peak?'Observed cycle peak: '+f.peak.date+' · '+money(f.peak.price)+' · '+f.fromPeak+' days since observed peak. ':'')+
 'BTC history: '+q.label+' · '+(q.last||'No data')+'.';
 const user=state.strategy?.phase||'Not configured';
 $('v11CycleContext').textContent='YOUR CYCLE THESIS: '+user+'  |  Objective timer: '+f.year+'. Historical timing does not confirm the market phase. '+'Provider values are observations, not a trading signal.';
}
function v11InitOverview(){
 const main=$('overviewPage'),band=main?.querySelector('.ct-live-band');if(!main||!band)return;
 const section=v11CreatePanel('Where Are We in the Cycle?','Time, trend and evidence before conviction.','ct-v11-overview');
 const metrics=document.createElement('div');metrics.className='ct-v11-metrics';
 for(const [name,id] of [['USER CYCLE VIEW','v11OverviewPhase'],['DAYS SINCE HALVING','v11OverviewElapsed'],['PEAK DRAWDOWN','v11OverviewDrawdown'],['FEAR & GREED','v11OverviewFear']])metrics.append(v11Metric(name,id));
 const note=document.createElement('p');note.className='ct-v11-foot';note.id='v11OverviewNote';
 const action=document.createElement('button');action.type='button';action.className='btn secondary';action.textContent='Review Cycle Research ↗';action.addEventListener('click',()=>setPage('cycle'));
 section.append(metrics,note,action);band.after(section);
}
function renderV11Overview(){
 if(!$('v11OverviewPhase'))return;
 const f=v11CycleFacts();
 $('v11OverviewPhase').textContent=state.strategy?.phase||'Not configured';
 $('v11OverviewElapsed').textContent=f.days+' days';
 $('v11OverviewDrawdown').textContent=f.drawdown===null?'—':fmt(f.drawdown,1)+'%';
 $('v11OverviewFear').textContent=fear.length?fear.at(-1).y+'/100':'—';
 $('v11OverviewNote').textContent='Price as of '+(f.quality.last||'unavailable')+' · '+f.quality.label+'. Personal cycle view is not independently verified.';
}
function v11InitMacro(){
 const grid=$('macroGrid');if(!grid)return;
 const p=v11CreatePanel('Macro Cross-Check','Compare Bitcoin with risk assets, the dollar, rates and liquidity. Correlation alone does not prove causation.','ct-v11-macro');
 const note=document.createElement('p');note.className='ct-v11-foot';
 note.textContent='Use these as potential challenges to your cycle thesis. Charts are source-labelled proxies; no unsupported live liquidity score is calculated.';
 p.append(note);grid.before(p);
}
function renderV11Quality(){
 const q=v11PriceQuality();
 const target=$('v11PriceQualityNote');
 if(target)target.textContent='BTC historical data: '+q.label+'. Last observed '+(q.last||'—')+
 ' · '+history.length+' observations. '+(q.daily?'Daily return metrics can be evaluated.':'Daily RSI, volatility and historical sentiment analog precision are limited; no missing dates are fabricated.');
}
function v11InitQuality(){
 const target=$('dataSources');if(!target)return;
 const node=document.createElement('p');node.className='ct-v11-foot';node.id='v11PriceQualityNote';target.after(node);
}


function v11InitAssessment(){
 const page=$('sentimentPage'),current=page?.querySelector('.ct-clean-sentiment-checks');if(!current)return;
 const old=current.querySelector('.ct-clean-details');if(old)old.classList.add('ct-cleanup-hidden');
 const form=document.createElement('div');form.className='ct-v11-assessment';
 const questions=[
  ['phase','1. 지금 사이클 중 어느 구간인가?','select',['','반감기 이전','반감기 후 1년차','반감기 후 2년차','반감기 후 3년차','반감기 후 4년차','판단 유보']],
  ['confidence','2. 세부 방향에 대한 확신은 어느 정도인가?','number'],
  ['overconfidence','3. 높은 확신이 위험하다는 점을 인지하는가?','select',['','예 · 반대 근거를 검토했다','부분적으로','아니오']],
  ['quantityRisk','4. BTC 수량을 잃지 않을 수 있는가?','select',['','수량 보호 계획 있음','수량 감소 위험 존재','판단 불가']],
  ['sentiment','5. 시장의 심리지수는 어떤 상태인가?','readonly'],
  ['directions','6. 3개월·6개월 뒤 방향은 어디인가?','directions'],
  ['prepared','7. 그 방향에 대비되어 있는가?','text'],
  ['wrongProbability','8. 내가 틀릴 확률은 얼마나 되는가?','number']
 ];
 for(const [key,label,kind,options] of questions){
  const field=document.createElement('label');field.className='ct-v11-assessment-field';
  const caption=document.createElement('strong');caption.textContent=label;field.append(caption);
  const makeSelect=(name,choices)=>{
   const select=document.createElement('select');select.dataset.v11Answer=name;
   for(const value of choices){const option=document.createElement('option');option.value=value;option.textContent=value||'선택';select.append(option)}
   return select;
  };
  if(kind==='select')field.append(makeSelect(key,options));
  else if(kind==='number'){
   const input=document.createElement('input');input.type='number';input.min='0';input.max='100';input.step='1';input.placeholder='0–100%';
   input.dataset.v11Answer=key;field.append(input);
  }else if(kind==='readonly'){
   const value=document.createElement('p');value.className='ct-v11-answer-current';value.id='v11ActualSentiment';value.textContent='데이터 확인 중';field.append(value);
  }else if(kind==='directions'){
   const choices=document.createElement('div');choices.className='ct-v11-dual';
   for(const [name,title] of [['direction3','3개월'],['direction6','6개월']]){
    const labelEl=document.createElement('label');labelEl.textContent=title;
    labelEl.append(makeSelect(name,['','상승','하락','횡보','판단 유보']));choices.append(labelEl);
   }field.append(choices);
  }else{const textarea=document.createElement('textarea');textarea.rows=2;textarea.placeholder='실제 준비 상태·조건·반대 시나리오';textarea.dataset.v11Answer=key;field.append(textarea)}
  form.append(field);
 }
 const actions=document.createElement('div');actions.className='ct-v11-actions';
 const saved=document.createElement('span');saved.id='v11AssessmentSaved';saved.className='muted tiny';
 const save=document.createElement('button');save.className='btn primary';save.type='button';save.textContent='답변 저장';
 save.addEventListener('click',()=>{
  const answers={};form.querySelectorAll('[data-v11-answer]').forEach(input=>answers[input.dataset.v11Answer]=input.value);
  state.v11Assessment={...answers,savedAt:new Date().toISOString(),fearAtSave:fear.at(-1)?.y??null,
   priceDateAtSave:history.at(-1)?.date??null};
  persist();renderV11Assessment();toast('8개 질문의 답변을 저장했습니다.');
 });
 const journal=document.createElement('button');journal.className='btn secondary';journal.type='button';journal.textContent='투자 판단 기록에 반영 ↗';
 journal.addEventListener('click',()=>{
  const answers=state.v11Assessment;
  if(!answers?.savedAt){toast('먼저 8개 질문에 답하고 저장해 주세요.');return}
  setPage('strategy');
  const summary='[시장 심리 점검 · '+answers.savedAt.slice(0,10)+']\n'+
   '사이클: '+(answers.phase||'—')+'\n확신: '+(answers.confidence||'—')+'%\n과신 점검: '+(answers.overconfidence||'—')+
   '\n수량 위험: '+(answers.quantityRisk||'—')+'\n3개월: '+(answers.direction3||'—')+
   ' / 6개월: '+(answers.direction6||'—')+'\n준비: '+(answers.prepared||'—')+
   '\n틀릴 확률: '+(answers.wrongProbability||'—')+'%';
  const evidence=$('journalEvidence');if(evidence)evidence.value=(evidence.value?evidence.value+'\n\n':'')+summary;
  $('journalTitle').value=$('journalTitle').value||'시장 심리·4년 사이클 판단';
  toast('현재 작성 중인 판단 기록에 복사했습니다. 저장하면 고정된 분석 스냅샷도 함께 남습니다.');
 });
 actions.append(save,journal,saved);form.append(actions);current.append(form);
 const values=state.v11Assessment||{};
 form.querySelectorAll('[data-v11-answer]').forEach(input=>{input.value=values[input.dataset.v11Answer]||''});
 renderV11Assessment();
}
function renderV11Assessment(){
 const el=$('v11ActualSentiment');if(el)el.textContent=fear.length?
  fear.at(-1).y+'/100 · '+sentimentLabelKo(fear.at(-1).y)+' · 관측 '+new Date(fear.at(-1).x).toISOString().slice(0,10):
  '공포·탐욕 지수 데이터 미수신';
 const label=$('v11AssessmentSaved');if(label)label.textContent=state.v11Assessment?.savedAt?
  '저장: '+state.v11Assessment.savedAt.slice(0,16).replace('T',' ')+' UTC':'미저장 · 수치는 직접 입력한 의견';
}


function v11InitHoldings(){
 const page=$('strategyPage'),journal=page?.querySelector('.journal-integrated');if(!page||!journal)return;
 const panel=v11CreatePanel('BTC 수량 관리','달러 수익률과 별개로 실제 보유 BTC가 줄었는지 확인합니다. 수량은 직접 입력하며 거래소와 연결되지 않습니다.','ct-v11-holdings');
 const form=document.createElement('div');form.className='ct-v11-holdings-grid';
 for(const [id,title] of [['initial','기준 BTC 수량'],['current','현재 BTC 수량']]){
  const label=document.createElement('label');label.textContent=title;
  const input=document.createElement('input');input.type='number';input.min='0';input.step='0.00000001';
  input.placeholder='0.00000000';input.dataset.v11Hold=id;
  input.value=state.v11Holdings?.[id]??'';
  label.append(input);form.append(label);
 }
 const measure=v11Metric('BTC QUANTITY VS HOLD','v11QuantityChange');form.append(measure);
 const footer=document.createElement('div');footer.className='ct-v11-actions';
 const save=document.createElement('button');save.type='button';save.className='btn primary';save.textContent='수량 저장';
 const detail=document.createElement('small');detail.id='v11QuantityLabel';detail.className='muted';
 save.addEventListener('click',()=>{
  const initial=form.querySelector('[data-v11-hold="initial"]').value;
  const current=form.querySelector('[data-v11-hold="current"]').value;
  if(initial===''||current===''||Number(initial)<=0||Number(current)<0||!Number.isFinite(Number(initial))||!Number.isFinite(Number(current))){
   toast('기준 BTC는 0보다 크게, 현재 수량은 0 이상으로 입력하세요.');return;
  }
  state.v11Holdings={initial:Number(initial),current:Number(current),savedAt:new Date().toISOString()};
  persist();renderV11Holdings();toast('BTC 수량을 이 브라우저에 저장했습니다.');
 });
 footer.append(save,detail);panel.append(form,footer);journal.before(panel);renderV11Holdings();
}
function renderV11Holdings(){
 const val=$('v11QuantityChange');if(!val)return;
 const h=state.v11Holdings||{},initial=Number(h.initial),current=Number(h.current);
 if(!Number.isFinite(initial)||initial<=0||!Number.isFinite(current)||current<0){
  val.textContent='Not recorded';$('v11QuantityLabel').textContent='기준 수량과 현재 수량을 직접 입력하세요.';return;
 }
 const change=current-initial;
 val.textContent=(change>=0?'+':'')+change.toFixed(8)+' BTC';
 val.style.color=change>=0?'#9bcaa5':'#db9d96';
 $('v11QuantityLabel').textContent='단순 보유 기준 '+initial.toFixed(8)+' BTC 대비 '+(change>=0?'+':'')+fmt(change/initial*100,2)+'% · '+(h.savedAt||'').slice(0,10)+' · 수수료 및 세금은 보유 수량에 포함된 경우만 반영';
}
function renderV11Journal(){
 const root=$('journalList');if(!root)return;
 const sorted=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
 const cards=root.querySelectorAll('.journal-entry');
 cards.forEach((card,i)=>{
  const r=sorted[i];if(!r)return;
  if(r.assessmentSnapshot?.savedAt){
   const detail=document.createElement('details');detail.className='ct-clean-details';
   const summary=document.createElement('summary');summary.textContent='최초 심리 판단 · '+r.assessmentSnapshot.savedAt.slice(0,10);
   const info=document.createElement('pre');info.className='ct-v11-snapshot';
   const v=r.assessmentSnapshot;
   info.textContent='사이클: '+(v.phase||'미기록')+'\n확신도: '+(v.confidence||'—')+'% · 틀릴 확률: '+(v.wrongProbability||'—')+
   '%\n3개월: '+(v.direction3||'—')+' · 6개월: '+(v.direction6||'—')+'\n보유 수량 위험: '+(v.quantityRisk||'—')+
   '\n시장 심리: '+(v.fearAtSave??'—')+'/100';
   detail.append(summary,info);card.append(detail);
  }
 });
}
function renderV11Calibration(){
 const root=$('journalReviewStats');if(!root)return;
 const samples=[];
 for(const r of state.journal){
  const p=Number(r.assessmentSnapshot?.wrongProbability);
  if(r.assessmentSnapshot?.wrongProbability===''||!Number.isFinite(p)||p<0||p>100)continue;
  if(!['up','down','flat'].includes(r.direction))continue;
  const result=v4JournalResult(r);
  if(result.status!=='Verification available')continue;
  const wrong=r.direction==='up'?result.change<=0:r.direction==='down'?result.change>=0:Math.abs(result.change)>5;
  samples.push(Math.pow(p/100-(wrong?1:0),2));
 }
 const panel=document.getElementById('v11Calibration');if(panel)panel.remove();
 const metric=document.createElement('div');metric.id='v11Calibration';metric.className='ct-v11-calibration';
 metric.textContent=samples.length?
 '확신 보정 · Brier score '+fmt(samples.reduce((a,b)=>a+b,0)/samples.length,3)+' ('+samples.length+'건, 낮을수록 좋음). 선택한 결과 확인 기간의 실제 방향을 평가합니다.':
 '확신 보정 · 검증 완료된 전망과 틀릴 확률 기록이 쌓이면 Brier score를 표시합니다.';
 root.after(metric);
}

readStorage();initFinalCleanup();v11InitAssessment();v11InitHoldings();v11InitCycle();v11InitOverview();v11InitMacro();v11InitQuality();applyTheme();initInstitutional();initInstitutionEndpoint();initSeasonality();initCommunity();initNav();initCharts();initCycle();initSentiment();initMacro();initStrategy();initJournal();initV4();restoreChecks();renderCycle();renderOverview();setPage('overview');renderSources();connectLivePrice();fetchQuickPrice();setTimeout(()=>{loadMarketSeries();if(!document.hidden)refreshAll(false)},400);
setInterval(()=>{if(!document.hidden&&!livePriceConnected)fetchQuickPrice()},5000);
setInterval(()=>{if(!document.hidden)refreshAll(false)},120000);
setInterval(()=>{if(!document.hidden&&!$('communityPage').classList.contains('hidden'))fetchCommunityNews()},600000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!livePriceConnected)fetchQuickPrice();refreshAll(false);if(!$('communityPage').classList.contains('hidden'))fetchCommunityNews()}});

})();
