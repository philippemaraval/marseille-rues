// ------------------------
// Paramètres du jeu
// ------------------------

const SESSION_SIZE = 20; // 20 rues par session

// ------------------------
// Variables globales
// ------------------------

let map = null;

// Données et couches
let streetsLayer = null;
let allStreetFeatures = [];       // toutes les rues utilisables
let streetLayersById = new Map(); // _gameId -> layer Leaflet

// Session en cours
let sessionStreets = [];  // liste des 20 rues de la session
let currentIndex = 0;     // index dans sessionStreets
let currentTarget = null; // feature courante

// Timers
let sessionStartTime = null; // timestamp début de session (ms)
let streetStartTime = null;  // timestamp début de la rue courante (ms)

// Score & récapitulatif
let correctCount = 0;
let totalAnswered = 0;  // nombre de réponses données (20 max)
let summaryData = [];   // [{ name, correct, time }]

// Surbrillance
let highlightTimeoutId = null;

// ------------------------
// Initialisation
// ------------------------

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUI();
  startTimersLoop(); // met à jour les chronos en continu
  loadStreets();     // charge le GeoJSON (mais ne démarre PAS la session)
});

// Initialise la carte centrée sur Marseille
function initMap() {
  map = L.map('map').setView([43.2965, 5.37], 13);

  // Fond de carte lisible, sans libellés (CARTO Positron no-labels)
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  ).addTo(map);
}

// Initialise l'interface (bouton, etc.)
function initUI() {
  const restartBtn = document.getElementById('restart-btn');
  restartBtn.addEventListener('click', () => {
    startNewSession();
  });

  document.getElementById('target-street').textContent = '';
  updateScoreUI();
  updateTimeUI(0, 0);
  document.getElementById('message').textContent =
    'Cliquez sur "Commencer la session" une fois que la carte est chargée.';
  document.getElementById('summary').classList.add('hidden');
}

// Boucle d'animation pour mettre à jour les chronomètres
function startTimersLoop() {
  function loop() {
    if (sessionStartTime !== null && streetStartTime !== null && currentTarget) {
      const now = performance.now();
      const totalTimeSec = (now - sessionStartTime) / 1000;
      const streetTimeSec = (now - streetStartTime) / 1000;
      updateTimeUI(totalTimeSec, streetTimeSec);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ------------------------
// Chargement des rues
// ------------------------

function loadStreets() {
  fetch('data/marseille_rues.geojson')
    .then(response => {
      if (!response.ok) {
        throw new Error('Erreur HTTP ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      const features = data.features || [];

      // on garde seulement les rues avec un nom
      const filtered = [];
      features.forEach(f => {
        if (f.properties && typeof f.properties.name === 'string' && f.properties.name.trim() !== '') {
          f.properties.name = f.properties.name.trim();
          filtered.push(f);
        }
      });

      allStreetFeatures = filtered;
      console.log('Nombre de rues chargées :', allStreetFeatures.length);

      // création du layer GeoJSON avec index interne _gameId
      streetLayersById.clear();
      let idCounter = 0;

      streetsLayer = L.geoJSON(allStreetFeatures, {
        style: {
          color: '#555',
          weight: 3
        },
        onEachFeature: (feature, layer) => {
          feature._gameId = idCounter++;
          streetLayersById.set(feature._gameId, layer);
          layer.feature = feature;

          layer.on('click', () => handleStreetClick(feature));
        }
      }).addTo(map);

      // On ne démarre plus automatiquement la session.
      document.getElementById('message').textContent =
        'Carte chargée. Cliquez sur "Commencer la session".';
    })
    .catch(err => {
      console.error('Erreur lors du chargement des rues :', err);
      document.getElementById('message').textContent =
        'Erreur de chargement des rues (voir console).';
    });
}

// ------------------------
// Gestion de session
// ------------------------

function startNewSession() {
  if (allStreetFeatures.length === 0) {
    console.warn('Impossible de démarrer une session : pas de rues chargées.');
    return;
  }

  clearHighlight();

  // Réinitialisation des compteurs
  correctCount = 0;
  totalAnswered = 0;
  summaryData = [];
  updateScoreUI();
  updateTimeUI(0, 0);
  document.getElementById('message').textContent = '';
  document.getElementById('summary').classList.add('hidden');

  // Tirage aléatoire de SESSION_SIZE rues
  sessionStreets = sampleWithoutReplacement(allStreetFeatures, SESSION_SIZE);
  currentIndex = 0;

  // Démarrage des timers
  sessionStartTime = performance.now();
  currentTarget = null;
  streetStartTime = null;

  setNewTarget();
}

// Tirage sans remise
function sampleWithoutReplacement(array, n) {
  const indices = Array.from(array.keys());
  shuffle(indices);
  const selected = indices.slice(0, n).map(i => array[i]);
  return selected;
}

// Mélange en place
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Sélectionne la rue cible suivante
function setNewTarget() {
  if (currentIndex >= sessionStreets.length) {
    endSession();
    return;
  }

  currentTarget = sessionStreets[currentIndex];
  streetStartTime = performance.now();

  const targetName = currentTarget.properties.name;
  document.getElementById('target-street').textContent = targetName;
}

// ------------------------
// Gestion des clics sur les rues
// ------------------------

function handleStreetClick(clickedFeature) {
  if (!currentTarget || sessionStartTime === null || streetStartTime === null) {
    return;
  }

  const now = performance.now();
  const streetTimeSec = (now - streetStartTime) / 1000;

  const isCorrect = (clickedFeature._gameId === currentTarget._gameId);

  if (isCorrect) {
    correctCount += 1;
    document.getElementById('message').textContent =
      `Correct (${streetTimeSec.toFixed(1)} s)`;
  } else {
    document.getElementById('message').textContent = 'Incorrect';
    highlightCorrectStreet();
  }

  totalAnswered += 1;

  summaryData.push({
    name: currentTarget.properties.name,
    correct: isCorrect,
    time: streetTimeSec.toFixed(1)
  });

  updateScoreUI();

  // Rue suivante
  currentIndex += 1;
  setNewTarget();
}

// ------------------------
// Surbrillance de la rue correcte
// ------------------------

function highlightCorrectStreet() {
  clearHighlight();
  if (!currentTarget) return;

  const id = currentTarget._gameId;
  const layer = streetLayersById.get(id);
  if (!layer) return;

  // style surligné
  layer.setStyle({ color: '#d00', weight: 6 });

  highlightTimeoutId = setTimeout(() => {
    // retour au style normal
    layer.setStyle({ color: '#555', weight: 3 });
    highlightTimeoutId = null;
  }, 2000); // 2 secondes
}

function clearHighlight() {
  if (highlightTimeoutId !== null) {
    clearTimeout(highlightTimeoutId);
    highlightTimeoutId = null;
  }
}

// ------------------------
// Fin de session & récapitulatif
// ------------------------

function endSession() {
  const now = performance.now();
  const totalTimeSec = sessionStartTime ? (now - sessionStartTime) / 1000 : 0;

  // Arrêt définitif des chronos pour la session courante
  sessionStartTime = null;
  streetStartTime = null;
  currentTarget = null;

  const total = summaryData.length;
  const nbCorrect = summaryData.filter(r => r.correct).length;
  const percent = total === 0 ? 0 : Math.round((nbCorrect / total) * 100);

  const avgTime = total === 0
    ? 0
    : summaryData.reduce((acc, r) => acc + parseFloat(r.time), 0) / total;

  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Récapitulatif de la session';
  summaryEl.appendChild(title);

  const stats = document.createElement('div');
  stats.innerHTML =
    `<p>Temps total : <strong>${totalTimeSec.toFixed(1)} s</strong></p>
     <p>Temps moyen par rue : <strong>${avgTime.toFixed(1)} s</strong></p>
     <p>Score : <strong>${percent} %</strong> (${nbCorrect} bonnes réponses / ${total})</p>`;
  summaryEl.appendChild(stats);

  const listTitle = document.createElement('h3');
  listTitle.textContent = 'Détail par rue';
  summaryEl.appendChild(listTitle);

  const list = document.createElement('ul');
  summaryData.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.name} – ${r.correct ? 'Correct' : 'Incorrect'} – ${r.time} s`;
    list.appendChild(li);
  });
  summaryEl.appendChild(list);

  summaryEl.classList.remove('hidden');
  document.getElementById('message').textContent = 'Session terminée.';
  document.getElementById('target-street').textContent = '';
}

// ------------------------
// Mise à jour de l'UI (score, temps)
// ------------------------

function updateScoreUI() {
  const scoreEl = document.getElementById('score');
  if (totalAnswered === 0) {
    scoreEl.textContent = '0 / 0 (0 %)';
    return;
  }
  const percent = Math.round((correctCount / totalAnswered) * 100);
  scoreEl.textContent = `${correctCount} / ${totalAnswered} (${percent} %)`;
}

function updateTimeUI(totalTimeSec, streetTimeSec) {
  const totalEl = document.getElementById('total-time');
  const streetEl = document.getElementById('street-time');

  totalEl.textContent = totalTimeSec.toFixed(1) + ' s';
  streetEl.textContent = streetTimeSec.toFixed(1) + ' s';
}