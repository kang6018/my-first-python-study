(()=>{'use strict';
const home=document.getElementById('ctHero');
if(!home)return;
const mobileMenu=document.getElementById('mobileMenuBtn');
const mainNav=document.getElementById('navigation');
function closeMobileMenu(){
 if(!mobileMenu||!mainNav)return;
 mobileMenu.setAttribute('aria-expanded','false');mainNav.classList.remove('ct-open');
 mobileMenu.setAttribute('aria-label','Open navigation menu');
}
mobileMenu?.addEventListener('click',()=>{
 const expanded=mobileMenu.getAttribute('aria-expanded')==='true';
 mobileMenu.setAttribute('aria-expanded',String(!expanded));
 mobileMenu.setAttribute('aria-label',expanded?'Open navigation menu':'Close navigation menu');
 mainNav?.classList.toggle('ct-open',!expanded);
});
mainNav?.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',closeMobileMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenu()});
document.addEventListener('click',e=>{if(mobileMenu&&mainNav&&!mainNav.contains(e.target)&&!mobileMenu.contains(e.target))closeMobileMenu()});
const bar=document.createElement('div');bar.className='ct-scrollbar';document.body.appendChild(bar);
const price=document.getElementById('btcPrice'),live=document.getElementById('ctLivePrice'),change=document.getElementById('btcChange'),liveChange=document.getElementById('ctLiveChange');
const status=document.getElementById('ctLiveConnection');
function syncPrice(){
 if(!price||!live)return;
 live.textContent=price.textContent==='—'?'Connecting to market feed':price.textContent;
 liveChange.textContent=change?.textContent||'Automatically refreshed';
 const source=document.getElementById('btcSource')?.textContent||'';
 if(status)status.textContent=/Coinbase/.test(source)?'● COINBASE / LIVE':/Binance/.test(source)?'● BINANCE / 5S':'● Checking connection';
}
if(price&&window.MutationObserver)new MutationObserver(syncPrice).observe(price,{childList:true,subtree:true,characterData:true});
syncPrice();
const motion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let ticking=false;
function updateScroll(){
 ticking=false;
 const y=scrollY||0;
 const range=Math.max(1,document.documentElement.scrollHeight-innerHeight);
 bar.style.width=Math.min(100,y/range*100)+'%';
 const orb=document.getElementById('ctOrb');
 if(orb&&!motion()){
  const rect=home.getBoundingClientRect();
  if(rect.bottom>0&&rect.top<innerHeight){
   orb.style.rotate=Math.max(-20,Math.min(75,y*.065))+'deg';
   orb.style.opacity=String(Math.max(.24,1-y/1200));
   orb.style.scale=String(Math.max(.8,1-y/4500));
  }
 }
}
window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(updateScroll)}},{passive:true});
updateScroll();
const sections=home.parentElement.querySelectorAll('.ct-story-chapter .ct-reveal');
if('IntersectionObserver' in window&&!motion()){
 const io=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
   entry.target.classList.remove('ct-entering');
   entry.target.classList.add('ct-entered');
   io.unobserve(entry.target);
  }
 },{threshold:.08,rootMargin:'0px 0px -25px 0px'});
 for(const el of sections){el.classList.add('ct-entering');io.observe(el)}
}

/* Decorative-only global BTC flow: avoid animating when hidden or reduced-motion requested. */
const flowMap=document.getElementById('ctOwnershipFlowSvg');
if(flowMap){
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 let flowOnScreen=true;
 const syncFlow=()=>{
  if(document.hidden||reduceMotion?.matches||!flowOnScreen)flowMap.pauseAnimations?.();
  else flowMap.unpauseAnimations?.();
 };
 if('IntersectionObserver' in window){
  const flowObserver=new IntersectionObserver(entries=>{
   flowOnScreen=!!entries[0]?.isIntersecting;syncFlow();
  },{threshold:.04});
  flowObserver.observe(flowMap);
 }
 document.addEventListener('visibilitychange',syncFlow);
 reduceMotion?.addEventListener?.('change',syncFlow);
 syncFlow();
}
})();