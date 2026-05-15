const API_URL = "https://script.google.com/macros/s/AKfycbwklg1Z31f-Nf_dh54ubKm7FTFi725XrT5gdhj8Dhm1h2GzdTJ28vxNapBPy4eX38ex/exec";

// -- AUTH ------------------------------------------------------
// Called from index.html login form.
async function checkAccess(code) {
  try {
    const data = await apiGet("get_all_employees", { manager_code: code });

    if (data.success) {
      sessionStorage.setItem("mgr_code", code);
      window.location.href = "dashboard.html";
      return true;
    }

    showLoginError("Invalid code. Try again.");
    return false;
  } catch (e) {
    showLoginError("Connection error. Try again.");
    return false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");

  if (el) {
    el.textContent = msg;
    el.style.display = "block";
    el.classList.add("is-visible");
  }
}

function requireAuth() {
  const code = sessionStorage.getItem("mgr_code");

  if (!code) {
    window.location.href = "index.html";
  }

  return code;
}

// -- CORE HELPERS ---------------------------------------------
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

async function apiPost(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  
  let data;
  try {
    data = await res.json();
  } catch (_) {
    // Response was not JSON (Apps Script redirect) — treat as success
    return { success: true };
  }
  
  // Response was valid JSON — check for API-level errors
  if (data && data.error) {
    throw new Error(data.error);
  }
  
  return data || { success: true };
}

// -- EMPLOYEES -------------------------------------------------
async function fetchAllEmployees(managerCode) {
  return apiGet("get_all_employees", { manager_code: managerCode });
}

// -- AVAILABILITY ---------------------------------------------
async function fetchAllAvailability(managerCode) {
  return apiGet("get_all_availability", { manager_code: managerCode });
}

// -- DAY OFF REQUESTS -----------------------------------------
async function fetchAllDayOff(managerCode) {
  return apiGet("get_all_day_off", { manager_code: managerCode });
}

async function updateDayOffStatus(managerCode, requestId, status) {
  return apiPost({
    action: "update_day_off_status",
    manager_code: managerCode,
    request_id: requestId,
    status: status,
  });
}

// -- SCHEDULE --------------------------------------------------
async function fetchManagerSchedule(managerCode, location, weekStart) {
  return apiGet("get_schedule_manager", {
    manager_code: managerCode,
    location: location,
    week_start: weekStart,
  });
}

async function saveSchedule(managerCode, location, weekStart, shifts, status) {
  return apiPost({
    action: "save_schedule",
    manager_code: managerCode,
    location: location,
    week_start: weekStart,
    shifts: shifts,
    status: status,
    published_by: "Manager",
  });
}

// -- DATE HELPERS ---------------------------------------------
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);

  d.setDate(diff);
  d.setHours(0, 0, 0, 0);

  return d;
}

function formatWeekStart(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatWeekLabel(monday) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const end = new Date(monday);

  end.setDate(monday.getDate() + 6);

  return `${months[monday.getMonth()]} ${monday.getDate()} - ${months[end.getMonth()]} ${end.getDate()}, ${monday.getFullYear()}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (!isNaN(d)) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun",
                      "Jul","Aug","Sep","Oct","Nov","Dec"];
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return days[d.getDay()] + " " + months[d.getMonth()] + " " + d.getDate();
    }
  } catch (_) {}
  // Fallback: parse long timestamp string
  try {
    const d = new Date(dateStr);
    if (!isNaN(d)) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun",
                      "Jul","Aug","Sep","Oct","Nov","Dec"];
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return days[d.getDay()] + " " + months[d.getMonth()] + " " + d.getDate();
    }
  } catch (_) {}
  return dateStr;
}

function getDatesOfWeek(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// -- ROLE COLORS ----------------------------------------------
const ROLE_COLORS = {
  Server: "#2563EB",
  Bartender: "#0891B2",
  Host: "#059669",
  Cook: "#D97706",
  Expo: "#9333EA",
  Busser: "#6B7280",
  Runner: "#DC2626",
  Captain: "#6F1D1B",
  Manager: "#374151",
};

function getRoleColor(role) {
  return ROLE_COLORS[role] || "#6B7280";
}
