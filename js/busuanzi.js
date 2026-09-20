// Busuanzi's existing API and Volantis counter IDs, with per-request referrers.
// https://github.com/volantis-x/cdn-busuanzi
(() => {
  'use strict';

  const page = window.location.pathname + window.location.search;
  const fields = ['site_pv', 'site_uv', 'page_pv'];
  const callback = 'BusuanziCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const script = document.createElement('script');

  function cleanup() {
    delete window[callback];
    script.remove();
  }

  window[callback] = function (counts) {
    // A slow response for the previous PJAX page must not update this article.
    if (window.location.pathname + window.location.search !== page) return;

    for (const field of fields) {
      const value = counts[field];
      if (!Number.isSafeInteger(value) || value < 0) continue;
      document.querySelectorAll('#busuanzi_value_' + field).forEach(element => {
        element.textContent = String(value);
      });
      document.querySelectorAll('#busuanzi_container_' + field).forEach(element => {
        element.style.display = 'inline';
      });
    }
  };

  script.async = true;
  // The API identifies articles by Referer. The browser default strips the path
  // across origins, merging every article into the site's root-page counter.
  // Apply the full-path policy only to this HTTPS analytics request.
  script.referrerPolicy = 'no-referrer-when-downgrade';
  script.src = 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=' + callback;
  script.onload = cleanup;
  script.onerror = cleanup;
  document.head.appendChild(script);
})();
