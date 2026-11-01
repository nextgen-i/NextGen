/* NextGen shared mobile Pull-to-Refresh — touch-first implementation. */
(function(){
  'use strict';
  if(window.__NG_PULL_REFRESH_V1__) return;
  window.__NG_PULL_REFRESH_V1__ = true;

  var startY=0, startX=0, tracking=false, ready=false, indicator=null, activeScroller=null;
  var threshold=76, maxPull=112, refreshing=false;

  function blocked(){
    return document.body.classList.contains('ng-profile-open') ||
           document.body.classList.contains('ng-menu-open') ||
           !!document.querySelector('.ng-profile-menu.is-open,.ng-menu-drawer.is-open');
  }
  function getScroller(target){
    var node=target;
    while(node && node!==document.body && node!==document.documentElement){
      if(node.tagName && node.tagName.toLowerCase()==='main'){
        var style=getComputedStyle(node);
        if((style.overflowY==='auto'||style.overflowY==='scroll') && node.scrollHeight>node.clientHeight+2) return node;
      }
      node=node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function atTop(node){ return !node || node===document.scrollingElement ? (window.scrollY<=1) : node.scrollTop<=1; }
  function ensureIndicator(){
    if(indicator) return;
    indicator=document.createElement('div');
    indicator.id='ng-global-pull-indicator';
    indicator.setAttribute('role','status');
    indicator.setAttribute('aria-live','polite');
    indicator.innerHTML='<span class="ng-pull-spinner" aria-hidden="true"></span><span class="ng-pull-label">Pull to refresh</span>';
    var style=document.createElement('style');
    style.textContent='#ng-global-pull-indicator{position:fixed;z-index:2147483000;top:calc(7px + env(safe-area-inset-top,0px));left:50%;transform:translate(-50%,-70px);display:flex;align-items:center;gap:9px;padding:8px 14px;border:1px solid #247dc2;border-radius:24px;background:#071a3d;color:#dff7ff;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 5px 22px #0007;opacity:0;pointer-events:none;transition:transform .12s ease,opacity .12s ease}#ng-global-pull-indicator.ng-visible{transform:translate(-50%,0);opacity:1}#ng-global-pull-indicator .ng-pull-spinner{width:17px;height:17px;border:2px solid #6c9ab8;border-top-color:#20d6ff;border-radius:50%;display:inline-block}#ng-global-pull-indicator.ng-loading .ng-pull-spinner{animation:ng-pull-spin .7s linear infinite}@keyframes ng-pull-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);document.body.appendChild(indicator);
  }
  function show(distance,isReady){
    ensureIndicator();
    indicator.classList.add('ng-visible');
    indicator.classList.toggle('ng-ready',!!isReady);
    indicator.querySelector('.ng-pull-label').textContent=isReady?'Release to refresh':'Pull to refresh';
    indicator.style.transform='translate(-50%,'+Math.min(58,distance)+'px)';
  }
  function hide(){
    if(!indicator)return;
    indicator.classList.remove('ng-visible','ng-ready','ng-loading');
    indicator.style.transform='';
  }
  document.addEventListener('touchstart',function(e){
    if(refreshing||blocked()||!e.touches||e.touches.length!==1){tracking=false;return;}
    var t=e.touches[0];
    activeScroller=getScroller(e.target);
    if(!atTop(activeScroller)){tracking=false;return;}
    startY=t.clientY;startX=t.clientX;tracking=true;ready=false;
  },{capture:true,passive:true});
  document.addEventListener('touchmove',function(e){
    if(!tracking||refreshing||blocked()||!e.touches||e.touches.length!==1)return;
    var t=e.touches[0],dy=t.clientY-startY,dx=t.clientX-startX;
    if(dx>Math.abs(dy)||dy<0){tracking=false;hide();return;}
    if(!atTop(activeScroller)){tracking=false;hide();return;}
    if(dy>8){
      if(e.cancelable)e.preventDefault();
      var distance=Math.min(maxPull,dy*.55);
      ready=dy>=threshold;
      show(distance,ready);
    }
  },{capture:true,passive:false});
  function finish(){
    if(!tracking)return;
    tracking=false;
    if(ready&&!refreshing){
      refreshing=true;ensureIndicator();
      indicator.classList.add('ng-visible','ng-loading');
      indicator.querySelector('.ng-pull-label').textContent='Refreshing…';
      indicator.style.transform='translate(-50%,0)';
      setTimeout(function(){window.location.reload();},180);
    }else hide();
    ready=false;activeScroller=null;
  }
  document.addEventListener('touchend',finish,{capture:true,passive:true});
  document.addEventListener('touchcancel',function(){tracking=false;ready=false;activeScroller=null;hide();},{capture:true,passive:true});
})();