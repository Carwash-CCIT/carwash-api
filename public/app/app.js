// ─── URL Params ────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const bayId = params.get('bay') || '1';

// ─── Google OAuth ──────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '1015275273603-ch7v0cops75lc14gib41q0cfv66ntb5v.apps.googleusercontent.com';

// ─── View Elements ─────────────────────────────────────────────
const viewAuth = document.getElementById('viewAuth');
const toastEl = document.getElementById('toast');

// ─── Init ──────────────────────────────────────────────────────
function init() {
    const token = localStorage.getItem('cw_token');
    if (token) {
        // ถ้ามี token แล้ว ให้เข้าไป wash.html เลย
        goToWash();
    } else {
        initGoogleSignIn();
    }
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
            showToast('✅ เข้าสู่ระบบสำเร็จ');
            setTimeout(() => {
                goToWash();
            }, 500);
        } else {
            showToast(data.message || 'Google Login ล้มเหลว', 'error');
        }
    } catch (e) {
        console.error('Google login error:', e);
        showToast('❌ Connection Error', 'error');
    }
}

// ─── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    toastEl.innerHTML = msg;
    toastEl.className = `toast show ${type}`;
    if (window._tt) clearTimeout(window._tt);
    window._tt = setTimeout(() => { toastEl.className = `toast hidden ${type}`; }, 3000);
}

// ─── Go to Wash Page ───────────────────────────────────────────
function goToWash() {
    const token = localStorage.getItem('cw_token');
    if (!token) {
        showToast('❌ ไม่พบ Token', 'error');
        return;
    }
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
    location.reload();
}

// ─── Start ─────────────────────────────────────────────────────
init();
