(() => {
  'use strict';

  if (window.__starcriedSky) return;

  const canvas = document.createElement('canvas');
  const coverCanvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const coverContext = coverCanvas.getContext('2d', { alpha: true });
  if (!context) return;

  const html = document.documentElement;
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');

  canvas.id = 'sc-sky';
  canvas.setAttribute('aria-hidden', 'true');
  coverCanvas.id = 'sc-cover-sky';
  coverCanvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const palettes = {
    dark: {
      sky: ['#060910', '#09121a', '#0b171d'],
      band: ['rgba(70, 155, 178, 0)', 'rgba(70, 155, 178, 0.06)', 'rgba(113, 205, 190, 0.03)', 'rgba(70, 155, 178, 0)'],
      aurora: ['rgba(69, 207, 184, 0)', 'rgba(69, 207, 184, 0.42)', 'rgba(85, 169, 222, 0.34)', 'rgba(229, 153, 167, 0.2)', 'rgba(69, 207, 184, 0)'],
      stars: ['#e8fbff', '#8be4f5', '#f2d494', '#c6d3ff', '#c7f4e6'],
      line: 'rgba(126, 213, 229, 0.12)',
      dust: 'rgba(166, 229, 237, 0.2)',
      streak: ['rgba(126, 231, 247, 0)', 'rgba(126, 231, 247, 0.92)']
    },
    light: {
      sky: ['#506f88', '#718fa0', '#a2aca8'],
      band: ['rgba(82, 193, 188, 0)', 'rgba(82, 193, 188, 0.09)', 'rgba(227, 178, 121, 0.075)', 'rgba(82, 193, 188, 0)'],
      aurora: ['rgba(88, 218, 193, 0)', 'rgba(88, 218, 193, 0.72)', 'rgba(104, 192, 220, 0.62)', 'rgba(242, 174, 167, 0.48)', 'rgba(88, 218, 193, 0)'],
      stars: ['#f8fcff', '#d6f7f4', '#fff0c2', '#d7e8ff', '#c9f2de'],
      line: 'rgba(226, 246, 247, 0.22)',
      dust: 'rgba(235, 250, 248, 0.28)',
      streak: ['rgba(255, 240, 190, 0)', 'rgba(255, 240, 190, 0.88)']
    }
  };

  const constellationPaths = [
    [[0.08, 0.21], [0.14, 0.17], [0.2, 0.23], [0.27, 0.18], [0.32, 0.27]],
    [[0.67, 0.12], [0.72, 0.2], [0.79, 0.16], [0.84, 0.25], [0.91, 0.19]],
    [[0.58, 0.7], [0.65, 0.63], [0.72, 0.69], [0.79, 0.61]]
  ];

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let stars = [];
  let dust = [];
  let frameId = 0;
  let resizeTimer = 0;
  let lastTime = 0;
  let nextStreakAt = 0;
  let streak = null;
  let coverHost = null;
  let coverActive = false;
  let dark = false;
  let reducedMotion = motionMedia.matches;
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;

  function isDarkMode() {
    const explicit = html.getAttribute('color-scheme');
    return explicit === 'dark' || (explicit !== 'light' && darkMedia.matches);
  }

  function createRandom(seedValue) {
    let seed = seedValue >>> 0;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function syncCoverCanvas() {
    const nextHost = document.querySelector('.cover-wrapper');
    const nextActive = Boolean(nextHost && window.getComputedStyle(nextHost).display !== 'none');
    if (nextHost === coverHost && nextActive === coverActive && (!nextActive || coverCanvas.isConnected)) return;
    if (coverCanvas.isConnected) coverCanvas.remove();
    coverHost = nextHost;
    coverActive = nextActive;
    if (coverActive && coverContext) coverHost.prepend(coverCanvas);
  }

  function rebuildScene() {
    const random = createRandom(0x5c7a21 + Math.round(width * 17 + height * 29));
    const mobile = width < 640;
    const starCount = Math.max(mobile ? 62 : 104, Math.min(mobile ? 108 : 240, Math.round(width * height / 6900)));
    const dustCount = Math.max(42, Math.min(mobile ? 82 : 168, Math.round(width * height / 9800)));

    stars = Array.from({ length: starCount }, (_, index) => ({
      x: random(),
      y: random(),
      radius: 0.42 + Math.pow(random(), 2.35) * 1.65,
      alpha: 0.3 + random() * 0.66,
      phase: random() * Math.PI * 2,
      speed: 0.00038 + random() * 0.0012,
      depth: 0.18 + random() * 0.82,
      color: index % palettes.dark.stars.length,
      glint: random() > 0.91,
      trail: random() > 0.86
    }));

    // Dust stays in one broad diagonal band so the sky reads as a single scene.
    dust = Array.from({ length: dustCount }, () => {
      const x = random() * 1.35 - 0.18;
      return {
        x,
        y: 0.78 - x * 0.42 + (random() - 0.5) * 0.24,
        radius: 0.25 + random() * 0.62,
        alpha: 0.2 + random() * 0.48
      };
    });

    streak = null;
    nextStreakAt = lastTime + 1800 + random() * 4200;
  }

  function resize() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.35 : 1.75);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    syncCoverCanvas();
    if (coverContext && coverActive) {
      coverCanvas.width = canvas.width;
      coverCanvas.height = canvas.height;
      coverContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    rebuildScene();
    render(lastTime || 0);
  }

  function drawSky(target, palette) {
    const sky = target.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.sky[0]);
    sky.addColorStop(0.58, palette.sky[1]);
    sky.addColorStop(1, palette.sky[2]);
    target.fillStyle = sky;
    target.fillRect(0, 0, width, height);

    target.save();
    target.translate(width * 0.5, height * 0.5);
    target.rotate(-0.35);
    const band = target.createLinearGradient(0, -height * 0.36, 0, height * 0.36);
    band.addColorStop(0, palette.band[0]);
    band.addColorStop(0.38, palette.band[1]);
    band.addColorStop(0.58, palette.band[2]);
    band.addColorStop(1, palette.band[3]);
    target.fillStyle = band;
    target.fillRect(-width, -height * 0.42, width * 2, height * 0.84);
    target.restore();
  }

  function drawAurora(target, palette, time, overlay) {
    const sway = reducedMotion ? 0 : Math.sin(time * 0.000075) * height * 0.038;
    const lift = reducedMotion ? 0 : Math.cos(time * 0.000052) * height * 0.026;
    const gradient = target.createLinearGradient(-width * 0.2, 0, width * 1.2, 0);
    palette.aurora.forEach((color, index) => {
      gradient.addColorStop(index / (palette.aurora.length - 1), color);
    });

    target.save();
    target.globalCompositeOperation = 'screen';
    target.strokeStyle = gradient;
    [
      { width: height * 0.18, alpha: dark ? 0.1 : 0.2, offset: 0 },
      { width: height * 0.1, alpha: dark ? 0.12 : 0.18, offset: height * 0.018 },
      { width: height * 0.038, alpha: dark ? 0.14 : 0.16, offset: height * 0.035 }
    ].forEach((pass) => {
      target.globalAlpha = pass.alpha * (overlay ? 0.72 : 1);
      target.lineWidth = Math.max(10, pass.width);
      target.beginPath();
      target.moveTo(-width * 0.24, height * 0.4 + sway + pass.offset);
      target.bezierCurveTo(
        width * 0.12,
        height * 0.22 + lift,
        width * 0.46,
        height * 0.57 - sway,
        width * 0.72,
        height * 0.38 + lift + pass.offset
      );
      target.bezierCurveTo(
        width * 0.94,
        height * 0.25 - lift,
        width * 1.08,
        height * 0.48 + sway,
        width * 1.24,
        height * 0.34 + pass.offset
      );
      target.stroke();
    });
    target.restore();
  }

  function skyRotation(time) {
    return reducedMotion ? 0 : (time % 5235988) * 0.0000012;
  }

  function orbitPoint(x, y, time) {
    const angle = skyRotation(time);
    const centerX = width * 0.5;
    const centerY = height * 1.55;
    const dx = x - centerX;
    const dy = y - centerY;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      x: centerX + dx * cosine - dy * sine,
      y: centerY + dx * sine + dy * cosine,
      centerX,
      centerY
    };
  }

  function wrap(value, size, margin) {
    const span = size + margin * 2;
    return ((value + margin) % span + span) % span - margin;
  }

  function drawDust(target, palette, time) {
    target.fillStyle = palette.dust;
    dust.forEach((particle, index) => {
      const shimmer = reducedMotion ? 0.72 : 0.58 + Math.sin(time * 0.00042 + index) * 0.22;
      const point = orbitPoint(
        particle.x * width + pointerX * 4,
        particle.y * height + pointerY * 3,
        time
      );
      const x = wrap(point.x, width, 4);
      const y = wrap(point.y, height, 4);
      target.globalAlpha = particle.alpha * shimmer;
      target.beginPath();
      target.arc(x, y, particle.radius, 0, Math.PI * 2);
      target.fill();
    });
    target.globalAlpha = 1;
  }

  function drawConstellations(target, palette, time) {
    target.strokeStyle = palette.line;
    target.lineWidth = 0.8;
    constellationPaths.forEach((path, pathIndex) => {
      target.beginPath();
      path.forEach((point, index) => {
        const depth = 4 + pathIndex * 1.5;
        const rotated = orbitPoint(
          point[0] * width + pointerX * depth,
          point[1] * height + pointerY * depth,
          time
        );
        if (index === 0) target.moveTo(rotated.x, rotated.y);
        else target.lineTo(rotated.x, rotated.y);
      });
      target.stroke();
    });
  }

  function drawStars(target, palette, time) {
    target.globalCompositeOperation = 'screen';
    stars.forEach((star) => {
      const point = orbitPoint(
        star.x * width + pointerX * star.depth * 8,
        star.y * height + pointerY * star.depth * 6,
        time
      );
      const x = wrap(point.x, width, 8);
      const y = wrap(point.y, height, 8);
      const twinkle = reducedMotion ? 0.82 : 0.7 + Math.sin(time * star.speed + star.phase) * 0.3;
      const alphaScale = dark ? 1 : 0.76;

      if (star.trail && !reducedMotion) {
        const radialX = point.x - point.centerX;
        const radialY = point.y - point.centerY;
        const radius = Math.max(1, Math.hypot(radialX, radialY));
        const tangentX = -radialY / radius;
        const tangentY = radialX / radius;
        const trailLength = 3 + star.radius * 4.2;
        target.globalAlpha = star.alpha * twinkle * alphaScale * 0.18;
        target.strokeStyle = palette.stars[star.color];
        target.lineWidth = 0.7;
        target.beginPath();
        target.moveTo(x - tangentX * trailLength, y - tangentY * trailLength);
        target.lineTo(x, y);
        target.stroke();
      }

      target.globalAlpha = star.alpha * twinkle * alphaScale;
      target.fillStyle = palette.stars[star.color];
      target.beginPath();
      target.arc(x, y, star.radius, 0, Math.PI * 2);
      target.fill();

      if (star.glint) {
        const arm = 2.5 + star.radius * 2.5;
        target.globalAlpha *= 0.5;
        target.strokeStyle = palette.stars[star.color];
        target.lineWidth = 0.7;
        target.beginPath();
        target.moveTo(x - arm, y);
        target.lineTo(x + arm, y);
        target.moveTo(x, y - arm);
        target.lineTo(x, y + arm);
        target.stroke();
      }
    });
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
  }

  function createStreak(time) {
    const random = createRandom(Math.round(time) + width * 13 + height * 7);
    const direction = random() > 0.14 ? 1 : -1;
    streak = {
      startedAt: time,
      duration: 420 + random() * 280,
      direction,
      x: direction > 0 ? width * (-0.08 + random() * 0.5) : width * (0.58 + random() * 0.46),
      y: height * (0.06 + random() * 0.32),
      length: 120 + random() * 110,
      distance: 340 + random() * 210,
      slope: 0.27 + random() * 0.22
    };
    nextStreakAt = time + 4800 + random() * 7000;
  }

  function drawStreak(target, palette, time) {
    if (reducedMotion) return;
    if (!streak && time >= nextStreakAt) createStreak(time);
    if (!streak) return;

    const progress = (time - streak.startedAt) / streak.duration;
    if (progress >= 1) {
      streak = null;
      return;
    }

    const eased = 1 - Math.pow(1 - progress, 3);
    const fade = Math.sin(progress * Math.PI);
    const headX = streak.x + streak.direction * streak.distance * eased;
    const headY = streak.y + streak.distance * streak.slope * eased;
    const tailX = headX - streak.direction * streak.length;
    const tailY = headY - streak.length * streak.slope;
    const streakGradient = target.createLinearGradient(tailX, tailY, headX, headY);
    streakGradient.addColorStop(0, palette.streak[0]);
    streakGradient.addColorStop(0.78, palette.streak[0]);
    streakGradient.addColorStop(1, palette.streak[1]);

    target.save();
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = fade * (dark ? 0.94 : 0.8);
    target.strokeStyle = streakGradient;
    target.lineWidth = dark ? 1.5 : 1.25;
    target.beginPath();
    target.moveTo(tailX, tailY);
    target.lineTo(headX, headY);
    target.stroke();
    target.fillStyle = palette.streak[1];
    target.beginPath();
    target.arc(headX, headY, dark ? 1.5 : 1.25, 0, Math.PI * 2);
    target.fill();
    target.restore();
  }

  function drawScene(target, palette, time, overlay) {
    if (overlay) target.clearRect(0, 0, width, height);
    else drawSky(target, palette);
    drawAurora(target, palette, time, overlay);
    drawDust(target, palette, time);
    drawConstellations(target, palette, time);
    drawStars(target, palette, time);
    drawStreak(target, palette, time);
  }

  function render(time) {
    lastTime = time || 0;
    dark = isDarkMode();
    const palette = dark ? palettes.dark : palettes.light;
    pointerX += (targetPointerX - pointerX) * 0.035;
    pointerY += (targetPointerY - pointerY) * 0.035;

    drawScene(context, palette, lastTime, false);
    if (coverContext && coverActive && coverCanvas.isConnected) {
      drawScene(coverContext, palette, lastTime, true);
    }

    if (!reducedMotion && !document.hidden) {
      frameId = window.requestAnimationFrame(render);
    } else {
      frameId = 0;
    }
  }

  function restart() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    dark = isDarkMode();
    reducedMotion = motionMedia.matches;
    streak = null;
    syncCoverCanvas();
    render(window.performance.now());
  }

  function onPointerMove(event) {
    if (!finePointer.matches) return;
    targetPointerX = event.clientX / Math.max(1, width) * 2 - 1;
    targetPointerY = event.clientY / Math.max(1, height) * 2 - 1;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', () => {
    targetPointerX = 0;
    targetPointerY = 0;
  }, { passive: true });
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  }, { passive: true });
  document.addEventListener('visibilitychange', restart);
  document.addEventListener('pjax:complete', () => {
    syncCoverCanvas();
    restart();
  });
  darkMedia.addEventListener('change', restart);
  motionMedia.addEventListener('change', restart);

  new MutationObserver(restart).observe(html, {
    attributes: true,
    attributeFilter: ['color-scheme']
  });

  window.__starcriedSky = { canvas, coverCanvas, restart };
  resize();
})();
