// ─── URL Params ────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const bayId = params.get('bay') || '?';

// ─── Google OAuth ──────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '1015275273603-ch7v0cops75lc14gib41q0cfv66ntb5v.apps.googleusercontent.com';

// ─── Init Bay UI ───────────────────────────────────────────────
document.getElementById('bayBadgeText').textContent = bayId !== '?' ? `ช่อง Bay ${bayId}` : 'ไม่ระบุช่อง';

// ─── View Elements ─────────────────────────────────────────────
const viewAuth = document.getElementById('viewAuth');
const viewInfo = document.getElementById('viewInfo');
const toastEl = document.getElementById('toast');

// ─── Init ──────────────────────────────────────────────────────
function init() {
    const token = localStorage.getItem('cw_token');
    if (token) {
        fetchProfile();
    } else {
        switchView('viewAuth');
    }
    initGoogleSignIn();
}

// ─── Google Sign-In Init ───────────────────────────────────────
function initGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(initGoogleSignIn, 300);
        return;
    }
    
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
        auto_select: false,
        cancel_on_tap_outside: true
    });
    
    google.accounts.id.renderButton(
        document.getElementById('btnGoogleSignIn'),
        { 
            theme: 'outline', 
            size: 'large', 
            width: '300',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
        }
    );
    
    console.log('✅ Google Sign-In initialized');
}

// ─── Google Callback ───────────────────────────────────────────
async function handleGoogleCallback(response) {
    try {
        const payload = { idToken: response.credential };
        if (bayId !== '?') payload.machine_id = bayId;

        const res = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('cw_token', data.token);
            if (data.refreshToken) localStorage.setItem('cw_refresh', data.refreshToken);
            showToast(data.message);
            setTimeout(() => {
                renderInfo(data.user);
            }, 500);
        } else {
            showToast(data.message || 'Google Login ล้มเหลว', 'error');
        }
    } catch (e) {
        console.error('Google login error:', e);
        showToast('Connection Error', 'error');
    }
}

// ─── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    toastEl.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> <span>${msg}</span>`;
    toastEl.className = `toast show ${type}`;
    if (window._tt) clearTimeout(window._tt);
    window._tt = setTimeout(() => { toastEl.className = `toast hidden ${type}`; }, 3000);
}

// ─── Switch Views ──────────────────────────────────────────────
function switchView(id) {
    [viewAuth, viewInfo].forEach(el => el.classList.add('hidden'));
    if (document.getElementById(id)) {
        document.getElementById(id).classList.remove('hidden');
    }
}

// ─── Fetch Profile (auto-login) ────────────────────────────────
async function fetchProfile() {
    const token = localStorage.getItem('cw_token');
    if (!token) { switchView('viewAuth'); return; }

    try {
        const url = bayId !== '?' ? `/me?machine_id=${bayId}` : '/me';
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
            renderInfo(data.user);
        } else {
            localStorage.removeItem('cw_token');
            switchView('viewAuth');
        }
    } catch (e) {
        console.error('Fetch profile error:', e);
        switchView('viewAuth');
    }
}

// ─── Render Info Page ──────────────────────────────────────────
function renderInfo(user) {
    document.getElementById('infoName').textContent = user.name || user.phone || user.email || 'User';
    document.getElementById('infoBalance').textContent = (user.balance || 0).toLocaleString();
    document.getElementById('infoBay').textContent = bayId !== '?' ? bayId : 'ไม่ระบุ';
    switchView('viewInfo');
}

// ─── Go to Wash Page ───────────────────────────────────────────
function goToWash() {
    const token = localStorage.getItem('cw_token');
    window.location.href = `/app/wash.html?bay=${bayId}&token=${encodeURIComponent(token)}`;
}

// ─── Logout ────────────────────────────────────────────────────
async function logout() {
    const token = localStorage.getItem('cw_token');
    if (token) {
        try {
            await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { }
    }
    localStorage.removeItem('cw_token');
    localStorage.removeItem('cw_refresh');
    switchView('viewAuth');
    location.reload();
}

// ─── Start ─────────────────────────────────────────────────────
init();
