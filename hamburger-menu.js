(function(){
  "use strict";
  function init(){
    if(document.getElementById("ng-menu-drawer")) return;
    fetch("./hamburger-menu.html?v=20261106-pull-refresh-v1",{cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("Menu component unavailable");return r.text();})
      .then(function(html){
        var holder=document.createElement("div");
        holder.id="ng-shared-hamburger-root";
        holder.innerHTML=html;
        document.body.appendChild(holder);
        bind();
      })
      .catch(function(err){console.error("NextGen navigation menu:",err);});
  }
  function bind(){
    var trigger=document.getElementById("ng-hamburger");
    var drawer=document.getElementById("ng-menu-drawer");
    var backdrop=document.getElementById("ng-menu-backdrop");
    var close=document.getElementById("ng-menu-close");
    if(!trigger||!drawer||!backdrop||drawer.dataset.sharedReady==="1")return;
    drawer.dataset.sharedReady="1";
    var historyEntry=false,ignorePop=false;
    function openMenu(){
      drawer.classList.add("is-open");
      try{sessionStorage.setItem("ng-hamburger-open","1");}catch(e){}
      drawer.setAttribute("aria-hidden","false");
      backdrop.hidden=false;
      trigger.setAttribute("aria-expanded","true");
      trigger.setAttribute("aria-label","Close navigation menu");
      document.body.classList.add("ng-menu-open");
      if(!historyEntry){try{history.pushState({ngDrawerOpen:true},"",location.href);historyEntry=true;}catch(e){}}
    }
    function closeMenu(fromBack){
      if(!drawer.classList.contains("is-open"))return;
      drawer.classList.remove("is-open");
      try{sessionStorage.removeItem("ng-hamburger-open");}catch(e){}
      drawer.setAttribute("aria-hidden","true");
      backdrop.hidden=true;
      trigger.setAttribute("aria-expanded","false");
      trigger.setAttribute("aria-label","Open navigation menu");
      document.body.classList.remove("ng-menu-open");
      if(historyEntry&&!fromBack){historyEntry=false;ignorePop=true;try{history.back();}catch(e){ignorePop=false;}}
    }
    trigger.addEventListener("click",function(){drawer.classList.contains("is-open")?closeMenu():openMenu();});
    if(close) close.addEventListener("click",closeMenu);
    backdrop.addEventListener("click",closeMenu);
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&drawer.classList.contains("is-open"))closeMenu();});
    window.addEventListener("popstate",function(){if(ignorePop){ignorePop=false;return;}if(drawer.classList.contains("is-open")){historyEntry=false;closeMenu(true);}});
    var drawerTouch=null;
    drawer.addEventListener("touchstart",function(e){if(e.touches&&e.touches.length===1)drawerTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
    drawer.addEventListener("touchend",function(e){if(!drawerTouch||!e.changedTouches||!e.changedTouches.length)return;var t=e.changedTouches[0],dx=t.clientX-drawerTouch.x,dy=t.clientY-drawerTouch.y;if(dx<-65&&Math.abs(dx)>Math.abs(dy)*1.2)closeMenu();drawerTouch=null;},{passive:true});

    /* HAMBURGER DRAWER ONLY: pull down at the top to refresh this page. */
    var pullStartY=0,pullActive=false,pullDistance=0,pullRefreshing=false;
    var pullIndicator=document.createElement("div");
    pullIndicator.id="ng-menu-pull-refresh";
    pullIndicator.setAttribute("role","status");
    pullIndicator.setAttribute("aria-live","polite");
    pullIndicator.textContent="↓  Pull to refresh";
    pullIndicator.style.cssText="height:0;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:8px;color:#65d5ff;font-size:13px;font-weight:600;letter-spacing:.2px;opacity:0;transition:height .16s ease,opacity .16s ease;flex:0 0 auto;pointer-events:none;";
    drawer.insertBefore(pullIndicator,drawer.firstChild);
    function resetPull(){
      pullActive=false;pullDistance=0;pullStartY=0;
      pullIndicator.style.height="0px";
      pullIndicator.style.opacity="0";
      pullIndicator.textContent="↓  Pull to refresh";
    }
    drawer.addEventListener("touchstart",function(e){
      if(pullRefreshing||!drawer.classList.contains("is-open")||!e.touches||e.touches.length!==1)return;
      if(drawer.scrollTop>0)return;
      pullStartY=e.touches[0].clientY;
      pullActive=true;
      pullDistance=0;
    },{passive:true});
    drawer.addEventListener("touchmove",function(e){
      if(!pullActive||pullRefreshing||!e.touches||e.touches.length!==1)return;
      var delta=e.touches[0].clientY-pullStartY;
      if(delta<=0){resetPull();return;}
      if(drawer.scrollTop>0){resetPull();return;}
      pullDistance=Math.min(104,delta*.52);
      if(pullDistance>3){
        e.preventDefault();
        pullIndicator.style.height=Math.round(pullDistance)+"px";
        pullIndicator.style.opacity="1";
        pullIndicator.textContent=pullDistance>=76?"↑  Release to refresh":"↓  Pull to refresh";
      }
    },{passive:false});
    drawer.addEventListener("touchend",function(){
      if(!pullActive)return;
      var shouldRefresh=pullDistance>=76&&!pullRefreshing;
      if(shouldRefresh){
        pullRefreshing=true;
        pullIndicator.style.height="48px";
        pullIndicator.style.opacity="1";
        pullIndicator.textContent="⟳  Refreshing…";
        try{sessionStorage.setItem("ng-hamburger-open","1");}catch(e){}
        window.setTimeout(function(){window.location.reload();},120);
      }else resetPull();
    },{passive:true});
    drawer.addEventListener("touchcancel",resetPull,{passive:true});

    document.addEventListener("touchstart",function(e){if(!drawer.classList.contains("is-open")||!e.touches||e.touches.length!==1)return;var x=e.touches[0].clientX;if(x>drawer.getBoundingClientRect().right)closeMenu();},{passive:true});
    var profileSwitch=document.getElementById("ng-menu-profile-switch"),shortcuts=document.querySelector(".ng-menu-shortcuts");
    if(profileSwitch&&shortcuts)profileSwitch.addEventListener("click",function(){var expanded=profileSwitch.getAttribute("aria-expanded")==="true";profileSwitch.setAttribute("aria-expanded",String(!expanded));shortcuts.classList.toggle("ng-profiles-expanded",!expanded);});
    function syncProfileHeader(){var u=window.NGWorkspace&&typeof window.NGWorkspace.getUser==="function"?window.NGWorkspace.getUser():null;var name=(u&&(u.user_metadata&&(u.user_metadata.full_name||u.user_metadata.name||u.user_metadata.display_name)||u.email))||"NextGen Account";var avatar=(u&&u.user_metadata&&(u.user_metadata.avatar_url||u.user_metadata.picture||u.user_metadata.photo_url))||"./profile-icon.jpg";var n=document.getElementById("ng-menu-profile-name"),img=document.getElementById("ng-menu-user-avatar");if(n)n.textContent=name;if(img&&img.getAttribute("src")!==avatar)img.src=avatar;}
    syncProfileHeader();window.addEventListener("nextgen-auth-state",syncProfileHeader);
    drawer.querySelectorAll(".ng-menu-accordion-trigger").forEach(function(btn){
      btn.addEventListener("click",function(){
        var panel=btn.nextElementSibling;
        if(!panel)return;
        var expanded=btn.getAttribute("aria-expanded")==="true";
        btn.setAttribute("aria-expanded",String(!expanded));
        panel.hidden=expanded;
        var chevron=btn.querySelector("i");
        if(chevron)chevron.textContent=expanded?"⌄":"⌃";
      });
    });
    var seeLess=document.getElementById("ng-menu-see-less");
    var mainLinks=drawer.querySelector(".ng-menu-main-links");
    if(seeLess&&mainLinks){
      seeLess.addEventListener("click",function(){
        var collapsed=mainLinks.classList.toggle("is-collapsed");
        seeLess.textContent=collapsed?"See more":"See less";
      });
    }
    if(mainLinks){mainLinks.querySelectorAll('a[href*="login.html"],a[href*="logout"]').forEach(function(link){link.remove();});}
    var authLink=drawer.querySelector(".ng-menu-logout");
    function syncAuthMenu(signedIn){
      if(!authLink)return;
      authLink.textContent=signedIn?"↪ Logout":"↪ Login";
      authLink.href=signedIn?"#":"./login.html";
      authLink.setAttribute("aria-label",signedIn?"Logout":"Login");
      authLink.classList.add("ng-menu-login-active");
      authLink.removeAttribute("disabled");
      authLink.removeAttribute("aria-disabled");
    }
    function syncFromWorkspace(){
      syncAuthMenu(!!(window.NGWorkspace&&typeof window.NGWorkspace.getUser==="function"&&window.NGWorkspace.getUser()));
    }
    syncFromWorkspace();
    window.addEventListener("nextgen-auth-state",function(event){syncAuthMenu(!!(event.detail&&event.detail.signedIn));});
    if(authLink&&!authLink.dataset.authBound){
      authLink.dataset.authBound="1";
      authLink.addEventListener("click",function(event){
        if(authLink.getAttribute("href")!=="#")return;
        event.preventDefault();
        if(window.NGWorkspace&&typeof window.NGWorkspace.signOut==="function"){
          authLink.style.pointerEvents="none";
          window.NGWorkspace.signOut().then(function(result){
            if(result&&result.error){authLink.style.pointerEvents="";return;}
            syncAuthMenu(false);authLink.style.pointerEvents="";
          }).catch(function(){authLink.style.pointerEvents="";});
        }
      });
    }
    try{if(sessionStorage.getItem("ng-hamburger-open")==="1")openMenu();}catch(e){}
    drawer.querySelectorAll("a[href]").forEach(function(link){
      link.addEventListener("click",function(){if(link.getAttribute("href")!=="#")closeMenu();});
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();