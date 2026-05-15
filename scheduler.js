// The working schedule, keyed by date string "YYYY-MM-DD".
let scheduleState = {};
let _availabilityData = [];
let _dayOffData = [];
let _currentWeekDates = [];

function setSchedulerContext(availability, dayOff, weekDates) {
  _availabilityData = availability || [];
  _dayOffData = dayOff || [];
  _currentWeekDates = weekDates || [];
}

function clearScheduleState() {
  scheduleState = {};
}

function getScheduleAsShifts() {
  const shifts = [];

  Object.entries(scheduleState).forEach(([date, dayShifts]) => {
    dayShifts.forEach((shift) => {
      shifts.push({
        emp_id: shift.empId,
        employee_name: shift.employeeName,
        role: shift.role,
        date: date,
        start_time: shift.startTime,
        end_time: shift.endTime,
        notes: "",
      });
    });
  });

  return shifts;
}

// Called by app.js whenever week changes or data loads.
function renderCalendar(weekDates, existingShifts = []) {
  const grid = document.getElementById("schedule-grid");
  if (!grid) return;

  grid.innerHTML = "";
  clearScheduleState();

  existingShifts.forEach((shift) => {
    if (!scheduleState[shift.date]) {
      scheduleState[shift.date] = [];
    }

    scheduleState[shift.date].push({
      shiftId: shift.shift_id || generateShiftId(),
      empId: shift.emp_id,
      employeeName: shift.employee_name,
      role: shift.role,
      startTime: shift.start_time || "17:00",
      endTime: shift.end_time || "23:00",
    });
  });

  weekDates.forEach((date) => {
    const dateStr = formatWeekStart(date);
    const col = createDayColumn(date, dateStr);
    grid.appendChild(col);
  });
}

function createDayColumn(date, dateStr) {
  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  const col = document.createElement("article");
  col.className = `day-column${isToday ? " is-today" : ""}`;
  col.dataset.date = dateStr;

  const header = document.createElement("header");
  header.className = `day-head day-header${isToday ? " today" : ""}`;
  header.innerHTML = `${dayNames[date.getDay()]}<span>${date.getDate()}</span>`;
  col.appendChild(header);

  const zone = document.createElement("div");
  zone.className = "drop-zone";
  zone.dataset.date = dateStr;

  setTimeout(() => {
    const bar = buildUnavailableBar(dateStr);
    if (bar) zone.insertBefore(bar, zone.firstChild);
  }, 100);

  const dayShifts = scheduleState[dateStr] || [];
  dayShifts.forEach((shift) => {
    zone.appendChild(createShiftCard(shift, dateStr));
  });

  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragover", "drag-over");
    event.dataTransfer.dropEffect = "copy";
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-dragover", "drag-over");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragover", "drag-over");

    const payload = event.dataTransfer.getData("application/json");
    if (!payload) return;

    try {
      const data = JSON.parse(payload);
      const date = _currentWeekDates.find((item) => formatWeekStart(item) === dateStr);
      const status = date ? getEmpStatusForDate(data.emp_id, date) : "available";

      if (status === "off" || status === "dayoff") {
        const label = status === "dayoff" ? "day off request" : "marked as OFF";
        const ok = confirm(
          `${data.employee_name} is ${label} on this day.\nAdd to schedule anyway?`
        );

        if (!ok) return;
      }

      addShiftToDay(dateStr, data, zone);
    } catch (_) {
      return;
    }
  });

  col.appendChild(zone);
  return col;
}

function addShiftToDay(dateStr, empData, zone) {
  const shift = {
    shiftId: generateShiftId(),
    empId: empData.emp_id,
    employeeName: empData.employee_name,
    role: empData.role,
    startTime: "17:00",
    endTime: "23:00",
  };

  if (!scheduleState[dateStr]) {
    scheduleState[dateStr] = [];
  }

  scheduleState[dateStr].push(shift);
  zone.appendChild(createShiftCard(shift, dateStr));
  markDraftChanged();
}

function createShiftCard(shift, dateStr) {
  const roleColor = getRoleColor(shift.role);
  const card = document.createElement("article");

  card.className = "shift-card";
  card.dataset.shiftId = shift.shiftId;
  card.style.setProperty("--role-color", roleColor);
  card.style.borderLeftColor = roleColor;

  card.innerHTML = `
    <button class="remove-shift shift-remove" type="button" aria-label="Remove shift" onclick="removeShift('${escapeForAttribute(dateStr)}','${escapeForAttribute(shift.shiftId)}',this)">&times;</button>
    <p class="shift-name">${escapeHtml(shift.employeeName)}</p>
    <span class="role-pill shift-role" style="--role-color: ${roleColor}; background:${roleColor}22;color:${roleColor}">
      ${escapeHtml(shift.role)}
    </span>
    <div class="time-row shift-times">
      <input class="time-input" type="text" inputmode="numeric" value="${escapeForAttribute(shift.startTime)}"
        onchange="updateShiftTime('${escapeForAttribute(dateStr)}','${escapeForAttribute(shift.shiftId)}','start',this.value)"
        aria-label="Shift start time">
      <span class="time-sep">&rarr;</span>
      <input class="time-input" type="text" inputmode="numeric" value="${escapeForAttribute(shift.endTime)}"
        onchange="updateShiftTime('${escapeForAttribute(dateStr)}','${escapeForAttribute(shift.shiftId)}','end',this.value)"
        aria-label="Shift end time">
    </div>
  `;

  return card;
}

function removeShift(dateStr, shiftId, btn) {
  scheduleState[dateStr] = (scheduleState[dateStr] || []).filter((shift) => shift.shiftId !== shiftId);

  if (btn) {
    const card = btn.closest(".shift-card");
    if (card) card.remove();
  }

  markDraftChanged();
}

function updateShiftTime(dateStr, shiftId, field, value) {
  const shift = (scheduleState[dateStr] || []).find((item) => item.shiftId === shiftId);

  if (!shift) return;

  if (field === "start") {
    shift.startTime = value;
  }

  if (field === "end") {
    shift.endTime = value;
  }

  markDraftChanged();
}

// Called by app.js after loading employees, availability, day off requests, and week dates.
function renderEmployeeList(employees, availability, dayOffRequests, weekDates) {
  setSchedulerContext(availability, dayOffRequests, weekDates);

  const list = document.getElementById("employee-list");
  const mobileList = document.querySelector(".mobile-staff");

  if (list) list.innerHTML = "";
  if (mobileList) mobileList.innerHTML = "";
  if (!list && !mobileList) return;

  const weekDateStrs = weekDates.map((date) => formatWeekStart(date));

  employees.forEach((emp) => {
    const avail = availability.find((item) => item.emp_id === emp.emp_id);
    const hasDayOff = dayOffRequests.some((request) => {
      if (request.emp_id !== emp.emp_id) return false;
      if (request.status === "denied") return false;
      return weekDateStrs.some((date) => date >= request.date_from && date <= request.date_to);
    });

    if (list) {
      list.appendChild(createEmployeeCard(emp, avail, hasDayOff));
    }

    if (mobileList) {
      mobileList.appendChild(createEmployeeChip(emp));
    }
  });
}

function createEmployeeCard(emp, avail, hasDayOff) {
  const roleColor = getRoleColor(emp.role);
  const card = document.createElement("article");

  card.className = "employee-card employee-chip";
  card.draggable = true;
  card.dataset.empId = emp.emp_id;
  card.dataset.empName = emp.employee_name;
  card.dataset.employeeName = emp.employee_name;
  card.dataset.role = emp.role;

  card.innerHTML = `
    <div class="employee-main chip-main">
      <p class="employee-name chip-name">
        ${escapeHtml(emp.employee_name)}
        ${hasDayOff ? '<span class="warning day-off-warn" title="Day off this week">!</span>' : ""}
      </p>
      <span class="role-pill chip-role" style="--role-color: ${roleColor}; color:${roleColor}">${escapeHtml(emp.role)}</span>
      <div class="availability chip-dots" aria-label="Weekly availability">${createAvailabilityDots(avail)}</div>
    </div>
    <div class="card-tools">
      <span>${hasDayOff ? '<span class="warning" title="Day off this week">!</span>' : ""}</span>
      <span class="drag-handle" aria-hidden="true">::</span>
    </div>
  `;

  attachEmployeeDrag(card, emp);
  return card;
}

function createEmployeeChip(emp) {
  const roleColor = getRoleColor(emp.role);
  const chip = document.createElement("button");

  chip.className = "employee-chip";
  chip.type = "button";
  chip.draggable = true;
  chip.style.setProperty("--role-color", roleColor);
  chip.textContent = emp.employee_name;

  attachEmployeeDrag(chip, emp);
  return chip;
}

function attachEmployeeDrag(el, emp) {
  el.addEventListener("dragstart", (event) => {
    el.classList.add("dragging");
    event.dataTransfer.setData("application/json", JSON.stringify({
      emp_id: emp.emp_id,
      employee_name: emp.employee_name,
      role: emp.role,
    }));
    event.dataTransfer.effectAllowed = "copy";

    _currentWeekDates.forEach((date) => {
      const dateStr = formatWeekStart(date);
      const col = document.querySelector(`.day-column[data-date="${dateStr}"]`);
      if (!col) return;

      const status = getEmpStatusForDate(emp.emp_id, date);
      col.classList.remove("avail-ok", "avail-off", "avail-dayoff");

      if (status === "available") col.classList.add("avail-ok");
      else if (status === "off") col.classList.add("avail-off");
      else if (status === "dayoff") col.classList.add("avail-dayoff");
    });
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    document.querySelectorAll(".day-column").forEach((col) => {
      col.classList.remove("avail-ok", "avail-off", "avail-dayoff");
    });
  });
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getEmpAvailForDate(empId, date) {
  const avail = _availabilityData.find((item) => item.emp_id === empId);
  if (!avail) return "OPEN";

  const dayKey = DAY_KEYS[date.getDay()];
  return avail[dayKey] || "OPEN";
}

function hasApprovedDayOff(empId, dateStr) {
  return _dayOffData.some((request) => {
    if (request.emp_id !== empId) return false;
    if (request.status === "denied") return false;
    return dateStr >= request.date_from && dateStr <= request.date_to;
  });
}

function getEmpStatusForDate(empId, date) {
  const dateStr = formatWeekStart(date);
  if (hasApprovedDayOff(empId, dateStr)) return "dayoff";

  const avail = getEmpAvailForDate(empId, date);
  if (avail === "OFF") return "off";

  return "available";
}

function buildUnavailableBar(dateStr) {
  const date = _currentWeekDates.find(
    d => formatWeekStart(d) === dateStr
  );
  if (!date || !_availabilityData.length) return null;

  const unavailable = [];

  const chips = document.querySelectorAll("#employee-list .employee-chip");
  chips.forEach((chip) => {
    const empId = chip.dataset.empId;
    const empName = chip.dataset.empName;
    const role = chip.dataset.role;
    if (!empId) return;

    const status = getEmpStatusForDate(empId, date);
    if (status === "off" || status === "dayoff") {
      unavailable.push({ empId, empName, role, status });
    }
  });

  if (unavailable.length === 0) return null;

  const bar = document.createElement("div");
  bar.className = "unavail-bar";
  bar.style.cssText = `
    padding: 6px 8px 4px;
    border-bottom: 1px solid rgba(111,29,27,0.08);
    margin-bottom: 4px;
  `;

  const label = document.createElement("div");
  label.style.cssText = `
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.8px; color: #B8A99A;
    margin-bottom: 4px; font-weight: 600;
  `;
  label.textContent = "Unavailable";
  bar.appendChild(label);

  const pills = document.createElement("div");
  pills.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;";

  unavailable.forEach((emp) => {
    const pill = document.createElement("div");
    const isOff = emp.status === "off";
    pill.title = `${emp.empName} - ${isOff ? "OFF" : "Day off requested"}`;
    pill.style.cssText = `
      background: ${isOff
        ? "rgba(220,38,38,0.10)"
        : "rgba(201,162,39,0.12)"};
      color: ${isOff ? "#DC2626" : "#92400E"};
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 500;
      cursor: default;
      white-space: nowrap;
    `;
    pill.textContent = emp.empName.split(" ")[0] + (isOff ? "" : " ⚠");
    pills.appendChild(pill);
  });

  bar.appendChild(pills);
  return bar;
}

function createAvailabilityDots(avail) {
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  return dayKeys.map((day) => {
    const val = avail ? avail[day] : null;
    let className = "";

    if (val === "OPEN") {
      className = "open";
    } else if (val === "OFF") {
      className = "off";
    } else if (val) {
      className = "hours";
    }

    return `<span class="dot ${className}"></span>`;
  }).join("");
}

function generateShiftId() {
  return `shift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function markDraftChanged() {
  const status = document.getElementById("draft-status");

  if (status) {
    status.textContent = "Unsaved changes";
    status.style.color = "#F59E0B";
  }

  if (typeof scheduleAutoSave === "function") scheduleAutoSave();
}

function setDraftStatus(text, color = "#8B8FA8") {
  const status = document.getElementById("draft-status");

  if (status) {
    status.textContent = text;
    status.style.color = color;
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
