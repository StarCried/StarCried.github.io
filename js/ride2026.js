(function () {
  'use strict';

  const ROUTE_DATA_URL = '/ride2026/data/route.json';
  const ROUTE_PROVINCES = new Set([310000, 320000, 340000, 410000, 610000]);
  const MAP_BOUNDS = { minLon: 104.5, maxLon: 123.8, minLat: 26, maxLat: 41.5 };
  const FOCUS_COORDINATE = [115.25, 34.1];
  const MAP_ASPECT_RATIO = 0.59;
  const MAP_EDGE_GUARD = 24;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SEGMENT_COLORS = [
    '#52e6ff', '#4ddfea', '#4bd7d7', '#52d4bf', '#68d2a7',
    '#85d291', '#a7d47e', '#c9d276', '#e3c873', '#f2b96e',
    '#faa96a', '#ff996c', '#ff8c77', '#f9858b', '#ec82a4'
  ];
  const MAP_LABELS = [
    { adcode: 110000, label: '北京', coordinate: [116.405285, 39.904989] },
    { adcode: 120000, label: '天津', coordinate: [117.190182, 39.125596] },
    { adcode: 130000, label: '石家庄', coordinate: [114.502461, 38.045474] },
    { adcode: 140000, label: '太原', coordinate: [112.549248, 37.857014] },
    { adcode: 150000, label: '呼和浩特', coordinate: [111.670801, 40.818311] },
    { adcode: 310000, label: '上海', coordinate: [121.472644, 31.231706] },
    { adcode: 320000, label: '南京', coordinate: [118.767413, 32.041544] },
    { adcode: 330000, label: '杭州', coordinate: [120.153576, 30.287459] },
    { adcode: 340000, label: '合肥', coordinate: [117.283042, 31.86119] },
    { adcode: 350000, label: '福州', coordinate: [119.306239, 26.075302] },
    { adcode: 360000, label: '南昌', coordinate: [115.892151, 28.676493] },
    { adcode: 370000, label: '济南', coordinate: [117.000923, 36.675807] },
    { adcode: 410000, label: '郑州', coordinate: [113.665412, 34.757975] },
    { adcode: 420000, label: '武汉', coordinate: [114.298572, 30.584355] },
    { adcode: 430000, label: '长沙', coordinate: [112.982279, 28.19409] },
    { adcode: 500000, label: '重庆', coordinate: [106.504962, 29.533155] },
    { adcode: 520000, label: '贵阳', coordinate: [106.713478, 26.578343] },
    { adcode: 610000, label: '西安', coordinate: [108.948024, 34.263161] },
    { adcode: 640000, label: '银川', coordinate: [106.278179, 38.46637] }
  ];

  let dataPromise = null;
  let activeExperience = null;

  function fetchJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load ' + url);
      return response.json();
    });
  }

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetchJson(ROUTE_DATA_URL);
    }
    return dataPromise;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createSvgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(function (entry) {
      element.setAttribute(entry[0], String(entry[1]));
    });
    return element;
  }

  function markerOffset(dayNumber) {
    const offsets = {
      0: [0, -5],
      7: [-10, 9],
      8: [17, -12],
      16: [-12, -8],
      17: [17, 12]
    };
    return offsets[Number(dayNumber)] || [0, 0];
  }

  class RideExperience {
    constructor(root, routeData) {
      this.root = root;
      this.routeData = routeData;
      this.mapStage = root.querySelector('#ride-map-stage');
      this.map = root.querySelector('#ride-map');
      this.markerLayer = root.querySelector('#ride-marker-layer');
      this.detail = root.querySelector('#ride-detail');
      this.loading = root.querySelector('#ride-loading');
      this.live = root.querySelector('#ride-live');
      this.abortController = new AbortController();
      this.signal = this.abortController.signal;
      this.mediaCoarse = window.matchMedia('(pointer: coarse)');
      this.smallScreen = this.mediaCoarse.matches;
      this.nodes = [routeData.start].concat(routeData.days);
      this.daysByNumber = new Map(this.nodes.map(function (day) { return [day.day, day]; }));
      this.markerElements = new Map();
      this.markerWorldPoints = new Map();
      this.pan = { x: 0, y: 0 };
      this.basePosition = { x: 0, y: 0 };
      this.stagePosition = { x: 0, y: 0 };
      this.drag = null;
      this.selectedDay = null;
      this.lastSoundAt = 0;
      this.soundEnabled = false;
      this.audioContext = null;
      this.firstFrame = true;
      this.resizeFrame = 0;
      this.loadingTimer = 0;
      this.dragListenersBound = false;
      this.boundPointerDown = this.handlePointerDown.bind(this);
      this.boundPointerMove = this.handlePointerMove.bind(this);
      this.boundPointerUp = this.handlePointerUp.bind(this);
      this.boundWindowResize = this.handleWindowResize.bind(this);

      this.activatePage();
      this.createMarkers();
      this.populateSummary();
      this.bindControls();
      this.resize();
    }

    activatePage() {
      const header = document.getElementById('l_header');
      const headerHeight = header ? Math.max(0, header.getBoundingClientRect().height) : 64;
      document.documentElement.style.setProperty('--ride-header-height', headerHeight + 'px');
      document.documentElement.classList.add('ride-page-active');
      document.body.classList.add('ride-page-active');
      if (header) header.classList.add('show');
    }

    createMarkers() {
      const fragment = document.createDocumentFragment();

      this.nodes.forEach((day) => {
        const marker = createElement('button', 'ride-marker', String(day.day));
        marker.type = 'button';
        marker.dataset.day = String(day.day);
        marker.dataset.city = day.city;
        marker.dataset.status = day.status;
        marker.classList.add(day.day % 2 === 0 ? 'is-label-up' : 'is-label-down');
        marker.setAttribute('aria-label', (day.day === 0 ? '起点 ' : 'D' + day.day + ' ') + day.route + '，打开记录');

        marker.addEventListener('click', (event) => {
          event.stopPropagation();
          this.openDay(day.day);
        }, { signal: this.signal });

        this.markerElements.set(day.day, marker);
        fragment.appendChild(marker);
      });

      this.markerLayer.replaceChildren(fragment);
    }

    bindControls() {
      const reset = this.root.querySelector('#ride-reset');
      const sound = this.root.querySelector('#ride-sound');
      const close = this.root.querySelector('#ride-detail-close');
      const summary = this.root.querySelector('#ride-summary');
      const summaryToggle = this.root.querySelector('#ride-summary-toggle');

      reset.addEventListener('click', () => this.resetMap(), { signal: this.signal });
      sound.addEventListener('click', () => this.toggleSound(), { signal: this.signal });
      close.addEventListener('click', () => this.closeDay(), { signal: this.signal });
      summaryToggle.addEventListener('click', () => {
        const expanded = summary.classList.toggle('is-expanded');
        summaryToggle.setAttribute('aria-expanded', String(expanded));
        this.root.querySelector('#ride-summary-more').setAttribute('aria-hidden', String(!expanded));
      }, { signal: this.signal });

      this.root.addEventListener('click', (event) => {
        if (this.detail.hidden) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || this.detail.contains(target) || target.closest('.ride-marker')) return;
        this.closeDay();
      }, { signal: this.signal });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !this.detail.hidden) this.closeDay();
      }, { signal: this.signal });

      window.addEventListener('resize', this.boundWindowResize, { signal: this.signal });
    }

    handleWindowResize() {
      if (this.resizeFrame) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.syncHeaderHeight();
        this.resize();
      });
    }

    syncDragListeners() {
      if (this.dragListenersBound === this.smallScreen) return;
      const action = this.smallScreen ? 'addEventListener' : 'removeEventListener';
      const options = this.smallScreen ? { signal: this.signal } : undefined;
      this.mapStage[action]('pointerdown', this.boundPointerDown, options);
      this.mapStage[action]('pointermove', this.boundPointerMove, options);
      this.mapStage[action]('pointerup', this.boundPointerUp, options);
      this.mapStage[action]('pointercancel', this.boundPointerUp, options);
      this.dragListenersBound = this.smallScreen;
    }

    syncHeaderHeight() {
      const header = document.getElementById('l_header');
      const height = header ? Math.max(0, header.getBoundingClientRect().height) : 64;
      document.documentElement.style.setProperty('--ride-header-height', height + 'px');
    }

    populateSummary() {
      const totals = this.routeData.totals;
      this.root.querySelector('#ride-total-distance').textContent = totals.distance_km.toFixed(2);
      this.root.querySelector('#ride-total-time').textContent = totals.moving_time;
      this.root.querySelector('#ride-total-ascent').textContent = String(totals.ascent_m) + ' m';
      this.root.querySelector('#ride-total-average').textContent = totals.average_kmh.toFixed(2) + ' km/h';
      this.root.querySelector('#ride-total-days').textContent = String(totals.natural_days);
      this.root.querySelector('#ride-total-calories').textContent = String(totals.calories_kcal);
      this.fillList(this.root.querySelector('#ride-before-list'), this.routeData.before_after.before);
      this.fillList(this.root.querySelector('#ride-after-list'), this.routeData.before_after.after);
      this.root.querySelector('#ride-data-note').textContent =
        '最终统计来自16个iGPSPORT FIT文件。' + this.routeData.meta.route_note + ' ' + this.routeData.before_after.note;
    }

    fillList(list, items) {
      list.replaceChildren(...items.map(function (item) {
        return createElement('li', '', item);
      }));
    }

    resize() {
      const rect = this.root.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const smallScreen = this.mediaCoarse.matches || width <= 760;
      if (width === this.width && height === this.height && smallScreen === this.smallScreen) return;

      this.width = width;
      this.height = height;
      this.smallScreen = smallScreen;
      this.syncDragListeners();
      const mobileHeightWidth = (this.height + MAP_EDGE_GUARD * 2) / MAP_ASPECT_RATIO;
      this.worldWidth = this.smallScreen
        ? Math.max(1320, this.width * 3.3, mobileHeightWidth)
        : Math.max(1760, this.width * 1.38);
      this.worldHeight = this.worldWidth * MAP_ASPECT_RATIO;
      this.mapStage.style.width = this.worldWidth + 'px';
      this.mapStage.style.height = this.worldHeight + 'px';
      this.map.setAttribute('viewBox', '0 0 ' + this.worldWidth + ' ' + this.worldHeight);
      this.map.setAttribute('width', String(this.worldWidth));
      this.map.setAttribute('height', String(this.worldHeight));
      this.markerLayer.style.width = this.worldWidth + 'px';
      this.markerLayer.style.height = this.worldHeight + 'px';
      this.markerWorldPoints.clear();
      this.buildMap();
      this.positionMarkers();

      const focus = this.project(FOCUS_COORDINATE);
      this.basePosition.x = this.width * 0.5 - focus[0];
      this.basePosition.y = this.height * 0.57 - focus[1];
      this.pan.x = 0;
      this.pan.y = 0;
      this.applyStagePosition();
      this.syncHeaderHeight();

      if (this.firstFrame) {
        this.firstFrame = false;
        requestAnimationFrame(() => this.finishLoading());
      }
    }

    finishLoading() {
      if (!this.loading || !this.loading.isConnected) return;
      const loading = this.loading;
      const remove = () => {
        if (loading.isConnected) loading.remove();
      };
      loading.classList.add('is-complete');
      loading.addEventListener('transitionend', remove, { once: true, signal: this.signal });
      this.loadingTimer = window.setTimeout(remove, 450);
    }

    project(coordinate) {
      const lon = coordinate[0];
      const lat = coordinate[1];
      const u = (lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon);
      const v = (MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
      const depthScale = 0.91 + v * 0.16;
      const x = this.worldWidth * 0.5 + (u - 0.5) * this.worldWidth * depthScale + (v - 0.5) * this.worldWidth * 0.035;
      const projectedV = v < 0 ? -Math.pow(-v, 1.075) : Math.pow(v, 1.075);
      const y = projectedV * this.worldHeight;
      return [x, y];
    }

    buildMap() {
      const capitalGroup = createSvgElement('g', { class: 'ride-capitals', 'aria-hidden': 'true' });
      const routeGroup = createSvgElement('g', { class: 'ride-routes', 'aria-hidden': 'true' });

      MAP_LABELS.forEach((item) => {
        const point = this.project(item.coordinate);
        const highlighted = ROUTE_PROVINCES.has(item.adcode);
        const className = highlighted ? ' is-route-province' : '';
        capitalGroup.appendChild(createSvgElement('rect', {
          class: 'ride-capital-dot' + className,
          x: point[0] - 3,
          y: point[1] - 3,
          width: 6,
          height: 6,
          transform: 'rotate(45 ' + point[0] + ' ' + point[1] + ')'
        }));
        const label = createSvgElement('text', {
          class: 'ride-capital-label' + className,
          x: point[0] + 8,
          y: point[1] + 4
        });
        label.textContent = item.label;
        capitalGroup.appendChild(label);
      });

      this.routeData.segments.forEach((segment, index) => {
        const points = segment.points.map(this.project.bind(this));
        if (points.length < 2) return;
        const color = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
        const group = createSvgElement('g', { class: 'ride-route-segment' });
        group.style.setProperty('--route-color', color);
        group.style.setProperty('--route-delay', (-index * 0.14) + 's');
        const pathData = this.pointsPathData(points);
        group.appendChild(createSvgElement('path', { class: 'ride-route-shadow', d: pathData }));
        group.appendChild(createSvgElement('path', { class: 'ride-route-line', d: pathData }));
        group.appendChild(createSvgElement('path', { class: 'ride-route-flow', d: pathData }));
        routeGroup.appendChild(group);
      });

      this.map.replaceChildren(capitalGroup, routeGroup);
    }

    pointsPathData(points) {
      return points.map(function (point, index) {
        return (index === 0 ? 'M' : 'L') + point[0].toFixed(1) + ' ' + point[1].toFixed(1);
      }).join(' ');
    }

    handlePointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      this.pan.x += dx;
      this.pan.y += dy;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.applyStagePosition();
      event.preventDefault();
    }

    handlePointerDown(event) {
      if (!this.smallScreen || (event.button !== undefined && event.button !== 0)) return;
      if (event.target.closest('.ride-marker')) return;
      this.drag = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY
      };
      this.mapStage.classList.add('is-dragging');
      this.mapStage.setPointerCapture(event.pointerId);
    }

    handlePointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      this.drag = null;
      this.mapStage.classList.remove('is-dragging');
      if (this.mapStage.hasPointerCapture(event.pointerId)) this.mapStage.releasePointerCapture(event.pointerId);
    }

    resetMap() {
      this.pan.x = 0;
      this.pan.y = 0;
      this.applyStagePosition();
      this.live.textContent = '地图位置已重置';
    }

    toggleSound() {
      this.soundEnabled = !this.soundEnabled;
      const button = this.root.querySelector('#ride-sound');
      const icon = button.querySelector('i');
      button.setAttribute('aria-pressed', String(this.soundEnabled));
      button.setAttribute('aria-label', this.soundEnabled ? '关闭交互提示音' : '开启交互提示音');
      icon.className = this.soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
      if (this.soundEnabled) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !this.audioContext) this.audioContext = new AudioContext();
        if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume();
        this.playTick(620, true);
      }
    }

    playTick(frequency, force) {
      if (!this.soundEnabled || !this.audioContext) return;
      const now = performance.now();
      if (!force && now - this.lastSoundAt < 85) return;
      this.lastSoundAt = now;
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const start = this.audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.025, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.06);
    }

    openDay(dayNumber) {
      const day = this.daysByNumber.get(dayNumber);
      if (!day) return;
      this.selectedDay = dayNumber;
      this.markerElements.forEach(function (marker, number) {
        marker.classList.toggle('is-selected', number === dayNumber);
      });

      this.root.querySelector('#ride-detail-day').textContent = day.day === 0 ? 'START · 00' : 'D' + String(day.day).padStart(2, '0');
      this.root.querySelector('#ride-detail-date').textContent = day.date;
      this.root.querySelector('#ride-detail-title').textContent = day.title;
      this.root.querySelector('#ride-detail-route').textContent = day.route;
      this.root.querySelector('#ride-detail-summary').textContent = day.summary;
      const media = this.root.querySelector('#ride-detail-media');
      let image = media.querySelector('img');
      if (!image) {
        image = document.createElement('img');
        image.id = 'ride-detail-image';
        media.appendChild(image);
      }
      image.src = day.image;
      image.alt = day.image_alt;

      const statsContainer = this.root.querySelector('#ride-detail-stats');
      if (day.stats) {
        statsContainer.replaceChildren(
          this.statElement(day.stats.distance_km.toFixed(2) + ' km', '距离'),
          this.statElement(day.stats.moving_time, '骑行计时'),
          this.statElement(day.stats.ascent_m + ' m', '爬升'),
          this.statElement(day.stats.average_kmh.toFixed(1) + ' km/h', '均速'),
          this.statElement(day.stats.max_kmh.toFixed(1) + ' km/h', '最高速度'),
          this.statElement(day.stats.calories_kcal + ' kcal', '码表估算')
        );
      } else if (day.status === 'origin') {
        statsContainer.replaceChildren(
          this.statElement('0 km', '起点里程'),
          this.statElement('上海', '出发城市'),
          this.statElement('D0', '旅程序章')
        );
      } else {
        statsContainer.replaceChildren(
          this.statElement('0 km', '距离'),
          this.statElement('完整休息', '状态'),
          this.statElement('涡阳', '停留城市')
        );
      }

      this.fillList(this.root.querySelector('#ride-detail-highlights'), day.highlights);
      const lodging = this.root.querySelector('#ride-detail-lodging');
      if (day.hotel) {
        lodging.textContent = '住宿 · ' + day.hotel + ' · ¥' + day.lodging_cny.toFixed(2) +
          (day.used_huazhu_benefit ? ' · 使用学校华住会铂金权益预订' : ' · 自费预订');
        lodging.hidden = false;
      } else {
        lodging.hidden = true;
      }

      this.detail.hidden = false;
      this.detail.scrollTop = 0;
      this.live.textContent = '已打开' + (day.day === 0 ? '起点' : 'D' + day.day) + '：' + day.title;
      this.playTick(680, true);
      this.positionDetail();
    }

    statElement(value, label) {
      const span = createElement('span');
      span.append(createElement('strong', '', value), createElement('small', '', label));
      return span;
    }

    closeDay() {
      this.selectedDay = null;
      this.detail.hidden = true;
      this.markerElements.forEach(function (marker) { marker.classList.remove('is-selected'); });
      this.live.textContent = '逐日卡片已关闭';
    }

    applyStagePosition() {
      if (!this.smallScreen) {
        this.pan.x = 0;
        this.pan.y = 0;
      } else {
        const minStageX = this.width + MAP_EDGE_GUARD - this.worldWidth;
        const maxStageX = -MAP_EDGE_GUARD;
        const minStageY = this.height + MAP_EDGE_GUARD - this.worldHeight;
        const maxStageY = -MAP_EDGE_GUARD;
        this.pan.x = clamp(this.pan.x, minStageX - this.basePosition.x, maxStageX - this.basePosition.x);
        this.pan.y = clamp(this.pan.y, minStageY - this.basePosition.y, maxStageY - this.basePosition.y);
      }
      this.stagePosition.x = Math.round(this.basePosition.x + this.pan.x);
      this.stagePosition.y = Math.round(this.basePosition.y + this.pan.y);
      this.mapStage.style.left = this.stagePosition.x + 'px';
      this.mapStage.style.top = this.stagePosition.y + 'px';
      this.updateMarkerVisibility();
      this.positionDetail();
    }

    positionMarkers() {
      this.nodes.forEach((day) => {
        const marker = this.markerElements.get(day.day);
        const world = this.project(day.coordinate);
        const offset = markerOffset(day.day);
        const worldX = Math.round(world[0] + offset[0]);
        const worldY = Math.round(world[1] + offset[1]);
        if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
          const previousWorld = this.markerWorldPoints.get(day.day);
          if (!previousWorld || previousWorld.x !== worldX || previousWorld.y !== worldY) {
            marker.style.left = worldX + 'px';
            marker.style.top = worldY + 'px';
            this.markerWorldPoints.set(day.day, { x: worldX, y: worldY });
          }
        }
      });
    }

    updateMarkerVisibility() {
      this.markerWorldPoints.forEach((world, dayNumber) => {
        const marker = this.markerElements.get(dayNumber);
        const screenX = world.x + this.stagePosition.x;
        const screenY = world.y + this.stagePosition.y;
        const visible = screenX > -80 && screenX < this.width + 80 && screenY > -80 && screenY < this.height + 80;
        const tabIndex = visible ? 0 : -1;
        if (marker.tabIndex !== tabIndex) marker.tabIndex = tabIndex;
      });
    }

    positionDetail() {
      if (this.selectedDay === null || this.detail.hidden) return;
      const day = this.daysByNumber.get(this.selectedDay);
      const world = this.project(day.coordinate);
      const offset = markerOffset(this.selectedDay);
      const anchorX = world[0] + this.stagePosition.x + offset[0];
      const anchorY = world[1] + this.stagePosition.y + offset[1];
      const cardWidth = this.detail.offsetWidth || 350;
      const cardHeight = this.detail.offsetHeight || 430;
      let x;
      let y;
      if (this.smallScreen) {
        this.detail.dataset.side = 'bottom';
        x = clamp((this.width - cardWidth) / 2, 12, Math.max(12, this.width - cardWidth - 12));
        y = Math.max(88, this.height - cardHeight - 12);
      } else {
        const side = anchorX < this.width * 0.5 ? 'right' : 'left';
        this.detail.dataset.side = side;
        x = side === 'right' ? this.width - cardWidth - 28 : 28;
        y = clamp(anchorY - cardHeight * 0.34, 24, Math.max(24, this.height - cardHeight - 24));
      }
      const left = Math.round(x) + 'px';
      const top = Math.round(y) + 'px';
      if (this.detail.style.left !== left) this.detail.style.left = left;
      if (this.detail.style.top !== top) this.detail.style.top = top;
    }

    destroy() {
      this.abortController.abort();
      if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
      if (this.loadingTimer) window.clearTimeout(this.loadingTimer);
      if (this.audioContext) this.audioContext.close();
      document.documentElement.classList.remove('ride-page-active');
      document.body.classList.remove('ride-page-active');
      document.documentElement.style.removeProperty('--ride-header-height');
    }
  }

  function initializeRideExperience() {
    const root = document.getElementById('ride-experience');
    if (!root) {
      if (activeExperience) {
        activeExperience.destroy();
        activeExperience = null;
      }
      return;
    }
    if (activeExperience && activeExperience.root === root) return;
    if (activeExperience) activeExperience.destroy();

    loadData().then(function (routeData) {
      if (!document.documentElement.contains(root)) return;
      activeExperience = new RideExperience(root, routeData);
    }).catch(function () {
      const loading = root.querySelector('#ride-loading');
      loading.classList.add('is-error');
      loading.querySelector('span').hidden = true;
      loading.querySelector('p').textContent = '路线数据暂时无法载入，请刷新后重试';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRideExperience);
  } else {
    initializeRideExperience();
  }
  document.addEventListener('pjax:complete', initializeRideExperience);
})();
