(()=>{'use strict';
const $=id=>document.getElementById(id), FX=20, REWARD=3.125, usd=n=>Number.isFinite(n)?'$'+Math.round(n).toLocaleString('en-US'):'—';
let livePrice=null, difficulty=null, priceHistory=[],difficultyHistory=[],sourcePrice='',sourceNetwork='',lastPriceAt=null,lastDifficultyAt=null;
const cost=d=>d>0?d*4294967296/1e12*FX/3600000/REWARD*Number($('elecRate').value):NaN;
const fetchJSON=async(url)=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(11000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const firstSuccess=async(tasks)=>{for(const [fn,name] of tasks){try{const value=await fn();if(value!=null)return{value,name}}catch(e){}}throw Error('연결 가능한 데이터 소스가 없습니다')};
const toSeries=(values,key)=>Array.isArray(values)?values.map(v=>({t:Number(v.x??v.timestamp??v.time)*(Number(v.x??v.timestamp??v.time)<1e11?1000:1),v:Number(v.y??v[key]??v.value)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)&&p.v>0).sort((a,b)=>a.t-b.t):[];
const last=(a)=>a.length?a[a.length-1]:null;
const draw=()=>{const price=livePrice,ec=cost(difficulty);$('elecBTC').textContent=usd(price);$('elecCost').textContent=usd(ec);
$('elecBTCSource').textContent=sourcePrice?(sourcePrice+' · '+new Date(lastPriceAt).toLocaleTimeString('ko-KR')):'실시간 시세 불러오기 실패';
$('elecDifficulty').textContent=Number.isFinite(difficulty)?('Network difficulty '+(difficulty/1e12).toFixed(1)+'T · '+sourceNetwork):'난이도 데이터 없음';
$('elecPremium').textContent=Number.isFinite(price)&&Number.isFinite(ec)&&ec>0?(100*(price/ec-1)>=0?'+':'')+(100*(price/ec-1)).toFixed(1)+'%':'—';
$('elecPremiumText').textContent=Number.isFinite(price)&&Number.isFinite(ec)?(price>=ec?'BTC 가격이 모델 전기비용보다 높음':'BTC 가격이 모델 전기비용보다 낮음'):'비교 불가능';
const now=Date.now(),cut=now-365*86400000,ph=priceHistory.filter(p=>p.t>=cut),dh=difficultyHistory.filter(p=>p.t>=cut);
const series=[];let j=0;for(const p of ph){while(j+1<dh.length&&dh[j+1].t<=p.t)j++;if(!dh.length||dh[j].t>p.t)continue;series.push({t:p.t,p:p.v,c:cost(dh[j].v)})}
if(series.length<10){$('elecPlot').innerHTML='<div class="ct-elec-empty">과거 가격 또는 난이도 데이터가 부족해 추세 차트를 표시할 수 없습니다.<br>현재 수치와 데이터 상태는 위에서 확인하세요.</div>';return}
if(Number.isFinite(price)&&Number.isFinite(ec))series.push({t:now,p:price,c:ec});
const W=1000,H=320,pl=68,pr=18,pt=22,pb=36,lo=Math.min(...series.map(v=>Math.min(v.p,v.c)))*.88,hi=Math.max(...series.map(v=>Math.max(v.p,v.c)))*1.08;const x=t=>pl+(t-series[0].t)/(series[series.length-1].t-series[0].t||1)*(W-pl-pr),y=v=>pt+(1-(v-lo)/(hi-lo||1))*(H-pt-pb);
const path=k=>series.map((v,i)=>(i?'L':'M')+x(v.t).toFixed(1)+','+y(v[k]).toFixed(1)).join(' ');
let grid='';for(let i=0;i<=4;i++){let val=lo+(hi-lo)*i/4,yy=y(val);grid+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+yy+'" y2="'+yy+'" stroke="#66452b" stroke-opacity=".35"/><text x="10" y="'+(yy+4)+'" font-size="12" fill="#aa927b">'+usd(val)+'</text>'}
const months=[0,3,6,9,12].map(i=>{let t=series[0].t+(series[series.length-1].t-series[0].t)*i/12;return '<text x="'+x(t)+'" y="'+(H-10)+'" text-anchor="middle" font-size="12" fill="#b69c85">'+new Date(t).toLocaleDateString('en-US',{month:'short',year:'2-digit'})+'</text>'}).join('');
$('elecPlot').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Historical BTC price and modeled electricity expense per bitcoin"><defs><linearGradient id="elecFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e89232" stop-opacity=".15"/><stop offset="1" stop-color="#e89232" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+path('c')+'" fill="none" stroke="#69a9c3" stroke-width="2.5" vector-effect="non-scaling-stroke"/><path d="'+path('p')+'" fill="none" stroke="#f6a23a" stroke-width="2.6" vector-effect="non-scaling-stroke"/>'+months+'</svg>';
};
const load=async()=>{const status=$('elecStatus');status.textContent='업데이트 중…';
await Promise.all([
(async()=>{try{const r=await firstSuccess([
[async()=>{const d=await fetchJSON('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');return Number(d.price)||null},'Binance BTCUSDT'],
[async()=>{const d=await fetchJSON('https://mempool.space/api/v1/prices');return Number(d.USD)||null},'Mempool BTC/USD'],
[async()=>{const d=await fetchJSON('https://api.coinbase.com/v2/prices/BTC-USD/spot');return Number(d.data?.amount)||null},'Coinbase BTC/USD']]);livePrice=r.value;sourcePrice=r.name;lastPriceAt=Date.now()}catch(e){sourcePrice=''}})(),
(async()=>{try{const d=await fetchJSON('https://mempool.space/api/v1/mining/hashrate/1y');difficulty=Number(d.currentDifficulty)||null;difficultyHistory=toSeries(d.difficulty||[],'difficulty');sourceNetwork='mempool.space';lastDifficultyAt=Date.now()}catch(e){try{const d=await fetchJSON('https://blockchain.info/q/getdifficulty?cors=true');difficulty=Number(d)||null;sourceNetwork='Blockchain.com'}catch(e){sourceNetwork=''}}})(),
(async()=>{try{const d=await fetchJSON('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365');priceHistory=(d||[]).map(k=>({t:Number(k[0]),v:Number(k[4])})).filter(p=>Number.isFinite(p.v)&&p.v>0)}catch(e){try{const d=await fetchJSON('https://api.blockchain.info/charts/market-price?timespan=1year&format=json&cors=true');priceHistory=toSeries(d.values||[])}catch(e){priceHistory=[]}}})()
]);draw();status.textContent='현재 시세: '+(sourcePrice||'연결 실패')+' · 난이도: '+(sourceNetwork||'연결 실패')+' · 과거 차트: '+(priceHistory.length&&difficultyHistory.length?'관측 기반':'데이터 미확보')+' · 마지막 시도 '+new Date().toLocaleTimeString('ko-KR')+' · 자동 갱신 60초';};
function removeExtraButtons(){const toolbar=document.querySelector('#chartsPage .toolbar');if(!toolbar)return;for(const b of toolbar.querySelectorAll('button')){if(/BTC\s*크게\s*\+\s*HYPE\s*7차트|이전\s*차트\s*설정/.test(b.textContent||''))b.remove()}}
document.addEventListener('DOMContentLoaded',()=>{$('elecRate')?.addEventListener('change',()=>{let v=Number($('elecRate').value);if(!Number.isFinite(v)||v<.01||v>.3){$('elecRate').value='.05'}draw()});$('elecRefresh')?.addEventListener('click',load);removeExtraButtons();const toolbar=document.querySelector('#chartsPage .toolbar');if(toolbar)new MutationObserver(removeExtraButtons).observe(toolbar,{childList:true,subtree:true});load();setInterval(()=>{if(!document.hidden)load()},60000)});
})();