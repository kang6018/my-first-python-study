(()=>{'use strict';
const $=id=>document.getElementById(id), FX=20, REWARD=3.125, usd=n=>Number.isFinite(n)?'$'+Math.round(n).toLocaleString('en-US'):'—';
let livePrice=null, difficulty=null, priceHistory=[],difficultyHistory=[],sourcePrice='',sourceNetwork='',lastPriceAt=null,lastDifficultyAt=null;
const HALVINGS=[{at:Date.UTC(2024,3,20),reward:3.125},{at:Date.UTC(2020,4,11),reward:6.25},{at:0,reward:12.5}];
const hardware=[{t:Date.UTC(2019,0,1),j:55},{t:Date.UTC(2020,0,1),j:45},{t:Date.UTC(2021,0,1),j:38},{t:Date.UTC(2022,0,1),j:32},{t:Date.UTC(2023,0,1),j:27},{t:Date.UTC(2024,0,1),j:23},{t:Date.UTC(2025,0,1),j:21},{t:Date.UTC(2026,0,1),j:20}];
const historicalEfficiency=t=>{let i=0;while(i<hardware.length-1&&hardware[i+1].t<=t)i++;if(i===hardware.length-1)return hardware[i].j;let a=hardware[i],b=hardware[i+1];return a.j+(b.j-a.j)*Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)))};
const cost=(d,t=Date.now())=>{const eff=historicalEfficiency(t),reward=(HALVINGS.find(x=>t>=x.at)||HALVINGS[HALVINGS.length-1]).reward;return d>0?d*4294967296/1e12*eff/3600000/reward*Number($('elecRate').value):NaN};
const fetchJSON=async(url)=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(11000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const firstSuccess=async(tasks)=>{for(const [fn,name] of tasks){try{const value=await fn();if(value!=null)return{value,name}}catch(e){}}throw Error('연결 가능한 데이터 소스가 없습니다')};
const toSeries=(values,key)=>Array.isArray(values)?values.map(v=>({t:Number(v.x??v.timestamp??v.time)*(Number(v.x??v.timestamp??v.time)<1e11?1000:1),v:Number(v.y??v[key]??v.value)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)&&p.v>0).sort((a,b)=>a.t-b.t):[];
const last=(a)=>a.length?a[a.length-1]:null;
const draw=()=>{const price=livePrice,ec=cost(difficulty);$('elecBTC').textContent=usd(price);$('elecCost').textContent=usd(ec);
$('elecBTCSource').textContent=sourcePrice?(sourcePrice+' · '+new Date(lastPriceAt).toLocaleTimeString('ko-KR')):'실시간 시세 불러오기 실패';
$('elecDifficulty').textContent=Number.isFinite(difficulty)?('Network difficulty '+(difficulty/1e12).toFixed(1)+'T · '+sourceNetwork):'난이도 데이터 없음';
$('elecPremium').textContent=Number.isFinite(price)&&Number.isFinite(ec)&&ec>0?(100*(price/ec-1)>=0?'+':'')+(100*(price/ec-1)).toFixed(1)+'%':'—';
$('elecPremiumText').textContent=Number.isFinite(price)&&Number.isFinite(ec)?(price>=ec?'BTC 가격이 모델 전기비용보다 높음':'BTC 가격이 모델 전기비용보다 낮음'):'비교 불가능';
const now=Date.now(),cut=Date.UTC(2020,0,1),ph=priceHistory.filter(p=>p.t>=cut),dh=difficultyHistory.filter(p=>p.t>=cut);
const series=[];let j=0;for(const p of ph){while(j+1<dh.length&&dh[j+1].t<=p.t)j++;if(!dh.length||dh[j].t>p.t)continue;series.push({t:p.t,p:p.v,c:cost(dh[j].v,p.t)})}
if(series.length<10){$('elecPlot').innerHTML='<div class="ct-elec-empty">과거 가격 또는 난이도 데이터가 부족해 추세 차트를 표시할 수 없습니다.<br>현재 수치와 데이터 상태는 위에서 확인하세요.</div>';return}
if(Number.isFinite(price)&&Number.isFinite(ec))series.push({t:now,p:price,c:ec});
const W=1000,H=425,pl=79,pr=24,pt=31,pb=53,lo=Math.min(...series.map(v=>Math.min(v.p,v.c)))*.88,hi=Math.max(...series.map(v=>Math.max(v.p,v.c)))*1.08;const x=t=>pl+(t-series[0].t)/(series[series.length-1].t-series[0].t||1)*(W-pl-pr),y=v=>pt+(1-(v-lo)/(hi-lo||1))*(H-pt-pb);
const path=k=>series.map((v,i)=>(i?'L':'M')+x(v.t).toFixed(1)+','+y(v[k]).toFixed(1)).join(' ');
let grid='';for(let i=0;i<=4;i++){let val=lo+(hi-lo)*i/4,yy=y(val);grid+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+yy+'" y2="'+yy+'" stroke="#66452b" stroke-opacity=".35"/><text x="10" y="'+(yy+4)+'" font-size="12" fill="#aa927b">'+usd(val)+'</text>'}
const y0=new Date(series[0].t).getUTCFullYear(),y1=new Date(series[series.length-1].t).getUTCFullYear();const years=Array.from({length:y1-y0+1},(_,i)=>y0+i).filter(y=>Date.UTC(y,0,1)>=series[0].t&&Date.UTC(y,0,1)<=series[series.length-1].t).map(y=>'<text x="'+x(Date.UTC(y,0,1)).toFixed(1)+'" y="'+(H-14)+'" text-anchor="middle" font-size="13" fill="#b69c85">'+y+'</text>').join('');
$('elecPlot').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Historical BTC price and modeled electricity expense per bitcoin"><defs><linearGradient id="elecFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e89232" stop-opacity=".15"/><stop offset="1" stop-color="#e89232" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+path('c')+'" fill="none" stroke="#69a9c3" stroke-width="2.5" vector-effect="non-scaling-stroke"/><path d="'+path('p')+'" fill="none" stroke="#f6a23a" stroke-width="2.6" vector-effect="non-scaling-stroke"/>'+years+'</svg>';
};
let historyLoadedAt=0,historySource='';
const historical=async()=>{if(Date.now()-historyLoadedAt<1800000&&priceHistory.length&&difficultyHistory.length>100)return;
const loadChart=async(name)=>{for(const span of ['7years','all']){for(const sampled of ['false','true']){try{const d=await fetchJSON('https://api.blockchain.info/charts/'+name+'?timespan='+span+'&format=json&sampled='+sampled+'&cors=true');const values=toSeries(d.values||[]);if(values.length>100)return values}catch(e){}}}return []};
const [prices,difficulties]=await Promise.all([loadChart('market-price'),loadChart('difficulty')]);
if(prices.length>100)priceHistory=prices;if(difficulties.length>100)difficultyHistory=difficulties;
if(prices.length>100&&difficulties.length>100){historyLoadedAt=Date.now();historySource='Blockchain.com historical series'}
};
const load=async()=>{const status=$('elecStatus');status.textContent='업데이트 중…';
await Promise.all([
(async()=>{try{const r=await firstSuccess([
[async()=>{const d=await fetchJSON('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');return Number(d.price)||null},'Binance BTCUSDT'],
[async()=>{const d=await fetchJSON('https://mempool.space/api/v1/prices');return Number(d.USD)||null},'Mempool BTC/USD'],
[async()=>{const d=await fetchJSON('https://api.coinbase.com/v2/prices/BTC-USD/spot');return Number(d.data?.amount)||null},'Coinbase BTC/USD']]);livePrice=r.value;sourcePrice=r.name;lastPriceAt=Date.now()}catch(e){sourcePrice=''}})(),
(async()=>{try{const d=await fetchJSON('https://mempool.space/api/v1/mining/hashrate/3y');difficulty=Number(d.currentDifficulty)||null;if(!difficultyHistory.length)difficultyHistory=toSeries(d.difficulty||[],'difficulty');sourceNetwork='mempool.space';lastDifficultyAt=Date.now()}catch(e){try{const d=await fetchJSON('https://blockchain.info/q/getdifficulty?cors=true');difficulty=Number(d)||null;sourceNetwork='Blockchain.com'}catch(e){sourceNetwork=''}}})(),
(async()=>{try{await historical()}catch(e){}if(priceHistory.length<100){try{const d=await fetchJSON('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000');priceHistory=(d||[]).map(k=>({t:Number(k[0]),v:Number(k[4])})).filter(p=>Number.isFinite(p.v)&&p.v>0)}catch(e){}}})()
]);draw();status.textContent='현재 시세: '+(sourcePrice||'연결 실패')+' · 난이도: '+(sourceNetwork||'연결 실패')+' · 과거 차트: '+(priceHistory.length&&difficultyHistory.length?(historySource||'일부 관측 구간'):'데이터 미확보')+' · 마지막 시도 '+new Date().toLocaleTimeString('ko-KR')+' · 자동 갱신 60초';};
function removeExtraButtons(){const toolbar=document.querySelector('#chartsPage .toolbar');if(!toolbar)return;for(const b of toolbar.querySelectorAll('button')){if(/BTC\s*크게\s*\+\s*HYPE\s*7차트|이전\s*차트\s*설정/.test(b.textContent||''))b.remove()}}
document.addEventListener('DOMContentLoaded',()=>{$('elecRate')?.addEventListener('change',()=>{let v=Number($('elecRate').value);if(!Number.isFinite(v)||v<.01||v>.3){$('elecRate').value='.05'}draw()});$('elecRefresh')?.addEventListener('click',load);removeExtraButtons();const toolbar=document.querySelector('#chartsPage .toolbar');if(toolbar)new MutationObserver(removeExtraButtons).observe(toolbar,{childList:true,subtree:true});load();setInterval(()=>{if(!document.hidden)load()},60000)});
})();