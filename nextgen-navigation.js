/* NextGen Global Return Navigation v1
 * Remembers the exact same-origin page/context before internal navigation.
 * Back controls return to that origin and restore its main scroll position.
 */
(function () {
  "use strict";
  if (window.NGNavigation && window.NGNavigation.version === 1) return;
  var PREFIX = "ng:return:v1:";
  var SCROLL_PREFIX = "ng:scroll:v1:";
  function pageKey(url) {
    var u = new URL(url, location.href);
    return u.pathname + u.search + u.hash;
  }
  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function write(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function remove(key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  }
  function currentScroll() {
    var main = document.querySelector("main");
    return { windowY: window.scrollY || 0, mainY: main ? main.scrollTop : 0 };
  }
  function saveCurrentScroll() {
    write(SCROLL_PREFIX + pageKey(location.href), currentScroll());
    try {
      var state = Object.assign({}, history.state || {}, { ngReturnScroll: currentScroll() });
      history.replaceState(state, "", location.href);
    } catch (e) {}
  }
  function sameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
  }
  function rememberDestination(url) {
    if (!sameOrigin(url)) return;
    var target = new URL(url, location.href);
    if (target.pathname === location.pathname && target.search === location.search && target.hash === location.hash) return;
    saveCurrentScroll();
    write(PREFIX + pageKey(target.href), {
      from: location.href,
      fromKey: pageKey(location.href),
      savedAt: Date.now()
    });
  }
  function back(fallback) {
    var key = PREFIX + pageKey(location.href);
    var record = read(key);
    if (record && record.from && sameOrigin(record.from) && record.from !== location.href) {
      remove(key);
      var ref = "";
      try { ref = document.referrer ? new URL(document.referrer).href : ""; } catch (e) {}
      if (ref && sameOrigin(ref) && pageKey(ref) === record.fromKey && history.length > 1) {
        history.back();
      } else {
        location.replace(record.from);
      }
      return true;
    }
    var referrer = "";
    try { referrer = document.referrer ? new URL(document.referrer).href : ""; } catch (e) {}
    if (referrer && sameOrigin(referrer) && history.length > 1) {
      history.back();
      return true;
    }
    if (fallback && sameOrigin(fallback)) {
      location.replace(fallback);
      return true;
    }
    location.replace("./dashboard.html");
    return false;
  }
  window.NGNavigation = { version: 1, back: back, remember: rememberDestination };
  document.addEventListener("click", function (event) {
    var backControl = event.target.closest && event.target.closest("[data-ng-back]");
    if (backControl) {
      event.preventDefault();
      back(backControl.getAttribute("data-ng-back-fallback") || "");
      return;
    }
    var anchor = event.target.closest && event.target.closest("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank" ||
        anchor.hasAttribute("data-ng-no-return") || event.defaultPrevented ||
        event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var href = anchor.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    if (!sameOrigin(href)) return;
    if (anchor.closest("dialog,[role=dialog],.ng-profile-menu,.ng-menu-drawer,.ng-header-popup,.ng-header-popup-backdrop")) return;
    rememberDestination(new URL(href, location.href).href);
  }, true);
  function restoreScroll() {
    var key = SCROLL_PREFIX + pageKey(location.href);
    var saved = read(key);
    if (!saved) return;
    remove(key);
    requestAnimationFrame(function () {
      var main = document.querySelector("main");
      if (main && typeof saved.mainY === "number") main.scrollTop = saved.mainY;
      if (typeof saved.windowY === "number") window.scrollTo(0, saved.windowY);
    });
  }
  window.addEventListener("pageshow", restoreScroll);
  if (document.readyState === "complete") restoreScroll();
  else window.addEventListener("load", restoreScroll, { once: true });
})();
