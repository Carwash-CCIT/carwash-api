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

// ─── State ─────────────────────────────────────────────────────
let currentQrRef = null;
let currentQrAmount = 0;

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
    // Wait for GIS SDK to load
    if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(initGoogleSignIn, 300);
        return;
    }
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
        auto_select: false,
        cancel_on_tap_outside: true,
        prompt_parent_id: 'viewAuth' // ช่วยให้ One Tap แสดงผลได้ดีขึ้น
    });
    
    // Render the standard button as a fallback/primary option
    google.accounts.id.renderButton(
        document.getElementById('btnGoogleSignIn'),
        { 
            theme: 'outline', 
            size: 'large', 
            width: document.getElementById('btnGoogleSignIn').offsetWidth,
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
        }
    );
    
    console.log('✅ Google Sign-In initialized');
}

// ─── Google Sign-In Trigger ────────────────────────────────────
function googleSignIn() {
    // ฟังก์ชันนี้ตอนนี้อาจไม่ได้ถูกเรียกโดยตรงหากใช้ renderButton
    // แต่เราใส่ไว้เพื่อเป็นทางเลือกในการเรียก prompt
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.prompt();
    }
}

// ─── Google Callback ───────────────────────────────────────────
async function handleGoogleCallback(response) {
    const btn = document.getElementById('btnGoogleSignIn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
    btn.disabled = true;

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
            renderInfo(data.user);
        } else {
            showToast(data.message || 'Google Login ล้มเหลว', 'error');
        }
    } catch (e) {
        console.error('Google login error:', e);
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> เข้าสู่ระบบด้วย Google';
    btn.disabled = false;
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
    document.getElementById(id).classList.remove('hidden');
}

// ─── Auth Mode Tabs ───────────────────────────────────────────
function setAuthMode(mode) {
    authMode = mode;
    const nameInput = document.getElementById('loginName');
    const tabLogin = document.getElementById('tabLogin');
    const tabReg = document.getElementById('tabRegister');
    document.getElementById('authMessage').innerHTML = '';

    if (mode === 'login') {
        tabLogin.classList.add('active'); tabReg.classList.remove('active');
        nameInput.classList.add('hidden');
    } else {
        tabReg.classList.add('active'); tabLogin.classList.remove('active');
        nameInput.classList.remove('hidden');
    }
    checkInputType();
}

// ─── เช็คประเภท Input (เบอร์โทร หรือ Email) ───────────────────
function checkInputType() {
    const idVal = document.getElementById('loginId').value.trim();
    const isEmail = idVal.includes('@');
    const passInput = document.getElementById('loginPassword');
    const btnOtp = document.getElementById('btnRequestOtp');
    const btnLogin = document.getElementById('btnLoginPassword');

    if (isEmail) {
        passInput.classList.remove('hidden');
        if (authMode === 'login') {
            btnOtp.classList.add('hidden');
            btnLogin.classList.remove('hidden');
        } else {
            btnOtp.classList.remove('hidden');
            btnLogin.classList.add('hidden');
        }
    } else {
        passInput.classList.add('hidden');
        btnOtp.classList.remove('hidden');
        btnLogin.classList.add('hidden');
    }
}

// ─── Request OTP ───────────────────────────────────────────────
async function requestOTP() {
    const identifier = document.getElementById('loginId').value.trim();
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const isEmail = identifier.includes('@');

    if (!identifier) return showToast('กรุณากรอกเบอร์หรืออีเมล', 'error');
    if (authMode === 'register' && !name) return showToast('กรุณากรอกชื่อ', 'error');

    if (authMode === 'register' && isEmail) {
        if (!password) return showToast('กรุณาตั้งรหัสผ่าน', 'error');
        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/;
        if (!passRegex.test(password)) {
            return showToast('รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป มีพิมพ์เล็ก พิมพ์ใหญ่ และตัวเลข', 'error');
        }
    }

    const btn = document.getElementById('btnRequestOtp');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';
    btn.disabled = true;

    try {
        const payload = { identifier };
        const endpoint = authMode === 'register' ? '/auth/register/request-otp' : '/auth/login/request-otp';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('displayId').textContent = identifier;
            switchView('viewOTP');
            showToast('ส่งรหัสไปแล้ว');
            startResendCooldown();
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ขอรหัส OTP';
    btn.disabled = false;
}

// ─── Verify OTP ────────────────────────────────────────────────
async function verifyOTP() {
    const identifier = document.getElementById('loginId').value.trim();
    const otp = document.getElementById('otpCode').value.trim();
    const name = document.getElementById('loginName').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (otp.length !== 6) return;

    const btn = document.getElementById('btnVerifyOtp');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    btn.disabled = true;

    try {
        const payload = { identifier, otp };
        if (authMode === 'register') {
            payload.name = name;
            if (password) payload.password = password;
        }
        if (bayId !== '?') payload.machine_id = bayId;

        const endpoint = authMode === 'register' ? '/auth/register/verify-otp' : '/auth/login/verify-otp';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('cw_token', data.token);
            document.getElementById('otpCode').value = '';
            document.getElementById('loginName').value = '';
            showToast('ยืนยันสำเร็จ');
            renderInfo(data.user);
        } else {
            showToast(data.message, 'error');
            document.getElementById('otpCode').value = '';
        }
    } catch (e) {
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = 'ยืนยัน';
    btn.disabled = false;
}

// ─── Login ด้วยรหัสผ่าน (Email) ───────────────────────────────
async function loginWithPassword() {
    const identifier = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!identifier || !password) return showToast('กรุณากรอกอีเมลและรหัสผ่าน', 'error');

    const btn = document.getElementById('btnLoginPassword');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
    btn.disabled = true;

    try {
        const payload = { identifier, password };
        if (bayId !== '?') payload.machine_id = bayId;

        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('cw_token', data.token);
            document.getElementById('loginPassword').value = '';
            showToast('เข้าสู่ระบบสำเร็จ');
            renderInfo(data.user);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบ';
    btn.disabled = false;
}

// ─── Resend OTP ────────────────────────────────────────────────
async function resendOTP() {
    const btn = document.getElementById('btnResendOtp');
    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = 'กำลังส่งรหัสใหม่...';

    const identifier = document.getElementById('loginId').value.trim();
    const endpoint = authMode === 'register' ? '/auth/register/request-otp' : '/auth/login/request-otp';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        if (res.ok) {
            showToast('ส่งรหัส OTP ใหม่แล้ว');
            startResendCooldown();
        } else {
            const data = await res.json();
            showToast(data.message, 'error');
            btn.disabled = false;
            btn.textContent = 'ขอรหัสใหม่อีกครั้ง';
        }
    } catch (e) {
        showToast('Connection Error', 'error');
        btn.disabled = false;
        btn.textContent = 'ขอรหัสใหม่อีกครั้ง';
    }
}

function startResendCooldown() {
    const btn = document.getElementById('btnResendOtp');
    btn.disabled = true;
    resendSeconds = 60;
    if (resendTimer) clearInterval(resendTimer);
    btn.textContent = `รอ ${resendSeconds} วินาทีเพื่อขอรหัสใหม่`;
    resendTimer = setInterval(() => {
        resendSeconds--;
        if (resendSeconds <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            btn.disabled = false;
            btn.textContent = 'ขอรหัสใหม่อีกครั้ง';
        } else {
            btn.textContent = `รอ ${resendSeconds} วินาทีเพื่อขอรหัสใหม่`;
        }
    }, 1000);
}

// ─── Fetch Profile (auto-login) ────────────────────────────────
async function fetchProfile() {
    const token = localStorage.getItem('cw_token');
    if (!token) { switchView('viewAuth'); return; }

    try {
        const url = bayId !== '?' ? `/me?machine_id=${bayId}` : '/me';
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }  // ✅ แก้ไข: เพิ่ม Bearer
        });
        const data = await res.json();

        if (res.ok) {
            renderInfo(data.user);
        } else {
            localStorage.removeItem('cw_token');
            switchView('viewAuth');
        }
    } catch (e) {
        showToast('Connection Error', 'error');
        switchView('viewAuth');
    }
}

// ─── Render Info Page ──────────────────────────────────────────
function renderInfo(user) {
    document.getElementById('infoName').textContent = user.name || user.phone || user.email;
    document.getElementById('infoBalance').textContent = user.balance;
    document.getElementById('infoBay').textContent = bayId !== '?' ? bayId : 'ไม่ระบุ';
    switchView('viewInfo');
}

// ─── Logout ────────────────────────────────────────────────────
async function logout() {
    const token = localStorage.getItem('cw_token');
    if (token) {
        try {
            await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }  // ✅ แก้ไข: เพิ่ม Bearer
            });
        } catch (e) { }
    }
    localStorage.removeItem('cw_token');
    switchView('viewAuth');
}

// ─── Topup QR System ───────────────────────────────────────────
function setAmount(n) {
    document.getElementById('topupAmount').value = n;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    event.target.classList.add('selected');
}

function openTopupModal() {
    document.getElementById('topupModal').classList.add('show');
    document.getElementById('qrSection').classList.add('hidden');
    document.getElementById('topupAmount').value = '';
}

function closeTopupModal() {
    document.getElementById('topupModal').classList.remove('show');
}

async function generateQR() {
    const amountStr = document.getElementById('topupAmount').value.trim();
    const amount = parseInt(amountStr);
    if (!amount || amount < 20) return showToast('กรุณากรอกยอดเงินขั้นต่ำ 20 บาท', 'error');

    const token = localStorage.getItem('cw_token');
    if (!token) return showToast('กรุณาเข้าสู่ระบบก่อน', 'error');

    const btn = document.querySelector('.btn-gen');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้าง QR...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/qr/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`  // ✅ แก้ไข: เพิ่ม Bearer
            },
            body: JSON.stringify({ amount })
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'ไม่สามารถสร้าง QR ได้', 'error');
        } else {
            currentQrRef = data.qrRef;
            currentQrAmount = amount;

            const imgSrc = data.qrImage.startsWith('http') || data.qrImage.startsWith('data:image')
                ? data.qrImage
                : `data:image/png;base64,${data.qrImage}`;

            document.getElementById('qrContainer').innerHTML =
                `<img src="${imgSrc}" alt="QR PromptPay" style="width:180px;height:180px;">`;
            document.getElementById('qrSection').classList.remove('hidden');
            showToast('สแกน QR เพื่อชำระเงินได้เลย!');
            startPaymentPolling();
        }
    } catch (e) {
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> สร้าง QR Code';
    btn.disabled = false;
}

// ─── ตรวจสอบยอดเงินหลังสแกน QR ─────────────────────────────
let _pollTimer = null;
function startPaymentPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    let tries = 0;
    const prevBalance = parseFloat(document.getElementById('infoBalance').textContent) || 0;
    _pollTimer = setInterval(async () => {
        tries++;
        if (tries > 24) { clearInterval(_pollTimer); return; } // หยุดหลัง 2 นาที
        const token = localStorage.getItem('cw_token');
        if (!token) { clearInterval(_pollTimer); return; }
        try {
            const res = await fetch('/me', {
                headers: { 'Authorization': `Bearer ${token}` }  // ✅ แก้ไข: เพิ่ม Bearer
            });
            const data = await res.json();
            if (res.ok && parseFloat(data.user.balance) > prevBalance) {
                clearInterval(_pollTimer);
                document.getElementById('infoBalance').textContent = data.user.balance;
                showToast(`เติมเงินสำเร็จ ฿${data.user.balance - prevBalance}`);
                closeTopupModal();
            }
        } catch (e) { }
    }, 5000);
}

// ─── จำลองการจ่ายเงินสำเร็จ (Mock) ─────────────────────────────
async function simulateTopupSuccess() {
    if (!currentQrRef) return showToast('ไม่พบข้อมูลการเติมเงิน', 'error');

    const btn = document.querySelector('.btn-pay');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังจำลองการจ่ายเงิน...';
    btn.disabled = true;

    try {
        const res = await fetch('/webhook/scb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ref3: currentQrRef,
                amount: currentQrAmount.toFixed(2),
                transactionId: 'MOCK_TXN_' + Date.now()
            })
        });

        if (res.ok) {
            showToast('จำลองการจ่ายเงินสำเร็จ! รอระบบอัปเดต...');
        } else {
            showToast('จำลองการจ่ายเงินไม่สำเร็จ', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> ชำระเงินสำเร็จ (Mock)';
        }
    } catch (e) {
        showToast('Connection Error', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> ชำระเงินสำเร็จ (Mock)';
    }
}


// ─── Start ─────────────────────────────────────────────────────
init();