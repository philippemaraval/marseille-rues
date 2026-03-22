const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:"
    ? "http://localhost:3000"
    : "https://camino2.onrender.com";

const STORAGE_KEY = "camino_editor_user";

const state = {
  token: "",
  username: "",
  role: "",
  content: null,
};

const refs = {
  globalStatus: document.getElementById("global-status"),
  loginSection: document.getElementById("login-section"),
  editorSection: document.getElementById("editor-section"),
  loginForm: document.getElementById("login-form"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  sessionUser: document.getElementById("session-user"),
  sessionRole: document.getElementById("session-role"),
  refreshContentBtn: document.getElementById("refresh-content-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  statsGrid: document.getElementById("stats-grid"),
  infoModeSelect: document.getElementById("info-mode-select"),
  streetSearchInput: document.getElementById("street-search-input"),
  streetSelect: document.getElementById("street-select"),
  streetNameInput: document.getElementById("street-name-input"),
  streetInfoText: document.getElementById("street-info-text"),
  saveStreetInfoBtn: document.getElementById("save-street-info-btn"),
  deleteStreetInfoBtn: document.getElementById("delete-street-info-btn"),
  famousListText: document.getElementById("famous-list-text"),
  mainListText: document.getElementById("main-list-text"),
  monumentsListText: document.getElementById("monuments-list-text"),
  saveListsBtn: document.getElementById("save-lists-btn"),
};

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function setGlobalStatus(message, type = "info") {
  if (!refs.globalStatus) {
    return;
  }
  refs.globalStatus.textContent = message;
  refs.globalStatus.classList.remove("status--info", "status--success", "status--error");
  if (type === "success") {
    refs.globalStatus.classList.add("status--success");
  } else if (type === "error") {
    refs.globalStatus.classList.add("status--error");
  } else {
    refs.globalStatus.classList.add("status--info");
  }
}

function setUiAuthenticated(isAuthenticated) {
  refs.loginSection.classList.toggle("hidden", isAuthenticated);
  refs.editorSection.classList.toggle("hidden", !isAuthenticated);
}

function saveSession() {
  const payload = {
    token: state.token,
    username: state.username,
    role: state.role,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearSession() {
  state.token = "";
  state.username = "";
  state.role = "";
  state.content = null;
  localStorage.removeItem(STORAGE_KEY);
}

function restoreSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return false;
  }
  try {
    const payload = JSON.parse(raw);
    state.token = String(payload.token || "");
    state.username = String(payload.username || "");
    state.role = String(payload.role || "");
    return Boolean(state.token);
  } catch (error) {
    clearSession();
    return false;
  }
}

async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (auth) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function parseListTextarea(value) {
  const dedup = new Set();
  const normalized = [];
  String(value || "")
    .split("\n")
    .forEach((line) => {
      const name = normalizeName(line);
      if (!name || dedup.has(name)) {
        return;
      }
      dedup.add(name);
      normalized.push(name);
    });
  return normalized;
}

function listToTextarea(values) {
  return (Array.isArray(values) ? values : []).join("\n");
}

function getCurrentMode() {
  return refs.infoModeSelect.value === "main" ? "main" : "famous";
}

function getModeListKey(mode) {
  return mode === "main" ? "mainStreets" : "famousStreets";
}

function getStreetNamesForMode(mode) {
  if (!state.content) {
    return [];
  }
  const listNames = state.content.lists?.[getModeListKey(mode)] || [];
  const infoNames = Object.keys(state.content.streetInfos?.[mode] || {});
  const allNames = new Set([...listNames, ...infoNames]);
  return Array.from(allNames).sort((a, b) => a.localeCompare(b, "fr"));
}

function renderStats() {
  if (!state.content || !refs.statsGrid) {
    return;
  }

  const stats = state.content.stats || {};
  const cards = [
    ["Fiches rues celebres", stats.famousStreetInfoCount ?? 0],
    ["Fiches rues principales", stats.mainStreetInfoCount ?? 0],
    ["Rues celebres", stats.famousStreetCount ?? 0],
    ["Rues principales", stats.mainStreetCount ?? 0],
    ["Monuments", stats.monumentCount ?? 0],
  ];

  refs.statsGrid.innerHTML = cards
    .map(
      ([label, value]) =>
        `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`,
    )
    .join("");
}

function updateEditorFieldsForStreet(streetName) {
  const mode = getCurrentMode();
  const infoMap = state.content?.streetInfos?.[mode] || {};
  const normalizedName = normalizeName(streetName);
  refs.streetNameInput.value = normalizedName;
  refs.streetInfoText.value = normalizedName ? infoMap[normalizedName] || "" : "";
}

function renderStreetSelect(preferredStreetName = "") {
  const mode = getCurrentMode();
  const filterQuery = normalizeName(refs.streetSearchInput.value);
  const names = getStreetNamesForMode(mode).filter((name) =>
    filterQuery ? name.includes(filterQuery) : true,
  );

  refs.streetSelect.innerHTML = "";
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    refs.streetSelect.appendChild(option);
  });

  const normalizedPreferred = normalizeName(preferredStreetName);
  let selected = "";
  if (normalizedPreferred && names.includes(normalizedPreferred)) {
    refs.streetSelect.value = normalizedPreferred;
    selected = normalizedPreferred;
  } else if (names.length > 0) {
    refs.streetSelect.selectedIndex = 0;
    selected = refs.streetSelect.value;
  }

  if (selected) {
    updateEditorFieldsForStreet(selected);
  } else {
    updateEditorFieldsForStreet("");
  }
}

function renderListsEditors() {
  if (!state.content) {
    return;
  }
  refs.famousListText.value = listToTextarea(state.content.lists?.famousStreets);
  refs.mainListText.value = listToTextarea(state.content.lists?.mainStreets);
  refs.monumentsListText.value = listToTextarea(state.content.lists?.monuments);
}

function renderAllEditors(preferredStreetName = "") {
  refs.sessionUser.textContent = state.username || "-";
  refs.sessionRole.textContent = state.role || "player";
  renderStats();
  renderListsEditors();
  renderStreetSelect(preferredStreetName);
}

async function ensureEditorAccess() {
  const me = await apiRequest("/api/editor/me");
  if (!me?.canEdit) {
    const error = new Error("Ce compte n'a pas les droits editeur.");
    error.status = 403;
    throw error;
  }
  state.username = me.username;
  state.role = me.role;
  saveSession();
}

async function loadContent(preferredStreetName = "") {
  setGlobalStatus("Chargement du contenu...", "info");
  const content = await apiRequest("/api/editor/content");
  state.content = content;
  renderAllEditors(preferredStreetName);
  setGlobalStatus("Contenu charge.", "success");
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const username = refs.loginUsername.value.trim();
  const password = refs.loginPassword.value;
  if (!username || !password) {
    setGlobalStatus("Pseudo et mot de passe requis.", "error");
    return;
  }

  try {
    setGlobalStatus("Connexion en cours...", "info");
    const payload = await apiRequest("/api/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });

    state.token = String(payload?.token || "");
    state.username = String(payload?.username || username);
    state.role = String(payload?.role || "player");
    saveSession();

    await ensureEditorAccess();
    setUiAuthenticated(true);
    await loadContent();
  } catch (error) {
    clearSession();
    setUiAuthenticated(false);
    setGlobalStatus(`Connexion impossible: ${error.message}`, "error");
  }
}

async function bootstrapSession() {
  if (!restoreSession()) {
    setUiAuthenticated(false);
    return;
  }

  try {
    await ensureEditorAccess();
    setUiAuthenticated(true);
    await loadContent();
  } catch (error) {
    clearSession();
    setUiAuthenticated(false);
    setGlobalStatus(`Session invalide: ${error.message}`, "error");
  }
}

async function onSaveStreetInfo() {
  const mode = getCurrentMode();
  const streetName = normalizeName(refs.streetNameInput.value);
  const infoText = String(refs.streetInfoText.value || "").trim();

  if (!streetName) {
    setGlobalStatus("Nom de rue obligatoire.", "error");
    return;
  }
  if (!infoText) {
    setGlobalStatus("Le texte de la fiche est vide.", "error");
    return;
  }

  try {
    setGlobalStatus("Enregistrement de la fiche...", "info");
    await apiRequest("/api/editor/street-info", {
      method: "PUT",
      body: {
        mode,
        streetName,
        infoText,
      },
    });
    await loadContent(streetName);
    setGlobalStatus(`Fiche enregistree: ${streetName}`, "success");
  } catch (error) {
    setGlobalStatus(`Echec enregistrement fiche: ${error.message}`, "error");
  }
}

async function onDeleteStreetInfo() {
  const mode = getCurrentMode();
  const streetName = normalizeName(refs.streetNameInput.value || refs.streetSelect.value);
  if (!streetName) {
    setGlobalStatus("Selectionnez une rue a supprimer.", "error");
    return;
  }

  if (!window.confirm(`Supprimer la fiche de "${streetName}" ?`)) {
    return;
  }

  try {
    setGlobalStatus("Suppression de la fiche...", "info");
    await apiRequest("/api/editor/street-info", {
      method: "DELETE",
      body: {
        mode,
        streetName,
      },
    });
    refs.streetNameInput.value = "";
    refs.streetInfoText.value = "";
    await loadContent();
    setGlobalStatus(`Fiche supprimee: ${streetName}`, "success");
  } catch (error) {
    setGlobalStatus(`Echec suppression fiche: ${error.message}`, "error");
  }
}

async function onSaveLists() {
  const payload = {
    famousStreets: parseListTextarea(refs.famousListText.value),
    mainStreets: parseListTextarea(refs.mainListText.value),
    monuments: parseListTextarea(refs.monumentsListText.value),
  };

  try {
    setGlobalStatus("Enregistrement des listes...", "info");
    await apiRequest("/api/editor/lists", {
      method: "PUT",
      body: payload,
    });
    await loadContent();
    setGlobalStatus("Listes enregistrees.", "success");
  } catch (error) {
    setGlobalStatus(`Echec enregistrement listes: ${error.message}`, "error");
  }
}

function bindEvents() {
  refs.loginForm.addEventListener("submit", onLoginSubmit);
  refs.logoutBtn.addEventListener("click", () => {
    clearSession();
    setUiAuthenticated(false);
    setGlobalStatus("Deconnecte.", "info");
  });
  refs.refreshContentBtn.addEventListener("click", async () => {
    try {
      await loadContent(refs.streetNameInput.value);
    } catch (error) {
      setGlobalStatus(`Echec actualisation: ${error.message}`, "error");
    }
  });

  refs.infoModeSelect.addEventListener("change", () => {
    refs.streetSearchInput.value = "";
    renderStreetSelect();
  });

  refs.streetSearchInput.addEventListener("input", () => {
    renderStreetSelect();
  });

  refs.streetSelect.addEventListener("change", () => {
    updateEditorFieldsForStreet(refs.streetSelect.value);
  });

  refs.saveStreetInfoBtn.addEventListener("click", onSaveStreetInfo);
  refs.deleteStreetInfoBtn.addEventListener("click", onDeleteStreetInfo);
  refs.saveListsBtn.addEventListener("click", onSaveLists);
}

bindEvents();
bootstrapSession();
