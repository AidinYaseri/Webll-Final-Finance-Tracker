'use strict';

// ── Constants ──────────────────────────────────────────────────
const STORAGE_KEY = 'sales-map-v1';

const STATUS = {
  red:    { color: '#ef4444', label: 'Not Interested' },
  yellow: { color: '#f59e0b', label: 'Considering'    },
  green:  { color: '#22c55e', label: 'Sale!'           },
};

// ── Data helpers ───────────────────────────────────────────────
function loadHouses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveHouses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(houses));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── State ──────────────────────────────────────────────────────
let map;
let houses        = loadHouses();
let markers       = {};      // id → Leaflet marker
let pendingLatLng = null;    // location for a new pin
let editingId     = null;    // id of pin being edited
let undoStack     = [];      // stack of { type, payload } for undo

// ── DOM refs ───────────────────────────────────────────────────
const overlay    = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const deleteBtn  = document.getElementById('delete-btn');
const cancelBtn  = document.getElementById('cancel-btn');
const locateBtn  = document.getElementById('locate-btn');
const undoBtn    = document.getElementById('undo-btn');
const addHereBtn = document.getElementById('add-here-btn');
const toast      = document.getElementById('toast');

let toastTimer;

function showToast(msg, duration = 2000) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ── Marker creation ────────────────────────────────────────────
function markerIcon(status, pulse = false) {
  const { color } = STATUS[status];
  return L.divIcon({
    html: `<div class="pin-inner${pulse ? ' marker-pulse' : ''}" style="
      width: 26px; height: 26px;
      background: ${color};
      border: 3px solid rgba(255,255,255,0.9);
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    "></div>`,
    className: 'house-marker',
    iconSize:    [26, 26],
    iconAnchor:  [13, 13],
    popupAnchor: [0, -18],
  });
}

function addMarkerToMap(house, pulse = false) {
  const m = L.marker([house.lat, house.lng], { icon: markerIcon(house.status, pulse) })
    .addTo(map);

  m.on('click', e => {
    e.originalEvent?.stopPropagation();
    openEditModal(house.id);
  });

  markers[house.id] = m;
}

function refreshMarkerIcon(id) {
  const house = houses.find(h => h.id === id);
  if (house && markers[id]) markers[id].setIcon(markerIcon(house.status));
}

function removeMarkerFromMap(id) {
  if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
}

// ── Map init ───────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: false });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 20,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Default view; will be overridden if geolocation succeeds
  map.setView([37.7749, -122.4194], 16);

  // Tap on empty map → add a new house there
  map.on('click', e => {
    // Ignore if we just tapped a marker (marker click fires first + stops propagation)
    openAddModal(e.latlng);
  });

  houses.forEach(h => addMarkerToMap(h));
  gotoMyLocation(false);
}

// ── Geolocation ────────────────────────────────────────────────
let watchId = null;
let myDot   = null;

function gotoMyLocation(animate = true) {
  if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      map.setView([lat, lng], animate ? map.getZoom() : 17, { animate });
      updateMyDot(lat, lng, accuracy);
    },
    () => showToast('Could not get location'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function updateMyDot(lat, lng, accuracy) {
  if (!myDot) {
    myDot = L.layerGroup().addTo(map);
  } else {
    myDot.clearLayers();
  }

  // Accuracy circle
  L.circle([lat, lng], {
    radius: accuracy,
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.08,
    weight: 1,
  }).addTo(myDot);

  // Blue dot
  L.circleMarker([lat, lng], {
    radius: 8,
    color: '#fff',
    weight: 2,
    fillColor: '#3b82f6',
    fillOpacity: 1,
  }).addTo(myDot);
}

// ── Modal ──────────────────────────────────────────────────────
function openAddModal(latlng) {
  pendingLatLng = latlng;
  editingId     = null;
  modalTitle.textContent = 'New House';
  deleteBtn.classList.add('hidden');
  overlay.classList.remove('hidden');
}

function openEditModal(id) {
  editingId     = id;
  pendingLatLng = null;
  const house   = houses.find(h => h.id === id);
  modalTitle.textContent = house ? `Update — ${STATUS[house.status].label}` : 'Update Status';
  deleteBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeModal() {
  overlay.classList.add('hidden');
  pendingLatLng = null;
  editingId     = null;
}

// ── Status selection ───────────────────────────────────────────
document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const status = btn.dataset.status;

    if (pendingLatLng) {
      const house = {
        id:        uid(),
        lat:       pendingLatLng.lat,
        lng:       pendingLatLng.lng,
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      houses.push(house);
      saveHouses();
      addMarkerToMap(house, true);
      undoStack.push({ type: 'add', id: house.id });
      undoBtn.disabled = false;
      showToast(`Pinned as "${STATUS[status].label}"`);
    } else if (editingId) {
      const house = houses.find(h => h.id === editingId);
      if (house) {
        undoStack.push({ type: 'edit', id: house.id, prev: house.status });
        house.status    = status;
        house.updatedAt = Date.now();
        saveHouses();
        refreshMarkerIcon(editingId);
        undoBtn.disabled = false;
        showToast(`Updated to "${STATUS[status].label}"`);
      }
    }

    updateStats();
    closeModal();
  });
});

// ── Delete ─────────────────────────────────────────────────────
deleteBtn.addEventListener('click', () => {
  if (!editingId) return;
  const house = houses.find(h => h.id === editingId);
  if (house) {
    undoStack.push({ type: 'delete', house: { ...house } });
    houses        = houses.filter(h => h.id !== editingId);
    saveHouses();
    removeMarkerFromMap(editingId);
    undoBtn.disabled = false;
    showToast('Pin removed');
    updateStats();
  }
  closeModal();
});

// ── Undo ───────────────────────────────────────────────────────
undoBtn.addEventListener('click', () => {
  const action = undoStack.pop();
  if (!action) return;
  undoBtn.disabled = undoStack.length === 0;

  if (action.type === 'add') {
    houses = houses.filter(h => h.id !== action.id);
    saveHouses();
    removeMarkerFromMap(action.id);
    showToast('Undo: pin removed');
  } else if (action.type === 'edit') {
    const house = houses.find(h => h.id === action.id);
    if (house) {
      house.status    = action.prev;
      house.updatedAt = Date.now();
      saveHouses();
      refreshMarkerIcon(action.id);
      showToast('Undo: status reverted');
    }
  } else if (action.type === 'delete') {
    houses.push(action.house);
    saveHouses();
    addMarkerToMap(action.house, true);
    showToast('Undo: pin restored');
  }

  updateStats();
});

// ── Add at GPS location ────────────────────────────────────────
addHereBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported — tap the map instead');
    return;
  }
  addHereBtn.disabled = true;
  addHereBtn.querySelector('span').textContent = 'Getting location…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      addHereBtn.disabled = false;
      addHereBtn.querySelector('span').textContent = '+ Add House Here';
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.panTo(latlng);
      openAddModal(latlng);
    },
    () => {
      addHereBtn.disabled = false;
      addHereBtn.querySelector('span').textContent = '+ Add House Here';
      showToast('Could not get location — tap the map to pin manually');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

// ── Locate button ──────────────────────────────────────────────
locateBtn.addEventListener('click', () => gotoMyLocation(true));

// ── Cancel / close overlay ─────────────────────────────────────
cancelBtn.addEventListener('click', closeModal);

overlay.addEventListener('click', e => {
  if (e.target === overlay) closeModal();
});

// Swipe down to dismiss
let touchStartY = 0;
document.getElementById('modal').addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.getElementById('modal').addEventListener('touchend', e => {
  if (e.changedTouches[0].clientY - touchStartY > 60) closeModal();
}, { passive: true });

// ── Stats ──────────────────────────────────────────────────────
function updateStats() {
  const counts = { red: 0, yellow: 0, green: 0 };
  houses.forEach(h => counts[h.status]++);
  document.getElementById('red-count').textContent    = counts.red;
  document.getElementById('yellow-count').textContent = counts.yellow;
  document.getElementById('green-count').textContent  = counts.green;
  document.getElementById('total-count').textContent  = houses.length;
}

// ── Service worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  updateStats();
  undoBtn.disabled = undoStack.length === 0;
});
