// ------------------------
// Paramètres du jeu
// ------------------------

const SESSION_SIZE = 20;           // 20 rues par session
const MAX_ERRORS_MARATHON = 3;     // 3 erreurs max en mode "marathon"
const MAX_TIME_SECONDS = 500;      // coupe les chronos à 500 s

// ------------------------
// Variables globales
// ------------------------

let map = null;

// Données et couches
let streetsLayer = null;
let allStreetFeatures = [];          // toutes les rues utilisables
let streetLayersById = new Map();    // _gameId -> layer Leaflet

// Quartiers (polygones)
let quartierPolygonsByName = new Map(); // nom_qua -> feature GeoJSON
let quartierOverlay = null;             // couche du quartier sélectionné

// Session en cours
let sessionStreets = [];   // liste des rues de la session (sans doublons de nom)
let currentIndex = 0;      // index dans sessionStreets
let currentTarget = null;  // feature courante
let isSessionRunning = false; // état global de la session

// Timers
let sessionStartTime = null; // timestamp début de session (ms)
let streetStartTime = null;  // timestamp début de la rue courante (ms)

// Score & récapitulatif
let correctCount = 0;
let totalAnswered = 0;         // nombre de réponses données
let summaryData = [];          // [{ name, correct, time }]
let weightedScore = 0;         // score pondéré (temps)

// Erreurs en mode marathon
let errorsCount = 0;

// Surbrillance rues
let highlightTimeoutId = null;
let highlightedLayers = [];

// Messages (auto-hide)
let messageTimeoutId = null;

// ------------------------
// Initialisation
// ------------------------

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUI();
  startTimersLoop();          // met à jour les chronos en continu
  loadStreets();              // charge les rues (mais ne démarre PAS la session)
  loadQuartierPolygons();     // charge les polygones de quartiers pour l'affichage
});

// ------------------------
// Carte
// ------------------------

function initMap() {
  map = L.map('map').setView([43.2965, 5.37], 13);

  // Fond de carte (Esri World Imagery, sans labels)
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles © Esri'
    }
  ).addTo(map);
}

// ------------------------
// Interface
// ------------------------

function initUI() {
  const restartBtn = document.getElementById('restart-btn');
  const modeSelect = document.getElementById('mode-select');
  const quartierBlock = document.getElementById('quartier-block');
  const quartierSelect = document.getElementById('quartier-select');

  // Bouton start/stop
  restartBtn.addEventListener('click', () => {
    if (!isSessionRunning) {
      startNewSession();
    } else {
      stopSessionManually();
    }
  });

  // Changement de mode (ville / quartier)
  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      if (modeSelect.value === 'quartier') {
        quartierBlock.style.display = 'block';
        // si un quartier est déjà sélectionné, afficher son contour
        if (quartierSelect && quartierSelect.value) {
          highlightQuartier(quartierSelect.value);
        }
      } else {
        quartierBlock.style.display = 'none';
        clearQuartierOverlay();
      }
    });
  }

  // Changement de quartier => contour + zoom immédiats
  if (quartierSelect) {
    quartierSelect.addEventListener('change', () => {
      const mode = modeSelect ? modeSelect.value : 'ville';
      if (mode === 'quartier' && quartierSelect.value) {
        highlightQuartier(quartierSelect.value);
      } else {
        clearQuartierOverlay();
      }
    });
  }

  document.getElementById('target-street').textContent = '—';
  updateScoreUI();
  updateTimeUI(0, 0);
  updateWeightedScoreUI();
  updateStartStopButton();

  showMessage(
    'Cliquez sur "Commencer la session" une fois que la carte est chargée.',
    'info'
  );
  document.getElementById('summary').classList.add('hidden');
}

// Boucle d'animation pour les chronos
function startTimersLoop() {
  function loop() {
    if (sessionStartTime !== null && streetStartTime !== null && currentTarget) {
      const now = performance.now();
      const totalTimeSec = (now - sessionStartTime) / 1000;
      const streetTimeSec = (now - streetStartTime) / 1000;

      // arrêt automatique à 500 s
      if (totalTimeSec >= MAX_TIME_SECONDS || streetTimeSec >= MAX_TIME_SECONDS) {
        endSession();
        return;
      }

      updateTimeUI(totalTimeSec, streetTimeSec);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ------------------------
// Messages (success / error / info)
// ------------------------

function showMessage(text, type) {
  const el = document.getElementById('message');
  if (!el) return;

  // reset classes
  el.className = 'message';
  if (type === 'success') el.classList.add('message--success');
  else if (type === 'error') el.classList.add('message--error');
  else el.classList.add('message--info');

  el.textContent = text;
  el.classList.add('message--visible');

  // auto-hide après 3s
  if (messageTimeoutId !== null) {
    clearTimeout(messageTimeoutId);
  }
  messageTimeoutId = setTimeout(() => {
    el.classList.remove('message--visible');
    messageTimeoutId = null;
  }, 3000);
}

// ------------------------
// Chargement des rues
// ------------------------

function loadStreets() {
  // On utilise le GeoJSON enrichi (avec "quartier")
  fetch('data/marseille_rues_enrichi.geojson')
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
        if (
          f.properties &&
          typeof f.properties.name === 'string' &&
          f.properties.name.trim() !== ''
        ) {
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

          // clic sur n'importe quel tronçon
          layer.on('click', () => handleStreetClick(feature));
        }
      }).addTo(map);

      // Remplir la liste des quartiers disponibles
      populateQuartiers();

      showMessage(
        'Carte chargée. Choisissez la zone, le type de partie, puis cliquez sur "Commencer la session".',
        'info'
      );
    })
    .catch(err => {
      console.error('Erreur lors du chargement des rues :', err);
      showMessage('Erreur de chargement des rues (voir console).', 'error');
    });
}

// ------------------------
// Chargement des polygones de quartiers
// ------------------------

function loadQuartierPolygons() {
  fetch('data/marseille_quartiers_111.geojson')
    .then(response => {
      if (!response.ok) {
        throw new Error('Erreur HTTP ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      const features = data.features || [];
      quartierPolygonsByName.clear();

      features.forEach(f => {
        const props = f.properties || {};
        const name = typeof props.nom_qua === 'string' ? props.nom_qua.trim() : '';
        if (name) {
          quartierPolygonsByName.set(name, f);
        }
      });

      console.log('Quartiers chargés :', quartierPolygonsByName.size);
    })
    .catch(err => {
      console.error('Erreur lors du chargement des quartiers :', err);
    });
}

// ------------------------
// Gestion visuelle du quartier
// ------------------------

function highlightQuartier(quartierName) {
  clearQuartierOverlay();
  if (!quartierName) return;

  const feature = quartierPolygonsByName.get(quartierName);
  if (!feature) return;

  quartierOverlay = L.geoJSON(feature, {
    style: {
      color: '#0077ff',
      weight: 2,
      fill: false
    }
  }).addTo(map);

  const bounds = quartierOverlay.getBounds();
  if (bounds && bounds.isValid && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

function clearQuartierOverlay() {
  if (quartierOverlay) {
    map.removeLayer(quartierOverlay);
    quartierOverlay = null;
  }
}

// ------------------------
// Liste des quartiers (UI)
// ------------------------

function populateQuartiers() {
  const quartierSelect = document.getElementById('quartier-select');
  if (!quartierSelect) return;

  const setQuartiers = new Set();

  allStreetFeatures.forEach(f => {
    const props = f.properties || {};
    const q = props.quartier;
    if (typeof q === 'string' && q.trim() !== '') {
      setQuartiers.add(q.trim());
    }
  });

  const quartiers = Array.from(setQuartiers).sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  );

  quartierSelect.innerHTML = '';

  quartiers.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = q;
    quartierSelect.appendChild(opt);
  });
}

// ------------------------
// Gestion de session
// ------------------------

function getGameMode() {
  const select = document.getElementById('game-mode-select');
  return select ? select.value : 'classique';
}

function startNewSession() {
  if (allStreetFeatures.length === 0) {
    console.warn('Impossible de démarrer une session : pas de rues chargées.');
    showMessage('Impossible de démarrer : données non chargées.', 'error');
    return;
  }

  clearHighlight();

  // Sélection des rues candidates selon la zone choisie
  const candidates = getCurrentZoneStreets();
  if (candidates.length === 0) {
    showMessage('Aucune rue disponible pour cette zone.', 'error');
    return;
  }

  // Rues uniques par nom (une feature représentative par nom)
  const uniqueStreets = buildUniqueStreetList(candidates);
  if (uniqueStreets.length === 0) {
    showMessage('Aucune rue nommée disponible pour cette zone.', 'error');
    return;
  }

  const gameMode = getGameMode();

  // Réinitialisation des compteurs
  correctCount = 0;
  totalAnswered = 0;
  summaryData = [];
  weightedScore = 0;
  errorsCount = 0;

  updateScoreUI();
  updateTimeUI(0, 0);
  updateWeightedScoreUI();
  document.getElementById('summary').classList.add('hidden');

  // Tirage selon mode
  if (gameMode === 'marathon') {
    // Marathon : on parcourt toutes les rues uniques, dans un ordre aléatoire
    sessionStreets = sampleWithoutReplacement(uniqueStreets, uniqueStreets.length);
  } else {
    // Classique : on limite à SESSION_SIZE rues (ou moins si la zone est petite)
    const n = Math.min(SESSION_SIZE, uniqueStreets.length);
    sessionStreets = sampleWithoutReplacement(uniqueStreets, n);
  }

  currentIndex = 0;

  // Zoom + surbrillance du quartier si applicable
  const modeSelect = document.getElementById('mode-select');
  const quartierSelect = document.getElementById('quartier-select');
  const mode = modeSelect ? modeSelect.value : 'ville';

  if (mode === 'quartier' && quartierSelect && quartierSelect.value) {
    highlightQuartier(quartierSelect.value);
  } else {
    clearQuartierOverlay();
  }

  // Démarrage des timers
  sessionStartTime = performance.now();
  currentTarget = null;
  streetStartTime = null;

  isSessionRunning = true;
  updateStartStopButton();

  setNewTarget();
  showMessage('Session démarrée.', 'info');
}

// Récupère la liste de rues candidates selon la zone choisie (ville ou quartier)
function getCurrentZoneStreets() {
  const modeSelect = document.getElementById('mode-select');
  const quartierSelect = document.getElementById('quartier-select');

  const mode = modeSelect ? modeSelect.value : 'ville';

  if (mode === 'quartier' && quartierSelect && quartierSelect.value) {
    const targetQuartier = quartierSelect.value;
    return allStreetFeatures.filter(f =>
      f.properties &&
      typeof f.properties.quartier === 'string' &&
      f.properties.quartier === targetQuartier
    );
  }

  // Ville entière par défaut
  return allStreetFeatures;
}

// Construit une liste de rues uniques à partir d'une liste de segments
// => une seule feature représentative par nom de rue (insensible à la casse)
function buildUniqueStreetList(features) {
  const byName = new Map();

  features.forEach(f => {
    const props = f.properties || {};
    const rawName = typeof props.name === 'string' ? props.name.trim() : '';
    if (!rawName) return;
    const key = rawName.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, f);
    }
  });

  return Array.from(byName.values());
}

// Tirage sans remise dans un tableau
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
  const targetEl = document.getElementById('target-street');
  targetEl.textContent = targetName || '—';

  triggerTargetPulse();
}

// Animation légère du panneau "Rue à trouver"
function triggerTargetPulse() {
  const panel = document.querySelector('.target-panel');
  if (!panel) return;
  panel.classList.remove('pulse');
  void panel.offsetWidth;
  panel.classList.add('pulse');
}

// ------------------------
// Start/Stop bouton
// ------------------------

function updateStartStopButton() {
  const btn = document.getElementById('restart-btn');
  if (!btn) return;

  if (isSessionRunning) {
    btn.textContent = 'Arrêter la session';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-stop');
  } else {
    btn.textContent = 'Commencer la session';
    btn.classList.remove('btn-stop');
    btn.classList.add('btn-primary');
  }
}

function stopSessionManually() {
  if (!isSessionRunning) return;
  endSession();
}

// ------------------------
// Gestion des clics sur les rues
// ------------------------

function handleStreetClick(clickedFeature) {
  if (!currentTarget || sessionStartTime === null || streetStartTime === null) {
    return;
  }

  const gameMode = getGameMode();

  const now = performance.now();
  const streetTimeSec = (now - streetStartTime) / 1000;

  // Comparaison par NOM de rue (tolérance sur les tronçons)
  const clickedName = (clickedFeature.properties.name || '').trim().toLowerCase();
  const targetName = (currentTarget.properties.name || '').trim().toLowerCase();

  const isCorrect = (clickedName === targetName);

  if (isCorrect) {
    correctCount += 1;
    // Score pondéré : 10 points - temps (min 0)
    const points = Math.max(0, 10 - streetTimeSec);
    weightedScore += points;
    updateWeightedScoreUI();

    showMessage(
      `Correct (${streetTimeSec.toFixed(1)} s, +${points.toFixed(1)} pts)`,
      'success'
    );
    // surbrillance verte
    highlightStreet('#00aa00');
  } else {
    errorsCount += 1;
    if (gameMode === 'marathon' && errorsCount >= MAX_ERRORS_MARATHON) {
      showMessage(
        `Incorrect (limite de ${MAX_ERRORS_MARATHON} erreurs atteinte)`,
        'error'
      );
    } else {
      showMessage('Incorrect', 'error');
    }
    // surbrillance rouge
    highlightStreet('#d00');
  }

  totalAnswered += 1;

  summaryData.push({
    name: currentTarget.properties.name,
    correct: isCorrect,
    time: streetTimeSec.toFixed(1)
  });

  updateScoreUI();

  // Si marathon et limite d'erreurs atteinte => fin immédiate
  if (!isCorrect && gameMode === 'marathon' && errorsCount >= MAX_ERRORS_MARATHON) {
    endSession();
    return;
  }

  // Rue suivante
  currentIndex += 1;
  setNewTarget();
}

// ------------------------
// Surbrillance de la rue cible
// ------------------------

function highlightStreet(color) {
  if (!currentTarget) return;
  highlightStreetByName(currentTarget.properties.name, color);
}

// Surbrillance par nom de rue (utilisé aussi pour le récap cliquable)
function highlightStreetByName(streetName, color) {
  clearHighlight();
  const targetName = (streetName || '').trim().toLowerCase();
  if (!targetName) return [];

  // Récupérer tous les layers dont le nom est identique
  const layersToHighlight = [];
  streetLayersById.forEach(layer => {
    const name = (layer.feature.properties.name || '').trim().toLowerCase();
    if (name === targetName) {
      layersToHighlight.push(layer);
    }
  });

  if (layersToHighlight.length === 0) return [];

  highlightedLayers = layersToHighlight;

  // Appliquer le style surligné
  highlightedLayers.forEach(layer => {
    layer.setStyle({ color: color, weight: 6 });
  });

  highlightTimeoutId = setTimeout(() => {
    highlightedLayers.forEach(layer => {
      layer.setStyle({ color: '#555', weight: 3 });
    });
    highlightedLayers = [];
    highlightTimeoutId = null;
  }, 5000); // 5 secondes

  return layersToHighlight;
}

function clearHighlight() {
  if (highlightTimeoutId !== null) {
    clearTimeout(highlightTimeoutId);
    highlightTimeoutId = null;
  }

  if (highlightedLayers && highlightedLayers.length > 0) {
    highlightedLayers.forEach(layer => {
      layer.setStyle({ color: '#555', weight: 3 });
    });
    highlightedLayers = [];
  }
}

// ------------------------
// Focus sur une rue depuis le récapitulatif
// ------------------------

function focusStreetByName(streetName) {
  const layers = highlightStreetByName(streetName, '#ffcc00'); // surbrillance jaune
  if (!layers || layers.length === 0) return;

  let bounds = null;
  layers.forEach(layer => {
    if (typeof layer.getBounds === 'function') {
      const b = layer.getBounds();
      if (!bounds) {
        bounds = b;
      } else {
        bounds = bounds.extend(b);
      }
    }
  });

  if (bounds && bounds.isValid && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// ------------------------
// Fin de session & récapitulatif
// ------------------------

function endSession() {
  const now = performance.now();
  const totalTimeSec = sessionStartTime ? (now - sessionStartTime) / 1000 : 0;

  // Arrêt des chronos
  sessionStartTime = null;
  streetStartTime = null;
  currentTarget = null;
  isSessionRunning = false;
  updateStartStopButton();

  const total = summaryData.length;
  const nbCorrect = summaryData.filter(r => r.correct).length;
  const percent = total === 0 ? 0 : Math.round((nbCorrect / total) * 100);

  const avgTime = total === 0
    ? 0
    : summaryData.reduce((acc, r) => acc + parseFloat(r.time), 0) / total;

  const gameMode = getGameMode();

  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Récapitulatif de la session';
  summaryEl.appendChild(title);

  const modeInfo = document.createElement('p');
  modeInfo.textContent =
    gameMode === 'marathon'
      ? `Mode : Marathon (max. ${MAX_ERRORS_MARATHON} erreurs)`
      : `Mode : Classique (${SESSION_SIZE} rues max)`;
  summaryEl.appendChild(modeInfo);

  const stats = document.createElement('div');
  stats.innerHTML =
    `<p>Temps total : <strong>${totalTimeSec.toFixed(1)} s</strong></p>
     <p>Temps moyen par rue : <strong>${avgTime.toFixed(1)} s</strong></p>
     <p>Score : <strong>${percent} %</strong> (${nbCorrect} bonnes réponses / ${total})</p>
     <p>Score pondéré : <strong>${weightedScore.toFixed(1)} pts</strong></p>`;
  summaryEl.appendChild(stats);

  const listTitle = document.createElement('h3');
  listTitle.textContent = 'Détail par rue (cliquable pour zoomer)';
  summaryEl.appendChild(listTitle);

  const list = document.createElement('ul');
  summaryData.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.name} – ${r.correct ? 'Correct' : 'Incorrect'} – ${r.time} s`;
    li.dataset.streetName = r.name;
    li.addEventListener('click', () => {
      focusStreetByName(r.name);
    });
    list.appendChild(li);
  });
  summaryEl.appendChild(list);

  summaryEl.classList.remove('hidden');
  showMessage('Session terminée.', 'info');
  document.getElementById('target-street').textContent = '—';
}

// ------------------------
// Mise à jour de l'UI (score, temps, score pondéré)
// ------------------------

function updateScoreUI() {
  const scoreEl = document.getElementById('score');
  const pillEl = document.getElementById('score-pill');

  if (!scoreEl) return;

  if (totalAnswered === 0) {
    scoreEl.textContent = '0 / 0 (0 %)';
    if (pillEl) {
      pillEl.className = 'score-pill score-pill--neutral';
    }
    return;
  }

  const percent = Math.round((correctCount / totalAnswered) * 100);
  scoreEl.textContent = `${correctCount} / ${totalAnswered} (${percent} %)`;

  if (!pillEl) return;

  if (percent > 50) {
    pillEl.className = 'score-pill score-pill--good';
  } else if (percent > 0) {
    pillEl.className = 'score-pill score-pill--warn';
  } else {
    pillEl.className = 'score-pill score-pill--neutral';
  }
}

function updateTimeUI(totalTimeSec, streetTimeSec) {
  const totalEl = document.getElementById('total-time');
  const streetEl = document.getElementById('street-time');

  totalEl.textContent = totalTimeSec.toFixed(1) + ' s';
  streetEl.textContent = streetTimeSec.toFixed(1) + ' s';
}

function updateWeightedScoreUI() {
  const el = document.getElementById('weighted-score');
  if (!el) return;
  el.textContent = weightedScore.toFixed(1);
}