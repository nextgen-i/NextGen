(function(){
  "use strict";
  function init(){
    if(document.getElementById("ng-menu-drawer")){bind();return;}
    fetch("./hamburger-menu.html?v=20261106-reference-v2",{cache:"no-store"})
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
    if(!drawer.querySelector("#ng-drawer-refresh-indicator")){
      var refreshIndicator=document.createElement("div");
      refreshIndicator.className="ng-drawer-refresh-indicator";
      refreshIndicator.id="ng-drawer-refresh-indicator";
      refreshIndicator.setAttribute("aria-live","polite");
      refreshIndicator.innerHTML='<span class="ng-drawer-refresh-spinner" aria-hidden="true"></span><span class="ng-drawer-refresh-label">Pull to refresh</span>';
      drawer.insertBefore(refreshIndicator,drawer.firstChild);
    }
    if(!document.getElementById("ng-drawer-refresh-styles")){
      var refreshStyle=document.createElement("style");
      refreshStyle.id="ng-drawer-refresh-styles";
      refreshStyle.textContent='#ng-menu-drawer{overscroll-behavior-y:contain}#ng-menu-drawer .ng-drawer-refresh-indicator{height:0;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:9px;color:#79d9ff;font:500 12px/1.2 system-ui,sans-serif;transition:height .16s ease;pointer-events:none}#ng-menu-drawer .ng-drawer-refresh-spinner{width:17px;height:17px;border:2px solid rgba(105,217,255,.25);border-top-color:#69d9ff;border-radius:50%;display:none;animation:ngDrawerRefreshSpin .7s linear infinite}#ng-menu-drawer .ng-drawer-refresh-indicator.is-refreshing .ng-drawer-refresh-spinner{display:block}@keyframes ngDrawerRefreshSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(refreshStyle);
    }
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
    // Drawer-only pull-to-refresh: reloads this menu component without refreshing its host page.
    var pullStartY=null,pullDistance=0,pullActive=false,pullBusy=false;
    function refreshDrawerOnly(){
      if(pullBusy)return;
      pullBusy=true;
      var indicator=drawer.querySelector("#ng-drawer-refresh-indicator");
      if(indicator){indicator.classList.add("is-refreshing");var label=indicator.querySelector(".ng-drawer-refresh-label");if(label)label.textContent="Refreshing menu…";}
      fetch("./hamburger-menu.html?v="+Date.now(),{cache:"no-store"})
        .then(function(response){if(!response.ok)throw new Error("Menu refresh failed");return response.text();})
        .then(function(markup){
          var parsed=document.createElement("div");parsed.innerHTML=markup;
          var freshDrawer=parsed.querySelector("#ng-menu-drawer");
          if(!freshDrawer)throw new Error("Updated menu markup unavailable");
          drawer.innerHTML=freshDrawer.innerHTML;
          if(!drawer.dataset.refreshDelegation){
            drawer.dataset.refreshDelegation="1";
            drawer.addEventListener("click",function(event){
              var target=event.target;
              var profile=target.closest&&target.closest("#ng-menu-profile-switch");
              if(profile){var expanded=profile.getAttribute("aria-expanded")==="true";profile.setAttribute("aria-expanded",String(!expanded));var shortcuts=drawer.querySelector(".ng-menu-shortcuts");if(shortcuts)shortcuts.classList.toggle("ng-profiles-expanded",!expanded);return;}
              var accordion=target.closest&&target.closest(".ng-menu-accordion-trigger");
              if(accordion){var panel=accordion.nextElementSibling;if(panel){var open=accordion.getAttribute("aria-expanded")==="true";accordion.setAttribute("aria-expanded",String(!open));panel.hidden=open;var chevron=accordion.querySelector("i");if(chevron)chevron.textContent=open?"⌄":"⌃";}return;}
              var more=target.closest&&target.closest("#ng-menu-see-less");
              if(more){var links=drawer.querySelector(".ng-menu-main-links");if(links){var collapsed=links.classList.toggle("is-collapsed");more.textContent=collapsed?"See more":"See less";}return;}
              var auth=target.closest&&target.closest(".ng-menu-logout");
              if(auth&&auth.getAttribute("href")==="#"){event.preventDefault();if(window.NGWorkspace&&typeof window.NGWorkspace.signOut==="function"){auth.style.pointerEvents="none";window.NGWorkspace.signOut().then(function(result){auth.style.pointerEvents="";if(!(result&&result.error))syncAuthMenu(false);}).catch(function(){auth.style.pointerEvents="";});}return;}
              var link=target.closest&&target.closest("a[href]");
              if(link&&link.getAttribute("href")!=="#")closeMenu();
            });
          }
          syncProfileHeader();syncFromWorkspace();
          drawer.scrollTop=0;
        })
        .catch(function(error){console.error("NextGen hamburger menu refresh:",error);})
        .finally(function(){
          pullBusy=false;pullActive=false;pullStartY=null;pullDistance=0;
          var current=drawer.querySelector("#ng-drawer-refresh-indicator");
          if(current){current.classList.remove("is-refreshing","is-pulling");current.style.height="0px";var label=current.querySelector(".ng-drawer-refresh-label");if(label)label.textContent="Pull to refresh";}
        });
    }
    drawer.addEventListener("touchstart",function(event){
      if(pullBusy||!drawer.classList.contains("is-open")||drawer.scrollTop>0||!event.touches||event.touches.length!==1)return;
      pullStartY=event.touches[0].clientY;pullDistance=0;pullActive=true;
    },{passive:true,capture:true});
    drawer.addEventListener("touchmove",function(event){
      if(!pullActive||pullStartY===null||pullBusy||!event.touches||event.touches.length!==1)return;
      var delta=event.touches[0].clientY-pullStartY;
      if(delta<=0){pullActive=false;return;}
      if(drawer.scrollTop>0){pullActive=false;return;}
      pullDistance=Math.min(delta,90);
      var indicator=drawer.querySelector("#ng-drawer-refresh-indicator");
      if(indicator){indicator.classList.add("is-pulling");indicator.style.height=Math.min(42,pullDistance*.48)+"px";var label=indicator.querySelector(".ng-drawer-refresh-label");if(label)label.textContent=pullDistance>=72?"Release to refresh":"Pull to refresh";}
      if(event.cancelable)event.preventDefault();
    },{passive:false,capture:true});
    drawer.addEventListener("touchend",function(){
      if(!pullActive)return;
      if(pullDistance>=72)refreshDrawerOnly();
      else{var indicator=drawer.querySelector("#ng-drawer-refresh-indicator");if(indicator){indicator.classList.remove("is-pulling");indicator.style.height="0px";}}
      pullActive=false;pullStartY=null;pullDistance=0;
    },{passive:true,capture:true});
    drawer.addEventListener("touchcancel",function(){
      pullActive=false;pullStartY=null;pullDistance=0;
      var indicator=drawer.querySelector("#ng-drawer-refresh-indicator");
      if(indicator){indicator.classList.remove("is-pulling");indicator.style.height="0px";}
    },{passive:true,capture:true});
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
      var currentAuthLink=drawer.querySelector(".ng-menu-logout");
      if(!currentAuthLink)return;
      currentAuthLink.textContent=signedIn?"↪ Logout":"↪ Login";
      currentAuthLink.href=signedIn?"#":"./login.html";
      currentAuthLink.setAttribute("aria-label",signedIn?"Logout":"Login");
      currentAuthLink.classList.add("ng-menu-login-active");
      currentAuthLink.removeAttribute("disabled");
      currentAuthLink.removeAttribute("aria-disabled");
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