'use strict';

let SearchService = (() => {
  const fn = {};
  fn.queryText = '';
  fn.data = null;
  fn.template = `<div id="u-search">
  <div class="modal">
    <header class="modal-header clearfix">
      <form id="u-search-modal-form" class="u-search-form" name="uSearchModalForm">
        <input type="text" id="u-search-modal-input" class="u-search-input" aria-label="站内搜索" />
        <button type="submit" id="u-search-modal-btn-submit" class="u-search-btn-submit" aria-label="提交搜索">
          <span class="fa-solid fa-search" aria-hidden="true"></span>
        </button>
      </form>
      <button id="u-search-btn-close" class="btn-close" type="button" aria-label="关闭搜索">
        <span class="fa-solid fa-times" aria-hidden="true"></span>
      </button>
    </header>
    <main class="modal-body">
      <ul class="modal-results"></ul>
    </main>
  </div>
  <div id="modal-overlay" class="modal-overlay"></div>
</div>`;

  fn.escapeHTML = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  fn.escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  fn.highlight = (value, keywords) => {
    let result = fn.escapeHTML(value);
    keywords.forEach((keyword) => {
      const escapedKeyword = fn.escapeHTML(keyword);
      result = result.replace(
        new RegExp(fn.escapeRegExp(escapedKeyword), 'gi'),
        (match) => `<b mark>${match}</b>`
      );
    });
    return result;
  };

  fn.init = () => {
    if (document.getElementById('u-search')) return;

    const container = document.createElement('div');
    container.innerHTML = fn.template;
    document.body.append(container.firstElementChild);

    document.querySelectorAll('.u-search-form').forEach((form) => {
      form.addEventListener('submit', fn.onSubmit, false);
    });
    document.querySelector('#u-search-modal-input')
      .addEventListener('input', fn.onSubmit, false);
    document.querySelector('#u-search-btn-close')
      .addEventListener('click', fn.close, false);
    document.querySelector('#modal-overlay')
      .addEventListener('click', fn.close, false);
  };

  fn.onSubmit = (event) => {
    event.preventDefault();
    const target = event.target;
    const input = target.matches('.u-search-input')
      ? target
      : target.querySelector('.u-search-input');
    fn.queryText = input ? input.value.trim() : '';

    if (fn.queryText) fn.search();
  };

  fn.search = async () => {
    document.querySelectorAll('.u-search-input').forEach((input) => {
      input.value = fn.queryText;
    });

    const modal = document.querySelector('#u-search');
    const resultList = document.querySelector('#u-search .modal-results');
    if (!modal || !resultList) return;
    modal.style.display = 'block';

    try {
      if (!fn.data) fn.data = await fn.fetchData();
      const pages = Array.isArray(fn.data.pages) ? fn.data.pages : [];
      const posts = Array.isArray(fn.data.posts) ? fn.data.posts : [];
      const results = fn.buildResultList(pages) + fn.buildResultList(posts);
      resultList.innerHTML = results || '<li class="no-result">没有找到相关内容</li>';
      window.pjax && pjax.refresh(document.querySelector('#u-search'));
    } catch (error) {
      console.error('Local search failed:', error);
      resultList.innerHTML = '<li class="no-result">搜索索引加载失败，请稍后重试</li>';
    }

    document.addEventListener('keydown', function closeOnEscape(event) {
      if (event.code !== 'Escape') return;
      fn.close();
      document.removeEventListener('keydown', closeOnEscape);
    });
  };

  fn.close = () => {
    const modal = document.querySelector('#u-search');
    if (modal) modal.style.display = 'none';
  };

  fn.fetchData = () => fetch(SearchServiceDataPath)
    .then((response) => {
      if (!response.ok) throw new Error(`Search index returned ${response.status}`);
      return response.json();
    });

  fn.buildResultList = (entries) => entries.map((entry) => {
    const match = fn.contentSearch(entry);
    if (!match) return '';
    return fn.buildResult(entry.permalink, match.title, match.digest);
  }).join('');

  fn.contentSearch = (entry) => {
    const text = String(entry.text || '').replace(/12345\d*/g, '').trim();
    const title = String(entry.title || text.slice(0, 15)).trim();
    const titleLower = title.toLowerCase();
    const textLower = text.toLowerCase();
    const keywords = fn.queryText.toLowerCase().split(/[-\s]+/).filter(Boolean);
    if (!keywords.length) return null;

    const matches = keywords.every((keyword) =>
      titleLower.includes(keyword) || textLower.includes(keyword)
    );
    if (!matches) return null;

    const contentIndexes = keywords
      .map((keyword) => textLower.indexOf(keyword))
      .filter((index) => index >= 0);
    const firstOccurrence = contentIndexes.length ? Math.min(...contentIndexes) : 0;
    const start = Math.max(firstOccurrence - 40, 0);
    const end = Math.min(start + 180, text.length);
    const digest = text.slice(start, end) + (end < text.length ? '...' : '');

    return {
      title: fn.highlight(title, keywords),
      digest: fn.highlight(digest, keywords)
    };
  };

  fn.buildResult = (url, title, digest) => {
    const result = fn.getUrlRelativePath(url);
    const keyword = encodeURIComponent(fn.queryText);
    return `<li><a class="result" href="${result}?keyword=${keyword}">` +
      `<span class="title">${title}</span>` +
      `<span class="digest">${digest}</span></a></li>`;
  };

  fn.getUrlRelativePath = (url) => {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname;
  };

  return {
    init: fn.init,
    search: () => fn.search(),
    setQueryText: (queryText) => {
      fn.queryText = String(queryText || '').trim();
    }
  };
})();

Object.freeze(SearchService);
SearchService.init();
document.addEventListener('pjax:success', SearchService.init);
document.addEventListener('pjax:send', () => {
  const modal = document.querySelector('#u-search');
  if (modal) modal.style.display = 'none';
});
