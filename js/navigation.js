/* Keep PJAX feedback independent of model loading and third-party libraries. */
(function () {
  'use strict';
  if (window.__starcriedNavigationBound) return;
  window.__starcriedNavigationBound = true;
  let timer = 0;
  let target = '';
  const warmed = new Set();
  const status = document.createElement('div');
  status.className = 'sc-navigation-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = '正在打开页面…';
  status.hidden = true;
  document.body.append(status);

  function clear() {
    window.clearTimeout(timer);
    timer = 0;
    target = '';
    status.hidden = true;
    document.body.removeAttribute('aria-busy');
  }
  function recover(href) {
    if (!href || (target && target !== href)) return;
    clear();
    // Back/forward navigation has already changed the URL when its request fails.
    if (href === window.location.href) window.location.reload();
    else window.location.assign(href);
  }
  document.addEventListener('pjax:send', function (event) {
    clear();
    target = event.triggerElement?.href || window.location.href;
    status.hidden = false;
    document.body.setAttribute('aria-busy', 'true');
    // The theme's request times out at 5 seconds. Guard completion too, in case
    // a page script throws after a successful response but before completion.
    timer = window.setTimeout(function () { recover(target); }, 6000);
  });
  document.addEventListener('pjax:complete', clear);
  document.addEventListener('pjax:error', function (event) {
    recover(event.triggerElement?.href || target);
  });
  window.addEventListener('pagehide', clear);

  function warmNavigation(event) {
    const link = event.target?.closest?.('#l_header a[href], .cover-wrapper .menu a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname
      || url.search || url.hash || warmed.has(url.href) || warmed.size >= 8) return;
    const connection = navigator.connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    warmed.add(url.href);
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.as = 'document';
    hint.href = url.href;
    document.head.append(hint);
  }
  // Only warm a navigation link the reader actually approaches. Do not crawl
  // posts or initiate model requests; the browser may ignore a prefetch hint.
  document.addEventListener('pointerover', warmNavigation, { passive: true });
  document.addEventListener('focusin', warmNavigation);
})();
