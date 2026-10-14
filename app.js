'use strict';

const $ = (id) => document.getElementById(id);
const startButton = $('start');
const landing = $('landing');
const result = $('result');
const soundToggle = $('soundToggle');
const topRight = $('topRight');
const siteTrack = $('siteTrack');
const dropCurtain = $('dropCurtain');
const failScreen = $('failScreen');

// V17: OAuth Discord + отчёт через backend. Telegram-токен живёт только на сервере.
const DROP_AT_MS = 12300;
const COUNTDOWN_STEPS = 13;
const TRACK_BEAT_TIMES_MS = [
  370, 720, 1070, 1420, 1780, 2130, 2480, 2840, 3190, 3540, 3900, 4250, 4600, 4950, 5310, 5660, 6010, 6370, 6720, 7070, 7420, 7780, 8130, 8480, 8840, 9190, 9540, 9900, 10250, 10600, 10950, 11310, 11660, 12010, 12370, 12720, 13070, 13420, 13780, 14130, 14480, 14840, 15190, 15540, 15900, 16250, 16600, 16950, 17310, 17660, 18010, 18370, 18720, 19070, 19420, 19780, 20130, 20480, 20840, 21190, 21540, 21900, 22250, 22600, 22950, 23310, 23660, 24010, 24370, 24720, 25070, 25420, 25780, 26130, 26480, 26840, 27190, 27540, 27900, 28250, 28600, 28950, 29310, 29660, 30010, 30370, 30720, 31070, 31420, 31780, 32130, 32480, 32840, 33190, 33540, 33900, 34250, 34600, 34950, 35310, 35660, 36010, 36370, 36720, 37070, 37420, 37780, 38130, 38480, 38840, 39190, 39540, 39900, 40250, 40600, 40950, 41310, 41660, 42010, 42370, 42720, 43070, 43420, 43780, 44130, 44480, 44840
];
const STALE_BEAT_TOLERANCE_MS = 150;
const REVEAL_FALLBACK_MS = 950;
const REVEAL_FALLBACK_STEP_MS = 355;

const WTFISMYP_API = 'https://wtfismyip.com/json';
const IPWHO_API = 'https://ipwho.is/';
const IPAPI_FALLBACK = 'https://ipapi.co/json/';

let started = false;
let muted = false;
let isPlaying = false;
let nextTrackBeatIndex = 0;
let fallbackNextRevealAtMs = DROP_AT_MS + REVEAL_FALLBACK_MS;
let revealItems = [];
let nextRevealIndex = 0;
let dropReached = false;
let dropPending = false;
let dropTimer = null;
let lastCountdownNumber = '13';
let revealTimers = [];
let pulseFrame = 0;
let playbackWatchdog = null;
let failureShown = false;
let localInfoFilled = false;
let gpuInfo = { vendor: '', renderer: '', exposed: false };
let cpuArchInfo = '';

function setText(id, value, fallback = 'НЕ РАСКРЫВАЕТСЯ БРАУЗЕРОМ') {
  const node = $(id);
  if (!node) return;
  node.textContent = value === undefined || value === null || value === '' ? fallback : String(value);
}

function platformName(ua) {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/Windows/i.test(platform) || /Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(platform) || /Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS / iPadOS';
  if (/Mac/i.test(platform) || /Mac OS X|Macintosh/i.test(ua)) {
    return navigator.maxTouchPoints > 1 ? 'macOS / iPadOS (версия не раскрыта)' : 'macOS';
  }
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux';
  return platform || 'Не определена';
}

function browserInfo(ua) {
  const rules = [
    ['Microsoft Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/i],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/i],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/i],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/i],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/i],
    ['Safari', /Version\/([\d.]+).*Safari/i]
  ];
  for (const [name, regex] of rules) {
    const match = ua.match(regex);
    if (match) return { name, version: match[1] };
  }
  return { name: 'Не определён', version: 'Недоступно' };
}

function deviceClass(ua) {
  if (/iPad|Tablet|Kindle|Silk/i.test(ua)) return 'ПЛАНШЕТ';
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua) || navigator.userAgentData?.mobile) return 'ТЕЛЕФОН';
  return 'КОМПЬЮТЕР / НОУТБУК';
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch { return false; }
}

function mediaSupport() {
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  const mp4 = video.canPlayType('video/mp4; codecs="avc1.42E01E"');
  const webm = video.canPlayType('video/webm; codecs="vp9"');
  const mp3 = audio.canPlayType('audio/mpeg');
  const ogg = audio.canPlayType('audio/ogg; codecs="vorbis"');
  const pdf = typeof navigator.pdfViewerEnabled === 'boolean' ? (navigator.pdfViewerEnabled ? 'PDF viewer' : 'без встроенного PDF') : 'PDF — неизвестно';
  return `MP4 ${mp4 || '—'} · WEBM ${webm || '—'} · MP3 ${mp3 || '—'} · OGG ${ogg || '—'} · ${pdf}`;
}

function fillLocalInfo() {
  if (localInfoFilled) return;
  localInfoFilled = true;
  const ua = navigator.userAgent || '';
  const browser = browserInfo(ua);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Неизвестно';
  const offset = -new Date().getTimezoneOffset();
  const offsetString = `UTC${offset >= 0 ? '+' : ''}${(offset / 60).toString().replace('.5', ':30').replace('.75', ':45')}`;
  const orientation = screen.orientation?.type || (innerWidth > innerHeight ? 'landscape (по размерам окна)' : 'portrait (по размерам окна)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const pointer = [matchMedia('(pointer: coarse)').matches ? 'TOUCH/COARSE' : 'FINE POINTER', matchMedia('(hover: hover)').matches ? 'HOVER' : 'NO HOVER'].join(' · ');
  const prefs = [
    matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT/DEFAULT',
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'REDUCED MOTION' : 'NORMAL MOTION',
    matchMedia('(prefers-contrast: more)').matches ? 'HIGH CONTRAST' : 'DEFAULT CONTRAST'
  ].join(' · ');
  const dnt = navigator.globalPrivacyControl === true ? 'GPC ON' : (navigator.doNotTrack === '1' || window.doNotTrack === '1' ? 'DNT ON' : 'DNT/GPC OFF OR UNSUPPORTED');
  const uaData = navigator.userAgentData;
  const brandString = uaData?.brands?.map((b) => `${b.brand} ${b.version}`).join(' · ') || 'UA client hints не раскрыты';
  const engine = /AppleWebKit/i.test(ua) ? (/Gecko\//i.test(ua) && !/like Gecko/i.test(ua) ? 'Gecko' : /Chrome|Chromium|CriOS|Edg|OPR/i.test(ua) ? 'Blink / Chromium family' : 'WebKit') : (/Gecko\//i.test(ua) ? 'Gecko' : 'Не определён');
  const cpuText = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} ЛОГИЧЕСКИХ ПОТОКОВ` : 'ЧИСЛО ПОТОКОВ НЕ РАСКРЫВАЕТСЯ';
  const memText = navigator.deviceMemory ? `RAM ≈ ${navigator.deviceMemory} GB (оценка браузера)` : 'RAM НЕ РАСКРЫВАЕТСЯ';
  const online = navigator.onLine ? 'ONLINE' : 'OFFLINE';
  const cookie = navigator.cookieEnabled ? 'COOKIES ON' : 'COOKIES OFF';
  const https = location.protocol === 'https:' ? 'HTTPS ON' : 'HTTPS OFF';

  setText('browserValue', browser.name);
  setText('browserExtra', brandString);
  setText('engineValue', engine);
  setText('engineExtra', `ВЕРСИЯ ${browser.version}`);
  setText('platformValue', platformName(ua));
  setText('platformExtra', `navigator.platform: ${navigator.platform || 'не раскрыто'}`);
  setText('deviceClassValue', deviceClass(ua));
  setText('deviceClassExtra', `TOUCHPOINTS ${navigator.maxTouchPoints || 0} · MOBILE HINT ${uaData ? (uaData.mobile ? 'YES' : 'NO') : 'N/A'}`);
  setText('screenValue', `${screen.width} × ${screen.height}`);
  setText('screenOrientation', `ОРИЕНТАЦИЯ · ${orientation.toUpperCase()}`);
  setText('windowValue', `${innerWidth} × ${innerHeight}`);
  setText('availScreenValue', `ЭКРАН ДОСТУПЕН · ${screen.availWidth} × ${screen.availHeight}`);
  setText('pixelValue', `${devicePixelRatio || 1}× DPR`);
  setText('colorValue', `${screen.colorDepth || '—'} BIT · PIXEL DEPTH ${screen.pixelDepth || '—'} BIT`);
  setText('cpuValue', cpuText);
  fillHardwareDetails();
  setText('memoryValue', memText);
  setText('languageValue', (navigator.languages?.join(' / ') || navigator.language || '—').toUpperCase());
  setText('zoneValue', `${zone} · ${offsetString}`);
  setText('localTimeValue', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  setText('connectionValue', connection ? `${connection.effectiveType || 'TYPE N/A'} · ${connection.downlink ?? '?'} Mbps · RTT ${connection.rtt ?? '?'} ms${connection.saveData ? ' · SAVE-DATA' : ''}` : 'DETAILS API НЕ ПОДДЕРЖИВАЕТСЯ');
  setText('basicStatusValue', `${online} · ${cookie} · ${https}`);
  setText('touchValue', navigator.maxTouchPoints > 0 ? `YES · ${navigator.maxTouchPoints} TOUCH POINT(S)` : 'NO TOUCH POINTS REPORTED');
  setText('pointerValue', pointer);
  setText('preferencesValue', prefs);
  setText('apisValue', `WebGL ${supportsWebGL() ? 'YES' : 'NO'} · WASM ${typeof WebAssembly !== 'undefined' ? 'YES' : 'NO'} · WebRTC ${typeof RTCPeerConnection !== 'undefined' ? 'YES' : 'NO'}`);
  setText('mediaValue', mediaSupport());
  setText('privacyValue', `${dnt} · REFERRER POLICY BROWSER-DEPENDENT`);
  setText('referrerValue', document.referrer ? new URL(document.referrer).hostname : 'DIRECT / REFERRER EMPTY');
  setText('apiSupportValue', `UA-HINTS ${uaData ? 'YES' : 'NO'} · STORAGE API ${navigator.storage ? 'YES' : 'NO'} · GEO API ${navigator.geolocation ? 'SUPPORTED, NOT REQUESTED' : 'NO'}`);
  setText('userAgentValue', ua);
  const navEntry = performance.getEntriesByType('navigation')[0];
  setText('loadTimeValue', navEntry?.loadEventEnd ? `${Math.round(navEntry.loadEventEnd)} ms` : 'ТАЙМИНГ БРАУЗЕРА НЕ ДОСТУПЕН');

  try {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const quota = estimate.quota ? `${(estimate.quota / (1024 ** 3)).toFixed(2)} GB` : '—';
        const usage = estimate.usage ? `${(estimate.usage / (1024 ** 2)).toFixed(1)} MB` : '0 MB / НЕ ВЫСТАВЛЕНО';
        setText('storageValue', `QUOTA ${quota} · USED ${usage}`);
      }).catch(() => setText('storageValue', 'СТАТИСТИКА ХРАНИЛИЩА НЕДОСТУПНА'));
    } else setText('storageValue', 'STORAGE ESTIMATE API НЕ ПОДДЕРЖИВАЕТСЯ');
  } catch {
    setText('storageValue', 'СТАТИСТИКА ХРАНИЛИЩА НЕДОСТУПНА');
  }
}

function parseCoordinate(value, axis) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  const limit = axis === 'latitude' ? 90 : 180;
  if (number < -limit || number > limit) return null;
  return number;
}

function coordinatePair(source) {
  if (!source) return null;
  const latitude = parseCoordinate(source.latitude, 'latitude');
  const longitude = parseCoordinate(source.longitude, 'longitude');
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function mapWtfIsMyIp(data) {
  const city = data.YourFuckingCity || '';
  const country = data.YourFuckingCountry || '';
  const location = data.YourFuckingLocation || '';
  const parts = location.split(/,\s*/).filter(Boolean);
  const middle = parts.filter((part) => part !== city && part !== country);
  return {
    ip: data.YourFuckingIPAddress,
    ipType: '—',
    city,
    region: middle.join(' · '),
    country,
    countryCode: data.YourFuckingCountryCode,
    continent: '',
    continentCode: '',
    postal: '',
    latitude: null,
    longitude: null,
    timezone: '',
    utc: '',
    isp: data.YourFuckingISP,
    org: data.YourFuckingISP,
    asn: '',
    domain: data.YourFuckingHostname,
    capital: '',
    callingCode: '',
    eu: undefined
  };
}

function mapIpWho(data) {
  const conn = data.connection || {};
  const tz = data.timezone || {};
  return {
    ip: data.ip,
    ipType: data.type || '—',
    city: data.city,
    region: data.region,
    country: data.country,
    countryCode: data.country_code,
    continent: data.continent,
    continentCode: data.continent_code,
    postal: data.postal,
    latitude: parseCoordinate(data.latitude, 'latitude'),
    longitude: parseCoordinate(data.longitude, 'longitude'),
    timezone: tz.id,
    utc: tz.utc,
    isp: conn.isp,
    org: conn.org,
    asn: conn.asn,
    domain: conn.domain,
    capital: data.capital,
    callingCode: data.calling_code,
    eu: data.is_eu
  };
}

function mapIpApi(data) {
  return {
    ip: data.ip,
    ipType: data.version || '—',
    city: data.city,
    region: data.region,
    country: data.country_name,
    countryCode: data.country_code,
    continent: data.continent_code,
    continentCode: data.continent_code,
    postal: data.postal,
    latitude: parseCoordinate(data.latitude, 'latitude'),
    longitude: parseCoordinate(data.longitude, 'longitude'),
    timezone: data.timezone,
    utc: data.utc_offset,
    isp: data.org,
    org: data.org,
    asn: data.asn,
    domain: data.network,
    capital: '',
    callingCode: '',
    eu: undefined
  };
}

async function fetchJson(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.success === false || data.error) throw new Error('IP provider returned no result');
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

// V17: отчёт уходит только на backend, где к нему подкладывается Discord-сессия.
async function sendReport(d) {
  if (!d) return;
  try {
    const res = await fetch('/api/submit-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(d)
    });
    if (!res.ok) {
      console.warn('Report submission failed', res.status);
    } else {
      console.log('📤 Report submitted');
    }
  } catch (e) {
    console.warn('Report submission error', e);
  }
}

async function loadIpInfo() {
  let data;
  try {
    const primary = await fetchJson(WTFISMYP_API);
    if (!primary.YourFuckingIPAddress) throw new Error('Primary IP location response is incomplete');
    data = mapWtfIsMyIp(primary);
    try {
      const enrichment = mapIpWho(await fetchJson(IPWHO_API));
      data = {
        ...enrichment,
        ...data,
        ipType: data.ipType && data.ipType !== '—' ? data.ipType : enrichment.ipType,
        continent: data.continent || enrichment.continent,
        continentCode: data.continentCode || enrichment.continentCode,
        postal: data.postal || enrichment.postal,
        latitude: (coordinatePair(data) || coordinatePair(enrichment) || {}).latitude ?? null,
        longitude: (coordinatePair(data) || coordinatePair(enrichment) || {}).longitude ?? null,
        timezone: data.timezone || enrichment.timezone,
        utc: data.utc || enrichment.utc,
        asn: data.asn || enrichment.asn,
        capital: data.capital || enrichment.capital,
        callingCode: data.callingCode || enrichment.callingCode,
        eu: typeof data.eu === 'boolean' ? data.eu : enrichment.eu,
        org: data.org || enrichment.org,
        domain: data.domain || enrichment.domain,
        isp: data.isp || enrichment.isp
      };
    } catch (enrichmentError) {
      console.warn('IP metadata enrichment unavailable', enrichmentError);
    }
  } catch (primaryError) {
    try {
      data = mapIpWho(await fetchJson(IPWHO_API));
    } catch (secondaryError) {
      try {
        data = mapIpApi(await fetchJson(IPAPI_FALLBACK));
      } catch (fallbackError) {
        console.warn('IP lookup providers unavailable', primaryError, secondaryError, fallbackError);
        const ids = ['ipValue','ipTypeValue','ipPlace','regionValue','regionExtra','providerValue','asnValue','providerExtra','ipCoords','countryMeta','countryCodeMeta','ipTimezone','ipUtc','postalValue','postalExtra','networkTypeValue','networkExtra'];
        ids.forEach((id) => setText(id, 'IP GEO НЕ ДОСТУПНА'));
        sendReport({
          ip: null, city: null, country: null, isp: null,
          userAgent: navigator.userAgent,
          screen: `${screen.width}x${screen.height}`,
          viewport: `${innerWidth}x${innerHeight}`,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          referrer: document.referrer || null,
          platform: navigator.platform || null,
          cores: navigator.hardwareConcurrency || null,
          ram: navigator.deviceMemory || null,
          gpu: gpuInfo.renderer || null,
          gpuVendor: gpuInfo.vendor || null,
          cpuArch: cpuArchInfo || null,
          isMobile: !!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
          online: navigator.onLine
        });
        return;
      }
    }
  }

  if (!coordinatePair(data)) {
    try {
      const fallbackCoordinates = mapIpApi(await fetchJson(IPAPI_FALLBACK));
      const pair = coordinatePair(fallbackCoordinates);
      if (pair) {
        data.latitude = pair.latitude;
        data.longitude = pair.longitude;
      }
      if (!data.postal && fallbackCoordinates.postal) data.postal = fallbackCoordinates.postal;
    } catch (coordinateFallbackError) {
      console.warn('IP coordinate fallback unavailable', coordinateFallbackError);
    }
  }

  const geoName = [data.city, data.country].filter(Boolean).join(', ');
  const countryRegion = [data.region, data.country].filter(Boolean).join(' · ');
  setText('ipValue', data.ip);
  setText('ipTypeValue', `IP TYPE · ${data.ipType || 'НЕ ОПРЕДЕЛЁН'}`);
  setText('ipPlace', geoName ? `IP LOCATION · ${geoName}` : 'ГОРОД ПО IP НЕ ОПРЕДЕЛЁН');
  setText('regionValue', data.city || 'НЕ ОПРЕДЕЛЁН');
  setText('regionExtra', countryRegion || 'РЕГИОН НЕ ОПРЕДЕЛЁН');
  setText('providerValue', data.isp || data.org || 'НЕ ОПРЕДЕЛЁН');
  setText('asnValue', data.asn ? `ASN · ${data.asn}` : 'ASN НЕ РАСКРЫТ');
  setText('providerExtra', `ORG · ${data.org || 'НЕИЗВЕСТНО'}${data.domain ? ` · ${data.domain}` : ''}`);
  const coords = coordinatePair(data);
  setText('ipCoords', coords ? `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°` : 'НЕДОСТУПНО');
  setText('countryMeta', [data.country, data.continent].filter(Boolean).join(' · '));
  setText('countryCodeMeta', `COUNTRY ${data.countryCode || '—'} · CONTINENT ${data.continentCode || '—'}${typeof data.eu === 'boolean' ? ` · EU ${data.eu ? 'YES' : 'NO'}` : ''}`);
  setText('ipTimezone', data.timezone || 'НЕИЗВЕСТНО');
  setText('ipUtc', `UTC · ${data.utc || 'НЕТ ДАННЫХ'}`);
  const cityPostal = lookupCityPostal(data.city, data.countryCode);
  const selectedPostal = cityPostal || data.postal || '';
  setText('postalValue', selectedPostal || 'НЕ НАЙДЕН');
  setText('postalExtra', cityPostal ? 'CITY POSTAL TABLE · APPROXIMATE CITY CODE' : (data.postal ? 'IP GEO PROVIDER · APPROXIMATE' : 'NO CITY CODE MATCH · IP DATA ALSO UNAVAILABLE'));
  setText('networkTypeValue', `${data.ipType || 'IP'} · ${data.countryCode || '—'}`);
  setText('networkExtra', `ASN ${data.asn || '—'} · NETWORK ${data.domain || data.org || '—'}`);

  sendReport({
    ip: data.ip,
    city: data.city,
    country: data.country,
    region: data.region,
    isp: data.isp || data.org,
    asn: data.asn,
    coords: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : null,
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: document.referrer || null,
    platform: navigator.platform || null,
    cores: navigator.hardwareConcurrency || null,
    ram: navigator.deviceMemory || null,
    gpu: gpuInfo.renderer || null,
    gpuVendor: gpuInfo.vendor || null,
    cpuArch: cpuArchInfo || null,
    isMobile: !!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''),
    online: navigator.onLine
  });
}

const SWISS_CITY_POSTCODES = new Map([
  ['yverdon-les-bains', '1400'], ['yverdon', '1400'],
  ['lausanne', '1000'], ['geneva', '1200'], ['genève', '1200'],
  ['zurich', '8000'], ['zürich', '8000'], ['bern', '3000'],
  ['basel', '4000'], ['winterthur', '8400'], ['lucerne', '6000'], ['luzern', '6000'],
  ['lugano', '6900'], ['st gallen', '9000'], ['saint gall', '9000'],
  ['biel', '2500'], ['biel/bienne', '2500'], ['bienne', '2500'],
  ['neuchatel', '2000'], ['neuchâtel', '2000'], ['fribourg', '1700'], ['freiburg', '1700'],
  ['sion', '1950'], ['montreux', '1820'], ['vevey', '1800'], ['nyon', '1260'],
  ['morges', '1110'], ['payerne', '1530'], ['orbe', '1350'], ['aigle', '1860'],
  ['thun', '3600'], ['chur', '7000'], ['schaffhausen', '8200'], ['zug', '6300'],
  ['uster', '8610'], ['baden', '5400'], ['interlaken', '3800'], ['rolle', '1180'],
  ['renens', '1020'], ['pully', '1009'], ['ecublens', '1024'], ['prilly', '1008'],
  ['kloten', '8302'], ['bellinzona', '6500'], ['locarno', '6600'], ['delémont', '2800'],
  ['delemont', '2800'], ['olten', '4600'], ['rapperswil', '8640'], ['crans-montana', '3963']
]);

function normalizedCity(value) {
  return String(value || '').trim().toLocaleLowerCase('en').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ');
}

function lookupCityPostal(city, countryCode) {
  if (String(countryCode || '').toUpperCase() !== 'CH') return '';
  const normalized = normalizedCity(city);
  if (!normalized) return '';
  const lookup = (name) => {
    if (SWISS_CITY_POSTCODES.has(name)) return SWISS_CITY_POSTCODES.get(name);
    for (const [label, postal] of SWISS_CITY_POSTCODES) {
      if (normalizedCity(label) === name) return postal;
    }
    return '';
  };
  const direct = lookup(normalized);
  if (direct) return direct;
  const cityParts = normalized.split(/[,/|·]/).map(part => part.trim()).filter(Boolean);
  for (const part of cityParts) {
    const postal = lookup(part);
    if (postal) return postal;
  }
  return '';
}

function getGpuDetails() {
  const fallback = { vendor: '', renderer: '', exposed: false };
  let canvas;
  let gl;
  try {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) return fallback;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const generic = /^(webgl|webkit webgl|mozilla|unknown)$/i.test(String(renderer || '').trim());
    return { vendor: String(vendor || ''), renderer: String(renderer || ''), exposed: !!debugInfo && !generic };
  } catch (error) {
    return fallback;
  } finally {
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (error) { /* optional */ }
  }
}

function fillHardwareDetails() {
  const isMobile = !!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (isMobile) {
    setText('cpuModelValue', 'МОБИЛЬНОЕ УСТРОЙСТВО');
    setText('cpuModelExtra', 'МОДЕЛЬ ПРОЦЕССОРА НЕ ПРЕДОСТАВЛЯЕТСЯ БРАУЗЕРОМ');
  } else {
    setText('cpuModelValue', 'МОДЕЛЬ CPU НЕ РАСКРЫВАЕТСЯ');
    const hints = navigator.userAgentData?.getHighEntropyValues;
    const cpuParts = [];
    if (navigator.hardwareConcurrency) cpuParts.push(`${navigator.hardwareConcurrency} ЛОГИЧЕСКИХ ПОТОКОВ`);
    setText('cpuModelExtra', cpuParts.length ? cpuParts.join(' · ') : 'ЧИСЛО ПОТОКОВ НЕДОСТУПНО');
    if (typeof hints === 'function') {
      navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion'])
        .then((data) => {
          const arch = data.architecture ? `ARCH ${data.architecture}` : '';
          const bits = data.bitness ? `${data.bitness}-BIT` : '';
          const model = data.model ? `DEVICE MODEL ${data.model}` : '';
          const extra = [arch, bits, model, navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} LOGICAL THREADS` : ''].filter(Boolean).join(' · ');
          if (extra) setText('cpuModelExtra', extra);
          cpuArchInfo = [data.architecture || '', data.bitness ? `${data.bitness}-BIT` : ''].filter(Boolean).join(' · ');
        })
        .catch(() => { /* optional */ });
    }
  }

  const gpu = getGpuDetails();
  gpuInfo = gpu;
  const renderer = gpu.renderer.trim();
  const vendor = gpu.vendor.trim();
  const lowValue = /^(webgl|webkit webgl|mozilla|unknown)$/i.test(renderer);
  if (renderer && !lowValue) {
    setText('gpuValue', renderer);
    setText('gpuExtra', [vendor, gpu.exposed ? 'WEBGL RENDERER EXPOSED' : 'MASKED RENDERER'].filter(Boolean).join(' · '));
  } else {
    setText('gpuValue', 'GPU МОДЕЛЬ НЕ РАСКРЫТА');
    setText('gpuExtra', 'WEBGL ОТДАЁТ ОБЩЕЕ ИМЯ ИЛИ БРАУЗЕР ОГРАНИЧИЛ ДОСТУП');
  }
}

function setCountdown(positionMs) {
  const position = Math.max(0, Math.min(DROP_AT_MS, Number(positionMs) || 0));
  const number = position >= DROP_AT_MS ? '0' : String(Math.max(1, Math.ceil(COUNTDOWN_STEPS * (1 - position / DROP_AT_MS))));
  const numberNode = $('countdownNumber');
  const progress = $('countdownProgress');
  if (numberNode && number !== lastCountdownNumber) {
    numberNode.textContent = number;
    numberNode.classList.remove('countdown-tick');
    void numberNode.offsetWidth;
    numberNode.classList.add('countdown-tick');
    lastCountdownNumber = number;
  }
  if (progress) progress.style.transform = `scaleX(${position / DROP_AT_MS})`;
}

function setAudioState(value) {
  setText('audioState', value);
}

function failAudio() {
  if (!started || dropReached || failureShown) return;
  failureShown = true;
  if (playbackWatchdog) window.clearTimeout(playbackWatchdog);
  document.body.classList.remove('awaiting-drop');
  document.body.classList.add('audio-failed');
  failScreen.hidden = false;
  setAudioState('LOCAL AUDIO NOT PLAYING');
}

function playSelectedTrack() {
  if (!started || !siteTrack || isPlaying) return;
  try {
    siteTrack.muted = muted;
    siteTrack.volume = 1;
    setAudioState('LOCAL TRACK / STARTING');
    const playPromise = siteTrack.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error) => {
        console.warn('Local track could not be played', error);
        failAudio();
      });
    }
  } catch (error) {
    console.warn('Local track playback failed', error);
    failAudio();
  }
}

function kickPulse() {
  document.body.classList.remove('beat-hit');
  void document.body.offsetWidth;
  document.body.classList.add('beat-hit');
  window.setTimeout(() => document.body.classList.remove('beat-hit'), 140);
}

function trackRhythm() {
  if (!started || !isPlaying || !siteTrack) return;
  const positionMs = siteTrack.currentTime * 1000;
  if (!dropReached) {
    setCountdown(positionMs);
    queueDropAtPosition(positionMs);
  }
  processTrackTimeline(positionMs);
  pulseFrame = requestAnimationFrame(trackRhythm);
}

function queueDropAtPosition(positionMs) {
  if (dropReached || dropPending || positionMs < DROP_AT_MS) return;
  dropPending = true;
  setCountdown(DROP_AT_MS);
  document.body.classList.add('countdown-zero');
  revealOnDrop();
}

function processTrackTimeline(positionMs) {
  let mappedBeatProcessed = false;
  while (nextTrackBeatIndex < TRACK_BEAT_TIMES_MS.length && TRACK_BEAT_TIMES_MS[nextTrackBeatIndex] <= positionMs) {
    const beatMs = TRACK_BEAT_TIMES_MS[nextTrackBeatIndex];
    nextTrackBeatIndex += 1;
    if (positionMs - beatMs > STALE_BEAT_TOLERANCE_MS) continue;
    if (!dropReached) continue;
    mappedBeatProcessed = true;
    kickPulse();
    if (beatMs >= DROP_AT_MS) revealNextItem();
    fallbackNextRevealAtMs = positionMs + REVEAL_FALLBACK_MS;
  }

  if (dropReached && nextRevealIndex < revealItems.length && !mappedBeatProcessed && positionMs >= fallbackNextRevealAtMs) {
    kickPulse();
    revealNextItem();
    fallbackNextRevealAtMs = positionMs + REVEAL_FALLBACK_STEP_MS;
  }
}

function revealOnDrop() {
  if (dropReached) return;
  dropReached = true;
  dropPending = false;
  if (dropTimer) window.clearTimeout(dropTimer);
  document.body.classList.remove('awaiting-drop', 'countdown-zero');
  document.body.classList.add('drop-activated');
  setAudioState('DROP / AUDIO-REACTIVE REVEAL');
  kickPulse();
  fallbackNextRevealAtMs = (siteTrack ? siteTrack.currentTime * 1000 : DROP_AT_MS) + REVEAL_FALLBACK_MS;
  scheduleReveal();
}

function scheduleReveal() {
  revealItems = [...document.querySelectorAll('#result [data-step]')]
    .sort((a, b) => Number(a.dataset.step) - Number(b.dataset.step));
  nextRevealIndex = 0;
}

function revealNextItem() {
  if (!dropReached || nextRevealIndex >= revealItems.length) return;
  const item = revealItems[nextRevealIndex];
  nextRevealIndex += 1;
  item.classList.add('is-visible');
  if (nextRevealIndex % 2 === 1 || nextRevealIndex === revealItems.length) {
    document.querySelectorAll('.camera-focus').forEach((node) => node.classList.remove('camera-focus'));
    item.classList.add('camera-focus');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    item.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
  }
}

async function showReport() {
  if (started) return;

  // V17: страховка на случай, если кто-то снял hidden у кнопки через F12.
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const s = await res.json();
    if (!s.authenticated) {
      window.location.href = '/api/discord-login';
      return;
    }
  } catch (e) {
    console.warn('Session verify failed', e);
    return;
  }

  started = true;
  document.body.classList.add('scanning', 'awaiting-drop');
  lastCountdownNumber = '13';
  setCountdown(0);
  landing.classList.add('leaving');
  result.classList.add('is-active');
  result.setAttribute('aria-hidden', 'false');
  topRight.hidden = false;
  fillLocalInfo();
  loadIpInfo();
  playSelectedTrack();
  playbackWatchdog = window.setTimeout(() => {
    if (started && !isPlaying && !dropReached) failAudio();
  }, 18000);
  window.setTimeout(() => {
    landing.classList.add('gone');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, 500);
}

function restart() {
  revealTimers.forEach(window.clearTimeout);
  revealTimers = [];
  if (playbackWatchdog) window.clearTimeout(playbackWatchdog);
  if (dropTimer) window.clearTimeout(dropTimer);
  cancelAnimationFrame(pulseFrame);
  if (siteTrack) {
    try { siteTrack.pause(); } catch { /* noop */ }
  }
  window.location.reload();
}

// ===== V17: Discord auth gate =====
const authGate = document.getElementById('authGate');
const authBtn = document.getElementById('authBtn');
const authUser = document.getElementById('authUser');
const authAvatar = document.getElementById('authAvatar');
const authName = document.getElementById('authName');
const authTag = document.getElementById('authTag');

async function checkSession() {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated && data.user) {
      authUser.hidden = false;
      authAvatar.src = data.user.avatar || '';
      authAvatar.alt = data.user.username || '';
      authName.textContent = data.user.global_name || data.user.username || '—';
      authTag.textContent = '@' + (data.user.username || '—') + ' · ' + data.user.id;
      if (authBtn) authBtn.hidden = true;
      startButton.hidden = false;
    } else {
      authUser.hidden = true;
      if (authBtn) authBtn.hidden = false;
      startButton.hidden = true;
    }
  } catch (e) {
    console.warn('Session check failed', e);
    authUser.hidden = true;
    if (authBtn) authBtn.hidden = false;
    startButton.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', checkSession);

startButton.addEventListener('click', showReport);
soundToggle.addEventListener('click', () => {
  muted = !muted;
  soundToggle.classList.toggle('is-muted', muted);
  soundToggle.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  if (siteTrack) siteTrack.muted = muted;
});
$('restart').addEventListener('click', restart);
$('retryButton').addEventListener('click', () => window.location.reload());
window.addEventListener('online', () => setText('basicStatusValue', `ONLINE · ${navigator.cookieEnabled ? 'COOKIES ON' : 'COOKIES OFF'} · ${location.protocol === 'https:' ? 'HTTPS ON' : 'HTTPS OFF'}`));
window.addEventListener('offline', () => setText('basicStatusValue', `OFFLINE · ${navigator.cookieEnabled ? 'COOKIES ON' : 'COOKIES OFF'}`));

if (siteTrack) {
  siteTrack.addEventListener('play', () => {
    isPlaying = true;
    failureShown = false;
    document.body.classList.add('sound-playing');
    setAudioState('LOCAL TRACK / PLAYING');
    nextTrackBeatIndex = TRACK_BEAT_TIMES_MS.findIndex((beatMs) => beatMs > siteTrack.currentTime * 1000);
    if (nextTrackBeatIndex < 0) nextTrackBeatIndex = TRACK_BEAT_TIMES_MS.length;
    cancelAnimationFrame(pulseFrame);
    pulseFrame = requestAnimationFrame(trackRhythm);
    if (playbackWatchdog) window.clearTimeout(playbackWatchdog);
  });
  siteTrack.addEventListener('pause', () => {
    isPlaying = false;
    document.body.classList.remove('sound-playing');
    cancelAnimationFrame(pulseFrame);
    if (started && !dropReached && !siteTrack.ended) failAudio();
  });
  siteTrack.addEventListener('error', () => failAudio());
  siteTrack.addEventListener('ended', () => {
    isPlaying = false;
    cancelAnimationFrame(pulseFrame);
    if (!dropReached) failAudio();
  });
}