(() => {
  'use strict';

  if (window.__starcriedSky) return;

  const canvas = document.createElement('canvas');
  const coverCanvas = document.createElement('canvas');
  const galaxyTextures = {
    dark: [document.createElement('canvas'), document.createElement('canvas')],
    light: [document.createElement('canvas'), document.createElement('canvas')]
  };
  const grainCanvas = document.createElement('canvas');
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
      atmosphere: {
        horizon: ['rgba(58, 136, 151, 0)', 'rgba(58, 136, 151, 0.1)'],
        afterglow: ['rgba(239, 169, 137, 0.08)', 'rgba(46, 130, 151, 0.035)', 'rgba(8, 18, 27, 0)'],
        vignette: 'rgba(1, 4, 9, 0.42)',
        grain: 0.026
      },
      galaxy: {
        outer: [45, 105, 176],
        cool: [56, 205, 238],
        warm: [255, 157, 122],
        core: [255, 236, 174],
        violet: [182, 105, 244],
        magenta: [245, 79, 179],
        mint: [89, 231, 196],
        opacity: 0.74,
        overlayOpacity: 0.46,
        dust: 0.56
      },
      stars: ['#e8fbff', '#8be4f5', '#f2d494', '#c6d3ff', '#c7f4e6'],
      dust: 'rgba(166, 229, 237, 0.14)',
      streak: ['rgba(104, 218, 255, 0)', 'rgba(104, 218, 255, 0.46)', 'rgba(232, 253, 255, 0.98)']
    },
    light: {
      sky: ['#245886', '#3f79a1', '#78a0b8'],
      atmosphere: {
        horizon: ['rgba(121, 187, 204, 0)', 'rgba(166, 202, 205, 0.24)'],
        afterglow: ['rgba(252, 157, 157, 0.2)', 'rgba(67, 188, 211, 0.13)', 'rgba(35, 84, 126, 0)'],
        vignette: 'rgba(15, 43, 75, 0.25)',
        grain: 0.018
      },
      galaxy: {
        outer: [53, 137, 219],
        cool: [46, 200, 230],
        warm: [255, 145, 139],
        core: [255, 226, 169],
        violet: [172, 111, 232],
        magenta: [226, 82, 181],
        mint: [62, 204, 181],
        opacity: 0.62,
        overlayOpacity: 0.28,
        dust: 0.44
      },
      stars: ['#f8fcff', '#d6f7f4', '#fff0c2', '#d7e8ff', '#c9f2de'],
      dust: 'rgba(227, 249, 255, 0.21)',
      streak: ['rgba(255, 205, 160, 0)', 'rgba(255, 205, 160, 0.42)', 'rgba(255, 249, 217, 0.96)']
    }
  };

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
  let galaxyWidth = 0;
  let galaxyHeight = 0;

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

  function rgba(color, alpha) {
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
  }

  function randomNormal(random) {
    return (random() + random() + random() + random() - 2) * 0.5;
  }

  function smoothStep(value) {
    return value * value * (3 - 2 * value);
  }

  function hashNoise(x, y, seed) {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function valueNoise(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothStep(x - x0);
    const ty = smoothStep(y - y0);
    const top = hashNoise(x0, y0, seed) * (1 - tx) + hashNoise(x0 + 1, y0, seed) * tx;
    const bottom = hashNoise(x0, y0 + 1, seed) * (1 - tx) + hashNoise(x0 + 1, y0 + 1, seed) * tx;
    return top * (1 - ty) + bottom * ty;
  }

  function fractalNoise(x, y, seed) {
    let value = 0;
    let amplitude = 0.55;
    let frequency = 1;
    let total = 0;
    for (let octave = 0; octave < 5; octave += 1) {
      value += valueNoise(x * frequency, y * frequency, seed + octave * 977) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return value / total;
  }

  function mixColor(first, second, amount) {
    return [
      first[0] + (second[0] - first[0]) * amount,
      first[1] + (second[1] - first[1]) * amount,
      first[2] + (second[2] - first[2]) * amount
    ];
  }

  function galaxyCorePosition(seedValue) {
    return 0.38 + hashNoise(7, 11, seedValue + 19) * 0.3;
  }

  function buildFractalGalaxy(palette, seedValue) {
    const sampleScale = width < 640 ? 2.5 : 3;
    const sampleWidth = Math.max(1, Math.ceil(galaxyWidth / sampleScale));
    const sampleHeight = Math.max(1, Math.ceil(galaxyHeight / sampleScale));
    const noiseCanvas = document.createElement('canvas');
    const noiseContext = noiseCanvas.getContext('2d');
    if (!noiseContext) return null;
    noiseCanvas.width = sampleWidth;
    noiseCanvas.height = sampleHeight;
    const image = noiseContext.createImageData(sampleWidth, sampleHeight);
    const galaxy = palette.galaxy;
    const corePosition = galaxyCorePosition(seedValue);

    for (let y = 0; y < sampleHeight; y += 1) {
      const normalizedY = y / Math.max(1, sampleHeight - 1);
      for (let x = 0; x < sampleWidth; x += 1) {
        const normalizedX = x / Math.max(1, sampleWidth - 1);
        const broadWarp = (valueNoise(normalizedX * 3.8, 0.37, seedValue + 41) - 0.5) * 0.13;
        const center = 0.5 + Math.sin(normalizedX * 7.8 + 0.42) * 0.022 + broadWarp;
        const distance = Math.abs(normalizedY - center);
        const widthField = valueNoise(normalizedX * 4.6, 1.31, seedValue + 79);
        const halfWidth = 0.22 + widthField * 0.17;
        const denseProfile = smoothStep(Math.max(0, 1 - distance / halfWidth));
        const outerProfile = Math.exp(-Math.pow(distance / (halfWidth * 1.45), 2) * 1.7);
        const coarse = fractalNoise(normalizedX * 7.4, normalizedY * 9.2, seedValue + 113);
        const fine = fractalNoise(normalizedX * 22.8, normalizedY * 31.6, seedValue + 257);
        const cloud = Math.max(0, Math.min(1, (coarse * 0.68 + fine * 0.32 - 0.34) / 0.52));
        const filament = Math.max(0, Math.min(1, (fine - 0.43) * 2.25));
        const structure = cloud * 0.74 + filament * 0.26;
        const core = Math.exp(-Math.pow((normalizedX - corePosition) / 0.19, 2));
        const edge = smoothStep(Math.min(1, normalizedX / 0.15, (1 - normalizedX) / 0.15));
        const laneWarp = (valueNoise(normalizedX * 13, 0.83, seedValue + 389) - 0.5) * 0.055;
        const laneDistance = Math.abs(normalizedY - center - laneWarp);
        const riftTexture = fractalNoise(normalizedX * 19, normalizedY * 28, seedValue + 521);
        const riftWidth = 0.015 + riftTexture * 0.026;
        const rift = Math.max(0, 1 - laneDistance / riftWidth) * (0.52 + riftTexture * 0.36);
        const intensity = edge
          * (outerProfile * 0.026 + denseProfile * structure * 0.78)
          * (0.68 + core * 0.58)
          * (1 - rift * 0.78);
        const warmMix = Math.min(0.8, core * (0.3 + cloud * 0.42));
        const violetMix = Math.max(0, (fine - 0.48) * 0.92);
        const chromaField = fractalNoise(normalizedX * 4.2, normalizedY * 5.1, seedValue + 683);
        const mintField = fractalNoise(normalizedX * 6.8, normalizedY * 7.4, seedValue + 811);
        const magentaMix = Math.max(0, Math.min(1, (chromaField - 0.46) * 2.35)) * (1 - core * 0.56);
        const mintMix = Math.max(0, Math.min(1, (mintField - 0.5) * 2.45)) * (0.42 + cloud * 0.58);
        const coolTone = mixColor(galaxy.outer, galaxy.cool, cloud * 0.76);
        const warmTone = mixColor(coolTone, galaxy.warm, warmMix);
        const violetTone = mixColor(warmTone, galaxy.violet, violetMix);
        const magentaTone = mixColor(violetTone, galaxy.magenta, magentaMix * 0.72);
        const color = mixColor(magentaTone, galaxy.mint, mintMix * 0.56);
        const alpha = Math.max(0, Math.min(0.58, intensity * (0.18 + structure * 0.56 + core * 0.1)));
        const offset = (y * sampleWidth + x) * 4;
        image.data[offset] = Math.round(color[0]);
        image.data[offset + 1] = Math.round(color[1]);
        image.data[offset + 2] = Math.round(color[2]);
        image.data[offset + 3] = Math.round(alpha * 255);
      }
    }

    noiseContext.putImageData(image, 0, 0);
    return noiseCanvas;
  }

  function buildGrainTexture() {
    const size = 112;
    const grainContext = grainCanvas.getContext('2d');
    if (!grainContext) return;
    grainCanvas.width = size;
    grainCanvas.height = size;
    const random = createRandom(0x91e10da5);
    const image = grainContext.createImageData(size, size);
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 92 + Math.round(random() * 76);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 18 + Math.round(random() * 28);
    }
    grainContext.putImageData(image, 0, 0);
  }

  function drawNebulaCloud(target, x, y, radiusX, radiusY, rotation, color, alpha) {
    target.save();
    target.translate(x, y);
    target.rotate(rotation);
    target.scale(radiusX, radiusY);
    const glow = target.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, rgba(color, alpha));
    glow.addColorStop(0.38, rgba(color, alpha * 0.52));
    glow.addColorStop(1, rgba(color, 0));
    target.fillStyle = glow;
    target.beginPath();
    target.arc(0, 0, 1, 0, Math.PI * 2);
    target.fill();
    target.restore();
  }

  function buildGalaxyTexture(texture, palette, seedValue) {
    const textureContext = texture.getContext('2d');
    if (!textureContext) return;
    const textureRatio = Math.min(1, Math.max(0.78, pixelRatio * 0.62));
    texture.width = Math.ceil(galaxyWidth * textureRatio);
    texture.height = Math.ceil(galaxyHeight * textureRatio);
    textureContext.setTransform(textureRatio, 0, 0, textureRatio, 0, 0);
    textureContext.clearRect(0, 0, galaxyWidth, galaxyHeight);

    const galaxy = palette.galaxy;
    const random = createRandom(seedValue + Math.round(width * 11 + height * 19));
    const centerY = galaxyHeight * 0.5;
    const corePosition = galaxyCorePosition(seedValue);
    const veil = textureContext.createLinearGradient(0, 0, 0, galaxyHeight);
    [
      [0, rgba(galaxy.outer, 0)],
      [0.12, rgba(galaxy.outer, 0.006)],
      [0.27, rgba(galaxy.cool, 0.014)],
      [0.4, rgba(galaxy.violet, 0.025)],
      [0.48, rgba(galaxy.warm, 0.04)],
      [0.52, rgba(galaxy.core, 0.052)],
      [0.62, rgba(galaxy.cool, 0.026)],
      [0.76, rgba(galaxy.outer, 0.012)],
      [0.9, rgba(galaxy.outer, 0.004)],
      [1, rgba(galaxy.outer, 0)]
    ].forEach(([position, color]) => veil.addColorStop(position, color));
    textureContext.fillStyle = veil;
    textureContext.fillRect(0, 0, galaxyWidth, galaxyHeight);

    textureContext.globalCompositeOperation = 'screen';
    const fractalGalaxy = buildFractalGalaxy(palette, seedValue);
    if (fractalGalaxy) {
      textureContext.imageSmoothingEnabled = true;
      textureContext.drawImage(fractalGalaxy, 0, 0, galaxyWidth, galaxyHeight);
    }
    drawNebulaCloud(
      textureContext,
      galaxyWidth * corePosition,
      centerY,
      galaxyHeight * 0.7,
      galaxyHeight * 0.23,
      -0.04,
      galaxy.core,
      0.17
    );
    drawNebulaCloud(
      textureContext,
      galaxyWidth * (corePosition - 0.02),
      centerY - galaxyHeight * 0.018,
      galaxyHeight * 0.44,
      galaxyHeight * 0.13,
      0.03,
      galaxy.warm,
      0.13
    );
    [
      { x: 0.24, y: -0.035, radiusX: 0.34, radiusY: 0.12, color: galaxy.magenta, alpha: 0.11 },
      { x: 0.69, y: 0.03, radiusX: 0.3, radiusY: 0.1, color: galaxy.mint, alpha: 0.1 },
      { x: 0.84, y: -0.045, radiusX: 0.27, radiusY: 0.095, color: galaxy.violet, alpha: 0.09 }
    ].forEach((bloom) => {
      drawNebulaCloud(
        textureContext,
        galaxyWidth * bloom.x,
        centerY + galaxyHeight * bloom.y,
        galaxyHeight * bloom.radiusX,
        galaxyHeight * bloom.radiusY,
        -0.08 + bloom.x * 0.12,
        bloom.color,
        bloom.alpha
      );
    });

    const cloudColors = [
      galaxy.outer,
      galaxy.cool,
      galaxy.warm,
      galaxy.violet,
      galaxy.magenta,
      galaxy.mint,
      galaxy.core
    ];
    const cloudCount = width < 640 ? 30 : 46;
    for (let index = 0; index < cloudCount; index += 1) {
      const x = random() * galaxyWidth;
      const coreWeight = 0.52 + 0.48 * (1 - Math.min(1, Math.abs(x / galaxyWidth - 0.56) * 2));
      const y = centerY
        + Math.sin(x / galaxyWidth * Math.PI * 2.6 + 0.45) * galaxyHeight * 0.035
        + randomNormal(random) * galaxyHeight * 0.31;
      const radiusX = (30 + random() * 112) * (0.76 + coreWeight * 0.24);
      const radiusY = 18 + random() * 62 * coreWeight;
      const tone = cloudColors[Math.floor(random() * cloudColors.length)];
      drawNebulaCloud(
        textureContext,
        x,
        y,
        radiusX,
        radiusY,
        (random() - 0.5) * 0.42,
        tone,
        0.014 + random() * 0.044
      );
    }

    const accentColors = [galaxy.cool, galaxy.magenta, galaxy.mint, galaxy.violet];
    const accentCount = width < 640 ? 9 : 14;
    for (let index = 0; index < accentCount; index += 1) {
      const x = galaxyWidth * (0.08 + random() * 0.84);
      const y = centerY
        + Math.sin(x / galaxyWidth * Math.PI * 2.6 + 0.45) * galaxyHeight * 0.03
        + randomNormal(random) * galaxyHeight * 0.16;
      drawNebulaCloud(
        textureContext,
        x,
        y,
        34 + random() * 96,
        18 + random() * 42,
        (random() - 0.5) * 0.5,
        accentColors[index % accentColors.length],
        0.045 + random() * 0.07
      );
    }

    textureContext.globalCompositeOperation = 'destination-out';
    textureContext.filter = 'blur(5px)';
    textureContext.lineCap = 'round';
    textureContext.fillStyle = 'rgba(0, 0, 0, 1)';
    for (let index = 0; index < 76; index += 1) {
      const x = random() * galaxyWidth;
      const y = centerY + randomNormal(random) * galaxyHeight * 0.2;
      textureContext.globalAlpha = galaxy.dust * (0.08 + random() * 0.26);
      textureContext.save();
      textureContext.translate(x, y);
      textureContext.rotate((random() - 0.5) * 0.7);
      textureContext.scale(18 + random() * 72, 4 + random() * 18);
      textureContext.beginPath();
      textureContext.arc(0, 0, 1, 0, Math.PI * 2);
      textureContext.fill();
      textureContext.restore();
    }

    textureContext.globalCompositeOperation = 'screen';
    textureContext.filter = 'none';
    const speckCount = width < 640 ? 520 : 920;
    for (let index = 0; index < speckCount; index += 1) {
      const x = random() * galaxyWidth;
      const y = centerY
        + Math.sin(x / galaxyWidth * Math.PI * 2.6 + 0.45) * galaxyHeight * 0.03
        + randomNormal(random) * galaxyHeight * 0.34;
      const centerDensity = Math.max(0.22, 1 - Math.abs(y - centerY) / (galaxyHeight * 0.34));
      const radius = 0.28 + Math.pow(random(), 3) * 1.18;
      const tone = cloudColors[index % cloudColors.length];
      textureContext.globalAlpha = (0.16 + random() * 0.64) * centerDensity;
      textureContext.fillStyle = rgba(tone, 1);
      textureContext.beginPath();
      textureContext.arc(x, y, radius, 0, Math.PI * 2);
      textureContext.fill();
    }

    textureContext.globalAlpha = 1;
    textureContext.globalCompositeOperation = 'destination-in';
    // Feather both axes so neighboring tiles blend without exposing their canvas bounds.
    const verticalFeather = textureContext.createLinearGradient(0, 0, 0, galaxyHeight);
    verticalFeather.addColorStop(0, 'rgba(0, 0, 0, 0)');
    verticalFeather.addColorStop(0.14, 'rgba(0, 0, 0, 0.18)');
    verticalFeather.addColorStop(0.3, 'rgba(0, 0, 0, 0.82)');
    verticalFeather.addColorStop(0.43, 'rgba(0, 0, 0, 1)');
    verticalFeather.addColorStop(0.58, 'rgba(0, 0, 0, 1)');
    verticalFeather.addColorStop(0.74, 'rgba(0, 0, 0, 0.76)');
    verticalFeather.addColorStop(0.89, 'rgba(0, 0, 0, 0.14)');
    verticalFeather.addColorStop(1, 'rgba(0, 0, 0, 0)');
    textureContext.fillStyle = verticalFeather;
    textureContext.fillRect(0, 0, galaxyWidth, galaxyHeight);

    const horizontalFeather = textureContext.createLinearGradient(0, 0, galaxyWidth, 0);
    horizontalFeather.addColorStop(0, 'rgba(0, 0, 0, 0)');
    horizontalFeather.addColorStop(0.14, 'rgba(0, 0, 0, 1)');
    horizontalFeather.addColorStop(0.86, 'rgba(0, 0, 0, 1)');
    horizontalFeather.addColorStop(1, 'rgba(0, 0, 0, 0)');
    textureContext.fillStyle = horizontalFeather;
    textureContext.fillRect(0, 0, galaxyWidth, galaxyHeight);

    textureContext.globalCompositeOperation = 'source-over';
    textureContext.filter = 'none';
  }

  function rebuildAtmosphereTextures() {
    galaxyWidth = Math.min(2200, Math.max(1200, Math.ceil(Math.hypot(width, height) * 0.92)));
    galaxyHeight = Math.min(900, Math.max(420, Math.ceil(height * 0.98)));
    galaxyTextures.dark.forEach((texture, index) => {
      buildGalaxyTexture(texture, palettes.dark, 0x2e71c41 + index * 0x18a43d);
    });
    galaxyTextures.light.forEach((texture, index) => {
      buildGalaxyTexture(texture, palettes.light, 0x713fb21 + index * 0x14c62b);
    });
    if (!grainCanvas.width) buildGrainTexture();
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

    dust = Array.from({ length: dustCount }, () => {
      return {
        x: random(),
        y: random(),
        radius: 0.2 + random() * 0.52,
        alpha: 0.1 + random() * 0.34
      };
    });

    rebuildAtmosphereTextures();
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

    const atmosphere = palette.atmosphere;
    const glowX = width * (0.72 + (reducedMotion ? 0 : Math.sin(lastTime * 0.000018) * 0.035));
    const glow = target.createRadialGradient(
      glowX,
      height * 1.04,
      0,
      glowX,
      height * 1.04,
      Math.max(width * 0.68, height * 0.72)
    );
    glow.addColorStop(0, atmosphere.afterglow[0]);
    glow.addColorStop(0.42, atmosphere.afterglow[1]);
    glow.addColorStop(1, atmosphere.afterglow[2]);
    target.fillStyle = glow;
    target.fillRect(0, 0, width, height);

    const horizon = target.createLinearGradient(0, height * 0.48, 0, height);
    horizon.addColorStop(0, atmosphere.horizon[0]);
    horizon.addColorStop(1, atmosphere.horizon[1]);
    target.fillStyle = horizon;
    target.fillRect(0, height * 0.48, width, height * 0.52);

    const vignette = target.createRadialGradient(
      width * 0.5,
      height * 0.4,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.4,
      Math.max(width, height) * 0.78
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, atmosphere.vignette);
    target.fillStyle = vignette;
    target.fillRect(0, 0, width, height);

    target.save();
    target.globalCompositeOperation = 'soft-light';
    target.globalAlpha = atmosphere.grain;
    const grainPattern = target.createPattern(grainCanvas, 'repeat');
    if (grainPattern) {
      const grainOffset = reducedMotion ? 0 : Math.floor(lastTime * 0.0008) % grainCanvas.width;
      target.translate(grainOffset, grainOffset * 0.63);
      target.fillStyle = grainPattern;
      target.fillRect(-grainCanvas.width, -grainCanvas.height, width + grainCanvas.width * 2, height + grainCanvas.height * 2);
    }
    target.restore();
  }

  function drawMilkyWay(target, palette, time, overlay) {
    const textures = palette === palettes.dark ? galaxyTextures.dark : galaxyTextures.light;
    if (!textures[0].width || !textures[0].height) return;
    target.save();
    target.globalCompositeOperation = dark ? 'screen' : 'source-over';
    target.globalAlpha = overlay ? palette.galaxy.overlayOpacity : palette.galaxy.opacity;

    const orbitCenterX = width * 0.5;
    const orbitCenterY = height * 1.55;
    target.translate(orbitCenterX, orbitCenterY);
    target.rotate(skyRotation(time) * 0.94);
    target.translate(-orbitCenterX, -orbitCenterY);
    target.translate(width * 0.52 + pointerX * 7, height * 0.49 + pointerY * 5);
    target.rotate(-0.54);
    const tileStride = galaxyWidth * 0.72;
    const tileReach = Math.hypot(width, height) * 0.75 + galaxyWidth * 0.5;
    const tileCount = Math.ceil(tileReach / tileStride);
    // Alternate mirrored textures across the full orbit instead of rotating one finite strip.
    for (let tileIndex = -tileCount; tileIndex <= tileCount; tileIndex += 1) {
      const textureIndex = ((tileIndex % textures.length) + textures.length) % textures.length;
      const verticalOffset = Math.sin(tileIndex * 1.73) * galaxyHeight * 0.025;
      target.save();
      target.translate(tileIndex * tileStride, verticalOffset);
      if (Math.abs(tileIndex) % 2 === 1) target.scale(-1, 1);
      target.drawImage(
        textures[textureIndex],
        -galaxyWidth * 0.5,
        -galaxyHeight * 0.5,
        galaxyWidth,
        galaxyHeight
      );
      target.restore();
    }
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

  function edgeVisibility(x, y, margin) {
    // Wrapped particles complete their lifecycle outside the viewport rather than popping at an edge.
    const xFade = Math.min(1, Math.max(0, (x + margin) / margin), Math.max(0, (width + margin - x) / margin));
    const yFade = Math.min(1, Math.max(0, (y + margin) / margin), Math.max(0, (height + margin - y) / margin));
    return smoothStep(Math.min(xFade, yFade));
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
      const margin = 24;
      const x = wrap(point.x, width, margin);
      const y = wrap(point.y, height, margin);
      target.globalAlpha = particle.alpha * shimmer * edgeVisibility(x, y, margin);
      target.beginPath();
      target.arc(x, y, particle.radius, 0, Math.PI * 2);
      target.fill();
    });
    target.globalAlpha = 1;
  }

  function drawStars(target, palette, time) {
    target.globalCompositeOperation = 'screen';
    stars.forEach((star) => {
      const point = orbitPoint(
        star.x * width + pointerX * star.depth * 8,
        star.y * height + pointerY * star.depth * 6,
        time
      );
      const margin = 36;
      const x = wrap(point.x, width, margin);
      const y = wrap(point.y, height, margin);
      const twinkle = reducedMotion ? 0.82 : 0.7 + Math.sin(time * star.speed + star.phase) * 0.3;
      const alphaScale = dark ? 1 : 0.76;
      const visibility = edgeVisibility(x, y, margin);

      if (star.trail && !reducedMotion) {
        const radialX = point.x - point.centerX;
        const radialY = point.y - point.centerY;
        const radius = Math.max(1, Math.hypot(radialX, radialY));
        const tangentX = -radialY / radius;
        const tangentY = radialX / radius;
        const trailLength = 3 + star.radius * 4.2;
        target.globalAlpha = star.alpha * twinkle * alphaScale * visibility * 0.18;
        target.strokeStyle = palette.stars[star.color];
        target.lineWidth = 0.7;
        target.beginPath();
        target.moveTo(x - tangentX * trailLength, y - tangentY * trailLength);
        target.lineTo(x, y);
        target.stroke();
      }

      target.globalAlpha = star.alpha * twinkle * alphaScale * visibility;
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
    streak = {
      startedAt: time,
      duration: 260 + random() * 140,
      x: width * (-0.14 + random() * 0.54),
      y: height * (0.04 + random() * 0.3),
      length: 150 + random() * 100,
      distance: 460 + random() * 220,
      slope: 0.28 + random() * 0.14
    };
    nextStreakAt = time + 4800 + random() * 7000;
  }

  function fillTaperedStreak(target, tipX, tipY, headX, headY, perpendicularX, perpendicularY, halfWidth) {
    target.beginPath();
    target.moveTo(tipX, tipY);
    target.lineTo(headX + perpendicularX * halfWidth, headY + perpendicularY * halfWidth);
    target.lineTo(headX - perpendicularX * halfWidth, headY - perpendicularY * halfWidth);
    target.closePath();
    target.fill();
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

    const fadeIn = Math.min(1, progress / 0.07);
    const fadeOut = Math.min(1, (1 - progress) / 0.06);
    const visibility = Math.min(fadeIn, fadeOut);
    const headX = streak.x + streak.distance * progress;
    const headY = streak.y + streak.distance * streak.slope * progress;
    const inverseLength = 1 / Math.hypot(1, streak.slope);
    const directionX = inverseLength;
    const directionY = streak.slope * inverseLength;
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    const tailX = headX - directionX * streak.length;
    const tailY = headY - directionY * streak.length;
    const shoulderX = headX - directionX * 2.4;
    const shoulderY = headY - directionY * 2.4;
    const streakGradient = target.createLinearGradient(tailX, tailY, headX, headY);
    streakGradient.addColorStop(0, palette.streak[0]);
    streakGradient.addColorStop(0.58, palette.streak[1]);
    streakGradient.addColorStop(1, palette.streak[2]);

    target.save();
    target.globalCompositeOperation = 'screen';
    target.fillStyle = streakGradient;
    target.globalAlpha = visibility * (dark ? 0.26 : 0.2);
    fillTaperedStreak(
      target,
      tailX,
      tailY,
      shoulderX,
      shoulderY,
      perpendicularX,
      perpendicularY,
      dark ? 6 : 5
    );
    target.globalAlpha = visibility * (dark ? 0.96 : 0.84);
    fillTaperedStreak(
      target,
      tailX,
      tailY,
      shoulderX,
      shoulderY,
      perpendicularX,
      perpendicularY,
      dark ? 1.8 : 1.5
    );
    target.fillStyle = palette.streak[2];
    target.beginPath();
    target.arc(headX, headY, dark ? 1.7 : 1.4, 0, Math.PI * 2);
    target.fill();
    target.restore();
  }

  function drawScene(target, palette, time, overlay) {
    if (overlay) target.clearRect(0, 0, width, height);
    else drawSky(target, palette);
    drawMilkyWay(target, palette, time, overlay);
    drawDust(target, palette, time);
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
