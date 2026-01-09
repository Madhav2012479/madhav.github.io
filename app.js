/**
 * SaebMC Studio - Ultimate Nuclear-Safe Core v25.0.2
 */

// 1. Core State & Config
const SUPABASE_URL = 'https://kuqynhfcfucxyqeldcli.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1cXluaGZjZnVjeHlxZWxkY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzAyNDAsImV4cCI6MjA4MzUwNjI0MH0.OPm7SlyWPcBAowyQdMXDlzLBtqe-GEZEGHlqsQjVcz8';

let currentUser = null;
let chatMode = 'public';
let currentOpenGroupName = null;
let chatPollingInterval = null;
let lastKnownMessageTime = new Date().toISOString();
let notifications = [];

// Hyper-Safe DOM Access
const get = (id) => document.getElementById(id);

function safeAddClass(id, className) {
    const el = get(id);
    if (el && el.classList) el.classList.add(className);
}

function safeRemoveClass(id, className) {
    const el = get(id);
    if (el && el.classList) el.classList.remove(className);
}

function safeText(id, text) {
    const el = get(id);
    if (el) el.innerText = text;
}

// 2. Storage & Database
function safeGet(key, fallback) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
    } catch (e) { return fallback; }
}

function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

async function dbCall(path, method = 'GET', body = null) {
    const config = safeGet('studio_cloud_config', { enabled: true, url: SUPABASE_URL, key: SUPABASE_KEY });
    if (!config.enabled || !navigator.onLine) return null;

    const headers = {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
    };
    
    if (method === 'POST') headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    else if (method === 'PATCH' || method === 'DELETE') headers['Prefer'] = 'return=representation';

    try {
        const res = await fetch(`${config.url}/rest/v1/${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

// 3. Navigation & Views
function hideAllViews() {
    const views = ['loginPage', 'registerPage', 'dashboard', 'publicPage', 'tfaPage', 'loadingScreen'];
    views.forEach(id => {
        const el = get(id);
        if (el) el.classList.add('hidden');
    });
}

function showLogin() {
    if (currentUser) return showDashboard();
    hideAllViews();
    safeRemoveClass('loginPage', 'hidden');
    if (location.hash && location.hash !== '#') {
        history.replaceState(null, null, ' ');
    }
}

function showRegister() {
    hideAllViews();
    safeRemoveClass('registerPage', 'hidden');
}

function showDashboard() {
    if (!currentUser) return showLogin();
    hideAllViews();
    safeRemoveClass('dashboard', 'hidden');

    safeText('displayName', currentUser.name || "User");
    safeText('displayUsername', `@${currentUser.username}`);
    safeText('userAvatar', (currentUser.name || 'U')[0].toUpperCase());
    safeText('userRoleBadge', currentUser.role || 'user');
    safeText('tfaStatus', currentUser.tfaEnabled ? 'Enabled' : 'Disabled');

    const ownerBtn = get('ownerPanelBtn');
    if (ownerBtn) {
        if (['owner', 'admin'].includes(currentUser.role)) ownerBtn.classList.remove('hidden');
        else ownerBtn.classList.add('hidden');
    }

    if (location.hash !== '#dashboard') history.replaceState(null, null, '#dashboard');
}

// 4. Authentication
async function login(un, pw) {
    safeRemoveClass('loadingScreen', 'hidden');
    safeText('loadingStatusText', "Authenticating Protocol...");

    try {
        const data = await dbCall(`users?username=eq.${un.toLowerCase()}&select=*`);
        const user = data?.[0];

        if (user && user.password === pw) {
            const mapped = {
                username: user.username,
                name: user.name,
                role: user.role,
                tfaEnabled: !!user.tfa_enabled,
                pageConfig: user.page_config ? JSON.parse(user.page_config) : {}
            };
            completeLogin(mapped);
        } else {
            alert("Authorization Denied: Invalid Credentials.");
        }
    } catch (e) {
        alert("System Error during Authentication.");
    } finally {
        safeAddClass('loadingScreen', 'hidden');
    }
}

function completeLogin(user) {
    currentUser = user;
    localStorage.setItem('studio_session', user.username);
    showDashboard();
    showToast(`Welcome back, ${user.name}!`);
}

function logout() {
    localStorage.removeItem('studio_session');
    location.reload();
}

// 5. Modals & UI
function openModal(id) {
    safeRemoveClass('modalOverlay', 'hidden');
    const overlay = get('modalOverlay');
    if (overlay) {
        Array.from(overlay.children).forEach(c => c.classList.add('hidden'));
    }
    safeRemoveClass(id, 'hidden');
}

function closeModal() {
    safeAddClass('modalOverlay', 'hidden');
}

function showToast(text, title = "Studio") {
    const container = get('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'glass p-4 rounded-xl shadow-lg border-l-4 border-emerald-500 transition-all min-w-[280px] z-[10000]';
    toast.innerHTML = `<div class="text-[10px] font-bold text-emerald-500 uppercase">${title}</div><div class="text-sm font-medium">${text}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 4000);
}

// 6. Public Profile
async function showPublicPage(username) {
    hideAllViews();
    safeRemoveClass('publicPage', 'hidden');
    safeRemoveClass('loadingScreen', 'hidden');

    try {
        const data = await dbCall(`users?username=eq.${username.toLowerCase()}&select=*`);
        const user = data?.[0];

        if (!user) {
            showToast("Profile Not Found", "Error");
            return showLogin();
        }

        const pc = user.page_config ? JSON.parse(user.page_config) : {};
        const container = get('pageContainer');
        if (container) {
            const primary = pc.primaryColor || '#4ade80';
            container.style.background = `linear-gradient(135deg, ${primary}dd, ${primary})`;
            container.style.borderRadius = (pc.borderRadius || 28) + 'px';
        }
        
        safeText('pageAvatar', pc.avatarEmoji || "👋");
        safeText('pageName', pc.displayName || user.name);
        safeText('pageUsername', `@${user.username}`);
        safeText('pageBioDisplay', pc.bio || "No bio set yet.");
    } catch (e) {
        showToast("Error loading page", "System");
    } finally {
        safeAddClass('loadingScreen', 'hidden');
    }
}

// 7. Site Settings Application
function applySiteSettings() {
    const settings = safeGet('studio_site_settings', {
        siteName: "SaebMC Studio",
        siteLogo: "S",
        welcomeMsg: "Authentication Protocol v25.0"
    });

    safeText('siteTitle', settings.siteName);
    safeText('navTitle', settings.siteName);
    const logoEls = document.querySelectorAll('#siteLogo');
    logoEls.forEach(el => el.innerText = settings.siteLogo);
    safeText('welcomeMessage', settings.welcomeMsg);
}

// 8. Initialization
async function initApp() {
    applySiteSettings();
    
    // Hash router
    window.addEventListener('hashchange', () => {
        const h = location.hash;
        if (h.startsWith('#/u/')) showPublicPage(h.split('/u/')[1]);
        else if (h === '#dashboard' || h === '') currentUser ? showDashboard() : showLogin();
    });

    // Form Binding
    get('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const un = get('loginUsername')?.value;
        const pw = get('loginPassword')?.value;
        if (un && pw) login(un, pw);
    });

    get('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const un = get('regUsername')?.value?.trim().toLowerCase();
        const pw = get('regPassword')?.value;
        const name = get('regName')?.value;
        
        if (!un || !pw || !name) return;

        const res = await dbCall('users', 'POST', {
            username: un, password: pw, name: name,
            role: 'user', page_config: JSON.stringify({})
        });
        if (res) { alert("Account Created."); showLogin(); }
        else alert("Registration Failed.");
    });

    // Session Recovery
    const session = localStorage.getItem('studio_session');
    if (session) {
        const data = await dbCall(`users?username=eq.${session}&select=*`);
        if (data?.[0]) {
            const u = data[0];
            currentUser = {
                username: u.username, name: u.name, role: u.role,
                tfaEnabled: !!u.tfa_enabled, statusText: u.status_text,
                pageConfig: u.page_config ? JSON.parse(u.page_config) : {}
            };
            showDashboard();
        } else showLogin();
    } else if (location.hash.startsWith('#/u/')) {
        showPublicPage(location.hash.split('/u/')[1]);
    } else {
        showLogin();
    }

    safeText('initStatus', "✅ Ready");
}

document.addEventListener('DOMContentLoaded', initApp);

// Global Exports
window.showDashboard = showDashboard;
window.showLogin = showLogin;
window.logout = logout;
window.closeModal = closeModal;
window.openModal = openModal;
window.toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('studio_theme', isDark ? 'dark' : 'light');
    const icon = get('themeIcon');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
};
window.goBackFromPublic = () => { hideAllViews(); currentUser ? showDashboard() : showLogin(); };
window.copyProfileLink = () => {
    const url = window.location.href.split('#')[0] + '#/u/' + get('pageUsername')?.innerText.replace('@','');
    navigator.clipboard.writeText(url).then(() => showToast("Link Copied!"));
};
window.openOwnerPanel = async () => {
    openModal('ownerPanelModal');
    const tbody = get('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4">Loading Users...</td></tr>';
    const users = await dbCall('users?select=*');
    safeText('totalUsersCount', users ? users.length : '0');
    if (!users) return;
    tbody.innerHTML = users.map(u => `
        <tr class="border-b border-white/5 text-sm">
            <td class="py-4">@${u.username}</td>
            <td>${u.role}</td>
            <td class="text-right">
                <button onclick="manageUser('${u.username}')" class="px-2 py-1 bg-white/5 rounded">Manage</button>
            </td>
        </tr>
    `).join('');
};
window.manageUser = (un) => {
    window.selectedUser = un;
    openModal('manageUserModal');
};
window.deleteSelectedUser = async () => {
    if (confirm("Delete user?")) {
        await dbCall(`users?username=eq.${window.selectedUser}`, 'DELETE');
        closeModal(); window.openOwnerPanel();
    }
};
window.openNotifications = () => {
    openModal('notificationsModal');
    const list = get('notificationsList');
    if (list) list.innerHTML = notifications.length ? notifications.map(n => `<div class="p-3 bg-white/5 rounded-xl border border-white/10 mb-2"><div class="text-[10px] font-bold text-emerald-500 uppercase">${n.type}</div><div class="text-sm">${n.text}</div></div>`).reverse().join('') : '<p class="text-center text-gray-500">No alerts.</p>';
};
window.openPageEditorModal = () => openModal('pageEditorModal');
window.openEditProfile = () => openModal('editProfileModal');
window.openCloudSync = () => openModal('cloudSyncModal');
window.openChat = () => openModal('chatModal');
