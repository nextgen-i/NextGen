(function(){
  "use strict";
  if(window.NGNavigation&&window.NGNavigation.__ready)return;
  var KEY_PREFIX="ng:immediate-back:";
  function pageKey(value){
    try{var u=new URL(value,location.href);return KEY_PREFIX+u.origin+u.pathname;}catch(e){return null;}
  }
  function valid(value){
    try{var u=new URL(value,location.href);if(u.origin!==location.origin||u.href===location.href)return null;return u.href;}catch(e){return null;}
  }
  function remember(destination){
    var key=pageKey(destination);
    if(!key)return;
    try{sessionStorage.setItem(key,location.href);}catch(e){}
  }
  function back(fallback){
    var key=pageKey(location.href),target=null;
    try{if(key){target=sessionStorage.getItem(key);sessionStorage.removeItem(key);}}catch(e){}
    target=valid(target);
    if(!target)target=valid(document.referrer);
    if(target){location.assign(target);return true;}
    if(fallback){location.assign(fallback);return true;}
    if(history.length>1){history.back();return true;}
    return false;
  }
  window.NGNavigation={__ready:true,back:back,remember:remember};
  document.addEventListener("click",function(event){
    var node=event.target&&event.target.closest?event.target.closest("a[href]"):null;
    if(!node||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(node.target&&node.target!=="_self"||node.hasAttribute("download"))return;
    var href=node.getAttribute("href");
    if(!href||href==="#"||/^javascript:/i.test(href))return;
    var destination;
    try{destination=new URL(href,location.href);}catch(e){return;}
    if(destination.origin!==location.origin)return;
    if(destination.pathname===location.pathname&&destination.search===location.search)return;
    remember(destination.href);
  },true);
  document.addEventListener("click",function(event){
    var control=event.target&&event.target.closest?event.target.closest("[data-ng-back],#ng-settings-back,.ng-subpage-back,.ng-back-button,button[aria-label='Back'],button[aria-label='Go back'],a[aria-label='Back'],a[aria-label='Go back']"):null;
    if(!control)return;
    if(control.matches("a[href]"))event.preventDefault();
    event.preventDefault();
    back("./dashboard.html");
  },true);
})();