const state = { records: [], selectedDate: "", editingPlayerId: null, dragPlayerId: null, initialized: false, viewMode: "roster" };
const $ = (selector) => document.querySelector(selector);
const byType = (type) => state.records.filter((record) => record.type === type);

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const button = $("#theme-toggle");
  button.innerHTML = theme === "dark"
    ? '<i data-lucide="sun" width="18" height="18"></i>'
    : '<i data-lucide="moon" width="18" height="18"></i>';
  lucide.createIcons();
}

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem("mbufc_theme");
  } catch (err) {
    stored = null;
  }
  applyTheme(stored === "light" ? "light" : "dark");
}

$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem("mbufc_theme", next);
  } catch (err) {
    /* ignore */
  }
});

initTheme();
const players = () => byType("player").sort((a, b) => a.name.localeCompare(b.name));
const teams = () => {
  const seen = new Set();
  return byType("team")
    .filter((team) => {
      const key = team.name.trim().toLowerCase();
      if (!["red", "blue"].includes(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};
const schedules = () => byType("schedule").sort((a, b) => (a.schedule_date + a.schedule_time).localeCompare(b.schedule_date + b.schedule_time));

const STATUS_ORDER = ["played", "pending", "invited", "out"];
const STATUS_LABELS = { played: "Confirmed", pending: "Pending", invited: "Invited", out: "Out" };

function canonicalPlayerStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return STATUS_ORDER.includes(normalized) ? normalized : "invited";
}

function setButtonBusy(button, busy) {
  button.disabled = busy;
}

function showMessage(message, kind = "success") {
  const el = $("#status-message");
  el.textContent = message;
  el.className = "status-message";
  Object.assign(
    el.style,
    kind === "error"
      ? { background: "#fff1f0", borderColor: "#fecaca", color: "#8f1d15" }
      : { background: "#edf9f0", borderColor: "#b9e5c3", color: "#166534" }
  );
  el.classList.remove("hidden");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => el.classList.add("hidden"), 4200);
}

function renderScheduleDisplay(schedule) {
  const holder = $("#schedule-display");
  holder.replaceChildren();

  const parts = [];
  if (schedule) {
    const [year, month, day] = schedule.schedule_date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    parts.push(new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(date));
    if (schedule.schedule_time) parts.push(schedule.schedule_time);
    parts.push(new Intl.DateTimeFormat("en", { weekday: "long" }).format(date));
  } else {
    parts.push("No schedule set");
  }

  parts.forEach((text, index) => {
    if (index > 0) {
      const divider = document.createElement("span");
      divider.className = "schedule-divider";
      divider.setAttribute("aria-hidden", "true");
      holder.appendChild(divider);
    }
    const part = document.createElement("span");
    part.className = "schedule-part";
    part.textContent = text;
    holder.appendChild(part);
  });
}

function daysLeftInfo(dateString) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return { text: "Today", kind: "today" };
  if (diffDays === 1) return { text: "Tomorrow", kind: "upcoming" };
  if (diffDays > 1) return { text: diffDays + " days left", kind: "upcoming" };
  const pastDays = Math.abs(diffDays);
  return { text: pastDays === 1 ? "Yesterday" : pastDays + " days ago", kind: "past" };
}

function populateSchedulePickers() {
  const hourSelect = $("#schedule-hour");
  for (let hour = 1; hour <= 12; hour++) hourSelect.add(new Option(String(hour), String(hour)));

  const ampmSelect = $("#schedule-ampm");
  ["AM", "PM"].forEach((period) => ampmSelect.add(new Option(period, period)));
}

function setDateControls(dateString) {
  $("#schedule-date").value = dateString || new Date().toISOString().slice(0, 10);
}

function getDateControls() {
  return $("#schedule-date").value;
}

function setTimeControls(timeString) {
  const match = String(timeString || "9 AM").match(/^(\d{1,2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!match) {
    $("#schedule-hour").value = "9";
    $("#schedule-ampm").value = "AM";
    return;
  }
  $("#schedule-hour").value = String(Number(match[1]));
  $("#schedule-ampm").value = match[2].toUpperCase();
}

function getTimeControls() {
  const hour = $("#schedule-hour").value;
  const period = $("#schedule-ampm").value;
  return hour && period ? hour + " " + period : "";
}

function currentSchedule() {
  return schedules().find((schedule) => schedule.schedule_date === state.selectedDate) || null;
}

function namedTeam(name) {
  return teams().find((team) => team.name.trim().toLowerCase() === name);
}

function renderPlayerColumn(holderId, emptyId, list, group, options = {}) {
  const holder = $("#" + holderId);
  holder.replaceChildren();
  list.forEach((player) => {
    const item = document.createElement("p");
    item.className = "player-name";
    if (options.markOut && canonicalPlayerStatus(player.status) === "out") {
      item.classList.add("player-out");
    }
    const dot = document.createElement("span");
    dot.className = "group-dot " + group;
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "player-name-text";
    name.textContent = player.name;
    item.append(dot, name);
    holder.appendChild(item);
  });
  const emptyState = $("#" + emptyId);
  if (emptyState) emptyState.classList.toggle("hidden", list.length > 0);
}

function setViewMode(mode) {
  state.viewMode = mode;
  $("#roster-view-button").setAttribute("aria-pressed", String(mode === "roster"));
  $("#teams-view-button").setAttribute("aria-pressed", String(mode === "teams"));
  $("#full-roster-columns").classList.toggle("hidden", mode !== "roster");
  $("#team-player-columns").classList.toggle("hidden", mode !== "teams");
}

function renderViewer() {
  const scheduleList = schedules();
  if (!state.selectedDate && scheduleList.length) state.selectedDate = scheduleList[0].schedule_date;
  const schedule = currentSchedule();
  renderScheduleDisplay(schedule);

  const daysLeftEl = $("#days-left");
  const info = schedule ? daysLeftInfo(schedule.schedule_date) : null;
  if (info) {
    daysLeftEl.textContent = info.text;
    daysLeftEl.className = "days-left-badge " + info.kind;
  } else {
    daysLeftEl.classList.add("hidden");
  }

  const allPlayers = players();
  const playedPlayers = allPlayers.filter((p) => canonicalPlayerStatus(p.status) === "played");
  const pendingPlayers = allPlayers.filter((p) => canonicalPlayerStatus(p.status) === "pending");
  const invitedPlayers = allPlayers.filter((p) => canonicalPlayerStatus(p.status) === "invited");
  const outPlayers = allPlayers.filter((p) => canonicalPlayerStatus(p.status) === "out");
  renderPlayerColumn("played-players", "played-empty", playedPlayers, "status-played");
  renderPlayerColumn("pending-players", "pending-empty", pendingPlayers, "status-pending");
  renderPlayerColumn("invited-players", "invited-empty", invitedPlayers, "status-invited");
  renderPlayerColumn("out-players", "out-empty", outPlayers, "status-out");
  [
    ["played-count", playedPlayers.length],
    ["pending-count", pendingPlayers.length],
    ["invited-count", invitedPlayers.length],
    ["out-count", outPlayers.length],
  ].forEach(([id, count]) => {
    const badge = $("#" + id);
    badge.textContent = count;
    badge.setAttribute("aria-label", count + (count === 1 ? " player" : " players"));
  });

  const redTeam = namedTeam("red");
  const blueTeam = namedTeam("blue");
  const redPlayers = redTeam ? allPlayers.filter((p) => p.team_id === redTeam.__backendId) : [];
  const bluePlayers = blueTeam ? allPlayers.filter((p) => p.team_id === blueTeam.__backendId) : [];
  const extraPlayers = allPlayers.filter(
    (p) => p.team_id !== (redTeam && redTeam.__backendId) && p.team_id !== (blueTeam && blueTeam.__backendId)
  );
  renderPlayerColumn("red-players", "red-empty", redPlayers, "red");
  renderPlayerColumn("blue-players", "blue-empty", bluePlayers, "blue");
  renderPlayerColumn("extra-players", "extra-empty", extraPlayers, "extra", { markOut: true });
  [
    ["red-count", redPlayers.length],
    ["blue-count", bluePlayers.length],
    ["extra-count", extraPlayers.length],
  ].forEach(([id, count]) => {
    const badge = $("#" + id);
    badge.textContent = count;
    badge.setAttribute("aria-label", count + (count === 1 ? " player" : " players"));
  });
}

function setMode(mode) {
  const viewer = mode === "viewer";
  $("#viewer-mode").classList.toggle("hidden", !viewer);
  $("#management-mode").classList.toggle("hidden", viewer);
  $("#management-button").classList.toggle("hidden", !viewer);
  if (viewer) renderViewer();
  else renderManagement();
}

async function movePlayer(playerId, teamId) {
  const player = players().find((item) => item.__backendId === playerId);
  if (!player || player.team_id === teamId) return;
  const result = await window.dataSdk.update({ ...player, team_id: teamId });
  if (!result.isOk) showMessage("The player could not be moved. Please try again.", "error");
}

function setupDropZone(zone, targetTeamId) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    zone.classList.remove("is-over");
    if (state.dragPlayerId) await movePlayer(state.dragPlayerId, targetTeamId);
  });
}

function applyStatusSelectStyle(select) {
  STATUS_ORDER.forEach((value) => select.classList.remove("status-" + value));
  select.classList.add("status-" + select.value);
}

function addPlayerToBoard(player, holder) {
  const fragment = $("#assignment-player-template").content.cloneNode(true);
  const row = fragment.querySelector(".player-chip");
  row.querySelector(".chip-name").textContent = player.name;
  row.addEventListener("dragstart", () => {
    state.dragPlayerId = player.__backendId;
  });
  row.addEventListener("dragend", () => {
    state.dragPlayerId = null;
    document.querySelectorAll(".drop-zone").forEach((zone) => zone.classList.remove("is-over"));
  });

  const statusSelect = row.querySelector(".status-select");
  STATUS_ORDER.forEach((value) => statusSelect.add(new Option(STATUS_LABELS[value], value)));
  statusSelect.value = canonicalPlayerStatus(player.status);
  applyStatusSelectStyle(statusSelect);
  statusSelect.addEventListener("change", async () => {
    applyStatusSelectStyle(statusSelect);
    const result = await window.dataSdk.update({ ...player, status: statusSelect.value });
    if (!result.isOk) showMessage("The player status could not be saved. Please try again.", "error");
  });

  row.querySelector(".chip-edit").addEventListener("click", () => {
    state.editingPlayerId = player.__backendId;
    $("#player-name").value = player.name;
    $("#cancel-player-edit").classList.remove("hidden");
    $("#player-name").focus();
  });

  row.querySelector(".chip-delete").addEventListener("click", async () => {
    if (!window.confirm("Delete " + player.name + "?")) return;
    const result = await window.dataSdk.delete(player);
    if (!result.isOk) showMessage("The player could not be deleted. Please try again.", "error");
  });

  holder.appendChild(fragment);
}

function makeTeamCard(team, isExtra = false) {
  if (isExtra) {
    const card = document.createElement("article");
    card.className = "panel";
    card.innerHTML =
      '<div class="team-card-header"><h3 class="team-card-name">Extra</h3><span class="count-badge count-badge-extra" aria-label="0 players">0</span></div><div class="drop-zone" tabindex="0"></div>';
    setupDropZone(card.querySelector(".drop-zone"), "");
    return card;
  }

  const fragment = $("#team-card-template").content.cloneNode(true);
  const card = fragment.querySelector("article");
  card.dataset.teamId = team.__backendId;
  card.querySelector(".team-card-name").textContent = team.name;
  const badge = card.querySelector(".team-card-count");
  badge.classList.add(team.name.trim().toLowerCase() === "red" ? "count-badge-red" : "count-badge-blue");
  setupDropZone(card.querySelector(".drop-zone"), team.__backendId);
  return fragment;
}

function renderManagement() {
  $("#players-empty").classList.toggle("hidden", players().length > 0);

  const board = $("#assignment-board");
  board.replaceChildren();

  const redTeam = namedTeam("red");
  const blueTeam = namedTeam("blue");
  const orderedTeams = [redTeam, blueTeam].filter(Boolean);

  orderedTeams.forEach((team) => board.appendChild(makeTeamCard(team)));
  const extraCard = makeTeamCard(null, true);
  board.appendChild(extraCard);

  const extraPlayers = players().filter((player) => !player.team_id || !teams().some((team) => team.__backendId === player.team_id));
  const extraHolder = extraCard.querySelector(".drop-zone");
  extraCard.querySelector(".count-badge").textContent = extraPlayers.length;
  extraCard.querySelector(".count-badge").setAttribute("aria-label", extraPlayers.length + (extraPlayers.length === 1 ? " player" : " players"));
  extraPlayers.forEach((player) => addPlayerToBoard(player, extraHolder));

  orderedTeams.forEach((team) => {
    const holder = board.querySelector('[data-team-id="' + team.__backendId + '"] .drop-zone');
    const teamPlayers = players().filter((player) => player.team_id === team.__backendId);
    const badge = board.querySelector('[data-team-id="' + team.__backendId + '"] .team-card-count');
    badge.textContent = teamPlayers.length;
    badge.setAttribute("aria-label", teamPlayers.length + (teamPlayers.length === 1 ? " player" : " players"));
    teamPlayers.forEach((player) => addPlayerToBoard(player, holder));
  });

  lucide.createIcons();
}

$("#schedule-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const date = getDateControls();
  const time = getTimeControls();
  if (!date || !time) return showMessage("Please enter both a date and time.", "error");
  const button = $("#save-schedule-button");
  setButtonBusy(button, true);
  const existing = schedules().find((item) => item.schedule_date === date);
  const result = existing
    ? await window.dataSdk.update({ ...existing, schedule_time: time })
    : await window.dataSdk.create({ type: "schedule", name: "Schedule", schedule_date: date, schedule_time: time, team_id: "", notes: "" });
  setButtonBusy(button, false);
  if (!result.isOk) return showMessage("The schedule could not be saved. Please try again.", "error");
  state.selectedDate = date;
  showMessage("Schedule saved.");
});

$("#player-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#player-name").value.trim();
  if (!name) return showMessage("A player name is required.", "error");
  const button = $("#save-player-button");
  const editing = players().find((item) => item.__backendId === state.editingPlayerId);
  setButtonBusy(button, true);
  const result = editing
    ? await window.dataSdk.update({ ...editing, name })
    : await window.dataSdk.create({ type: "player", name, schedule_date: state.selectedDate || "", schedule_time: "", team_id: "", notes: "", status: "invited" });
  setButtonBusy(button, false);
  if (!result.isOk) return showMessage("The player could not be saved. Please try again.", "error");
  $("#player-form").reset();
  state.editingPlayerId = null;
  $("#cancel-player-edit").classList.add("hidden");
  showMessage(editing ? "Player updated." : "Player added.");
});

$("#cancel-player-edit").addEventListener("click", () => {
  state.editingPlayerId = null;
  $("#player-form").reset();
  $("#cancel-player-edit").classList.add("hidden");
});

$("#return-viewer-button").addEventListener("click", () => setMode("viewer"));
$("#roster-view-button").addEventListener("click", () => setViewMode("roster"));
$("#teams-view-button").addEventListener("click", () => setViewMode("teams"));

function openPasswordModal() {
  $("#password-error").classList.add("hidden");
  $("#manage-email").value = "";
  $("#manage-password").value = "";
  $("#password-modal").classList.remove("hidden");
  $("#manage-email").focus();
}

function closePasswordModal() {
  $("#password-modal").classList.add("hidden");
}

$("#management-button").addEventListener("click", async () => {
  if (await window.dataSdk.isSignedIn()) setMode("management");
  else openPasswordModal();
});

$("#logout-button").addEventListener("click", async () => {
  await window.dataSdk.signOut();
  setMode("viewer");
});

$("#password-cancel").addEventListener("click", closePasswordModal);

$("#password-modal").addEventListener("click", (event) => {
  if (event.target.id === "password-modal") closePasswordModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#password-modal").classList.contains("hidden")) closePasswordModal();
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#password-form button[type='submit']");
  setButtonBusy(submitButton, true);
  const email = $("#manage-email").value.trim();
  const password = $("#manage-password").value;
  const result = await window.dataSdk.signIn(email, password);
  setButtonBusy(submitButton, false);
  if (result.isOk) {
    closePasswordModal();
    setMode("management");
  } else {
    $("#password-error").classList.remove("hidden");
    $("#manage-password").value = "";
    $("#manage-password").focus();
  }
});

const dataHandler = {
  onDataChanged(data) {
    state.records = data;
    if (!state.initialized) {
      state.initialized = true;
      setDateControls(new Date().toISOString().slice(0, 10));
      const firstSchedule = schedules()[0];
      if (firstSchedule) {
        state.selectedDate = firstSchedule.schedule_date;
        setDateControls(firstSchedule.schedule_date);
        setTimeControls(firstSchedule.schedule_time);
      }
    }
    renderViewer();
    if (!$("#management-mode").classList.contains("hidden")) renderManagement();
  },
};

async function initApp() {
  populateSchedulePickers();
  setViewMode("roster");
  lucide.createIcons();
  const result = await window.dataSdk.init(dataHandler);
  if (!result.isOk) showMessage("Your saved schedule could not be loaded. Please refresh and try again.", "error");
}

initApp();
