/**
 * Coimbra Pocket — Core Application Logic
 * Zero-cost PWA for GitHub Pages using Leaflet + CartoDB Tiles
 */

const CONFIG = {
  center: [40.2085, -8.4265], // Baixa de Coimbra
  defaultZoom: 15,
  maxZoom: 19,
  walkingSpeedMetersPerMin: 75, // Adjusted for Coimbra's hills (~4.5 km/h)
  enableMonetizationBar: true,  // Toggle false to hide bottom partner bar
  reportEmail: 'coimbrapocket@example.com', // Replace with your email or Google Form URL
  tiles: {
    light: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
  }
};

const I18N = {
  en: {
    nearestBtn: 'Nearest',
    locateMe: 'Locate Me',
    catAll: 'All',
    catWc: 'WC / Toilets',
    catWater: 'Water',
    catRest: 'Rest & Shade',
    catLockers: 'Lockers',
    catUphill: 'Uphill Help',
    accessFree: 'Free',
    accessCustomers: 'Customers',
    accessPaid: 'Paid',
    directionsBtn: 'Directions (Walk)',
    bookBtn: 'Reserve / Info',
    reportIssue: 'Report error / Out of order',
    enableGps: 'Tap "Locate Me" for walking time',
    away: 'away',
    minWalk: 'min walk',
    locating: 'Finding your location...',
    gpsDenied: 'Location access denied. Showing city center.',
    gpsFound: 'Location updated',
    partnerBadge: 'PARTNER',
    partnerText: 'Hands-free Coimbra: Luggage storage near stations from €3.50/day →'
  },
  pt: {
    nearestBtn: 'Mais Perto',
    locateMe: 'Onde Estou',
    catAll: 'Todos',
    catWc: 'WC / Casas de Banho',
    catWater: 'Bebedouros',
    catRest: 'Descanso & Sombra',
    catLockers: 'Bagagem',
    catUphill: 'Poupar Pernas',
    accessFree: 'Gratuito',
    accessCustomers: 'Clientes',
    accessPaid: 'Pago',
    directionsBtn: 'Como Chegar (A Pé)',
    bookBtn: 'Reservar / Info',
    reportIssue: 'Reportar erro / Avariado',
    enableGps: 'Ative "Onde Estou" para ver a distância',
    away: 'de distância',
    minWalk: 'min a pé',
    locating: 'A obter localização...',
    gpsDenied: 'Localização bloqueada. A mostrar centro.',
    gpsFound: 'Localização atualizada',
    partnerBadge: 'PARCEIRO',
    partnerText: 'Visite sem peso: Cacifos junto às estações desde 3,50€/dia →'
  }
};

const CATEGORY_ICONS = {
  wc: '🚻',
  water: '💧',
  rest: '🌳',
  lockers: '🧳',
  uphill: '🛗'
};

// Application State
const state = {
  lang: 'en', // Opens in English by default for tourists
  theme: 'light',
  activeCategory: 'all',
  points: [],
  userCoords: null, // { lat, lng }
  selectedPoint: null,
  map: null,
  tileLayer: null,
  markersLayer: null,
  userMarker: null
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initMonetization();
  initMap();
  bindEvents();
  await loadPoints();
  applyTranslations();
  renderMarkers();
  registerServiceWorker();
});

// 1. Theme Handling (Auto-detects OS preference, allows manual override)
function initTheme() {
  const savedTheme = localStorage.getItem('cp_theme');
  if (savedTheme) {
    state.theme = savedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    state.theme = 'dark';
  }
  applyTheme(state.theme);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cp_theme', theme);

  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon = document.getElementById('theme-icon-sun');
  if (theme === 'dark') {
    moonIcon.classList.add('hidden');
    sunIcon.classList.remove('hidden');
  } else {
    moonIcon.classList.remove('hidden');
    sunIcon.classList.add('hidden');
  }

  if (state.map && state.tileLayer) {
    state.tileLayer.setUrl(CONFIG.tiles[theme]);
  }
}

// 2. Monetization Bar Toggle
function initMonetization() {
  const bar = document.getElementById('monetization-bar');
  if (!CONFIG.enableMonetizationBar && bar) {
    bar.classList.add('hidden');
  }
}

// 3. Leaflet Map Setup
function initMap() {
  state.map = L.map('map', {
    center: CONFIG.center,
    zoom: CONFIG.defaultZoom,
    zoomControl: false
  });

  state.tileLayer = L.tileLayer(CONFIG.tiles[state.theme], {
    attribution: CONFIG.tiles.attribution,
    maxZoom: CONFIG.maxZoom
  }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);

  // Close detail card when tapping empty map area
  state.map.on('click', () => {
    closeDetailSheet();
  });
}

// 4. Load Data from pontos.json
async function loadPoints() {
  try {
    const response = await fetch('pontos.json');
    if (!response.ok) throw new Error('Failed to load pontos.json');
    state.points = await response.json();
  } catch (err) {
    console.error('Error loading points:', err);
    showToast('Offline mode: check connection');
  }
}

// 5. Render Pins on Map
function renderMarkers() {
  state.markersLayer.clearLayers();

  const filtered = state.points.filter(p =>
    state.activeCategory === 'all' || p.category === state.activeCategory
  );

  filtered.forEach(point => {
    const pinClass = getPinColorClass(point.access);
    const emoji = CATEGORY_ICONS[point.category] || '📍';

    const icon = L.divIcon({
      className: '',
      html: `<div class="custom-pin ${pinClass}"><span>${emoji}</span></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    });

    const marker = L.marker([point.lat, point.lng], { icon });
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openDetailSheet(point);
    });

    marker.addTo(state.markersLayer);
  });
}

function getPinColorClass(access) {
  if (access === 'free') return 'pin-free';
  if (access === 'customers') return 'pin-customers';
  if (access === 'paid') return 'pin-paid';
  return 'pin-default';
}

// 6. Geolocation & Haversine Distance Calculation
function locateUser() {
  if (!navigator.geolocation) {
    showToast(I18N[state.lang].gpsDenied);
    return;
  }

  showToast(I18N[state.lang].locating);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      updateUserMarker();
      state.map.flyTo([state.userCoords.lat, state.userCoords.lng], 16, { duration: 0.8 });
      showToast(I18N[state.lang].gpsFound);

      // Refresh open sheet distance if currently visible
      if (state.selectedPoint) {
        openDetailSheet(state.selectedPoint);
      }
    },
    () => {
      showToast(I18N[state.lang].gpsDenied);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

function updateUserMarker() {
  if (!state.userCoords) return;

  if (state.userMarker) {
    state.userMarker.setLatLng([state.userCoords.lat, state.userCoords.lng]);
  } else {
    const userIcon = L.divIcon({
      className: '',
      html: '<div class="user-pulse"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    state.userMarker = L.marker([state.userCoords.lat, state.userCoords.lng], {
      icon: userIcon,
      zIndexOffset: 1000
    }).addTo(state.map);
  }
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatDistanceLabel(point) {
  const dict = I18N[state.lang];
  if (!state.userCoords) {
    return `📍 ${dict.enableGps}`;
  }

  const meters = calculateDistanceMeters(
    state.userCoords.lat,
    state.userCoords.lng,
    point.lat,
    point.lng
  );

  // Add ~20% street winding factor for realistic urban walking distance
  const realisticMeters = Math.round(meters * 1.2);
  const mins = Math.max(1, Math.round(realisticMeters / CONFIG.walkingSpeedMetersPerMin));
  const distStr = realisticMeters >= 1000
    ? `${(realisticMeters / 1000).toFixed(1)} km`
    : `${realisticMeters} m`;

  return `🚶 ${mins} ${dict.minWalk} (${distStr})`;
}

// 7. Find Nearest Point in Active Category
function findNearestPoint() {
  const refCoords = state.userCoords || { lat: CONFIG.center[0], lng: CONFIG.center[1] };

  if (!state.userCoords) {
    locateUser();
  }

  const candidates = state.points.filter(p =>
    state.activeCategory === 'all' || p.category === state.activeCategory
  );

  if (!candidates.length) return;

  let nearest = candidates[0];
  let minDist = Infinity;

  candidates.forEach(p => {
    const d = calculateDistanceMeters(refCoords.lat, refCoords.lng, p.lat, p.lng);
    if (d < minDist) {
      minDist = d;
      nearest = p;
    }
  });

  state.map.flyTo([nearest.lat, nearest.lng], 17, { duration: 0.8 });
  openDetailSheet(nearest);
}

// 8. Bottom Sheet Detail Card
function openDetailSheet(point) {
  state.selectedPoint = point;
  const dict = I18N[state.lang];
  const sheet = document.getElementById('detail-sheet');

  // Category Badge
  const catMap = {
    wc: dict.catWc,
    water: dict.catWater,
    rest: dict.catRest,
    lockers: dict.catLockers,
    uphill: dict.catUphill
  };
  document.getElementById('sheet-category').textContent = catMap[point.category] || point.category;

  // Access Badge (Free / Customers / Paid)
  const accessBadge = document.getElementById('sheet-access');
  accessBadge.className = 'badge';
  if (point.access === 'free') {
    accessBadge.classList.add('badge-free');
    accessBadge.textContent = dict.accessFree;
  } else if (point.access === 'customers') {
    accessBadge.classList.add('badge-customers');
    accessBadge.textContent = dict.accessCustomers;
  } else {
    accessBadge.classList.add('badge-paid');
    accessBadge.textContent = dict.accessPaid;
  }

  // Title, Distance, Hours, Note
  document.getElementById('sheet-title').textContent = point.name[state.lang];
  document.getElementById('sheet-distance').textContent = formatDistanceLabel(point);
  document.getElementById('sheet-hours').textContent = point.hours ? `🕒 ${point.hours}` : '';
  document.getElementById('sheet-note').textContent = point.note[state.lang];

  // Universal Walking Directions URL (Opens Apple Maps on iOS or Google Maps on Android/Web)
  const dirBtn = document.getElementById('sheet-directions');
  dirBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=walking`;

  // Optional Affiliate / Booking Button (e.g., for Lockers)
  const affBtn = document.getElementById('sheet-affiliate');
  if (point.affiliateUrl) {
    affBtn.href = point.affiliateUrl;
    affBtn.classList.remove('hidden');
  } else {
    affBtn.classList.add('hidden');
  }

  // Discreet Report Issue Mailto Link
  const reportLink = document.getElementById('sheet-report');
  const subject = encodeURIComponent(`[Coimbra Pocket] Issue with: ${point.name.en} (${point.id})`);
  reportLink.href = `mailto:${CONFIG.reportEmail}?subject=${subject}`;

  sheet.classList.remove('hidden');
}

function closeDetailSheet() {
  state.selectedPoint = null;
  document.getElementById('detail-sheet').classList.add('hidden');
}

// 9. Bilingual UI Switcher (EN / PT)
function applyTranslations() {
  const dict = I18N[state.lang];
  document.documentElement.lang = state.lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  const langBtn = document.getElementById('lang-toggle');
  langBtn.textContent = state.lang === 'en' ? 'EN | PT' : 'PT | EN';

  if (state.selectedPoint) {
    openDetailSheet(state.selectedPoint);
  }
}

// 10. Event Listeners
function bindEvents() {
  // Language Toggle
  document.getElementById('lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'pt' : 'en';
    applyTranslations();
  });

  // Theme Toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });

  // Locate Me
  document.getElementById('locate-btn').addEventListener('click', locateUser);

  // Nearest Point
  document.getElementById('nearest-btn').addEventListener('click', findNearestPoint);

  // Category Filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeCategory = chip.getAttribute('data-category');
      closeDetailSheet();
      renderMarkers();
    });
  });

  // Close Bottom Sheet
  document.getElementById('sheet-close-btn').addEventListener('click', closeDetailSheet);
  document.getElementById('sheet-close-area').addEventListener('click', closeDetailSheet);
}

// Toast Helper
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }
}
