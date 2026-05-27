let managerCode = "";
let currentLocation = "Ditmars";
let currentWeekMonday = getMondayOf(new Date());
let allEmployees = [];
let allAvailability = [];
let allDayOff = [];
let currentView = "schedule";
let requestsFilter = "all";
let _pollInterval = null;
let _autoSaveTimer = null;
const _publishPhrases = [
  'Aldo pettina le bambole...',
  'Aldo sta contando i tovaglioli uno per uno...',
  'Aldo ha perso le chiavi del frigo ancora...',
  'Aldo discute con la stampante da 20 minuti...',
  'Aldo sta misurando il sale a occhio...',
  'Aldo ha bloccato il POS di nuovo...',
  'Aldo si è addormentato sul pass...',
  'Aldo sta negoziando con il fornitore di pasta...',
  'Aldo ha ordinato 400 chili di farina per errore...',
  'Aldo sta cercando il suo telefono sotto il bancone...',
  'Aldo controlla il menu di tre settimane fa...',
  'Aldo ha mandato il tavolo 4 al tavolo 7...',
  'Aldo sta spiegando al cuoco come si fa il caffè...',
  'Aldo ha dimenticato di aprire il locale...',
  'Aldo sta facendo i conti sui tovaglioli...',
];

let _phraseInterval = null;
let _pendingDropEmp = null;
let _pendingDropDate = null;
let _pendingDropZone = null;

function showDropRolePicker(emp, dateStr, zone, x, y) {
  _pendingDropEmp = emp;
  _pendingDropDate = dateStr;
  _pendingDropZone = zone;

  const picker = document.getElementById('drop-role-picker');
  const options = document.getElementById('drop-role-options');
  if (!picker || !options) return;

  options.innerHTML = '';

  const roles = emp.role.split('/').map(r => r.trim()).filter(Boolean);
  roles.forEach(role => {
    const btn = document.createElement('button');
    btn.className = 'drop-role-btn';
    btn.textContent = role;
    btn.onclick = () => {
      const empWithRole = Object.assign({}, _pendingDropEmp, { role });
      addShiftToDay(_pendingDropDate, empWithRole, _pendingDropZone);
      closeDropRolePicker();
    };
    options.appendChild(btn);
  });

  const w = 220;
  let left = Math.min(x, window.innerWidth - w - 12);
  let top = Math.min(y, window.innerHeight - (roles.length * 46 + 100));
  picker.style.left = left + 'px';
  picker.style.top = top + 'px';
  picker.classList.add('visible');
}

function closeDropRolePicker() {
  const picker = document.getElementById('drop-role-picker');
  if (picker) picker.classList.remove('visible');
  _pendingDropEmp = null;
  _pendingDropDate = null;
  _pendingDropZone = null;
}

document.addEventListener('DOMContentLoaded', () => {
  const cancel = document.getElementById('drop-role-cancel');
  if (cancel) cancel.addEventListener('click', closeDropRolePicker);
  document.addEventListener('click', e => {
    const picker = document.getElementById('drop-role-picker');
    if (picker && picker.classList.contains('visible') &&
        !picker.contains(e.target)) {
      closeDropRolePicker();
    }
  });
});

function showPublishOverlay() {
  const overlay = document.getElementById("publish-overlay");
  const phrase = document.getElementById("publish-phrase");
  if (!overlay || !phrase) return;

  overlay.classList.add("visible");
  document.body.style.overflow = "hidden";

  let idx = 0;
  phrase.textContent = _publishPhrases[0];

  _phraseInterval = setInterval(() => {
    phrase.style.opacity = "0";
    setTimeout(() => {
      idx = (idx + 1) % _publishPhrases.length;
      phrase.textContent = _publishPhrases[idx];
      phrase.style.opacity = "1";
    }, 400);
  }, 2400);
}

function hidePublishOverlay() {
  clearInterval(_phraseInterval);
  _phraseInterval = null;
  const overlay = document.getElementById("publish-overlay");
  if (overlay) overlay.classList.remove("visible");
  document.body.style.overflow = "";
}

function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    const shifts = getScheduleAsShifts();
    if (shifts.length === 0) return;
    const badge = document.getElementById("schedule-status-badge");
    if (badge && badge.classList.contains("published")) return;
    try {
      await saveSchedule(
        managerCode, currentLocation,
        formatWeekStart(currentWeekMonday),
        shifts, "draft"
      );
      setDraftStatus("Auto-saved", "#8B7355");
    } catch (_) {}
  }, 3000);
}

function getCached(key) {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return null;
    const { data, ts } = JSON.parse(item);
    if (Date.now() - ts > 5 * 60 * 1000) return null;
    return data;
  } catch (_) { return null; }
}

function setCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (_) {}
}

function startRequestPolling() {
  stopRequestPolling();
  _pollInterval = setInterval(async () => {
    if (currentView !== "requests") return;
    try {
      const dayOffData = await fetchAllDayOff(managerCode);
      allDayOff = dayOffData.requests || [];
      renderRequestsView();
    } catch (_) {}
  }, 30000);
}

function stopRequestPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  // Clear cache if older than 10 minutes or on first load
  const cacheAge = sessionStorage.getItem("cache_ts");
  if (!cacheAge || Date.now() - parseInt(cacheAge) > 600000) {
    const mgrCode = sessionStorage.getItem("mgr_code");
    sessionStorage.clear();
    if (mgrCode) sessionStorage.setItem("mgr_code", mgrCode);
    sessionStorage.setItem("cache_ts", Date.now().toString());
  }

  if (!document.getElementById("view-schedule")) return;

  managerCode = requireAuth();

  const locSelect = document.getElementById("location-select");
  if (locSelect) {
    locSelect.value = currentLocation;
    locSelect.addEventListener("change", async () => {
      showGlobalLoading(true, "Switching location...");
      // Auto-save current draft before switching
      const currentShifts = getScheduleAsShifts();
      const badge = document.getElementById("schedule-status-badge");
      const isPublished = badge && badge.classList.contains("published");
      if (currentShifts.length > 0 && !isPublished) {
        try {
          await saveSchedule(
            managerCode, currentLocation,
            formatWeekStart(currentWeekMonday),
            currentShifts, "draft"
          );
        } catch (_) {}
      }
      currentLocation = locSelect.value;
      loadDashboard();
    });
  }

  document.getElementById("btn-prev-week")?.addEventListener("click", () => {
    currentWeekMonday = new Date(currentWeekMonday);
    currentWeekMonday.setDate(currentWeekMonday.getDate() - 7);
    loadScheduleView();
  });

  document.getElementById("btn-next-week")?.addEventListener("click", () => {
    currentWeekMonday = new Date(currentWeekMonday);
    currentWeekMonday.setDate(currentWeekMonday.getDate() + 7);
    loadScheduleView();
  });

  document.getElementById("tab-schedule")?.addEventListener("click", () => switchView("schedule"));
  document.getElementById("tab-requests")?.addEventListener("click", () => switchView("requests"));
  document.getElementById("tab-employees")?.addEventListener("click", () => switchView("employees"));

  document.getElementById("btn-save-draft")?.addEventListener("click", () => handleSave("draft"));
  document.getElementById("btn-publish")?.addEventListener("click", () => handlePublish());

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.href = "index.html";
  });

  wireRequestFilters();
  loadDashboard();
  window.addEventListener("beforeunload", stopRequestPolling);
});

function switchView(name) {
  currentView = name;

  ["schedule", "requests", "employees"].forEach((viewName) => {
    const el = document.getElementById(`view-${viewName}`);
    const tab = document.getElementById(`tab-${viewName}`);
    const active = viewName === name;

    if (el) {
      el.hidden = !active;
      el.style.display = active
        ? (viewName === "schedule" && !window.matchMedia("(max-width: 767px)").matches ? "flex" : "block")
        : "none";
    }

    if (tab) {
      tab.classList.toggle("active", active);
      tab.classList.toggle("is-active", active);
    }
  });

  if (name === "requests") renderRequestsView();
  if (name === "requests") startRequestPolling();
  else stopRequestPolling();
  if (name === "employees") renderEmployeesView();
}

async function loadDashboard() {
  showGlobalLoading(true);

  // Load each independently so one failure doesn't break everything
  const cacheKey = `emp_${currentLocation}`;
  let empData = getCached(cacheKey);
  if (!empData) {
    try {
      empData = await fetchAllEmployees(managerCode);
      setCache(cacheKey, empData);
    } catch (_) { empData = { employees: [] }; }
  }
  allEmployees = (empData.employees || [])
    .filter(e => e.location === currentLocation);

  const availCacheKey = "availability_all";
  let availData = getCached(availCacheKey);
  if (!availData) {
    try {
      availData = await fetchAllAvailability(managerCode);
      setCache(availCacheKey, availData);
    } catch (_) { availData = { availability: [] }; }
  }
  allAvailability = availData.availability || [];

  try {
    const dayOffData = await fetchAllDayOff(managerCode);
    allDayOff = dayOffData.requests || [];
  } catch (_) { allDayOff = []; }

  try {
    await loadScheduleView();
  } finally {
    showGlobalLoading(false);
  }
}

async function loadCrossLocationShifts() {
  const weekStr = formatWeekStart(currentWeekMonday);
  const otherLocations = ["Brooklyn","Ditmars","UES"]
    .filter(l => l !== currentLocation);

  const crossShifts = [];
  for (const loc of otherLocations) {
    try {
      const data = await fetchManagerSchedule(managerCode, loc, weekStr);
      if (data.shifts?.length) {
        data.shifts.forEach(s => crossShifts.push({...s, atLocation: loc}));
      }
    } catch (_) {}
  }
  return crossShifts;
}

async function markCrossLocationEmployees() {
  const weekStr = formatWeekStart(currentWeekMonday);
  const otherLocs = ["Brooklyn","Ditmars","UES"]
    .filter(l => l !== currentLocation);

  const crossShifts = [];
  for (const loc of otherLocs) {
    try {
      const d = await fetchManagerSchedule(managerCode, loc, weekStr);
      if (d.shifts?.length) {
        d.shifts.forEach(s => crossShifts.push({...s, atLocation: loc}));
      }
    } catch (_) {}
  }

  if (!crossShifts.length) return;

  document.querySelectorAll("#employee-list .employee-chip").forEach(chip => {
    const name = chip.dataset.empName;
    if (!name) return;
    const myShifts = crossShifts.filter(s => s.employee_name === name);
    if (!myShifts.length) return;

    chip.classList.add("chip-scheduled-elsewhere");

    const existing = chip.querySelector(".cross-loc-badge");
    if (existing) existing.remove();

    const locs = [...new Set(myShifts.map(s => s.atLocation))];
    const dates = [...new Set(myShifts.map(s => {
      try {
        const d = new Date(s.date + "T00:00:00");
        return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
      } catch(_) { return s.date; }
    }))];

    const badge = document.createElement("div");
    badge.className = "cross-loc-badge";
    badge.textContent = `Also at ${locs.join("/")} · ${dates.join(", ")}`;
    badge.title = myShifts.map(s =>
      `${s.atLocation}: ${s.date} ${s.start_time}–${s.end_time}`
    ).join("\n");
    chip.appendChild(badge);
  });
}

async function loadScheduleView() {
  const list = document.getElementById('employee-list');
  if (list) list.innerHTML =
    '<div style="padding:20px;color:#B8A99A;font-size:13px;text-align:center">Loading staff...</div>';

  updateWeekLabel();

  const weekDates = getDatesOfWeek(currentWeekMonday);
  const weekStr = formatWeekStart(currentWeekMonday);
  let existingShifts = [];

  const fetchWithTimeout = (promise, ms = 15000) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms))
    ]);

  try {
    const data = await fetchWithTimeout(
      fetchManagerSchedule(managerCode, currentLocation, weekStr)
    );

    if (data.published || data.shifts?.length) {
      existingShifts = data.shifts || [];
      updateStatusBanner(data.status, data.published_at);
      const pubDate = data.published_at
        ? new Date(data.published_at).toLocaleDateString('en-US',
            {month:'short',day:'numeric',year:'numeric'})
        : '';
      setDraftStatus(
        data.published ? `Published ${pubDate}` : 'Draft saved',
        data.published ? '#059669' : '#8B7355'
      );
    } else {
      updateStatusBanner(null, null);
      setDraftStatus('No schedule yet — drag staff to build');
    }
  } catch (_) {
    updateStatusBanner(null, null);
    setDraftStatus('Start building the schedule below');
  }

  renderCalendar(weekDates, existingShifts);
  renderEmployeeList(allEmployees, allAvailability, allDayOff, weekDates);
  markCrossLocationEmployees();

  if (currentView === "requests") renderRequestsView();
  if (currentView === "employees") renderEmployeesView();
}

function updateWeekLabel() {
  const label = document.getElementById("week-label");
  if (label) label.textContent = formatWeekLabel(currentWeekMonday);
}

function setDraftStatus(text, color) {
  const el = document.getElementById("draft-status");
  if (el) { el.textContent = text; el.style.color = color || "#8B7355"; }
}

function updateStatusBanner(status, publishedAt) {
  const badge = document.getElementById("schedule-status-badge");
  const text  = document.getElementById("status-banner-text");
  if (!badge || !text) return;

  badge.className = "status-badge " + (status || "none");

  if (status === "published") {
    badge.textContent = "✓ Published";
    const dateStr = publishedAt
      ? new Date(publishedAt).toLocaleDateString("en-US",
          { weekday:"short", month:"short", day:"numeric" })
      : "";
    text.textContent = dateStr
      ? `Schedule published ${dateStr} — employees have been notified`
      : "Schedule is published";
  } else if (status === "draft") {
    badge.textContent = "✎ Draft";
    text.textContent = "This schedule is a draft — not visible to staff yet";
  } else {
    badge.textContent = "No Schedule";
    text.textContent = "Build the schedule by dragging staff to days";
  }
}

async function handleSave(status) {
  const btn = status === "draft"
    ? document.getElementById("btn-save-draft")
    : document.getElementById("btn-publish");

  setButtonLoading(btn, true);

  try {
    const shifts = getScheduleAsShifts();
    const weekStr = formatWeekStart(currentWeekMonday);

    if (status === "published") showPublishOverlay();

    const result = await saveSchedule(
      managerCode, currentLocation, weekStr, shifts, status);

    // Apps Script returns error string if overlap detected
    if (result && result.error) {
      if (status === "published") hidePublishOverlay();
      showToast('⚠ ' + result.error, 'error');
      setButtonLoading(btn, false);
      return;
    }

    updateStatusBanner(status, status === "published" ? new Date().toISOString() : null);

    if (status === "published") {
      hidePublishOverlay();
      setDraftStatus("Published", "#10B981");
      showToast("Schedule published! Employees will be notified.", "success");
    } else {
      setDraftStatus("Draft saved", "#8B8FA8");
      showToast("Draft saved.", "success");
    }
  } catch (error) {
    if (status === "published") hidePublishOverlay();
    showToast(`Error: ${error.message}`, "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handlePublish() {
  const confirmed = confirm(
    `Publish schedule for ${currentLocation} - week of ${formatWeekLabel(currentWeekMonday)}?\n\nAll employees will receive an email notification.`
  );

  if (confirmed) {
    await handleSave("published");
  }
}

function renderRequestsView() {
  const container = document.getElementById("requests-list");
  if (!container) return;

  wireRequestFilters();
  updateLocationLabels();

  const empIds = allEmployees.map((emp) => emp.emp_id);
  let requests = allDayOff.filter((request) => empIds.includes(request.emp_id));

  if (requestsFilter !== "all") {
    requests = requests.filter((request) => request.status === requestsFilter);
  }

  requests.sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")));
  container.innerHTML = "";

  if (requests.length === 0) {
    container.innerHTML = `
      <div style="color:var(--text-muted);text-align:center;padding:60px;grid-column:1/-1">
        No requests found.
      </div>
    `;
    return;
  }

  requests.forEach((request) => {
    const emp = allEmployees.find((item) => item.emp_id === request.emp_id);
    const roleColor = getRoleColor(emp?.role || "");
    const sameDay = request.date_from === request.date_to;
    const dateLabel = sameDay
      ? formatDateShort(request.date_from)
      : `${formatDateShort(request.date_from)} - ${formatDateShort(request.date_to)}`;

    const statusColors = {
      pending: { bg: "#92400E22", text: "#F59E0B", label: "Pending", cls: "status-pending" },
      approved: { bg: "#06472922", text: "#10B981", label: "Approved", cls: "status-approved" },
      denied: { bg: "#7F1D1D22", text: "#EF4444", label: "Denied", cls: "status-denied" },
    };
    const sc = statusColors[request.status] || statusColors.pending;

    const card = document.createElement("article");
    card.className = "request-card";
    card.innerHTML = `
      <div class="request-top req-header">
        <div>
          <p class="request-name req-name">${escapeHtml(emp?.employee_name || request.emp_id)}</p>
          <span class="role-pill req-role" style="--role-color:${roleColor};color:${roleColor}">
            ${escapeHtml(emp?.role || "")}
          </span>
        </div>
        <span class="status-badge req-status-badge ${sc.cls}" style="background:${sc.bg};color:${sc.text}">
          ${sc.label}
        </span>
      </div>
      <p class="date-range req-dates">${dateLabel}</p>
      ${request.reason ? `<p class="reason req-reason">${escapeHtml(request.reason)}</p>` : ""}
      <p class="submitted req-submitted">Submitted ${escapeHtml(request.submitted_at || "")}</p>
      ${request.status === "pending" ? `
        <div class="request-actions req-actions">
          <button class="decision-btn decision-approve req-btn approve" type="button"
            onclick="handleRequestAction('${escapeForAttribute(request.request_id)}','approved',this)">
            <span class="spinner" aria-hidden="true"></span>&check; Approve
          </button>
          <button class="decision-btn decision-deny req-btn deny" type="button"
            onclick="handleRequestAction('${escapeForAttribute(request.request_id)}','denied',this)">
            <span class="spinner" aria-hidden="true"></span>&times; Deny
          </button>
        </div>
      ` : ""}
    `;

    container.appendChild(card);
  });
}

async function handleRequestAction(requestId, status, btn) {
  btn.disabled = true;
  btn.classList.add("is-loading");

  try {
    await updateDayOffStatus(managerCode, requestId, status);

    const request = allDayOff.find((item) => item.request_id === requestId);
    if (request) request.status = status;

    showToast(
      status === "approved" ? "Request approved." : "Request denied.",
      status === "approved" ? "success" : "error"
    );
    renderRequestsView();
  } catch (error) {
    showToast(`Error: ${error.message}`, "error");
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}

function renderEmployeesView() {
  const container = document.getElementById("employees-list");
  if (!container) return;

  updateLocationLabels();

  container.innerHTML = `
    <div class="employee-row table-head" aria-hidden="true">
      <div>Name</div>
      <div>Role</div>
      <div>Email</div>
      <div>Availability</div>
      <div>Status</div>
    </div>
  `;

  allEmployees.forEach((emp) => {
    const avail = allAvailability.find((item) => item.emp_id === emp.emp_id);
    const roleColor = getRoleColor(emp.role);
    const row = document.createElement("article");

    row.className = "employee-row emp-row";
    row.innerHTML = `
      <div class="name emp-name">${escapeHtml(emp.employee_name)}</div>
      <div>
        <span class="role-pill emp-role-badge" style="--role-color:${roleColor};background:${roleColor}22;color:${roleColor}">
          ${escapeHtml(emp.role)}
        </span>
      </div>
      <div class="email emp-email">
        ${emp.email ? escapeHtml(emp.email) : '<span style="color:var(--text-dim)">-</span>'}
      </div>
      <div class="availability emp-avail-dots">${buildAvailabilityDots(avail)}</div>
      <div><span class="status-active">Active</span></div>
    `;

    container.appendChild(row);
  });
}

function handleLocationChange() {
  const locSelect = document.getElementById("location-select");
  currentLocation = locSelect?.value || currentLocation;
  loadDashboard();
}

function wireRequestFilters() {
  const filterBar = document.getElementById("requests-filter-bar") || document.querySelector(".filter-pills");
  if (!filterBar || filterBar.dataset.wired) return;

  filterBar.dataset.wired = "1";

  const buttons = Array.from(filterBar.querySelectorAll("[data-filter], button"));
  buttons.forEach((btn) => {
    const filter = btn.dataset.filter || btn.textContent.trim().toLowerCase();
    btn.dataset.filter = filter;

    btn.addEventListener("click", () => {
      requestsFilter = filter;
      buttons.forEach((item) => {
        const active = item === btn;
        item.classList.toggle("active", active);
        item.classList.toggle("is-active", active);
      });
      renderRequestsView();
    });
  });
}

function updateLocationLabels() {
  const requestsLocation = document.getElementById("requests-location");
  const employeesLocation = document.getElementById("employees-location");

  if (requestsLocation) requestsLocation.textContent = currentLocation;
  if (employeesLocation) employeesLocation.textContent = currentLocation;
}

function buildAvailabilityDots(avail) {
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  return dayKeys.map((day) => {
    const val = avail ? avail[day] : null;
    const className = val === "OFF"
      ? "off"
      : val && val !== "OPEN"
        ? "hours"
        : val === "OPEN"
          ? "open"
          : "";
    const tip = escapeForAttribute(val || "Unknown");

    return `<span class="dot ${className}" title="${tip}"></span>`;
  }).join("");
}

function showToast(message, type = "success") {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  const bg = type === "success" ? "#10B981" : "#EF4444";

  toast.id = "toast";
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:80px;right:24px;z-index:9999;
    background:${bg};color:white;padding:12px 20px;
    border-radius:10px;font-size:14px;font-weight:500;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeIn 0.2s ease;
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showGlobalLoading(show, message) {
  const msg = message || "Loading schedule...";
  let overlay = document.getElementById("loading-overlay");
  if (show) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loading-overlay";
      overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="load-msg">${msg}</div>
      `;
      document.body.appendChild(overlay);
    } else {
      const m = overlay.querySelector(".load-msg");
      if (m) m.textContent = msg;
    }
  } else if (overlay) {
    overlay.remove();
  }
}

function setButtonLoading(btn, loading) {
  if (!btn) return;

  btn.disabled = loading;
  btn.dataset.orig = btn.dataset.orig || btn.textContent.trim();
  btn.classList.toggle("is-loading", loading);

  if (!btn.querySelector(".spinner")) {
    btn.textContent = loading ? "..." : btn.dataset.orig;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeForAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

window.switchView = switchView;
window.loadDashboard = loadDashboard;
window.handleLocationChange = handleLocationChange;
window.handleRequestAction = handleRequestAction;
