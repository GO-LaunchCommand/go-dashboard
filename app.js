/* ============================================
   LAUNCH COMMAND CENTRE - Frontend Logic
   ============================================ */

// ---- CONFIG ----
const CONFIG = {
    apiUrl: 'https://gymnasticsonline.com/go-api/api.php',
    password: 'launch26',
    refreshInterval: 30000,
    lockDuration: 5 * 60 * 1000,
    localMode: false,
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
let searchQuery = '';
let expandedActionId = null;
let refreshTimer = null;
let relatedTasks = [];
let showRelatedTasks = false;
let launchDate = '2026-07-01';
let isRecording = false;

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
    const btn = document.querySelector('.password-toggle');
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
        // Voice mic is in the Actions header bar — no FAB setup needed
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
            // Always try to fetch fresh JSON first; use localStorage as fallback only
            try {
                const resp = await fetch(`data/${id}.json?t=${Date.now()}`);
                if (resp.ok) {
                    const data = await resp.json();
                    // Merge: if localStorage has edits (newer activityLog), prefer localStorage
                    const cached = localStorage.getItem(`area_${id}`);
                    if (cached) {
                        try {
                            const cachedData = JSON.parse(cached);
                            if (cachedData.activityLog && cachedData.activityLog.length > (data.activityLog || []).length) {
                                return cachedData; // local has edits not yet in the JSON file
                            }
                        } catch (e) {}
                    }
                    return data;
                }
            } catch (e) {}
            // Fallback to localStorage if fetch fails
            const cached = localStorage.getItem(`area_${id}`);
            if (cached) { try { return JSON.parse(cached); } catch (e) {} }
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
            if (action.status !== 'complete' && action.deadline && new Date(action.deadline) < now) overdue++;
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

    // Only build the header once — don't rebuild on search (keeps input focused)
    if (!page.querySelector('.person-page-header')) {
        page.innerHTML = `
            <div class="person-page-header">
                <button class="detail-back-btn" onclick="closePersonTasks()">← Dashboard</button>
                <div class="person-page-title-row">
                    <h1 id="person-page-title">${person}'s Tasks <span class="person-page-count">${allTasks.length}</span></h1>
                </div>
                <div class="person-page-stats" id="person-page-stats"></div>
                <div class="person-search-bar">
                    <input type="text" id="person-search-input" class="form-input" placeholder="Search tasks or areas..."
                        value="${personTasksSearchQuery}"
                        oninput="personTasksSearchQuery=this.value; renderPersonPage('${person}', window._personAllTasks)">
                </div>
            </div>
            <div class="person-tasks-grid" id="person-tasks-grid"></div>
        `;
    }

    // Update stats
    document.getElementById('person-page-stats').innerHTML = `
        <span class="person-stat-pill">${completeCount} ✅ complete</span>
        <span class="person-stat-pill">${inProgCount} 🟡 in progress</span>
        <span class="person-stat-pill ${overdueCount > 0 ? 'overdue' : ''}">${overdueCount} 🔴 overdue</span>
    `;

    // Update grid only
    const grid = document.getElementById('person-tasks-grid');
    grid.innerHTML = `
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
    const page = document.getElementById('person-page');
    page.style.display = 'none';
    page.innerHTML = '';
    personTasksSearchQuery = '';
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

// ---- SEARCH ----
function runSearch(query) {
    searchQuery = query;
    const grid = document.getElementById('cards-grid');
    const filterBar = document.querySelector('.filter-bar');
    const clearBtn = document.getElementById('search-clear');

    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

    if (!query.trim()) {
        filterBar.style.display = '';
        renderCards();
        return;
    }

    filterBar.style.display = 'none';
    const q = query.toLowerCase();
    const results = [];
    const now = new Date();

    areas.forEach(area => {
        area.actions.forEach(action => {
            if (action.task.toLowerCase().includes(q) ||
                (action.owner && action.owner.toLowerCase().includes(q))) {
                results.push({ type: 'action', area, action });
            }
        });
        (area.ideas || []).forEach(idea => {
            if (idea.text && idea.text.toLowerCase().includes(q)) {
                results.push({ type: 'idea', area, idea });
            }
        });
    });

    if (results.length === 0) {
        grid.innerHTML = `<div class="search-no-results">No results for "<strong>${query}</strong>"</div>`;
        return;
    }

    grid.innerHTML = results.map(r => {
        if (r.type === 'action') {
            const a = r.action;
            const isOverdue = a.status !== 'complete' && a.deadline && new Date(a.deadline) < now;
            return `<div class="area-card search-result-card ${a.status === 'complete' ? 'complete' : ''} ${isOverdue ? 'overdue-card' : ''}"
                        onclick="openDetail('${r.area.id}')">
                <div class="card-top">
                    <span class="card-icon">${r.area.icon || '📋'}</span>
                    <span class="traffic-light ${a.priority || 'amber'}"></span>
                    <span class="status-badge ${a.status}">${formatStatus(a.status)}</span>
                </div>
                <div class="card-name" style="font-size:14px">${highlightMatch(a.task, query)}</div>
                <div class="card-description">${r.area.name} · ${a.owner || ''}${a.deadline ? ' · 📅 ' + formatDate(a.deadline) : ''}</div>
            </div>`;
        } else {
            return `<div class="area-card search-result-card" onclick="openDetail('${r.area.id}')">
                <div class="card-top"><span class="card-icon">💡</span></div>
                <div class="card-name" style="font-size:14px">${highlightMatch(r.idea.text, query)}</div>
                <div class="card-description">${r.area.name}</div>
            </div>`;
        }
    }).join('');
}

function clearSearch() {
    searchQuery = '';
    const input = document.getElementById('dashboard-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    document.querySelector('.filter-bar').style.display = '';
    renderCards();
}

function voiceSearch() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Voice search not supported. Try Chrome.');
        return;
    }
    const btn = document.getElementById('search-mic-btn');
    const input = document.getElementById('dashboard-search-input');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = false;
    recognition.continuous = false;

    btn.classList.add('recording');
    recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript;
        // Strip leading search phrases if spoken
        const query = spoken.replace(/^(search|find|look for|show me)\s+(tasks?\s+)?(with|for|about|containing)?\s*/i, '').trim();
        input.value = query;
        runSearch(query);
        btn.classList.remove('recording');
    };
    recognition.onerror = () => btn.classList.remove('recording');
    recognition.onend = () => btn.classList.remove('recording');
    recognition.start();
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
            if (action.status === 'complete' || !action.deadline) return;
            const deadline = new Date(action.deadline);
            if (isNaN(deadline.getTime())) return;
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
        const isOverdue = action.deadline && new Date(action.deadline) < new Date() && action.status !== 'complete';
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
            </div>
            <div class="action-reminder-row" onclick="event.stopPropagation()">
                <span style="font-size:12px; color: var(--text-dim);">📅 Reminder:</span>
                <input type="date" id="remind-date-${action.id}" value="${action.deadline || ''}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px;">
                <input type="time" id="remind-time-${action.id}" value="09:00" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px; width:90px;">
                <select id="remind-who-${action.id}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text); font-family:inherit; font-size:12px;">
                    ${TEAM_MEMBERS.map(m => `<option value="${m}" ${m === action.owner ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <button class="btn btn-sm btn-primary" onclick="sendCalendarReminder('${action.id}')">Send Invite</button>
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
    function newActionId() { return 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6); }

    area.actions.push({ id: newActionId(), task, owner, deadline: deadline || daysFromNow(14), priority, status: 'not-started', updates: [] });
    addActivityLog(area, `Added action: ${task}`);
    sendNotification(owner, task, area.name, deadline);

    if (showRelatedTasks) {
        relatedTasks.forEach(rt => {
            if (!rt.task.trim()) return;
            area.actions.push({ id: newActionId(), task: rt.task.trim(), owner: rt.owner, deadline: rt.deadline, priority: rt.priority, status: 'not-started', updates: [{ date: todayStr(), by: currentUser, note: `Related to: ${task}` }] });
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

// ---- CALENDAR REMINDERS ----
function downloadICS(actionId) {
    // Quick download from the action row button (desktop)
    const icsData = buildICS(actionId);
    if (icsData) downloadICSFile(icsData.ics, icsData.action.task);
}

function sendCalendarReminder(actionId) {
    // Full reminder from expanded view — with date, time, and recipient picker
    const dateInput = document.getElementById('remind-date-' + actionId);
    const timeInput = document.getElementById('remind-time-' + actionId);
    const whoSelect = document.getElementById('remind-who-' + actionId);

    const date = dateInput ? dateInput.value : null;
    const time = timeInput ? timeInput.value : '09:00';
    const who = whoSelect ? whoSelect.value : null;

    if (!date) { alert('Please pick a reminder date.'); return; }

    const icsData = buildICS(actionId, date, time);
    if (!icsData) return;

    if (CONFIG.localMode) {
        // Local mode — download the .ics file, user adds to calendar manually
        downloadICSFile(icsData.ics, icsData.action.task);
        showToast('📅 Calendar file downloaded — add to your calendar');
    } else {
        // Live mode — email the .ics as a calendar invite
        const email = TEAM_EMAILS[who] || TEAM_EMAILS[icsData.action.owner];
        fetch(CONFIG.apiUrl + '?action=calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                task: icsData.action.task,
                deadline: date,
                area: icsData.areaName,
                owner: who || icsData.action.owner
            })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showToast('📅 Calendar invite sent to ' + (who || icsData.action.owner));
            } else {
                showToast('⚠️ Failed to send — ' + (data.detail || 'check email config'));
            }
        }).catch(() => {
            // Fallback to download
            downloadICSFile(icsData.ics, icsData.action.task);
            showToast('📅 Downloaded .ics file (email send failed)');
        });
    }
}

function buildICS(actionId, overrideDate, overrideTime) {
    let action = null, areaName = '';
    for (const area of areas) {
        const found = area.actions.find(a => a.id === actionId);
        if (found) { action = found; areaName = area.name; break; }
    }
    if (!action) return null;

    const date = overrideDate || action.deadline;
    const time = overrideTime || '09:00';
    if (!date) return null;

    // Build timezone-aware event (Brisbane = Australia/Brisbane, AEST UTC+10)
    const dtDate = date.replace(/-/g, '');
    const dtTime = time.replace(':', '') + '00';
    const dtStart = dtDate + 'T' + dtTime;

    // End time = 1 hour after start
    const startHour = parseInt(time.split(':')[0]);
    const endHour = String(startHour + 1).padStart(2, '0');
    const dtEnd = dtDate + 'T' + endHour + time.split(':')[1] + '00';

    const uid = 'go-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '@gymnasticsonline.com';

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GO Launch Command Centre//EN',
        'METHOD:REQUEST',
        'BEGIN:VTIMEZONE',
        'TZID:Australia/Brisbane',
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:+1000',
        'TZOFFSETTO:+1000',
        'TZNAME:AEST',
        'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:' + uid,
        'DTSTART;TZID=Australia/Brisbane:' + dtStart,
        'DTEND;TZID=Australia/Brisbane:' + dtEnd,
        'SUMMARY:GO Launch: ' + action.task,
        'DESCRIPTION:Area: ' + areaName + '\\nOwner: ' + action.owner + '\\nPriority: ' + action.priority + '\\nStatus: ' + formatStatus(action.status),
        'ORGANIZER;CN=GO Launch:mailto:admin@gymnasticsonline.com',
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder: ' + action.task,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    return { ics, action, areaName };
}

function downloadICSFile(icsContent, taskName) {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (taskName || 'reminder').substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-') + '.ics';
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

    target.actions.push({
        id: 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
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

// ---- SMART VOICE COMMAND ----
function startVoiceCommand() {
    const btn = document.getElementById('voice-command-btn');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('Voice input not supported. Try Chrome or Edge.');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = false;
    recognition.continuous = false;

    btn.classList.add('voice-command-recording');
    btn.textContent = '⏹️';

    recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript.trim();
        btn.classList.remove('voice-command-recording');
        btn.textContent = '🎙️';
        processVoiceCommand(spoken);
    };

    recognition.onerror = () => {
        btn.classList.remove('voice-command-recording');
        btn.textContent = '🎙️';
        showToast('⚠️ Could not hear you — try again');
    };

    recognition.onend = () => {
        btn.classList.remove('voice-command-recording');
        btn.textContent = '🎙️';
    };

    recognition.start();
    showToast('🎙️ Listening... say "add note to [card name] — your note"');
}

function processVoiceCommand(spoken) {
    const lower = spoken.toLowerCase();

    // Check for SEARCH commands first
    const searchPatterns = [
        /^(?:show|find|search|look for|filter|get)\s+(?:all\s+)?(?:actions?|tasks?|notes?|items?)?\s*(?:with|for|about|containing|mentioning|related to|matching)?\s+(.+)/i,
        /^(?:show|find|search|look for)\s+(.+)/i,
        /^(?:where|what)\s+(?:is|are|about)\s+(.+)/i
    ];

    for (const pattern of searchPatterns) {
        const match = spoken.match(pattern);
        if (match) {
            const query = match[1].trim();
            showVoiceSearchResults(query);
            return;
        }
    }

    // Otherwise handle as ADD note command

    // Find which area the user mentioned
    let matchedArea = null;
    let matchScore = 0;

    // Build keyword map for fuzzy matching
    const areaKeywords = {
        'ws01-business-strategy': ['business', 'strategy', 'pricing', 'scope'],
        'ws02-finance': ['finance', 'financial', 'money', 'budget', 'funding'],
        'ws03-legal-compliance': ['legal', 'compliance', 'sprintlaw', 'contract', 'insurance', 'trademark'],
        'ws04-people': ['people', 'partners', 'crystal', 'georgia', 'emma', 'team', 'contractor'],
        'ws05-website': ['website', 'web', 'site', 'wordpress', 'squarespace', 'designer'],
        'ws06-everfit': ['everfit', 'app', 'exercise app', 'onboarding'],
        'ws07-exercise-content': ['exercise', 'content', 'curriculum', 'filming', 'reshoot', 'workout'],
        'ws08-club-software': ['reporting', 'saas', 'go reporting', 'club software'],
        'ws09-parent-resources': ['parent', 'resources', 'flipbook', 'webinar', 'expert'],
        'ws10-club-sales': ['club', 'sales', 'affiliate', 'club sales', 'outreach'],
        'ws11-merchandise': ['merchandise', 'merch', 'shop', 'product', 'store'],
        'ws13-member-experience': ['support', 'customer', 'member', 'experience', 'faq', 'helpdesk', 'cancellation'],
        'ws14-technical': ['technical', 'tech', 'infrastructure', 'analytics', 'active campaign', 'integration'],
        'inbox': ['inbox', 'miscellaneous', 'misc', 'general']
    };

    // Also match by area name directly
    areas.forEach(area => {
        const name = area.name.toLowerCase();
        // Direct name match (strongest)
        if (lower.includes(name)) {
            if (name.length > matchScore) {
                matchedArea = area;
                matchScore = name.length;
            }
        }
        // Keyword match
        const keywords = areaKeywords[area.id] || [];
        keywords.forEach(kw => {
            if (lower.includes(kw) && kw.length > matchScore) {
                matchedArea = area;
                matchScore = kw.length;
            }
        });
    });

    // Extract the note content — everything after the card name or after common separators
    let noteContent = spoken;

    // Try to strip the command prefix
    const prefixPatterns = [
        /^(?:add|new|create)\s+(?:a\s+)?(?:note|idea|task|thought)\s+(?:to|for|in|on)\s+/i,
        /^(?:add|new|create)\s+(?:to|for|in|on)\s+/i,
        /^(?:note|idea)\s+(?:to|for|in|on)\s+/i
    ];

    for (const pattern of prefixPatterns) {
        if (pattern.test(noteContent)) {
            noteContent = noteContent.replace(pattern, '');
            break;
        }
    }

    // Try to strip the area name from the start of remaining text
    if (matchedArea) {
        const namePattern = new RegExp('^' + matchedArea.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-—:,.]?\\s*', 'i');
        noteContent = noteContent.replace(namePattern, '');

        // Also try keyword stripping
        const keywords = areaKeywords[matchedArea.id] || [];
        for (const kw of keywords) {
            const kwPattern = new RegExp('^' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-—:,.]?\\s*', 'i');
            if (kwPattern.test(noteContent)) {
                noteContent = noteContent.replace(kwPattern, '');
                break;
            }
        }
    }

    // Clean up leading separators
    noteContent = noteContent.replace(/^[-—:,.]\s*/, '').trim();

    // If we couldn't parse a card or the note is empty, open the voice modal with what we have
    if (!matchedArea || !noteContent) {
        // Fall back to the standard voice note modal with the text pre-filled
        document.getElementById('voice-note-text').value = spoken;
        document.getElementById('voice-recording-indicator').style.display = 'none';
        document.getElementById('voice-modal-title').textContent = '📝 Where should this go?';
        document.getElementById('voice-card-picker').style.display = 'none';

        const buttonsDiv = document.getElementById('voice-modal-buttons');
        buttonsDiv.innerHTML = `
            <button class="btn btn-primary voice-action-btn" onclick="showCardPicker()">✅ Save to a Card</button>
            <button class="btn btn-outline voice-action-btn" onclick="addToInbox()">📥 Save to Inbox</button>
        `;
        document.getElementById('voice-modal').style.display = 'flex';
        return;
    }

    // We have a matched area and note content — add it directly
    if (!matchedArea.ideas) matchedArea.ideas = [];
    matchedArea.ideas.unshift({
        date: todayStr(),
        by: currentUser,
        text: noteContent.charAt(0).toUpperCase() + noteContent.slice(1)
    });
    addActivityLog(matchedArea, 'Voice note added');
    saveArea(matchedArea);
    renderCards();
    renderNotifications();

    // If we're currently viewing this area, refresh the ideas
    if (currentAreaId === matchedArea.id) {
        renderIdeas(matchedArea);
    }

    showToast('📌 Added to ' + matchedArea.name + ': "' + noteContent.substring(0, 40) + (noteContent.length > 40 ? '...' : '') + '"');
}

// ---- VOICE SEARCH RESULTS ----
function showVoiceSearchResults(query) {
    const q = query.toLowerCase();

    // Search across all areas — actions, ideas, descriptions
    const results = [];
    areas.forEach(area => {
        area.actions.forEach(action => {
            if (action.task.toLowerCase().includes(q) ||
                (action.owner && action.owner.toLowerCase().includes(q))) {
                results.push({
                    type: 'action',
                    text: action.task,
                    area: area.name,
                    areaId: area.id,
                    areaIcon: area.icon || '📋',
                    deadline: action.deadline,
                    priority: action.priority,
                    status: action.status,
                    owner: action.owner
                });
            }
        });
        (area.ideas || []).forEach(idea => {
            if (idea.text && idea.text.toLowerCase().includes(q)) {
                results.push({
                    type: 'idea',
                    text: idea.text,
                    area: area.name,
                    areaId: area.id,
                    areaIcon: area.icon || '📋'
                });
            }
        });
        if (area.description && area.description.toLowerCase().includes(q)) {
            results.push({
                type: 'area',
                text: area.description,
                area: area.name,
                areaId: area.id,
                areaIcon: area.icon || '📋'
            });
        }
    });

    // Show results as a full page (reusing person-page)
    const page = document.getElementById('person-page');
    const now = new Date();

    let html = `
        <div class="person-page-header">
            <button class="detail-back-btn" onclick="closePersonTasks()">← Dashboard</button>
            <div class="person-page-title-row">
                <h1>🔍 Results for "${query}" <span class="person-page-count">${results.length}</span></h1>
            </div>
        </div>
        <div class="person-tasks-grid">`;

    if (results.length === 0) {
        html += '<div class="person-no-results">No results found for "' + query + '"</div>';
    }

    results.forEach(r => {
        if (r.type === 'action') {
            const isOverdue = r.status !== 'complete' && r.deadline && new Date(r.deadline) < now;
            html += `
                <div class="person-task-card ${r.status === 'complete' ? 'complete' : ''} ${isOverdue ? 'overdue-card' : ''}"
                     onclick="closePersonTasks(); openDetail('${r.areaId}')">
                    <div class="person-card-top">
                        <span class="traffic-light ${r.priority}"></span>
                        <span class="status-badge ${r.status}">${formatStatus(r.status)}</span>
                    </div>
                    <div class="person-card-task">${highlightMatch(r.text, query)}</div>
                    <div class="person-card-meta">${r.areaIcon} ${r.area} · ${r.owner}</div>
                    ${r.deadline ? '<div class="person-card-date ' + (isOverdue ? 'overdue' : '') + '">📅 ' + formatDate(r.deadline) + '</div>' : ''}
                </div>`;
        } else if (r.type === 'idea') {
            html += `
                <div class="person-task-card" onclick="closePersonTasks(); openDetail('${r.areaId}')">
                    <div class="person-card-top"><span style="font-size:14px">💡</span><span class="status-badge not-started">Idea</span></div>
                    <div class="person-card-task">${highlightMatch(r.text, query)}</div>
                    <div class="person-card-meta">${r.areaIcon} ${r.area}</div>
                </div>`;
        } else {
            html += `
                <div class="person-task-card" onclick="closePersonTasks(); openDetail('${r.areaId}')">
                    <div class="person-card-top"><span style="font-size:14px">📋</span><span class="status-badge not-started">Area</span></div>
                    <div class="person-card-task">${highlightMatch(r.text.substring(0, 100), query)}${r.text.length > 100 ? '...' : ''}</div>
                    <div class="person-card-meta">${r.areaIcon} ${r.area}</div>
                </div>`;
        }
    });

    html += '</div>';
    page.innerHTML = html;
    page.style.display = 'block';
    document.getElementById('dashboard').querySelector('.launch-banner').style.display = 'none';
    document.getElementById('dashboard').querySelector('.metrics-bar').style.display = 'none';
    document.getElementById('dashboard').querySelector('.filter-bar').style.display = 'none';
    document.getElementById('dashboard').querySelector('.cards-grid').style.display = 'none';
}

function highlightMatch(text, query) {
    const regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(regex, '<mark style="background:#fde68a;padding:0 2px;border-radius:2px">$1</mark>');
}



function startVoiceNote() {
    const modal = document.getElementById('voice-modal');
    const textarea = document.getElementById('voice-note-text');
    const title = document.getElementById('voice-modal-title');
    const picker = document.getElementById('voice-card-picker');
    const buttonsDiv = document.getElementById('voice-modal-buttons');

    textarea.value = '';
    window._voiceAccumulated = '';
    window._voiceRecognition = null;
    title.textContent = '🎙️ Voice Note';
    picker.style.display = 'none';
    modal.style.display = 'flex';

    if (currentAreaId) {
        const currentArea = areas.find(a => a.id === currentAreaId);
        const areaName = currentArea ? currentArea.name : 'this card';
        buttonsDiv.innerHTML = `
            <button class="btn btn-primary voice-action-btn" onclick="addToCurrentCard()">✅ Save to ${areaName}</button>
            <button class="btn btn-outline voice-action-btn" onclick="showCardPicker()">📋 Save to different card</button>
            <button class="btn btn-outline voice-action-btn" onclick="addToInbox()">📥 Save to Inbox</button>
        `;
    } else {
        buttonsDiv.innerHTML = `
            <button class="btn btn-primary voice-action-btn" onclick="showCardPicker()">✅ Save to a Card</button>
            <button class="btn btn-outline voice-action-btn" onclick="addToInbox()">📥 Save to Inbox</button>
        `;
    }

    const btn = document.getElementById('voice-tap-mic-btn');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        if (btn) btn.style.display = 'none';
    }
}

function suppressChime(callback) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { callback(); return; }
        const ctx = new AudioContext();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        setTimeout(() => { ctx.close(); callback(); }, 50);
    } catch(e) { callback(); }
}

function startSilentAudio() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0; // completely silent
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        return ctx;
    } catch(e) { return null; }
}

function stopSilentAudio(ctx) {
    try { if (ctx) ctx.close(); } catch(e) {}
}

function tapToRecord() {
    if (window._voiceRunning) {
        // Already recording — stop it
        window._voiceRunning = false;
        if (window._voiceRecognition) window._voiceRecognition.stop();
        return;
    }
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;

    const textarea = document.getElementById('voice-note-text');
    const btn = document.getElementById('voice-tap-mic-btn');
    const icon = document.getElementById('voice-tap-mic-icon');
    const label = document.getElementById('voice-tap-mic-label');
    const title = document.getElementById('voice-modal-title');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    window._voiceRunning = true;
    window._silentAudioCtx = startSilentAudio();

    function startSession() {
        const r = new SpeechRecognition();
        r.lang = 'en-AU';
        r.interimResults = true;
        r.continuous = false;
        window._voiceRecognition = r;
        let sessionText = '';

        r.onstart = () => {
            sessionText = '';
            clearTimeout(window._voiceSilenceTimer);
            window._voiceSilenceTimer = setTimeout(() => {
                window._voiceRunning = false;
                if (window._voiceRecognition) window._voiceRecognition.stop();
            }, 10000);
        };

        r.onresult = (event) => {
            // Rebuild this session's text from scratch — no cross-session bleed
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
                text += event.results[i][0].transcript;
            }
            sessionText = text;
            textarea.value = (window._voiceAccumulated + sessionText).trim();
            document.getElementById('voice-clear-btn').style.display = 'block';
            // Reset silence timer on speech
            clearTimeout(window._voiceSilenceTimer);
            window._voiceSilenceTimer = setTimeout(() => {
                window._voiceRunning = false;
                if (window._voiceRecognition) window._voiceRecognition.stop();
            }, 10000);
        };

        r.onend = () => {
            // Commit this session's final text before restarting
            if (sessionText) {
                window._voiceAccumulated += sessionText + ' ';
                textarea.value = window._voiceAccumulated.trim();
                sessionText = '';
            }
            window._voiceRecognition = null;
            if (window._voiceRunning) {
                setTimeout(() => {
                    if (window._voiceRunning) suppressChime(() => { if (window._voiceRunning) startSession(); });
                }, 1500);
            } else {
                clearTimeout(window._voiceSilenceTimer);
                stopSilentAudio(window._silentAudioCtx);
                window._silentAudioCtx = null;
                btn.classList.remove('recording');
                icon.textContent = '🎙️';
                label.textContent = 'Tap to add more';
                title.textContent = '🎙️ Voice Note';
            }
        };

        r.onerror = (event) => {
            window._voiceRecognition = null;
            if (event.error === 'not-allowed') {
                window._voiceRunning = false;
                btn.classList.remove('recording');
                icon.textContent = '🎙️';
                label.textContent = '⚠️ Mic denied';
                title.textContent = '🎙️ Voice Note';
            }
            // other errors — onend will fire and restart
        };

        r.start();
    }

    btn.classList.add('recording');
    icon.textContent = '⏹️';
    label.textContent = 'Listening...';
    title.textContent = '🎙️ Recording...';

    suppressChime(() => startSession());
}

function clearVoiceNote() {
    window._voiceRunning = false;
    clearTimeout(window._voiceSilenceTimer);
    if (window._voiceRecognition) { window._voiceRecognition.stop(); window._voiceRecognition = null; }
    window._voiceAccumulated = '';
    document.getElementById('voice-note-text').value = '';
    document.getElementById('voice-clear-btn').style.display = 'none';
    document.getElementById('voice-tap-mic-icon').textContent = '🎙️';
    document.getElementById('voice-tap-mic-label').textContent = 'Tap to speak';
    document.getElementById('voice-tap-mic-btn').classList.remove('recording');
    document.getElementById('voice-modal-title').textContent = '🎙️ Voice Note';
}

function cancelVoiceNote() {
    window._voiceRunning = false;
    clearTimeout(window._voiceSilenceTimer);
    stopSilentAudio(window._silentAudioCtx);
    window._silentAudioCtx = null;
    if (window._voiceRecognition) { window._voiceRecognition.stop(); window._voiceRecognition = null; }
    window._voiceAccumulated = '';
    document.getElementById('voice-modal').style.display = 'none';
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
        // Voice mic is in the Actions header bar — no FAB setup needed
    }
});
