(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='cycle-terminal-v2-'+(window.__CT_ACCOUNT_ID__||'guest'),OLD='cycle-terminal-v1-'+(window.__CT_ACCOUNT_ID__||'guest'),HALVINGS=[['2012','2012-11-27','#8fb7fd'],['2016','2016-07-09','#f3ba6b'],['2020','2020-05-11','#49d5ac'],['2024','2024-04-20','#c998fd']],DAYS=86400000;
const presets={crypto:[['BINANCE:BTCUSDT','D'],['BINANCE:ETHUSDT','D'],['CRYPTOCAP:BTC.D','D'],['CRYPTOCAP:USDT.D','D'],['CRYPTOCAP:TOTAL3','D'],['NASDAQ:NDX','D']],macro:[['BINANCE:BTCUSDT','D'],['TVC:DXY','D'],['TVC:US10Y','D'],['NASDAQ:NDX','D'],['OANDA:XAUUSD','D'],['SP:SPX','D']],cycle:[['BINANCE:BTCUSDT','W'],['BINANCE:BTCUSDT','M'],['CRYPTOCAP:BTC.D','W'],['CRYPTOCAP:TOTAL','W'],['TVC:DXY','W'],['NASDAQ:NDX','W']]};
const defaults=()=>({charts:presets.crypto.map(([symbol,interval])=>({symbol,interval})),cols:2,height:360,preset:'crypto',light:false,macroMemo:'',strategy:{phase:'Not configured',mood:'Not configured',riskExposure:'',reviewDate:'',thesis:'',invalidations:'',riskPlan:'',rules:[{phase:'Early Expansion',mood:'Extreme Fear',action:'Review gradual entry (example)'},{phase:'Late Expansion',mood:'Extreme Greed',action:'Review risk reduction (example)'},{phase:'Bear Market',mood:'Extreme Fear',action:'Manage liquidity and observe basing (example)'}]},journal:[],checks:{},history:[],historySource:''});
let state=defaults(),price=null,fear=[],funding=null,oi=null,history=[],historySource='',fetched={},lastHistoryRefresh=0,refreshBusy=false;
function readStorage(){try{const parsed=JSON.parse(localStorage.getItem(KEY));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){const initial=defaults();state={...initial,...parsed,strategy:{...initial.strategy,...(parsed.strategy||{})}};if(!Array.isArray(state.charts)||!state.charts.length||state.charts.length>16)state.charts=initial.charts;if(!Array.isArray(state.journal))state.journal=[];if(!Array.isArray(state.strategy.rules))state.strategy.rules=initial.strategy.rules;if(!Array.isArray(state.history))state.history=[]}else{const old=JSON.parse(localStorage.getItem(OLD));if(old&&Array.isArray(old.charts)&&old.charts.length<=16&&old.charts.length>0){state.charts=old.charts;state.cols=old.cols||2;state.height=old.height||360;state.preset=old.preset||'custom';state.light=!!old.light;const memo=localStorage.getItem('cycle-terminal-journal-'+(window.__CT_ACCOUNT_ID__||'guest'));if(memo)state.journal=[{id:String(Date.now()),date:new Date().toISOString().slice(0,16),title:'Imported V1 note',phase:'Wait and Observe',price:'',horizon:'30',evidence:memo,action:'',review:''}]}}}catch(e){console.warn('Unable to read saved settings:',e)}// Translate only known legacy sample defaults; never rewrite free-form user notes.
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
 const data=[
  ['S&P 500 / SPX','SP:SPX','US EQUITIES'],
  ['Nasdaq 100 / NDQ','NASDAQ:NDX','US TECHNOLOGY'],
  ['Gold / XAUUSD','OANDA:XAUUSD','SAFE-HAVEN ASSET'],
  ['Brent Crude / BR1!','ICEEUR:BRN1!','ENERGY FUTURES'],
  ['US 10-Year Yield','TVC:US10Y','TREASURY YIELD'],
  ['USD / KRW','FX_IDC:USDKRW','FOREIGN EXCHANGE']
 ];
 grid.replaceChildren();
 const targets=[];
 data.forEach(([name,symbol,category],i)=>{
  const card=document.createElement('article');card.className='macro-card';
  const head=document.createElement('div');head.className='macro-head';
  const heading=document.createElement('div');heading.className='macro-identity';
  const eyebrow=document.createElement('span');eyebrow.className='macro-category';eyebrow.textContent=category;
  const label=document.createElement('strong');label.textContent=name;
  heading.append(eyebrow,label);
  const tools=document.createElement('div');tools.className='macro-actions';
  const code=document.createElement('span');code.className='macro-symbol';code.textContent=symbol;
  const link=document.createElement('a');link.textContent='Open chart ↗';
  link.href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol);
  link.rel='noopener noreferrer';link.target='_blank';link.className='macro-external';
  tools.append(code,link);head.append(heading,tools);
  const slot=document.createElement('div');slot.className='tv-slot';
  slot.innerHTML='<div class="macro-load-note">Loading '+name+' market chart…</div>';
  card.append(head,slot);grid.append(card);targets.push({slot,symbol});
 });
 macroMounted=true;
 // Load the first visible TradingView widgets on demand, not six at once.
 // Limits bandwidth and avoids simultaneous iframe-heavy work on mobile.
 const load=(entry)=>{
  if(entry.done)return;entry.done=true;
  tv(entry.slot,{symbol:entry.symbol,interval:'D',mini:true,allowSymbolChange:false});
 };
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   for(const e of entries){if(!e.isIntersecting)continue;const row=targets.find(r=>r.slot===e.target);if(row){load(row);observer.unobserve(e.target)}}
  },{rootMargin:'240px 0px',threshold:0.01});
  window.macroChartObserver=observer;
  for(const entry of targets)observer.observe(entry.slot);
 }else{
  targets.forEach((entry,i)=>setTimeout(()=>load(entry),i*350));
 }
}
function renderCharts(){const grid=$('chartGrid');grid.replaceChildren();$('preset').value=state.preset;$('layout').value=String(state.cols);$('chartHeight').value=String(state.height);grid.style.setProperty('--cols',String(state.cols));grid.style.setProperty('--chart-height',state.height+'px');$('chartCount').textContent=state.charts.length+' CHARTS';state.charts.forEach((entry,i)=>{const card=document.createElement('article');card.className='chart-card';const head=document.createElement('div');head.className='chart-head';const symbol=document.createElement('input');symbol.type='text';symbol.value=entry.symbol;symbol.setAttribute('aria-label','Chart '+(i+1)+' Symbol');const interval=document.createElement('select');for(const [value,label] of [['15','15 min'],['60','1 hour'],['240','4 hours'],['D','Daily'],['W','Weekly'],['M','Monthly']]){interval.add(new Option(label,value))}interval.value=entry.interval;const apply=btn('Apply',()=>{const val=symbol.value.trim().toUpperCase();if(!validSymbol(val))return toast('Use a symbol such as BINANCE:BTCUSDT.');state.charts[i]={symbol:val,interval:interval.value};state.preset='custom';$('preset').value='custom';tv(body,state.charts[i]);persist()});symbol.addEventListener('keydown',e=>{if(e.key==='Enter')apply.click()});symbol.addEventListener('change',()=>apply.click());interval.addEventListener('change',()=>apply.click());const before=btn('←',()=>swap(i,i-1),'secondary');before.disabled=i===0;const after=btn('→',()=>swap(i,i+1),'secondary');after.disabled=i===state.charts.length-1;const remove=btn('×',()=>{state.charts.splice(i,1);state.preset='custom';renderCharts();persist()},'secondary remove');remove.disabled=state.charts.length===1;const body=document.createElement('div');body.className='chart-body tv-slot';head.append(symbol,interval,apply,before,after,remove);card.append(head,body);grid.append(card);tv(body,entry)});function swap(a,b){[state.charts[a],state.charts[b]]=[state.charts[b],state.charts[a]];state.preset='custom';renderCharts();persist()}}
function btn(text,action,cls='secondary'){const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.textContent=text;b.onclick=action;return b}
function initCharts(){ $('preset').onchange=e=>{const name=e.target.value;state.preset=name;if(presets[name])state.charts=presets[name].map(([symbol,interval])=>({symbol,interval}));renderCharts();persist()};$('layout').onchange=e=>{state.cols=Number(e.target.value);$('chartGrid').style.setProperty('--cols',state.cols);persist()};$('chartHeight').onchange=e=>{state.height=Number(e.target.value);$('chartGrid').style.setProperty('--chart-height',state.height+'px');persist()};$('applyAllInterval').onclick=()=>{const interval=$('allInterval').value;state.charts.forEach(c=>c.interval=interval);state.preset='custom';renderCharts();persist()};$('addChart').onclick=()=>{if(state.charts.length>=16)return toast('You can have up to 16 charts.');state.charts.push({symbol:'BINANCE:BTCUSDT',interval:'D'});state.preset='custom';renderCharts();persist()};$('resetCharts').onclick=()=>{if(confirm('Reset all charts to the default layout?')){Object.assign(state,{charts:defaults().charts,cols:2,height:360,preset:'crypto'});renderCharts();persist()}};$('saveCharts').onclick=()=>persist(true)}
function normalizeHistory(rows){const m=new Map();for(const r of Array.isArray(rows)?rows:[]){if(!r)continue;let date=String(r.date||'');const value=Number(r.price??r.close);if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(value)&&value>0)m.set(date,value)}return [...m].map(([date,price])=>({date,price})).sort((a,b)=>a.date.localeCompare(b.date))}
function setHistory(rows,source){const normalized=normalizeHistory(rows);if(normalized.length<5)throw Error('At least five price observations are required.');history=normalized;historySource=source;state.history=normalized;state.historySource=source;persist();renderCycle();renderOverview()}
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

let chainTip=null,chainFetchedAt=0;
async function refreshBlockHeight(){const el=$('liveBlockHeight'),count=$('nextHalvingBlocks'),eta=$('nextHalvingEstimate'),source=$('blockHeightStatus');if(!el)return;try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),11000);let response;try{response=await fetch('https://mempool.space/api/blocks/tip/height',{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer)}if(!response.ok)throw Error('HTTP '+response.status);const height=Number((await response.text()).trim());if(!Number.isInteger(height)||height<840000||height>1049999)throw Error('Block height validation failed');chainTip=height;chainFetchedAt=Date.now();const remaining=1050000-height;el.textContent=fmt(height)+' blocks';count.textContent=fmt(remaining)+' blocks';const est=new Date(Date.now()+remaining*600000);eta.textContent=est.toLocaleDateString('en-US',{year:'numeric',month:'2-digit',day:'2-digit'});source.textContent='mempool.space · fetched at '+new Date(chainFetchedAt).toLocaleTimeString('en-US')+' · forecast assumes 10 minutes per block';source.dataset.status='ok';fetched.block='Connected · '+new Date(chainFetchedAt).toLocaleTimeString('en-US');}catch(e){if(!chainTip){el.textContent='Unavailable';count.textContent='Unavailable';eta.textContent='Estimated 2028';}source.textContent='Network block API unavailable · '+e.message;source.dataset.status='stale';fetched.block='Connection failed ('+e.message+')'}renderSources()}

function renderCycle(){const days=Math.max(0,dayNum(new Date().toISOString().slice(0,10))-dayNum('2024-04-20'));$('halvingDays').textContent=fmt(days)+' days';$('cycleDays').textContent=fmt(days)+' days';$('cycleYear').textContent='Since the halving: '+(days/365.25).toFixed(2)+' years';$('historyCount').textContent=history.length?fmt(history.length)+' records':'None';$('historySource').textContent=historySource||'API request or CSV upload required';const range=Number($('cycleRange').value),rows=[],chart=[];const current=cycleSeries('2024','2024-04-20',Math.max(range,days));if(current){const observed=interpolateNearest(history,dayNum(new Date().toISOString().slice(0,10)),7)||history[history.length-1];const y=observed.price/current.start.price*100-100;$('cycleReturn').textContent=(y>=0?'+':'')+fmt(y,1)+'%';$('cycleReturn').className='stat-value '+(y<0?'negative':'positive')}else{$('cycleReturn').textContent='—';$('cycleReturn').className='stat-value'}
for(const [year,date,color] of HALVINGS){const s=cycleSeries(year,date,range);if(s&&s.series.length>1)chart.push({label:year,color,points:s.series});if(!s){rows.push(`<tr><td>${year}</td><td>—</td><td>—</td><td>—</td><td>Data unavailable</td></tr>`);continue}const elapsed=Math.min(days,range);const comparable=s.series.filter(r=>r.x<=elapsed);const at=comparable[comparable.length-1];const max=s.series.reduce((acc,item)=>Math.max(acc,item.y),0);rows.push(`<tr><td>${year}</td><td>${money(s.start.price)}</td><td>${at?(at.y-100>=0?'+':'')+fmt(at.y-100,1)+'%':'—'}</td><td>+${fmt(max-100,1)}%</td><td>${s.series.length} observations</td></tr>`)}$('cycleTable').innerHTML=rows.join('');renderEmissionChart();renderSeasonality();}
function parseCsv(content){const lines=content.trim().split(/\r?\n/);if(lines.length<2)throw Error('Not enough CSV rows');let cols=lines[0].replace(/^\uFEFF/,'').split(',').map(s=>s.trim().toLowerCase().replaceAll('"',''));const ix=cols.findIndex(x=>['date','timestamp','time'].includes(x)),iy=cols.findIndex(x=>['close','price','value'].includes(x));if(ix===-1||iy===-1)throw Error('Required columns: date,close or timestamp,price');const output=[];for(const line of lines.slice(1)){const c=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));let date=c[ix];if(/^\d{10,13}$/.test(date))date=new Date(Number(date)*(date.length===10?1000:1)).toISOString().slice(0,10);else if(/^\d{4}\/\d{2}\/\d{2}$/.test(date))date=date.replaceAll('/','-');output.push({date,price:Number(c[iy])})}return normalizeHistory(output)}
function initCycle(){$('loadHistory').onclick=()=>fetchHistory(true);$('cycleRange').onchange=renderCycle;$('historyFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{setHistory(parseCsv(await file.text()),'CSV: '+file.name);toast('Imported '+history.length+' CSV observations.')}catch(err){toast('CSV read failed: '+err.message)}e.target.value=''};$('downloadCsvTemplate').onclick=()=>download('btc-price-template.csv','date,close\n','text/csv');$('exportHistory').onclick=()=>{if(!history.length)return toast('There is no historical data to export.');download('btc-history.csv','date,close\n'+history.map(r=>r.date+','+r.price).join('\n'),'text/csv')}}
function drawPlot(node,sets,opts={}){node.replaceChildren();if(!sets.some(s=>s.points?.length)){node.innerHTML='<div class="plot-placeholder">No observations available. Load an external feed or import CSV.</div>';return}const W=900,H=415,pad={l:58,r:22,t:24,b:45};const all=sets.flatMap(s=>s.points),xs=all.map(p=>p.x),ys=all.map(p=>p.y);let xMin=opts.xMin??Math.min(...xs),xMax=opts.xMax??Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);if(opts.normalizeY){yMin=Math.max(0,yMin*.87);yMax*=1.07}else{const d=Math.max(1,yMax-yMin);yMin-=d*.11;yMax+=d*.11}if(yMax<=yMin)yMax=yMin+1;if(xMax<=xMin)xMax=xMin+1;const px=x=>pad.l+(x-xMin)/(xMax-xMin)*(W-pad.l-pad.r),py=y=>pad.t+(yMax-y)/(yMax-yMin)*(H-pad.t-pad.b);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','Time series graph');function el(tag,attrs={},text=''){const x=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>x.setAttribute(k,v));if(text)x.textContent=text;svg.append(x);return x}for(let i=0;i<5;i++){const y=yMin+(yMax-yMin)*(i/4),yp=py(y);el('line',{x1:pad.l,y1:yp,x2:W-pad.r,y2:yp,stroke:'currentColor','stroke-opacity':'.15','stroke-width':'1'});el('text',{x:pad.l-9,y:yp+4,fill:'currentColor','fill-opacity':'.58','text-anchor':'end','font-size':'11'},fmt(y,opts.normalizeY?0:1))}for(let i=0;i<6;i++){const x=xMin+(xMax-xMin)*(i/5),xp=px(x);el('text',{x:xp,y:H-17,fill:'currentColor','fill-opacity':'.56','text-anchor':'middle','font-size':'11'},opts.xFormat?opts.xFormat(x):fmt(x,0))}if(opts.horizontalLine!==undefined&&opts.horizontalLine>=yMin&&opts.horizontalLine<=yMax)el('line',{x1:pad.l,y1:py(opts.horizontalLine),x2:W-pad.r,y2:py(opts.horizontalLine),stroke:'#92a1b9','stroke-dasharray':'5 5','stroke-opacity':'.6'});sets.forEach(s=>{const values=s.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=xMin&&p.x<=xMax);if(values.length<2)return;const d=values.map((p,i)=>(i?'L':'M')+px(p.x).toFixed(2)+' '+py(p.y).toFixed(2)).join(' ');el('path',{d,fill:'none',stroke:s.color||'#5c9eff','stroke-width':'2.6','stroke-linejoin':'round','stroke-linecap':'round'})});node.append(svg)}
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
async function fetchDerivatives(){const base='https://fapi.binance.com';const requests=await Promise.allSettled([jsonGet(base+'/fapi/v1/premiumIndex?symbol=BTCUSDT'),jsonGet(base+'/fapi/v1/openInterest?symbol=BTCUSDT')]);if(requests[0].status==='fulfilled'&&Number.isFinite(Number(requests[0].value.lastFundingRate))){funding={value:Number(requests[0].value.lastFundingRate)*100,time:Number(requests[0].value.time||Date.now())};fetched.funding='Connected'}else fetched.funding='Connection failed / regional restrictions possible';if(requests[1].status==='fulfilled'&&Number.isFinite(Number(requests[1].value.openInterest))){oi=Number(requests[1].value.openInterest);fetched.oi='Connected'}else fetched.oi='Connection failed / regional restrictions possible';renderSentiment();renderSources()}
function fearLabel(x){return x<=24?'Extreme Fear':x<=44?'Fear':x<=54?'Neutral':x<=74?'Greed':'Extreme Greed'}function renderPriceCard(){const p=$('btcPrice'),s=$('btcSource'),c=$('btcChange');if(!p||!s||!c)return;p.textContent=price?money(price.value):'—';s.textContent=price?.source||'Not connected';c.textContent=price&&Number.isFinite(price.change)?'24h '+(price.change>=0?'+':'')+fmt(price.change,2)+'%':'Price unavailable / awaiting connection';c.className='stat-sub '+(price?.change>=0?'positive':'negative');}
function renderOverview(){const last=fear.at(-1);renderPriceCard();$('fearScore').textContent=last?last.y+'/100':'—';$('fearName').textContent=last?fearLabel(last.y):'Sentiment feed unavailable';const s=state.strategy;$('currentFramework').textContent=s.phase==='Not configured'?'Not configured':s.phase;$('overviewStrategy').innerHTML=`<div>Cycle view: <b>${escapeHTML(s.phase)}</b> · Sentiment: <b>${escapeHTML(s.mood)}</b></div><div class="tiny muted">${escapeHTML(s.thesis?s.thesis.slice(0,190):'No supporting rationale entered yet.')}</div>`;const entries=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||Number(b.id?.split('-')[0])||0)-(Number(a.createdAt)||Number(a.id?.split('-')[0])||0)).slice(0,3);$('recentJournal').innerHTML=entries.length?entries.map(e=>`<div><b>${escapeHTML(e.title)}</b><div class="tiny muted">${escapeHTML(e.date)} · ${escapeHTML(e.phase)}</div></div>`).join(''):'No entries';const current=fear.slice(-90);drawPlot($('overviewFearChart'),current.length?[{label:'Fear & Greed',color:'#f3bb72',points:current.map((p,i)=>({x:i,y:p.y}))}]:[],{xMin:0,xMax:Math.max(1,current.length-1),xFormat:i=>{const item=current[Math.min(current.length-1,Math.round(i))];return item?new Date(item.x).toISOString().slice(5,10):''}});$('fearUpdated').textContent=last?'Latest observation: '+new Date(last.x).toLocaleDateString('en-US')+' · Alternative.me':'Waiting for Alternative.me'}
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

function renderSentiment(){const last=fear.at(-1),prev=fear.at(-2);$('sentFear').textContent=last?last.y+'/100':'—';$('sentFearLabel').textContent=last?fearLabel(last.y):'Data feed unavailable';$('sentDelta').textContent=last&&prev?(last.y-prev.y>=0?'+':'')+(last.y-prev.y)+'p':'—';$('fundingValue').textContent=funding?fmt(funding.value,4)+'%':'Connection required';$('fundingTime').textContent=funding?'Binance / '+new Date(funding.time).toLocaleString('en-US'):'Binance public API';$('oiValue').textContent=oi!==null?fmt(oi,0)+' BTC':'Connection required';const n=Number($('fearRange').value),data=n===0?fear:fear.slice(-n);drawPlot($('sentimentPlot'),data.length?[{label:'Fear·Greed',color:'#f0b95e',points:data.map((d,i)=>({x:i,y:d.y}))}]:[],{xMin:0,xMax:Math.max(1,data.length-1),xFormat:i=>{const d=data[Math.min(data.length-1,Math.round(i))];return d?new Date(d.x).toISOString().slice(5,10):''}});const interpretations=[];
const observation=(label,value,note,wide=false)=>`<div class="sentiment-observation${wide?' wide':''}"><span class="obs-label">${label}</span><strong>${value}</strong><span class="obs-note">${note}</span></div>`;
if(last){
const mood=fearLabel(last.y);
const d7=fear.length>=8?last.y-fear.at(-8).y:null;
const d30=fear.length>=31?last.y-fear.at(-31).y:null;
const sign=n=>n>0?'+':'';
interpretations.push(observation('Current Sentiment',`${last.y} / 100 · ${mood}`,`${new Date(last.x).toLocaleDateString('en-US')} observation date`));
interpretations.push(observation('7-Day Sentiment Change',d7===null?'Insufficient data':`${sign(d7)}${d7}p`,d7===null?'At least eight observations required':d7>0?'Sentiment index increased':d7<0?'Sentiment index decreased':'No index change'));
interpretations.push(observation('30-Day Sentiment Change',d30===null?'Insufficient data':`${sign(d30)}${d30}p`,d30===null?'At least 31 observations required':d30>0?'Intermediate sentiment improving':d30<0?'Intermediate sentiment deteriorating':'No index change'));
interpretations.push(observation('BTC Funding Rate',funding?`${fmt(funding.value,4)}%`:'Connection required',funding?'Positive funding typically means longs pay shorts':'Check Binance connection status'));
interpretations.push(observation('BTC Open Interest',oi!==null?`${fmt(oi,0)} BTC`:'Connection required',oi!==null?'Open interest alone cannot establish a long/short bias':'Check exchange API connection'));
const interpretation=last.y<=24?'Extreme Fear is not a standalone buy signal. Confirm the trend and any reduction in leverage.':last.y>=75?'Extreme Greed is not a standalone sell signal. Review funding and spot flows.':'Sentiment is in an intermediate range. Monitor its rate of change alongside derivatives.';
interpretations.push(observation('Overall Sentiment Note','Key observations',interpretation+' Also check for signs that contradict the four-year-cycle thesis.',true));
}else{
interpretations.push(observation('Current Sentiment Feed','Waiting for connection','Verified Fear & Greed observations will appear once connected.',true));
interpretations.push(observation('Derivatives Feed',funding?`${fmt(funding.value,4)}%`:'Waiting for connection','Only actual connected observations are displayed.',true));
}
$('sentimentInterpretation').innerHTML=interpretations.join('');
const m=computedBtcMeasures();
 const signed=(n,d=1)=>Number.isFinite(n)?(n>=0?'+':'')+fmt(n,d)+'%':'Fetching';
 const metric=(label,value,note,available=true)=>({label,value,note,available});
 const etfFlows=liveInstitution?.etf?.length?liveInstitution.etf:(etfExternal||ETF_SEED);
 const etfWindow=etfFlows.slice(-5),fiveDayFlow=etfWindow.length===5?etfWindow.reduce((sum,row)=>sum+Number(row[1]),0):null;
 const etfAsOf=liveInstitution?.etf?.length?liveInstitution.asOf:etfExternal?'CSV upload':'Snapshot as of 2026-11-06';
 const indicators=[
  metric('Fear & Greed Index',last?last.y+'/100 · '+fearLabel(last.y):'Fetching',last?new Date(last.x).toLocaleDateString('en-US')+' observation date':'Alternative.me automatic feed',!!last),
  metric('BTC Funding Rate',funding?fmt(funding.value,4)+'%':'Checking connection',funding?'Binance futures · '+new Date(funding.time).toLocaleTimeString('en-US'):'Exchange API may be restricted',!!funding),
  metric('BTC Open Interest',oi!==null?fmt(oi,0)+' BTC':'Checking connection',oi!==null?'Binance BTCUSDT data':'Exchange API may be restricted',oi!==null),
  metric('BTC 7-Day Return',signed(m.return7),m.latest?'BTC daily close · '+m.latest:'Loading historical close data',Number.isFinite(m.return7)),
  metric('BTC 30-Day Return',signed(m.return30),m.latest?'BTC daily close · '+m.latest:'Loading historical close data',Number.isFinite(m.return30)),
  metric('30-Day Realized Volatility',Number.isFinite(m.volatility30)?fmt(m.volatility30,1)+'%':'Checking price series','Annualized standard deviation of daily log returns',Number.isFinite(m.volatility30)),
  metric('14-Day RSI',Number.isFinite(m.rsi14)?fmt(m.rsi14,1):'Checking price series','Simple RSI calculated from 14 days of closing-price changes',Number.isFinite(m.rsi14)),
  metric('Distance from 200-Week MA',signed(m.maGap),Number.isFinite(m.ma200w)?'200-week average: '+money(m.ma200w):'200 weeks of price data required',Number.isFinite(m.maGap)),
  metric('BTC ETF 5-Day Net Flow',Number.isFinite(fiveDayFlow)?(fiveDayFlow>=0?'+':'')+fmt(fiveDayFlow,1)+'M USD':'Checking ETF connection','As of: '+etfAsOf+' · historical flows, not streaming',Number.isFinite(fiveDayFlow))
 ];
 $('indicators').innerHTML=indicators.map(item=>'<div class="indicator"><strong>'+escapeHTML(item.label)+'</strong><span class="tag '+(item.available?'ok':'off')+'">'+(item.available?'Data available':'Pending')+'</span><div class="indicator-value">'+escapeHTML(item.value)+'</div><small class="indicator-note">'+escapeHTML(item.note)+'</small></div>').join('');
}
function initSentiment(){$('refreshSentiment').onclick=()=>Promise.allSettled([fetchFear(),fetchDerivatives()]).then(()=>toast('Sentiment metrics refreshed.'));$('fearRange').onchange=renderSentiment}
function initMacro(){$('macroMemo').value=state.macroMemo||'';$('saveMacro').onclick=()=>{state.macroMemo=$('macroMemo').value;persist(true)}}
function renderStrategy(){const s=state.strategy;for(const f of ['phase','mood','riskExposure','reviewDate','thesis','invalidations','riskPlan'])$(f).value=s[f]??'';const matrix=$('strategyMatrix');matrix.replaceChildren();s.rules.forEach((r,i)=>{const item=document.createElement('div');item.className='rule';const line=document.createElement('div');line.className='rule-row';const a=document.createElement('input');a.value=r.phase||'';a.placeholder='Cycle phase';const b=document.createElement('input');b.value=r.mood||'';b.placeholder='Sentiment condition';const c=document.createElement('input');c.value=r.action||'';c.placeholder='Action to consider';const drop=btn('Delete',()=>{s.rules.splice(i,1);renderStrategy();persist()},'secondary remove');[a,b,c].forEach((input,j)=>input.addEventListener('input',()=>{r[['phase','mood','action'][j]]=input.value}));line.append(a,b);const line2=document.createElement('div');line2.className='rule-row';line2.append(c,drop);item.append(line,line2);matrix.append(item)})}
function initStrategy(){$('addRule').onclick=()=>{state.strategy.rules.push({phase:'',mood:'',action:''});renderStrategy();persist()};$('saveStrategy').onclick=()=>{for(const k of ['phase','mood','riskExposure','reviewDate','thesis','invalidations','riskPlan'])state.strategy[k]=$(k).value;persist(true);renderOverview()}}
function journalForm(record){const r=record||{id:'',date:localDateTime(),phase:'Wait and Observe',price:'',horizon:'30',title:'',evidence:'',action:'',review:''};for(const k of ['id','date','phase','price','horizon','title','evidence','action','review'])$('journal'+k[0].toUpperCase()+k.slice(1)).value=r[k]??'';$('journalDirection').value=r.direction||'';$('journalEditorTitle').textContent=record?'Edit decision':'New decision'}
function localDateTime(){const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function renderJournal(){const sorted=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||Number(b.id?.split('-')[0])||0)-(Number(a.createdAt)||Number(a.id?.split('-')[0])||0));$('journalCount').textContent=sorted.length+' entries';$('journalList').replaceChildren();if(!sorted.length){$('journalList').innerHTML='<div class="plot-placeholder">No decisions yet. Add your first research entry.</div>';return}sorted.forEach(r=>{const node=document.createElement('div');node.className='journal-entry';const title=document.createElement('strong');title.textContent=r.title||'Untitled';const meta=document.createElement('div');meta.className='meta';meta.textContent=r.date+' · '+r.phase+(Number(r.price)>0?' · '+money(r.price):'');const p=document.createElement('p');p.textContent=(r.evidence||'').slice(0,260)||'No supporting rationale';const actions=document.createElement('div');actions.className='actions';actions.append(btn('Edit',()=>{journalForm(r);window.scrollTo({top:0,behavior:'smooth'})}),btn('Delete',()=>{if(confirm('Delete this decision?')){state.journal=state.journal.filter(e=>e.id!==r.id);persist();renderJournal();renderOverview()}},'secondary remove'));node.append(title,meta,p,actions);$('journalList').append(node)})}
function initJournal(){journalForm();$('saveJournal').onclick=()=>{const r={};for(const k of ['id','date','phase','price','horizon','title','evidence','action','review'])r[k]=$('journal'+k[0].toUpperCase()+k.slice(1)).value;if(!r.title.trim())return toast('Enter a decision title.');if(!r.date)return toast('Choose a date and time for your decision.');r.direction=$('journalDirection').value;if(!r.id){r.id=String(Date.now())+'-'+Math.floor(Math.random()*10000);r.createdAt=Date.now()}else{r.createdAt=state.journal.find(e=>e.id===r.id)?.createdAt||Number(r.id.split('-')[0])||Date.now()}if(state.journal.some(e=>e.id===r.id))state.journal=state.journal.map(e=>e.id===r.id?r:e);else state.journal.push(r);persist(true);renderJournal();renderOverview();journalForm()};$('cancelJournal').onclick=()=>journalForm();$('useCurrentPrice').onclick=()=>{if(!price)return toast('BTC price is not connected. Enter a reference price manually.');$('journalPrice').value=price.value;toast('Current BTC quote copied into the form.')};$('exportJournal').onclick=()=>{const keys=['date','title','phase','price','horizon','evidence','action','review'];const csv=[keys.join(','),...state.journal.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');download('cycle-journal.csv','\uFEFF'+csv,'text/csv')}}
function renderSources(){if(!$('dataSources'))return;const list=[['TradingView Charts','Third-party chart embed'],['BTC spot price (5-second polling)',fetched.price||'Not fetched'],['Alternative.me Fear·Greed',fetched.fear||'Not fetched'],['Binance Funding Rate',fetched.funding||'Not fetched'],['Binance Open Interest',fetched.oi||'Not fetched'],['BTC/USD historical close',fetched.history||(history.length?'Local historical observations: '+history.length+' records':'Not fetched')],['BTC Network Block Height',fetched.block||'Not fetched'],['ETF and institutional holdings',fetched.institution||'Dated snapshots'],['MVRV / SOPR / Liquidations','Additional API required']];$('dataSources').innerHTML=list.map(([n,v])=>`<div class="indicator"><strong>${escapeHTML(n)}</strong><span>${escapeHTML(v)}</span></div>`).join('')}
async function refreshAll(notify=false){if(refreshBusy)return;refreshBusy=true;$('networkStatus').textContent='Fetching market data…';try{const shouldHistory=Date.now()-lastHistoryRefresh>(history.length?12*3600000:15*60000);const jobs=[livePriceConnected?Promise.resolve():fetchPrice(),fetchFear(),fetchDerivatives(),refreshBlockHeight(),refreshInstitutional()];if(shouldHistory){lastHistoryRefresh=Date.now();jobs.push(fetchHistory(false))}await Promise.allSettled(jobs);$('networkStatus').textContent='Checked at '+new Date().toLocaleTimeString('en-US')+' · according to provider frequency';$('networkStatus').classList.add('ok');renderSources();animateLiveUpdate();if(notify)toast('Source refresh completed. Check each card for observation dates.')}finally{refreshBusy=false}}
function download(name,content,mime){const blob=new Blob([content],{type:mime+';charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}function downloadBackup(){download('cycle-terminal-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'cycle-terminal',version:2,savedAt:new Date().toISOString(),state},null,2),'application/json')}
async function restoreBackup(e){const f=e.target.files?.[0];if(!f)return;try{const raw=JSON.parse(await f.text());if(raw.app!=='cycle-terminal'||raw.version!==2||!raw.state||!Array.isArray(raw.state.charts)||!Array.isArray(raw.state.journal)||!Array.isArray(raw.state.history))throw Error('Unsupported backup file.');if(!confirm('Replace existing local data with this backup?'))return;state={...defaults(),...raw.state,strategy:{...defaults().strategy,...raw.state.strategy}};history=normalizeHistory(state.history);historySource=state.historySource||'';if(!persist())return;location.reload()}catch(err){toast('Restore failed: '+err.message)}finally{e.target.value=''}}
function restoreChecks(){document.querySelectorAll('[data-check]').forEach(x=>{x.checked=!!state.checks?.[x.dataset.check];x.addEventListener('change',()=>{state.checks[x.dataset.check]=x.checked;persist()})})}

// Community: verified public profiles through the official X embed, plus live-source RSS.
const LEADERS=[['Michael Saylor','saylor'],['Cathie Wood','CathieDWood'],['Balaji Srinivasan','balajis'],['Eric Balchunas','EricBalchunas'],['Bitcoin Magazine','BitcoinMagazine']];
let activeLeader='saylor',communityTab='all',newsItems=[],newsPending=false,newsEverLoaded=false;
function renderCommunity(){
 const tabs=$('leaderTabs');if(!tabs)return;
 tabs.replaceChildren();
 for(const [label,handle] of LEADERS){
  const b=document.createElement('button');b.textContent=label;b.className=activeLeader===handle?'selected':'';
  b.onclick=()=>{activeLeader=handle;renderCommunity()};tabs.append(b);
 }
 const x=$('xTimeline');
 // Avoid third-party embedded timelines that render as a black, empty frame under tracking protection.
 // A native profile card loads instantly and works without third-party cookies.
 x.replaceChildren();x.classList.add('community-profile-card');
 const eyebrow=document.createElement('div');eyebrow.className='ct-profile-eyebrow';eyebrow.textContent='CURATED MARKET VOICES';
 const mark=document.createElement('div');mark.className='ct-profile-mark';mark.textContent='𝕏';
 const title=document.createElement('h3');title.textContent='Follow '+(LEADERS.find(x=>x[1]===activeLeader)?.[0]||('@'+activeLeader));
 const desc=document.createElement('p');desc.textContent='Explore original market commentary directly on X. Embedded timelines can be blocked by browser privacy settings.';
 const actions=document.createElement('div');actions.className='ct-profile-actions';
 const profile=document.createElement('a');profile.href='https://x.com/'+encodeURIComponent(activeLeader);profile.target='_blank';profile.rel='noopener noreferrer';profile.className='ct-action-primary';profile.textContent='Open X Profile ↗';
 const search=document.createElement('a');search.href='https://www.google.com/search?q='+encodeURIComponent('site:x.com/'+activeLeader+' bitcoin market');search.target='_blank';search.rel='noopener noreferrer';search.className='ct-action-secondary';search.textContent='Find Recent Posts ↗';
 actions.append(profile,search);x.append(eyebrow,mark,title,desc,actions);
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
let etfExternal=null;
function readEtfLocal(){try{const v=JSON.parse(localStorage.getItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest')));if(Array.isArray(v)&&v.length)etfExternal=v}catch(e){}}
function barSvg(data){const w=900,h=215,L=50,R=18,T=25,B=34,low=Math.min(-750,...data.map(x=>x[1])),high=Math.max(600,...data.map(x=>x[1]));const y=v=>T+(high-v)/(high-low)*(h-T-B),zero=y(0);let s=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily ETF net flows (USD millions)"><line x1="${L}" y1="${zero}" x2="${w-R}" y2="${zero}" stroke="#8d7b63" stroke-width="1"/>`;const bw=(w-L-R)/data.length;data.forEach(([date,val],i)=>{const x=L+i*bw+bw*.18,yr=y(val),rectY=Math.min(zero,yr),rectH=Math.max(1,Math.abs(zero-yr));s+=`<rect x="${x.toFixed(1)}" y="${rectY.toFixed(1)}" width="${(bw*.64).toFixed(1)}" height="${rectH.toFixed(1)}" fill="${val>=0?'#6eae8c':'#c98076'}"><title>${escapeHTML(date)}: ${fmt(val,1)}M USD</title></rect>`;if(i%Math.ceil(data.length/6)===0)s+=`<text x="${(x+bw*.32).toFixed(1)}" y="${h-10}" text-anchor="middle" font-size="12" fill="#a99a86">${escapeHTML(date.slice(5))}</text>`});s+='</svg>';return s;}
function renderInstitutional(){const data=liveInstitution?.etf?.length?liveInstitution.etf:(etfExternal||ETF_SEED);const last=data[data.length-1];$('etfFlowDate').textContent=last[0];$('etfFlowLatest').textContent=(last[1]>=0?'+':'')+fmt(last[1],1)+'M';$('etfFlowLatest').style.color=last[1]<0?'#d48c88':'#8bc3a0';$('etfFlowPlot').innerHTML=barSvg(data.slice(-40));$('etfFlowCaption').textContent=liveInstitution?.etf?.length?'External data · as of '+liveInstitution.asOf+' · source '+liveInstitution.source:etfExternal?'Uploaded ETF CSV. Please check its observation date.':'Farside historic snapshot ending 2026-11-06; not a real-time feed.';
const categoryData=liveInstitution?.categories?.length?liveInstitution.categories:TREASURY_CATEGORY;const weekData=liveInstitution?.weekly?.length?liveInstitution.weekly:WEEKLY_TREASURY;const asOf=liveInstitution?.categories?.length?liveInstitution.asOf:'2026-11-06 (snapshot)';$('treasuryAsOf').textContent=asOf;const sum=categoryData.reduce((a,[,v])=>a+v,0);$('treasuryTotal').textContent=liveInstitution?.categories?.length?'Reference by category':'3,922,216 BTC (snapshot)';const mx=Math.max(1,...categoryData.map(x=>x[1]));$('treasuryCategoryBars').innerHTML=categoryData.map(([name,value])=>`<div class="treasury-line"><span>${name}</span><div class="treasury-track"><i style="width:${(value/mx*100).toFixed(2)}%"></i></div><b>${fmt(value)} BTC</b></div>`).join('');$('treasuryWeeklyBars').innerHTML=weekData.map(([name,value])=>`<div class="weekly-item"><span>${name}</span><strong style="color:${value<0?'#d48c88':value>0?'#8bc3a0':'#a99a86'}">${value>0?'+':''}${fmt(value)} BTC</strong></div>`).join('');}
function parseEtfCsv(txt){const lines=txt.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(lines.length<2)throw Error('CSV records: None');const cols=lines.shift().split(',').map(x=>x.trim().toLowerCase());const dateIx=cols.findIndex(x=>['date','day'].includes(x));const vIx=cols.findIndex(x=>['total','flow','netflow','net_flow','net'].includes(x));if(dateIx<0||vIx<0)throw Error('Expected CSV headers: date,total');const rows=[];for(const line of lines){const a=line.split(',');if(a.length<=Math.max(dateIx,vIx))continue;const date=a[dateIx].trim(),val=Number(a[vIx].trim().replace(/[()]/g,''));if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(val))continue;rows.push([date,/^\s*\(/.test(a[vIx])?-Math.abs(val):val]);}rows.sort((a,b)=>a[0].localeCompare(b[0]));if(!rows.length)throw Error('No valid data in file.');return rows.slice(-500)}
function initInstitutional(){readEtfLocal();$('etfCsv').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{etfExternal=parseEtfCsv(await f.text());localStorage.setItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest'),JSON.stringify(etfExternal));renderInstitutional();toast('ETF CSV imported.')}catch(err){toast('CSV error: '+err.message)}e.target.value='';});$('etfReset').onclick=()=>{etfExternal=null;localStorage.removeItem('cycle-terminal-etf-csv-'+(window.__CT_ACCOUNT_ID__||'guest'));renderInstitutional();toast('Restored default snapshot.')};renderInstitutional()}
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
function renderV4Divergence(){if(!$('divergencePlot'))return;const days=Number($('divergenceRange').value||90),priceMap=new Map(history.map(r=>[r.date,r.price]));const paired=fear.map(x=>({date:v4ISO(x.x),fear:x.y,price:priceMap.get(v4ISO(x.x))})).filter(x=>Number.isFinite(x.price)&&x.price>0);const pair=days?paired.slice(-days):paired;
if(pair.length<10){$('divergenceCards').innerHTML=[v4Metric('Overlapping observation days',pair.length+' days','Measured BTC price and sentiment on the same calendar days'),v4Metric('Comparison Status','Insufficient data','Matched BTC prices and Fear & Greed history required')].join('');v4SetEmpty('divergencePlot','At least ten observations on matching dates are required. Load verified prices or import a CSV.');$('divergenceNote').textContent='No fabricated interpolations or synthetic observations are used.';return;}
const p0=pair[0].price,f0=pair[0].fear;const last=pair.at(-1),prev=pair[0];const btcChange=(last.price/prev.price-1)*100,fearChange=last.fear-prev.fear;const divergence=(btcChange>0&&fearChange<0)||(btcChange<0&&fearChange>0);const normalized=pair.map((x,i)=>({x:i,btc:x.price/p0*100,fear:x.fear/f0*100}));
$('divergenceCards').innerHTML=[v4Metric('Matched observations',pair.length+' days',pair[0].date+' ~ '+last.date),v4Metric('BTC Price Change',(btcChange>=0?'+':'')+fmt(btcChange,1)+'%','Relative to the first observation'),v4Metric('Sentiment Change',(fearChange>=0?'+':'')+fmt(fearChange,0)+'p',fmt(prev.fear,0)+' → '+fmt(last.fear,0)),v4Metric('Directional Divergence',divergence?'Observed':'Not observed','Direction measured from window endpoints')].join('');
drawPlot($('divergencePlot'),[{label:'BTC',color:'#91b7a0',points:normalized.map(x=>({x:x.x,y:x.btc}))},{label:'Fear & Greed',color:'#d8b36c',points:normalized.map(x=>({x:x.x,y:x.fear}))}],{xMin:0,xMax:pair.length-1,xFormat:i=>pair[Math.max(0,Math.min(pair.length-1,Math.round(i)))].date.slice(5)});
$('divergenceNote').textContent=`Matched dates: ${pair.length} records, ${pair[0].date} ~ ${last.date} · Directional comparison of the first and last observation. Both series start at 100, but use different scales and cannot be compared as equivalent changes.`;}
function v4JournalResult(r){const start=String(r.date||'').slice(0,10),days=Number(r.horizon)||30;if(!/^\d{4}-\d{2}-\d{2}$/.test(start))return {status:'Date invalid'};const target=v4ISO(v4DateUTC(start)+days*DAYS);const recentDay=v4ISO(Date.now());const manual=Number(r.price);const inferred=v4PriceAt(start,3);const base=manual>0?{price:manual,date:start,manual:true}:inferred;if(!base)return {status:'Reference price unavailable',target};if(recentDay<target)return {status:'Awaiting verification',target,base};const end=v4PriceAt(target,3);if(!end||end.date>recentDay)return {status:'End-price unavailable',target,base};return {status:'Verification available',target,base,end,change:(end.price/base.price-1)*100}}
function renderV4Journal(){if(!$('journalReviewRows'))return;const sorted=[...state.journal].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.createdAt)||0)-(Number(a.createdAt)||0));let ready=0,pending=0,positive=0,changes=[],scored=0,hits=0;const rows=sorted.map(r=>{const ev=v4JournalResult(r);if(ev.status==='Verification available'&&['up','down','flat'].includes(r.direction)){scored++;const c=ev.change;if((r.direction==='up'&&c>0)||(r.direction==='down'&&c<0)||(r.direction==='flat'&&Math.abs(c)<=5))hits++}if(ev.status==='Verification available'){ready++;if(ev.change>0)positive++;changes.push(ev.change)}else pending++;const v=ev.change;return `<tr><td><b>${escapeHTML(r.date||'')}</b><div class="v4-muted">${escapeHTML(r.title||'Untitled')}</div></td><td>${escapeHTML(String(r.horizon||30))} days</td><td>${ev.base?money(ev.base.price):'—'}</td><td>${ev.end?`${ev.end.date} / ${money(ev.end.price)}`:'—'}</td><td class="${Number.isFinite(v)?v>=0?'positive':'negative':''}">${Number.isFinite(v)?(v>=0?'+':'')+fmt(v,2)+'%':'—'}</td><td>${escapeHTML(ev.status)}</td></tr>`});
$('journalReviewRows').innerHTML=rows.join('')||'<tr><td colspan="6" class="v4-muted">No decisions yet. Add your first research entry above.</td></tr>';
$('journalReviewStats').innerHTML=[v4Metric('Total Decision Entries',sorted.length+' records','Saved in this browser'),v4Metric('Verification available',ready+' records','End-of-horizon price available'),v4Metric('Directional Forecast Hit Rate',scored?fmt(hits/scored*100,0)+'%':'—',scored?hits+' / '+scored+' directional predictions':'No directional predictions'),v4Metric('Average BTC Price Change',changes.length?(changes.reduce((a,b)=>a+b,0)/changes.length>=0?'+':'')+fmt(changes.reduce((a,b)=>a+b,0)/changes.length,2)+'%':'—','Simple average of verified entries, not trading returns')].join('');}
function v4DataStatus(name,value,note){const ok=/Connected|Fallback connected/.test(value),stale=/snapshot|not connected|separate/.test(value);return `<tr><td>${escapeHTML(name)}</td><td><span class="v4-tag ${ok?'ok':stale?'stale':'bad'}">${ok?'Connected':stale?'Limited':'Check required'}</span></td><td>${escapeHTML(value)}</td><td class="v4-muted">${escapeHTML(note)}</td></tr>`}
function renderV4Health(){if(!$('dataHealthRows'))return;const lastPrice=price?'Current price · observed at fetch time':'Price unavailable';const lastFear=fear.length?'Latest observation date: '+v4ISO(fear.at(-1).x):'Source refresh required';const lastHistory=history.length?'Last historical observation: '+history.at(-1).date:'CSV import available';$('dataHealthRows').innerHTML=[v4DataStatus('BTC Spot',fetched.price||'Not fetched',lastPrice),v4DataStatus('Fear·Greed',fetched.fear||'Not fetched',lastFear),v4DataStatus('BTC Price History',fetched.history||(history.length?'Local saved history':'Not fetched'),lastHistory),v4DataStatus('Funding',fetched.funding||'Not fetched','Check regional exchange access policy'),v4DataStatus('Open Interest',fetched.oi||'Not fetched','Exchange BTCUSDT product'),v4DataStatus('Block Height',fetched.block||'Not fetched','Block production times can vary'),v4DataStatus('ETF and institutional holdings',fetched.institution||'Snapshot shown · no API connected','Historical snapshot or custom HTTPS API')].join('')}
function renderV4All(){renderV4Cycle();renderV4Divergence();renderV4Journal();renderV4Health()}
function initV4(){const divergence=$('divergenceRange');if(divergence)divergence.addEventListener('change',renderV4Divergence);$('recalcJournal')?.addEventListener('click',()=>{renderV4Journal();toast('Rechecked saved entries against available observed BTC prices.')});renderV4All();
// Keep fallback fear index history on the same browser without silently replacing newer values.
try{const raw=JSON.parse(localStorage.getItem(V4_FEED_CACHE)||'null');if(raw?.data?.length&&!fear.length){setFear(raw.data);fetched.fear='Local cache ('+raw.data.length+' records · '+String(raw.saved||'')+')';renderV4All()}}catch(e){}
const oldSetHistory=setHistory;setHistory=function(...args){const r=oldSetHistory(...args);renderV4All();return r};
const oldSetFear=setFear;setFear=function(data){const r=oldSetFear(data);try{localStorage.setItem(V4_FEED_CACHE,JSON.stringify({saved:new Date().toISOString(),data:data.slice(0,4000)}))}catch(e){}renderV4All();return r};
const oldRenderJournal=renderJournal;renderJournal=function(...args){const r=oldRenderJournal(...args);renderV4Journal();return r};
const oldRenderSources=renderSources;renderSources=function(...args){const r=oldRenderSources(...args);renderV4Health();return r};
const oldRenderCycle=renderCycle;renderCycle=function(...args){const r=oldRenderCycle(...args);renderV4Cycle();return r};
const oldRenderSentiment=renderSentiment;renderSentiment=function(...args){const r=oldRenderSentiment(...args);renderV4Divergence();return r};
window.addEventListener('focus',()=>{if(!document.hidden&&Date.now()-v4LastCheck>180000){v4LastCheck=Date.now();refreshAll(false)}});let v4LastCheck=Date.now();
}

readStorage();applyTheme();initInstitutional();initInstitutionEndpoint();initSeasonality();initCommunity();initNav();initCharts();initCycle();initSentiment();initMacro();initStrategy();initJournal();initV4();restoreChecks();renderCycle();renderOverview();setPage('overview');renderSources();connectLivePrice();fetchQuickPrice();setTimeout(()=>{if(!document.hidden)refreshAll(false)},400);
setInterval(()=>{if(!document.hidden&&!livePriceConnected)fetchQuickPrice()},5000);
setInterval(()=>{if(!document.hidden)refreshAll(false)},120000);
setInterval(()=>{if(!document.hidden&&!$('communityPage').classList.contains('hidden'))fetchCommunityNews()},600000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!livePriceConnected)fetchQuickPrice();refreshAll(false);if(!$('communityPage').classList.contains('hidden'))fetchCommunityNews()}});

})();