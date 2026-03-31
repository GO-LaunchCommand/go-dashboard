/* ============================================
   LAUNCH COMMAND CENTRE - Frontend Logic
   ============================================ */

// ---- CONFIG ----
const CONFIG = {
    apiUrl: null,
    password: 'launch26',
    refreshInterval: 30000,
    lockDuration: 5 * 60 * 1000,
    localMode: true,
};

const TEAM_MEMBERS = ['Kym', 'Scott', 'Brendan'];
const TEAM_EMAILS = {
    'Kym': 'kym@gymnasticsonline.com',
    'Scott': 'scott@gymnasticsonline.com',
    'Brendan': 'brendan@gymnasticsonline.com'
};

// ---- STATE ----
let currentUser = null;
let areas = [];
let locks = {};
let currentAreaId = null;
let expandedActionId = null;
let refreshTimer = null;
let relatedTasks = [];
let showRelatedTasks = false;
let launchDate = '2026-07-01';
let isRecording = false;
let mediaRecorder = null;

const AREA_FILES = [
    'ws01-business-strategy', 'ws02-finance', 'ws03-legal-compliance',
    'ws04-people', 'ws05-website', 'ws06-everfit',
    'ws07-exercise-content', 'ws08-club-software', 'ws09-parent-resources',
    'ws10-club-sales', 'ws11-merchandise', 'ws13-member-experience',
    'ws14-technical', 'inbox'
];

// ---- HELPERS ----
function teamOptions(selected) {
    return TEAM_MEMBERS.map(m =>
        `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`
    ).join('');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateLong(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatStatus(status) {
    return { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'complete': 'Complete', 'blocked': 'Blocked' }[status] || status;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// Priority sort order: red=0, amber=1, green=2

function daysFromNow(n) {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function daysUntilLaunch() {
    return Math.ceil((new Date(launchDate) - new Date()) / (1000 * 60 * 60 * 24));
}

function daysBeforeLaunchToDate(daysBefore) {
    const d = new Date(launchDate);
    d.setDate(d.getDate() - daysBefore);
    return d.toISOString().split('T')[0];
}

function dateToDaysBeforeLaunch(dateStr) {
    if (!dateStr) return '';
    return Math.ceil((new Date(launchDate) - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}

// ---- LAUNCH DATE ----
async function loadConfig() {
    try {
        const cached = localStorage.getItem('dashboard_config');
        if (cached) {
            const c = JSON.parse(cached);
            if (c.launchDate) launchDate = c.launchDate;
        }
        const resp = await fetch(`data/config.json?t=${Date.now()}`);
        if (resp.ok) {
            const c = await resp.json();
            if (c.launchDate && !cached) launchDate = c.launchDate;
        }
    } catch (e) { /* use default */ }
    renderLaunchBanner();
}

function renderLaunchBanner() {
    const days = daysUntilLaunch();
    const el = document.getElementById('launch-countdown');
    if (el) {
        if (days > 0) el.textContent = `LAUNCH IN ${days} DAY${days !== 1 ? 'S' : ''}`;
        else if (days === 0) el.textContent = `🎉 LAUNCH DAY!`;
        else el.textContent = `LAUNCHED ${Math.abs(days)} DAYS AGO`;
    }
    const lbl = document.getElementById('launch-date-label');
    if (lbl) lbl.textContent = formatDateLong(launchDate);
    const inp = document.getElementById('launch-date-input');
    if (inp) inp.value = launchDate;
    // Sidebar countdown
    const sc = document.getElementById('sidebar-countdown');
    if (sc) sc.textContent = days > 0 ? `${days} days to launch` : (days === 0 ? 'Launch day!' : 'Launched!');
}

function toggleLaunchDateEdit() {
    const inp = document.getElementById('launch-date-input');
    inp.style.display = inp.style.display === 'none' ? 'inline-block' : 'none';
    if (inp.style.display !== 'none') inp.focus();
}

function saveLaunchDate(val) {
    launchDate = val;
    localStorage.setItem('dashboard_config', JSON.stringify({ launchDate }));
    document.getElementById('launch-date-input').style.display = 'none';
    renderLaunchBanner();
    renderSummary();
}

// Deadline sync: date ↔ days-before-launch
function syncDeadlineFromDate() {
    const dateVal = document.getElementById('new-action-deadline').value;
    const daysInput = document.getElementById('new-action-days-before');
    if (dateVal && daysInput) {
        const days = dateToDaysBeforeLaunch(dateVal);
        daysInput.value = days > 0 ? days : '';
    }
}

function syncDeadlineFromDays() {
    const daysInput = document.getElementById('new-action-days-before');
    const dateInput = document.getElementById('new-action-deadline');
    if (daysInput.value && dateInput) {
        dateInput.value = daysBeforeLaunchToDate(parseInt(daysInput.value));
    }
}

// ---- LOGIN ----
function voicePassword() {
    const btn = document.querySelector('.password-mic-btn');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Voice input not supported. Try Chrome or Edge.');
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = false;
    recognition.continuous = false;

    btn.style.background = '#E8317F';
    btn.style.borderRadius = '50%';
    btn.textContent = '⏹️';

    recognition.onresult = (event) => {
        let spoken = event.results[0][0].transcript.trim().toLowerCase().replace(/\s+/g, '');
        document.getElementById('login-password').value = spoken;
        // Auto-show so they can verify
        document.getElementById('login-password').type = 'text';
        document.querySelector('.password-toggle').textContent = '🙈';
        btn.textContent = '🎙️';
        btn.style.background = '';
    };
    recognition.onerror = () => {
        btn.textContent = '🎙️';
        btn.style.background = '';
    };
    recognition.onend = () => {
        btn.textContent = '🎙️';
        btn.style.background = '';
    };
    recognition.start();
}

function togglePasswordVisibility() {
    const input = document.getElementById('login-password');
    const btn = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

function attemptLogin() {
    const password = document.getElementById('login-password').value;
    const user = document.getElementById('login-user').value;
    if (password === CONFIG.password) {
        currentUser = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('user-name').textContent = user;
        document.getElementById('user-avatar').textContent = user.charAt(0);
        sessionStorage.setItem('dashboard_user', user);
        loadConfig();
        loadAllData();
        startAutoRefresh();
        showVoiceFab();
    } else {
        document.getElementById('login-error').style.display = 'block';
    }
}

function logout() {
    sessionStorage.removeItem('dashboard_user');
    currentUser = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-password').value = '';
    if (refreshTimer) clearInterval(refreshTimer);
}

// ---- DATA LOADING ----
async function loadAllData() {
    if (CONFIG.localMode) {
        const promises = AREA_FILES.map(async (id) => {
            const cached = localStorage.getItem(`area_${id}`);
            if (cached) { try { return JSON.parse(cached); } catch (e) {} }
            try {
                const resp = await fetch(`data/${id}.json?t=${Date.now()}`);
                if (resp.ok) return await resp.json();
            } catch (e) {}
            return null;
        });
        areas = (await Promise.all(promises)).filter(Boolean);
    } else {
        try {
            const resp = await fetch(`${CONFIG.apiUrl}?action=data`);
            const data = await resp.json();
            areas = data.areas || [];
            locks = data.locks || {};
        } catch (e) { console.error('Failed to load from API:', e); }
    }

    // Sort areas by priority (red first, then amber, then green)
    areas.sort((a, b) => {
        const order = {red: 0, amber: 1, green: 2};
        const va = order[a.trafficLight] !== undefined ? order[a.trafficLight] : 2;
        const vb = order[b.trafficLight] !== undefined ? order[b.trafficLight] : 2;
        return va - vb;
    });
    // Sort actions within each area by priority
    areas.forEach(area => {
        area.actions.sort((a, b) => {
            const order = {red: 0, amber: 1, green: 2};
            const va = order[a.priority] !== undefined ? order[a.priority] : 2;
            const vb = order[b.priority] !== undefined ? order[b.priority] : 2;
            return va - vb;
        });
    });

    renderCards();
    renderSummary();
    renderNotifications();
    renderLaunchBanner();
    updateSyncTime();

    if (currentAreaId) {
        const area = areas.find(a => a.id === currentAreaId);
        if (area) { renderActions(area); renderIdeas(area); renderActivityLog(area); }
    }
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadAllData, CONFIG.refreshInterval);
}

function updateSyncTime() {
    document.getElementById('sync-time').textContent = 'Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---- RENDER CARDS ----
function renderCards() {
    const grid = document.getElementById('cards-grid');
    grid.innerHTML = '';

    areas.forEach(area => {
        const totalActions = area.actions.length;
        const completeActions = area.actions.filter(a => a.status === 'complete').length;
        const progressPct = totalActions > 0 ? Math.round((completeActions / totalActions) * 100) : 0;
        const openActions = totalActions - completeActions;
        const ideasCount = area.ideas ? area.ideas.length : 0;
        const areaLocks = Object.keys(locks).filter(k => k.startsWith(area.id + '-'));
        const lockInfo = areaLocks.length > 0 ? locks[areaLocks[0]] : null;

        const card = document.createElement('div');
        card.className = 'area-card';
        card.setAttribute('data-traffic', area.trafficLight);
        card.setAttribute('data-area-id', area.id);
        card.onclick = () => openDetail(area.id);
        card.innerHTML = `
            <div class="card-top">
                <span class="card-icon">${area.icon || '📋'}</span>
                <span class="traffic-light ${area.trafficLight}"></span>
            </div>
            <div class="card-name">${area.name}</div>
            <div class="card-description">${area.description}</div>
            <div class="card-stats">
                <span class="card-stat">📋 ${openActions} open</span>
                <span class="card-stat">✅ ${completeActions} done</span>
                <span class="card-stat">💡 ${ideasCount} ideas</span>
            </div>
            <div class="card-progress"><div class="card-progress-fill" style="width: ${progressPct}%"></div></div>
            ${lockInfo ? `<div class="card-lock-indicator">🔒 ${lockInfo.user} is editing</div>` : ''}
        `;
        grid.appendChild(card);
    });
}

// ---- RENDER SUMMARY / METRICS ----
function renderSummary() {
    let total = 0, complete = 0, inProgress = 0, overdue = 0;
    const teamStats = {};
    TEAM_MEMBERS.forEach(m => { teamStats[m] = { total: 0, complete: 0 }; });
    const now = new Date();

    areas.forEach(area => {
        area.actions.forEach(action => {
            total++;
            if (action.status === 'complete') complete++;
            if (action.status === 'in-progress') inProgress++;
            if (action.status !== 'complete' && new Date(action.deadline) < now) overdue++;
            if (teamStats[action.owner]) {
                teamStats[action.owner].total++;
                if (action.status === 'complete') teamStats[action.owner].complete++;
            }
        });
    });

    const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('stat-inprogress').textContent = inProgress;
    document.getElementById('stat-complete').textContent = complete;

    // Progress ring
    const circle = document.getElementById('progress-circle');
    if (circle) {
        const circumference = 188.5;
        circle.style.strokeDashoffset = circumference - (circumference * pct / 100);
    }
    const pctEl = document.getElementById('launch-progress-pct');
    if (pctEl) pctEl.textContent = pct + '%';
    const lblEl = document.getElementById('launch-progress-label');
    if (lblEl) lblEl.textContent = `${complete} of ${total} complete`;

    // Team metrics
    const teamEl = document.getElementById('team-metrics');
    if (teamEl) {
        teamEl.innerHTML = TEAM_MEMBERS.map(m => {
            const s = teamStats[m];
            const p = s.total > 0 ? Math.round((s.complete / s.total) * 100) : 0;
            return `
                <div class="team-metric" onclick="showPersonTasks('${m}')" style="cursor:pointer" title="Click to see ${m}'s tasks">
                    <div class="team-metric-name">${m}</div>
                    <div class="team-metric-bar"><div class="team-metric-bar-fill" style="width:${p}%"></div></div>
                    <div class="team-metric-detail">${s.complete}/${s.total} done &middot; ${s.total - s.complete} remaining</div>
                </div>
            `;
        }).join('');
    }
}

// ---- PERSON TASK LIST (FULL PAGE) ----
let personTasksSearchQuery = '';

function showPersonTasks(person) {
    // Gather all tasks for this person across all areas
    const tasks = [];
    areas.forEach(area => {
        area.actions.forEach(action => {
            if (action.owner === person) {
                tasks.push({
                    task: action.task,
                    area: area.name,
                    areaId: area.id,
                    areaIcon: area.icon || '📋',
                    deadline: action.deadline,
                    priority: action.priority,
                    status: action.status,
                    id: action.id
                });
            }
        });
    });

    personTasksSearchQuery = '';
    renderPersonPage(person, tasks);
}

function renderPersonPage(person, allTasks) {
    const query = personTasksSearchQuery.toLowerCase();
    let tasks = allTasks;
    if (query) {
        tasks = allTasks.filter(t =>
            t.task.toLowerCase().includes(query) ||
            t.area.toLowerCase().includes(query)
        );
    }

    // Sort: incomplete by date (earliest first, no-date last), then complete at bottom
    tasks.sort((a, b) => {
        if (a.status === 'complete' && b.status !== 'complete') return 1;
        if (a.status !== 'complete' && b.status === 'complete') return -1;
        // Both same completion state — sort by date
        const aDate = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bDate = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aDate - bDate;
    });

    const now = new Date();
    const completeCount = allTasks.filter(t => t.status === 'complete').length;
    const inProgCount = allTasks.filter(t => t.status === 'in-progress').length;
    const overdueCount = allTasks.filter(t => t.status !== 'complete' && new Date(t.deadline) < now).length;

    const page = document.getElementById('person-page');
    page.innerHTML = `
        <div class="person-page-header">
            <button class="detail-back-btn" onclick="closePersonTasks()">← Dashboard</button>
            <div class="person-page-title-row">
                <h1>${person}'s Tasks <span class="person-page-count">${allTasks.length}</span></h1>
            </div>
            <div class="person-page-stats">
                <span class="person-stat-pill">${completeCount} ✅ complete</span>
                <span class="person-stat-pill">${inProgCount} 🟡 in progress</span>
                <span class="person-stat-pill ${overdueCount > 0 ? 'overdue' : ''}">${overdueCount} 🔴 overdue</span>
            </div>
            <div class="person-search-bar">
                <input type="text" id="person-search-input" class="form-input" placeholder="Search tasks or areas..."
                    value="${personTasksSearchQuery}"
                    oninput="personTasksSearchQuery=this.value; renderPersonPage('${person}', window._personAllTasks)">
            </div>
        </div>
        <div class="person-tasks-grid">
            ${tasks.map(t => {
                const isOverdue = t.status !== 'complete' && t.deadline && new Date(t.deadline) < now;
                const dbl = dateToDaysBeforeLaunch(t.deadline);
                const dblLabel = dbl > 0 ? dbl + 'd before launch' : '';
                const dateDisplay = t.deadline ? formatDate(t.deadline) : 'No date';
                return `
                    <div class="person-task-card ${t.status === 'complete' ? 'complete' : ''} ${isOverdue ? 'overdue-card' : ''}"
                         onclick="closePersonTasks(); openDetail('${t.areaId}')">
                        <div class="person-card-top">
                            <span class="traffic-light ${t.priority}"></span>
                            <span class="status-badge ${t.status}">${formatStatus(t.status)}</span>
                        </div>
                        <div class="person-card-task">${t.task}</div>
                        <div class="person-card-meta">
                            <span>${t.areaIcon} ${t.area}</span>
                        </div>
                        <div class="person-card-date ${isOverdue ? 'overdue' : ''}">
                            📅 ${dateDisplay} ${dblLabel ? '<small>' + dblLabel + '</small>' : ''}
                        </div>
                    </div>`;
            }).join('')}
            ${tasks.length === 0 ? '<div class="person-no-results">No tasks match your search.</div>' : ''}
        </div>
    `;

    // Store all tasks for search re-renders
    window._personAllTasks = allTasks;

    page.style.display = 'block';
    document.getElementById('dashboard').querySelector('.launch-banner').style.display = 'none';
    document.getElementById('dashboard').querySelector('.metrics-bar').style.display = 'none';
    document.getElementById('dashboard').querySelector('.filter-bar').style.display = 'none';
    document.getElementById('dashboard').querySelector('.cards-grid').style.display = 'none';
}

function closePersonTasks() {
    document.getElementById('person-page').style.display = 'none';
    document.getElementById('person-page').innerHTML = '';
    document.getElementById('dashboard').querySelector('.launch-banner').style.display = '';
    document.getElementById('dashboard').querySelector('.metrics-bar').style.display = '';
    document.getElementById('dashboard').querySelector('.filter-bar').style.display = '';
    document.getElementById('dashboard').querySelector('.cards-grid').style.display = '';
}

// ---- FILTER ----
function filterCards(filter, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.area-card').forEach(card => {
        if (filter === 'all') card.classList.remove('filtered-out');
        else card.classList.toggle('filtered-out', card.getAttribute('data-traffic') !== filter);
    });
}

// ---- NOTIFICATIONS ----
function renderNotifications() {
    const list = document.getElementById('notif-list');
    const allLogs = [];
    areas.forEach(area => {
        (area.activityLog || []).forEach(log => { allLogs.push({ ...log, area: area.name, areaId: area.id }); });
    });
    allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = allLogs.slice(0, 20);

    const warnings = [];
    const now = new Date();
    areas.forEach(area => {
        area.actions.forEach(action => {
            if (action.status === 'complete') return;
            const deadline = new Date(action.deadline);
            const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) warnings.push({ type: 'overdue', task: action.task, area: area.name, days: Math.abs(daysLeft) });
            else if (daysLeft <= 7) warnings.push({ type: 'soon', task: action.task, area: area.name, days: daysLeft });
        });
    });

    let html = '';
    warnings.forEach(w => {
        const icon = w.type === 'overdue' ? '🔴' : '🟡';
        const msg = w.type === 'overdue'
            ? `<strong>${w.task}</strong> in ${w.area} is ${w.days} day${w.days !== 1 ? 's' : ''} overdue`
            : `<strong>${w.task}</strong> in ${w.area} is due in ${w.days} day${w.days !== 1 ? 's' : ''}`;
        html += `<div class="notif-item"><span class="notif-dot" style="background:${w.type === 'overdue' ? 'var(--red)' : 'var(--amber)'}"></span><div class="notif-content">${icon} ${msg}</div></div>`;
    });
    recent.forEach(log => {
        html += `<div class="notif-item"><span class="notif-dot"></span><div class="notif-content"><strong>${log.by}</strong> ${log.action} in <strong>${log.area}</strong><div class="notif-time">${log.date}</div></div></div>`;
    });
    list.innerHTML = html || '<div style="padding: 20px; text-align: center; color: var(--text-dim);">No activity yet</div>';

    const badge = document.getElementById('notif-badge');
    if (warnings.length > 0) { badge.style.display = 'flex'; badge.textContent = warnings.length; }
    else { badge.style.display = 'none'; }
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ---- SIDEBAR ----
function renderSidebar() {
    const list = document.getElementById('sidebar-list');
    if (!list) return;
    list.innerHTML = areas.map((area, idx) => `
        <button class="sidebar-item ${area.id === currentAreaId ? 'active' : ''}"
                draggable="true"
                data-sidebar-idx="${idx}"
                onclick="switchArea('${area.id}')" title="${area.name}">
            <span class="sidebar-drag-handle" onmousedown="event.stopPropagation()">⠿</span>
            <span class="sidebar-item-icon">${area.icon || '📋'}</span>
            <span class="sidebar-item-name">${area.name}</span>
            <span class="sidebar-item-traffic ${area.trafficLight}"></span>
        </button>
    `).join('');
    initSidebarDrag();
    renderLaunchBanner();
}

// ---- SIDEBAR DRAG & DROP ----
function initSidebarDrag() {
    const list = document.getElementById('sidebar-list');
    if (!list) return;
    let dragIdx = null;

    list.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragIdx = parseInt(item.dataset.sidebarIdx);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            list.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('drag-over'));
            dragIdx = null;
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropIdx = parseInt(item.dataset.sidebarIdx);
            if (dragIdx !== null && dragIdx !== dropIdx) {
                const moved = areas.splice(dragIdx, 1)[0];
                areas.splice(dropIdx, 0, moved);
                renderSidebar();
                renderCards();
            }
        });
    });
}

function switchArea(areaId) {
    if (areaId === currentAreaId) return;
    openDetail(areaId);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

// ---- DETAIL PANEL ----
function openDetail(areaId) {
    currentAreaId = areaId;
    expandedActionId = null;
    showRelatedTasks = false;
    relatedTasks = [];
    const area = areas.find(a => a.id === areaId);
    if (!area) return;

    document.getElementById('detail-icon').textContent = area.icon || '📋';
    document.getElementById('detail-title').textContent = area.name;
    document.getElementById('detail-description').textContent = area.description;
    document.getElementById('description-textarea').value = area.description;
    document.getElementById('detail-traffic-select').value = area.trafficLight;
    document.querySelector('#detail-traffic .traffic-light-lg').className = `traffic-light-lg ${area.trafficLight}`;

    renderActions(area);
    renderIdeas(area);
    renderActivityLog(area);
    renderSidebar();

    document.getElementById('description-display').style.display = 'block';
    document.getElementById('description-edit').style.display = 'none';
    document.getElementById('add-action-form').style.display = 'none';
    document.getElementById('detail-overlay').style.display = 'flex';
    const mainEl = document.querySelector('.detail-main');
    if (mainEl) mainEl.scrollTop = 0;
}

function closeDetail() {
    document.getElementById('detail-overlay').style.display = 'none';
    currentAreaId = null;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('detail-overlay').style.display !== 'none') {
        closeDetail();
    }
});

// ---- TRAFFIC LIGHT ----
function changeTrafficLight(value) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    area.trafficLight = value;
    document.querySelector('#detail-traffic .traffic-light-lg').className = `traffic-light-lg ${value}`;
    addActivityLog(area, `Changed status to ${value}`);
    areas.sort((a, b) => ({red:0,amber:1,green:2}[a.trafficLight]||0) - ({red:0,amber:1,green:2}[b.trafficLight]||0));
    saveArea(area); renderCards(); renderSummary(); renderSidebar();
}

// ---- DESCRIPTION EDITING ----
function editSection(section) {
    if (section === 'description') {
        document.getElementById('description-display').style.display = 'none';
        document.getElementById('description-edit').style.display = 'block';
    }
}
function cancelEdit(section) {
    if (section === 'description') {
        const area = areas.find(a => a.id === currentAreaId);
        document.getElementById('description-textarea').value = area.description;
        document.getElementById('description-display').style.display = 'block';
        document.getElementById('description-edit').style.display = 'none';
    }
}
function saveSection(section) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    if (section === 'description') {
        area.description = document.getElementById('description-textarea').value;
        document.getElementById('detail-description').textContent = area.description;
        document.getElementById('description-display').style.display = 'block';
        document.getElementById('description-edit').style.display = 'none';
        addActivityLog(area, 'Updated description');
    }
    saveArea(area); renderCards();
}

// ---- ACTIONS ----
function renderActions(area) {
    const table = document.getElementById('actions-table');
    let html = '';

    area.actions.forEach((action, idx) => {
        const isOverdue = new Date(action.deadline) < new Date() && action.status !== 'complete';
        const isExpanded = expandedActionId === action.id;
        const dbl = dateToDaysBeforeLaunch(action.deadline);
        const dblLabel = dbl > 0 ? `(${dbl}d before launch)` : '';

        html += `
            <div class="action-row" draggable="true" data-action-idx="${idx}" onclick="toggleActionExpand('${action.id}')">
                <span class="drag-handle" onmousedown="event.stopPropagation()">⠿</span>
                <span class="traffic-light ${action.priority}"></span>
                <span class="action-task ${action.status === 'complete' ? 'complete' : ''}">${action.task}</span>
                <span class="action-owner">${action.owner}</span>
                <span class="action-deadline ${isOverdue ? 'overdue' : ''}">${formatDate(action.deadline)} <small style="color:var(--text-dim)">${dblLabel}</small></span>
                <span class="status-badge ${action.status}">${formatStatus(action.status)}</span>
                <button class="cal-btn" onclick="event.stopPropagation(); downloadICS('${action.id}')" title="Add to calendar">📅</button>
                <button class="action-menu-btn" onclick="event.stopPropagation(); deleteAction('${action.id}')" title="Delete">🗑</button>
            </div>
        `;

        if (isExpanded) {
            html += `<div class="action-expand">`;
            if (action.updates && action.updates.length > 0) {
                html += `<div class="action-updates"><strong>Updates:</strong>`;
                action.updates.forEach(u => { html += `<div class="action-update-item"><span class="action-update-date">${u.date}</span><span class="action-update-by">${u.by}</span><span>${u.note}</span></div>`; });
                html += `</div>`;
            }
            html += `<div class="add-update-row"><input type="text" id="update-input-${action.id}" placeholder="Add an update..." onkeydown="if(event.key==='Enter'){addUpdate('${action.id}');event.stopPropagation()}" onclick="event.stopPropagation()"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); addUpdate('${action.id}')">Add</button></div>`;
            html += `<div class="action-status-change" onclick="event.stopPropagation()">
                <span style="font-size:12px; color: var(--text-dim);">Task:</span>
                <input type="text" value="${action.task.replace(/"/g, '&quot;')}" onchange="changeActionField('${action.id}', 'task', this.value)" style="flex:1; padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px;">
            </div>
            <div class="action-status-change" onclick="event.stopPropagation()">
                <span style="font-size:12px; color: var(--text-dim);">Owner:</span>
                <select onchange="changeActionField('${action.id}', 'owner', this.value)">
                    ${TEAM_MEMBERS.map(m => `<option value="${m}" ${m === action.owner ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <span style="font-size:12px; color: var(--text-dim); margin-left: 12px;">Deadline:</span>
                <input type="date" id="edit-date-${action.id}" value="${action.deadline || ''}" onchange="syncEditDeadlineFromDate('${action.id}')" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px;">
                <span style="font-size:12px; color: var(--text-dim); margin-left: 4px;">or</span>
                <input type="number" id="edit-days-${action.id}" value="${dbl > 0 ? dbl : ''}" min="0" placeholder="days" onchange="syncEditDeadlineFromDays('${action.id}')" style="width:60px; padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px; text-align:center;">
                <span style="font-size:12px; color: var(--text-dim);">days before launch</span>
            </div>
            <div class="action-status-change" onclick="event.stopPropagation()">
                <span style="font-size:12px; color: var(--text-dim);">Status:</span>
                <select onchange="changeActionStatus('${action.id}', this.value)">
                    <option value="not-started" ${action.status === 'not-started' ? 'selected' : ''}>Not Started</option>
                    <option value="in-progress" ${action.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                    <option value="blocked" ${action.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                    <option value="complete" ${action.status === 'complete' ? 'selected' : ''}>Complete</option>
                </select>
                <span style="font-size:12px; color: var(--text-dim); margin-left: 12px;">Priority:</span>
                <select onchange="changeActionPriority('${action.id}', this.value)">
                    <option value="red" ${action.priority === 'red' ? 'selected' : ''}>🔴 High</option>
                    <option value="amber" ${action.priority === 'amber' ? 'selected' : ''}>🟡 Medium</option>
                    <option value="green" ${action.priority === 'green' ? 'selected' : ''}>🟢 Low</option>
                </select>
            </div>`;
            html += `</div>`;
        }
    });

    table.innerHTML = html || '<div style="padding: 16px; text-align: center; color: var(--text-dim);">No actions yet. Click "+ Add Action" to create one.</div>';
    initActionDrag(area);
}

// ---- ACTION DRAG & DROP ----
function initActionDrag(area) {
    const table = document.getElementById('actions-table');
    if (!table) return;
    let dragIdx = null;

    table.querySelectorAll('.action-row').forEach(row => {
        row.addEventListener('dragstart', (e) => {
            dragIdx = parseInt(row.dataset.actionIdx);
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            table.querySelectorAll('.action-row').forEach(r => r.classList.remove('drag-over'));
            dragIdx = null;
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            table.querySelectorAll('.action-row').forEach(r => r.classList.remove('drag-over'));
            row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const dropIdx = parseInt(row.dataset.actionIdx);
            if (dragIdx !== null && dragIdx !== dropIdx) {
                const moved = area.actions.splice(dragIdx, 1)[0];
                area.actions.splice(dropIdx, 0, moved);
                saveArea(area);
                renderActions(area);
            }
        });
    });
}

function toggleActionExpand(actionId) {
    expandedActionId = expandedActionId === actionId ? null : actionId;
    const area = areas.find(a => a.id === currentAreaId);
    if (area) renderActions(area);
}

// ---- ADD ACTION ----
function showAddAction() {
    document.getElementById('add-action-form').style.display = 'block';
    showRelatedTasks = false; relatedTasks = [];
    renderAddActionForm();
    document.getElementById('new-action-task').focus();
}
function hideAddAction() {
    document.getElementById('add-action-form').style.display = 'none';
    document.getElementById('new-action-task').value = '';
    showRelatedTasks = false; relatedTasks = [];
}

function renderAddActionForm() {
    const container = document.getElementById('related-tasks-container');
    if (!showRelatedTasks) {
        container.innerHTML = `<div class="related-tasks-toggle" onclick="toggleRelatedTasksForm()">🔗 Add related tasks (work backwards from a date)</div>`;
        return;
    }
    let html = `<div class="related-tasks-section"><h4>🔗 Related Tasks — work backwards from the main deadline</h4><p style="font-size:12px; color: var(--text-muted); margin-bottom: 12px;">Add the prep tasks that need to happen before this.</p>`;
    relatedTasks.forEach((rt, i) => {
        html += `<div class="related-task-row">
            <input type="text" value="${rt.task}" placeholder="e.g. Book venue, Hire videographer..." onchange="relatedTasks[${i}].task = this.value">
            <select onchange="relatedTasks[${i}].owner = this.value">${teamOptions(rt.owner)}</select>
            <input type="date" value="${rt.deadline}" onchange="relatedTasks[${i}].deadline = this.value">
            <select onchange="relatedTasks[${i}].priority = this.value">
                <option value="green" ${rt.priority === 'green' ? 'selected' : ''}>🟢</option>
                <option value="amber" ${rt.priority === 'amber' ? 'selected' : ''}>🟡</option>
                <option value="red" ${rt.priority === 'red' ? 'selected' : ''}>🔴</option>
            </select>
            <button class="related-task-remove" onclick="removeRelatedTask(${i})">✕</button>
        </div>`;
    });
    html += `<button class="related-task-add" onclick="addRelatedTaskRow()">+ Add another related task</button></div>`;
    container.innerHTML = html;
}

function toggleRelatedTasksForm() {
    showRelatedTasks = true;
    relatedTasks = [
        { task: '', owner: TEAM_MEMBERS[0], deadline: daysFromNow(7), priority: 'amber' },
        { task: '', owner: TEAM_MEMBERS[0], deadline: daysFromNow(11), priority: 'amber' }
    ];
    renderAddActionForm();
}
function addRelatedTaskRow() { relatedTasks.push({ task: '', owner: TEAM_MEMBERS[0], deadline: daysFromNow(7), priority: 'amber' }); renderAddActionForm(); }
function removeRelatedTask(i) { relatedTasks.splice(i, 1); renderAddActionForm(); }

function addAction() {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const task = document.getElementById('new-action-task').value.trim();
    if (!task) return;
    const owner = document.getElementById('new-action-owner').value;
    const deadline = document.getElementById('new-action-deadline').value;
    const priority = document.getElementById('new-action-priority').value;
    let nextNum = area.actions.length + 1;
    const prefix = area.id.substring(0, 3);

    area.actions.push({ id: prefix + '-' + String(nextNum++).padStart(3, '0'), task, owner, deadline: deadline || daysFromNow(14), priority, status: 'not-started', updates: [] });
    addActivityLog(area, `Added action: ${task}`);
    sendNotification(owner, task, area.name, deadline);

    if (showRelatedTasks) {
        relatedTasks.forEach(rt => {
            if (!rt.task.trim()) return;
            area.actions.push({ id: prefix + '-' + String(nextNum++).padStart(3, '0'), task: rt.task.trim(), owner: rt.owner, deadline: rt.deadline, priority: rt.priority, status: 'not-started', updates: [{ date: todayStr(), by: currentUser, note: `Related to: ${task}` }] });
            addActivityLog(area, `Added related task: ${rt.task.trim()}`);
            sendNotification(rt.owner, rt.task.trim(), area.name, rt.deadline);
        });
    }

    area.actions.sort((a, b) => ({red:0,amber:1,green:2}[a.priority]||0) - ({red:0,amber:1,green:2}[b.priority]||0));
    saveArea(area); renderActions(area); renderCards(); renderSummary(); hideAddAction();
}

function deleteAction(actionId) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const action = area.actions.find(a => a.id === actionId);
    if (!action || !confirm(`Delete action: "${action.task}"?`)) return;
    area.actions = area.actions.filter(a => a.id !== actionId);
    addActivityLog(area, `Deleted action: ${action.task}`);
    saveArea(area); renderActions(area); renderCards(); renderSummary();
}

function changeActionStatus(actionId, status) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const action = area.actions.find(a => a.id === actionId);
    if (!action) return;
    action.status = status;
    addActivityLog(area, `Changed "${action.task}" status to ${formatStatus(status)}`);
    saveArea(area); renderActions(area); renderCards(); renderSummary();
}

function changeActionPriority(actionId, priority) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const action = area.actions.find(a => a.id === actionId);
    if (!action) return;
    action.priority = priority;
    addActivityLog(area, `Changed "${action.task}" priority to ${priority}`);
    area.actions.sort((a, b) => ({red:0,amber:1,green:2}[a.priority]||0) - ({red:0,amber:1,green:2}[b.priority]||0));
    saveArea(area); renderActions(area); renderCards(); renderSummary();
}

function changeActionField(actionId, field, value) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const action = area.actions.find(a => a.id === actionId);
    if (!action) return;
    const oldVal = action[field];
    action[field] = value;
    addActivityLog(area, `Changed "${action.task}" ${field} from "${oldVal}" to "${value}"`);
    saveArea(area); renderActions(area); renderCards(); renderSummary();
}

// Sync edit deadline: date changed → update days field and save
function syncEditDeadlineFromDate(actionId) {
    const dateInput = document.getElementById('edit-date-' + actionId);
    const daysInput = document.getElementById('edit-days-' + actionId);
    if (!dateInput || !dateInput.value) return;
    const days = dateToDaysBeforeLaunch(dateInput.value);
    if (daysInput) daysInput.value = days > 0 ? days : '';
    changeActionField(actionId, 'deadline', dateInput.value);
}

// Sync edit deadline: days changed → update date field and save
function syncEditDeadlineFromDays(actionId) {
    const daysInput = document.getElementById('edit-days-' + actionId);
    const dateInput = document.getElementById('edit-date-' + actionId);
    if (!daysInput || !daysInput.value) return;
    const newDate = daysBeforeLaunchToDate(parseInt(daysInput.value));
    if (dateInput) dateInput.value = newDate;
    changeActionField(actionId, 'deadline', newDate);
}

function addUpdate(actionId) {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const action = area.actions.find(a => a.id === actionId);
    if (!action) return;
    const input = document.getElementById(`update-input-${actionId}`);
    const note = input.value.trim();
    if (!note) return;
    action.updates.push({ date: todayStr(), by: currentUser, note });
    addActivityLog(area, `Added update to "${action.task}"`);
    saveArea(area); renderActions(area);
}

// ---- CALENDAR .ICS DOWNLOAD ----
function downloadICS(actionId) {
    let action = null, areaName = '';
    for (const area of areas) {
        const found = area.actions.find(a => a.id === actionId);
        if (found) { action = found; areaName = area.name; break; }
    }
    if (!action) return;

    const deadline = new Date(action.deadline);
    const dtStart = deadline.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    // All-day event
    const dtStartDate = action.deadline.replace(/-/g, '');
    const endDate = new Date(deadline); endDate.setDate(endDate.getDate() + 1);
    const dtEndDate = endDate.toISOString().split('T')[0].replace(/-/g, '');

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Launch Command Centre//EN',
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:${dtStartDate}`,
        `DTEND;VALUE=DATE:${dtEndDate}`,
        `SUMMARY:${action.task}`,
        `DESCRIPTION:Area: ${areaName}\\nOwner: ${action.owner}\\nPriority: ${action.priority}\\nStatus: ${formatStatus(action.status)}`,
        `ORGANIZER;CN=Launch Command Centre:mailto:admin@gymnasticsonline.com`,
        'BEGIN:VALARM',
        'TRIGGER:-PT24H',
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: ${action.task} is due tomorrow`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${action.task.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- EMAIL NOTIFICATIONS ----
async function sendNotification(owner, task, areaName, deadline) {
    if (CONFIG.localMode) {
        console.log(`[Notification] Would email ${TEAM_EMAILS[owner]}: New task "${task}" in ${areaName}, due ${deadline}`);
        return;
    }
    // When live, call the API
    try {
        await fetch(`${CONFIG.apiUrl}?action=notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: owner, email: TEAM_EMAILS[owner], task, area: areaName, deadline, assignedBy: currentUser })
        });
    } catch (e) { console.warn('Email notification failed:', e); }
}

// ---- IDEAS ----
function renderIdeas(area) {
    const list = document.getElementById('ideas-list');
    let html = '';
    const isInbox = area.id === 'inbox';

    (area.ideas || []).forEach((idea, idx) => {
        if (isInbox) {
            // Inbox notes get full controls
            html += `
                <div class="idea-item inbox-note" data-idx="${idx}">
                    <span class="idea-bullet">📥</span>
                    <div class="idea-main">
                        <div class="idea-content" id="inbox-text-${idx}">${idea.text}</div>
                        <div class="idea-meta">${idea.by || 'Unknown'} &middot; ${idea.date || ''}</div>
                        <div class="inbox-actions">
                            <button class="inbox-btn" onclick="editInboxNote(${idx})" title="Edit">✏️ Edit</button>
                            <button class="inbox-btn" onclick="moveInboxToCard(${idx})" title="Move to card">📋 Move to Card</button>
                            <button class="inbox-btn inbox-btn-promote" onclick="promoteInboxToTask(${idx})" title="Convert to task">🎯 Make Task</button>
                            <button class="inbox-btn inbox-btn-delete" onclick="deleteInboxNote(${idx})" title="Delete">🗑️</button>
                        </div>
                        <div class="inbox-edit-form" id="inbox-edit-${idx}" style="display:none">
                            <textarea id="inbox-edit-text-${idx}" rows="2">${idea.text}</textarea>
                            <div class="inbox-edit-buttons">
                                <button class="btn btn-sm btn-primary" onclick="saveInboxEdit(${idx})">Save</button>
                                <button class="btn btn-sm btn-outline" onclick="cancelInboxEdit(${idx})">Cancel</button>
                            </div>
                        </div>
                        <div class="inbox-move-form" id="inbox-move-${idx}" style="display:none">
                            <select id="inbox-move-select-${idx}" class="form-input">
                                ${areas.filter(a => a.id !== 'inbox').map(a => `<option value="${a.id}">${a.icon || '📋'} ${a.name}</option>`).join('')}
                            </select>
                            <div class="inbox-edit-buttons">
                                <button class="btn btn-sm btn-primary" onclick="confirmMoveInbox(${idx})">Move</button>
                                <button class="btn btn-sm btn-outline" onclick="document.getElementById('inbox-move-${idx}').style.display='none'">Cancel</button>
                            </div>
                        </div>
                        <div class="inbox-task-form" id="inbox-task-${idx}" style="display:none">
                            <input type="text" id="inbox-task-name-${idx}" value="${idea.text.replace(/"/g, '&quot;')}" class="form-input" placeholder="Task name">
                            <div class="inbox-task-row">
                                <select id="inbox-task-area-${idx}" class="form-input">
                                    ${areas.filter(a => a.id !== 'inbox').map(a => `<option value="${a.id}">${a.icon || '📋'} ${a.name}</option>`).join('')}
                                </select>
                                <select id="inbox-task-owner-${idx}" class="form-input">
                                    ${TEAM_MEMBERS.map(m => `<option value="${m}">${m}</option>`).join('')}
                                </select>
                            </div>
                            <div class="inbox-task-row">
                                <input type="date" id="inbox-task-date-${idx}" class="form-input">
                                <select id="inbox-task-priority-${idx}" class="form-input">
                                    <option value="red">🔴 High</option>
                                    <option value="amber" selected>🟡 Medium</option>
                                    <option value="green">🟢 Low</option>
                                </select>
                            </div>
                            <div class="inbox-edit-buttons">
                                <button class="btn btn-sm btn-primary" onclick="confirmPromoteInbox(${idx})">Create Task</button>
                                <button class="btn btn-sm btn-outline" onclick="document.getElementById('inbox-task-${idx}').style.display='none'">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        } else {
            // Regular ideas — simple display
            html += `<div class="idea-item"><span class="idea-bullet">💡</span><div><div class="idea-content">${idea.text}</div><div class="idea-meta">${idea.by || ''} &middot; ${idea.date || ''}</div></div></div>`;
        }
    });

    list.innerHTML = html || '<div style="padding: 8px; color: var(--text-dim); font-size: 13px;">' + (isInbox ? 'No voice notes yet — use the 🎙️ mic to add one' : 'No ideas yet') + '</div>';
}

// ---- INBOX NOTE CONTROLS ----
function editInboxNote(idx) {
    document.getElementById('inbox-edit-' + idx).style.display = 'block';
    document.getElementById('inbox-move-' + idx).style.display = 'none';
    document.getElementById('inbox-task-' + idx).style.display = 'none';
}

function cancelInboxEdit(idx) {
    const inbox = areas.find(a => a.id === 'inbox');
    document.getElementById('inbox-edit-text-' + idx).value = inbox.ideas[idx].text;
    document.getElementById('inbox-edit-' + idx).style.display = 'none';
}

function saveInboxEdit(idx) {
    const inbox = areas.find(a => a.id === 'inbox');
    const newText = document.getElementById('inbox-edit-text-' + idx).value.trim();
    if (!newText) return;
    inbox.ideas[idx].text = newText;
    inbox.ideas[idx].date = todayStr();
    saveArea(inbox);
    renderIdeas(inbox);
    showToast('✏️ Note updated');
}

function deleteInboxNote(idx) {
    const inbox = areas.find(a => a.id === 'inbox');
    if (!confirm('Delete this note?')) return;
    inbox.ideas.splice(idx, 1);
    addActivityLog(inbox, 'Deleted a note');
    saveArea(inbox);
    renderIdeas(inbox);
    renderCards();
    showToast('🗑️ Note deleted');
}

function moveInboxToCard(idx) {
    document.getElementById('inbox-move-' + idx).style.display = 'block';
    document.getElementById('inbox-edit-' + idx).style.display = 'none';
    document.getElementById('inbox-task-' + idx).style.display = 'none';
}

function confirmMoveInbox(idx) {
    const inbox = areas.find(a => a.id === 'inbox');
    const targetId = document.getElementById('inbox-move-select-' + idx).value;
    const target = areas.find(a => a.id === targetId);
    if (!target || !inbox) return;

    const note = inbox.ideas[idx];
    if (!target.ideas) target.ideas = [];
    target.ideas.unshift(note);
    inbox.ideas.splice(idx, 1);

    addActivityLog(target, 'Note moved from inbox');
    addActivityLog(inbox, 'Note moved to ' + target.name);
    saveArea(inbox);
    saveArea(target);
    renderIdeas(inbox);
    renderCards();
    showToast('📋 Moved to ' + target.name);
}

function promoteInboxToTask(idx) {
    document.getElementById('inbox-task-' + idx).style.display = 'block';
    document.getElementById('inbox-edit-' + idx).style.display = 'none';
    document.getElementById('inbox-move-' + idx).style.display = 'none';
}

function confirmPromoteInbox(idx) {
    const inbox = areas.find(a => a.id === 'inbox');
    const taskName = document.getElementById('inbox-task-name-' + idx).value.trim();
    const targetId = document.getElementById('inbox-task-area-' + idx).value;
    const owner = document.getElementById('inbox-task-owner-' + idx).value;
    const deadline = document.getElementById('inbox-task-date-' + idx).value;
    const priority = document.getElementById('inbox-task-priority-' + idx).value;

    if (!taskName) { alert('Task name is required.'); return; }

    const target = areas.find(a => a.id === targetId);
    if (!target) return;

    const prefix = target.id.substring(0, 4);
    const nextNum = target.actions.length + 1;
    target.actions.push({
        id: prefix + '-' + String(nextNum).padStart(3, '0'),
        task: taskName,
        owner: owner,
        deadline: deadline || daysFromNow(14),
        priority: priority,
        status: 'not-started',
        updates: [{ date: todayStr(), by: currentUser, note: 'Created from inbox note' }]
    });

    // Sort by priority
    target.actions.sort((a, b) => {
        const order = {red: 0, amber: 1, green: 2};
        return (order[a.priority] !== undefined ? order[a.priority] : 2) - (order[b.priority] !== undefined ? order[b.priority] : 2);
    });

    // Remove from inbox
    inbox.ideas.splice(idx, 1);

    addActivityLog(target, 'Task created from inbox: ' + taskName);
    addActivityLog(inbox, 'Note promoted to task in ' + target.name);
    saveArea(inbox);
    saveArea(target);
    renderIdeas(inbox);
    renderCards();
    renderSummary();
    showToast('🎯 Task created in ' + target.name);
}

function addIdea() {
    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;
    const input = document.getElementById('new-idea-text');
    const text = input.value.trim();
    if (!text) return;
    if (!area.ideas) area.ideas = [];
    area.ideas.unshift({ date: todayStr(), by: currentUser, text });
    addActivityLog(area, `Added new idea`);
    saveArea(area); renderIdeas(area); renderNotifications(); input.value = '';
}

// ---- VOICE INPUT ----
async function toggleVoiceInput(targetInputId) {
    const btn = document.getElementById('mic-btn-' + targetInputId);
    if (isRecording) {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        isRecording = false;
        if (btn) btn.classList.remove('recording');
        return;
    }
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-AU'; recognition.interimResults = false; recognition.continuous = false;
        isRecording = true;
        if (btn) btn.classList.add('recording');
        recognition.onresult = (event) => {
            const input = document.getElementById(targetInputId);
            if (input) input.value = (input.value ? input.value + ' ' : '') + event.results[0][0].transcript;
            isRecording = false; if (btn) btn.classList.remove('recording');
        };
        recognition.onerror = (event) => {
            isRecording = false; if (btn) btn.classList.remove('recording');
            if (event.error === 'not-allowed') alert('Microphone access denied.');
        };
        recognition.onend = () => { isRecording = false; if (btn) btn.classList.remove('recording'); };
        recognition.start();
    } else { alert('Voice input not supported. Try Chrome or Edge.'); }
}

// ---- ACTIVITY LOG ----
function renderActivityLog(area) {
    const log = document.getElementById('activity-log');
    let html = '';
    (area.activityLog || []).slice(0, 15).forEach(entry => {
        html += `<div class="activity-log-item"><span class="activity-date">${entry.date}</span><span class="activity-user">${entry.by}</span><span>${entry.action}</span></div>`;
    });
    log.innerHTML = html || '<div style="padding: 8px; color: var(--text-dim); font-size: 13px;">No activity yet</div>';
}

function addActivityLog(area, action) {
    if (!area.activityLog) area.activityLog = [];
    area.activityLog.unshift({ date: todayStr(), by: currentUser, action });
    area.activityLog = area.activityLog.slice(0, 50);
}

// ---- SAVE ----
async function saveArea(area) {
    if (CONFIG.localMode) {
        localStorage.setItem(`area_${area.id}`, JSON.stringify(area));
    } else {
        try {
            await fetch(`${CONFIG.apiUrl}?action=save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area, user: currentUser }) });
        } catch (e) { console.error('Failed to save:', e); alert('Failed to save.'); }
    }
}

// ---- FLOATING VOICE NOTE ----
function showVoiceFab() {
    // Voice mic is now in the Actions header bar — FAB no longer used
}

function initFabSwipe() {
    const fab = document.getElementById('voice-fab');
    if (!fab || fab._swipeInit) return;
    fab._swipeInit = true;

    let startX = 0, startRight = 0, dragging = false;

    fab.addEventListener('touchstart', (e) => {
        if (fab.classList.contains('dismissed')) return; // tap to restore handled by click
        startX = e.touches[0].clientX;
        startRight = parseInt(getComputedStyle(fab).right) || 24;
        dragging = false;
    }, { passive: true });

    fab.addEventListener('touchmove', (e) => {
        if (fab.classList.contains('dismissed')) return;
        const dx = e.touches[0].clientX - startX;
        if (dx > 10) { // only swipe right
            dragging = true;
            fab.style.transition = 'none';
            fab.style.right = Math.max(-80, startRight - dx) + 'px';
        }
    }, { passive: true });

    fab.addEventListener('touchend', () => {
        fab.style.transition = '';
        fab.style.right = '';
        if (dragging) {
            const currentRight = parseInt(getComputedStyle(fab).right);
            if (currentRight < -20) {
                dismissVoiceFab();
            }
            dragging = false;
        }
    });

    // Double-tap to dismiss on desktop (right-click or long press alternative)
    fab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!fab.classList.contains('dismissed')) {
            dismissVoiceFab();
        }
    });
}

function dismissVoiceFab() {
    const fab = document.getElementById('voice-fab');
    fab.classList.add('dismissed');
    fab.onclick = restoreVoiceFab;
}

function restoreVoiceFab() {
    const fab = document.getElementById('voice-fab');
    if (fab.classList.contains('dismissed')) {
        fab.classList.remove('dismissed');
        fab.onclick = startVoiceNote;
    }
}

function startVoiceNote() {
    const modal = document.getElementById('voice-modal');
    const textarea = document.getElementById('voice-note-text');
    const indicator = document.getElementById('voice-recording-indicator');
    const title = document.getElementById('voice-modal-title');
    const fab = document.getElementById('voice-fab');
    const picker = document.getElementById('voice-card-picker');
    const buttonsDiv = document.getElementById('voice-modal-buttons');

    textarea.value = '';
    indicator.style.display = 'flex';
    title.textContent = '🎙️ Recording...';
    picker.style.display = 'none';
    modal.style.display = 'flex';

    // Context-aware buttons
    if (currentAreaId) {
        const currentArea = areas.find(a => a.id === currentAreaId);
        const areaName = currentArea ? currentArea.name : 'this card';
        buttonsDiv.innerHTML = `
            <button class="btn btn-primary voice-action-btn" onclick="addToCurrentCard()">📌 Add to ${areaName}</button>
            <button class="btn btn-outline voice-action-btn" onclick="showCardPicker()">📋 Different card</button>
            <button class="btn btn-outline voice-action-btn" onclick="addToInbox()">📥 Inbox</button>
        `;
    } else {
        buttonsDiv.innerHTML = `
            <button class="btn btn-primary voice-action-btn" onclick="showCardPicker()">📋 Add to a Card</button>
            <button class="btn btn-outline voice-action-btn" onclick="addToInbox()">📥 Add to Inbox</button>
        `;
    }

    // Animate FAB to recording state
    fab.classList.add('recording');
    document.getElementById('voice-fab-icon').textContent = '⏹️';
    document.getElementById('voice-fab-label').textContent = 'Stop';

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-AU';
        recognition.interimResults = true;
        recognition.continuous = true;

        window._voiceRecognition = recognition;

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            textarea.value = transcript;
        };

        recognition.onend = () => {
            indicator.style.display = 'none';
            title.textContent = '📝 Your note';
            fab.classList.remove('recording');
            document.getElementById('voice-fab-icon').textContent = '🎙️';
            document.getElementById('voice-fab-label').textContent = 'Voice Note';
            window._voiceRecognition = null;
        };

        recognition.onerror = (event) => {
            indicator.style.display = 'none';
            if (event.error === 'not-allowed') {
                title.textContent = '⚠️ Microphone access denied';
            } else {
                title.textContent = '📝 Type your note';
            }
            fab.classList.remove('recording');
            document.getElementById('voice-fab-icon').textContent = '🎙️';
            document.getElementById('voice-fab-label').textContent = 'Voice Note';
            window._voiceRecognition = null;
        };

        recognition.start();

        // FAB becomes stop button while recording
        fab.onclick = function() {
            if (window._voiceRecognition) {
                window._voiceRecognition.stop();
            }
            fab.onclick = startVoiceNote;
        };
    } else {
        // No speech recognition — just show text input
        indicator.style.display = 'none';
        title.textContent = '📝 Type your note';
        fab.classList.remove('recording');
        document.getElementById('voice-fab-icon').textContent = '🎙️';
        document.getElementById('voice-fab-label').textContent = 'Voice Note';
    }
}

function cancelVoiceNote() {
    if (window._voiceRecognition) window._voiceRecognition.stop();
    document.getElementById('voice-modal').style.display = 'none';
    const fab = document.getElementById('voice-fab');
    fab.classList.remove('recording');
    fab.onclick = startVoiceNote;
    document.getElementById('voice-fab-icon').textContent = '🎙️';
    document.getElementById('voice-fab-label').textContent = 'Voice Note';
}

function showCardPicker() {
    const picker = document.getElementById('voice-card-picker');
    const select = document.getElementById('voice-card-select');
    select.innerHTML = areas
        .filter(a => a.id !== 'inbox')
        .map(a => `<option value="${a.id}">${a.icon || '📋'} ${a.name}</option>`)
        .join('');
    picker.style.display = 'block';
}

function addToInbox() {
    const text = document.getElementById('voice-note-text').value.trim();
    if (!text) { alert('No note to add.'); return; }

    const inbox = areas.find(a => a.id === 'inbox');
    if (!inbox) { alert('Inbox not found.'); return; }

    if (!inbox.ideas) inbox.ideas = [];
    inbox.ideas.unshift({
        date: todayStr(),
        by: currentUser,
        text: text
    });
    addActivityLog(inbox, 'Voice note added to inbox');
    saveArea(inbox);
    renderCards();
    renderNotifications();

    document.getElementById('voice-modal').style.display = 'none';
    showToast('📥 Added to Inbox — triage later from your laptop');
}

function addToSelectedCard() {
    const text = document.getElementById('voice-note-text').value.trim();
    if (!text) { alert('No note to add.'); return; }

    const areaId = document.getElementById('voice-card-select').value;
    const area = areas.find(a => a.id === areaId);
    if (!area) return;

    if (!area.ideas) area.ideas = [];
    area.ideas.unshift({
        date: todayStr(),
        by: currentUser,
        text: text
    });
    addActivityLog(area, 'Voice note added');
    saveArea(area);
    renderCards();
    renderNotifications();

    document.getElementById('voice-modal').style.display = 'none';
    showToast('✅ Added to ' + area.name);
}

function addToCurrentCard() {
    const text = document.getElementById('voice-note-text').value.trim();
    if (!text) { alert('No note to add.'); return; }

    const area = areas.find(a => a.id === currentAreaId);
    if (!area) return;

    if (!area.ideas) area.ideas = [];
    area.ideas.unshift({
        date: todayStr(),
        by: currentUser,
        text: text
    });
    addActivityLog(area, 'Voice note added');
    saveArea(area);
    renderIdeas(area);
    renderCards();
    renderNotifications();

    document.getElementById('voice-modal').style.display = 'none';
    showToast('📌 Added to ' + area.name);
}

function showToast(message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- INIT ----
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem('dashboard_user');
    if (savedUser) {
        currentUser = savedUser;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('user-name').textContent = savedUser;
        document.getElementById('user-avatar').textContent = savedUser.charAt(0);
        loadConfig();
        loadAllData();
        startAutoRefresh();
        showVoiceFab();
    }
});
