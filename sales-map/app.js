import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ── Firebase setup ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyAhdX-_aKqXwdHHAiWqzwYcuN09oKkESg4',
  authDomain:        'aeas-a2d06.firebaseapp.com',
  projectId:         'aeas-a2d06',
  storageBucket:     'aeas-a2d06.firebasestorage.app',
  messagingSenderId: '620050893865',
  appId:             '1:620050893865:web:aa11d5d054c9c6e8b6a038',
};

const fbApp   = initializeApp(firebaseConfig);
const db      = initializeFirestore(fbApp, { localCache: persistentLocalCache() });
const pinsRef = collection(db, 'pins');

// ── Constants ──────────────────────────────────────────────────
const STATUS = {
  red:    { color: '#ef4444', label: 'Not Interested' },
  yellow: { color: '#f59e0b', label: 'Considering'    },
  green:  { color: '#22c55e', label: 'Sale!'           },
};

// ── State ──────────────────────────────────────────────────────
let map;
let houses        = [];       // kept in sync with Firestore via onSnapshot
let markers       = {};       // firestoreId → Leaflet marker
let pendingLatLng = null;
let editingId     = null;
let undoStack     = [];

// ── DOM refs ───────────────────────────────────────────────────
const overlay    = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const deleteBtn  = document.getElementById('delete-btn');
const cancelBtn  = document.getElementById('cancel-btn');
const locateBtn  = document.getElementById('locate-btn');
const undoBtn    = document.getElementById('undo-btn');
const addHereBtn = document.getElementById('add-here-btn');
const toast      = document.getElementById('toast');
const syncBadge  = document.getElementById('sync-badge');

// ── Toast ──────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2200) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ── Sync badge ─────────────────────────────────────────────────
function setSyncStatus(status) {
  syncBadge.className = `sync-${status}`;
  syncBadge.title = { online: 'Synced', offline: 'Offline — changes will sync when reconnected', connecting: 'Connecting…' }[status];
}

window.addEventListener('online',  () => setSyncStatus('online'));
window.addEventListener('offline', () => setSyncStatus('offline'));

// ── Marker creation ────────────────────────────────────────────
function markerIcon(status) {
  const { color } = STATUS[status];
  return L.divIcon({
    html: `<div style="
      width:26px;height:26px;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);
    "></div>`,
    className:   'house-marker',
    iconSize:    [26, 26],
    iconAnchor:  [13, 13],
    popupAnchor: [0, -18],
  });
}

function addMarkerToMap(house) {
  if (markers[house.id]) return; // already on map
  const m = L.marker([house.lat, house.lng], { icon: markerIcon(house.status) }).addTo(map);
  m.on('click', e => { e.originalEvent?.stopPropagation(); openEditModal(house.id); });
  markers[house.id] = m;
}

function refreshMarkerIcon(id) {
  const house = houses.find(h => h.id === id);
  if (house && markers[id]) markers[id].setIcon(markerIcon(house.status));
}

function removeMarkerFromMap(id) {
  if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
}

// ── Real-time Firestore listener ───────────────────────────────
function startSync() {
  onSnapshot(
    pinsRef,
    snapshot => {
      setSyncStatus('online');
      snapshot.docChanges().forEach(change => {
        const id   = change.doc.id;
        const data = change.doc.data();

        if (change.type === 'added') {
          if (!houses.find(h => h.id === id)) houses.push({ id, ...data });
          addMarkerToMap({ id, ...data });
        } else if (change.type === 'modified') {
          const idx = houses.findIndex(h => h.id === id);
          if (idx >= 0) houses[idx] = { id, ...data };
          refreshMarkerIcon(id);
        } else if (change.type === 'removed') {
          houses = houses.filter(h => h.id !== id);
          removeMarkerFromMap(id);
        }
      });
      updateStats();
    },
    err => {
      setSyncStatus('offline');
      showToast('Sync error — check Firestore rules in Firebase console', 5000);
      console.error('Firestore onSnapshot error:', err);
    }
  );
}

// ── Map init ───────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: false });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 20,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  map.setView([37.7749, -122.4194], 16);

  map.on('click', e => openAddModal(e.latlng));

  gotoMyLocation(false);
  startSync();
}

// ── Geolocation ────────────────────────────────────────────────
let myDot = null;

function gotoMyLocation(animate = true) {
  if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      map.setView([lat, lng], animate ? map.getZoom() : 17, { animate });
      if (!myDot) myDot = L.layerGroup().addTo(map);
      else myDot.clearLayers();
      L.circle([lat, lng], { radius: accuracy, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }).addTo(myDot);
      L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(myDot);
    },
    () => showToast('Could not get location'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
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
  btn.addEventListener('click', async () => {
    const status = btn.dataset.status;

    if (pendingLatLng) {
      const newRef = doc(pinsRef);          // generate ID client-side
      await setDoc(newRef, {
        lat:       pendingLatLng.lat,
        lng:       pendingLatLng.lng,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      undoStack.push({ type: 'add', id: newRef.id });
      undoBtn.disabled = false;
      showToast(`Pinned as "${STATUS[status].label}"`);
    } else if (editingId) {
      const house = houses.find(h => h.id === editingId);
      if (house) {
        undoStack.push({ type: 'edit', id: editingId, prev: house.status });
        await updateDoc(doc(db, 'pins', editingId), { status, updatedAt: serverTimestamp() });
        undoBtn.disabled = false;
        showToast(`Updated to "${STATUS[status].label}"`);
      }
    }

    closeModal();
  });
});

// ── Delete ─────────────────────────────────────────────────────
deleteBtn.addEventListener('click', async () => {
  if (!editingId) return;
  const house = houses.find(h => h.id === editingId);
  if (house) {
    undoStack.push({ type: 'delete', house: { ...house } });
    await deleteDoc(doc(db, 'pins', editingId));
    undoBtn.disabled = false;
    showToast('Pin removed');
  }
  closeModal();
});

// ── Undo ───────────────────────────────────────────────────────
undoBtn.addEventListener('click', async () => {
  const action = undoStack.pop();
  if (!action) return;
  undoBtn.disabled = undoStack.length === 0;

  if (action.type === 'add') {
    await deleteDoc(doc(db, 'pins', action.id));
    showToast('Undo: pin removed');
  } else if (action.type === 'edit') {
    await updateDoc(doc(db, 'pins', action.id), { status: action.prev, updatedAt: serverTimestamp() });
    showToast('Undo: status reverted');
  } else if (action.type === 'delete') {
    const { id, ...data } = action.house;
    await setDoc(doc(db, 'pins', id), { ...data, updatedAt: serverTimestamp() });
    showToast('Undo: pin restored');
  }
});

// ── Add at GPS location ────────────────────────────────────────
addHereBtn.addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('Tap the map to pin manually'); return; }
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

locateBtn.addEventListener('click', () => gotoMyLocation(true));

// ── Cancel / dismiss ───────────────────────────────────────────
cancelBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

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
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Boot ───────────────────────────────────────────────────────
setSyncStatus('connecting');
initMap();
