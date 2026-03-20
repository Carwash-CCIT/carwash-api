// ─── URL Params ────────────────────────────────────────────────
let resendTimer = null;
let resendSeconds = 60;
const params = new URLSearchParams(window.location.search);
const bayId = params.get('bay') || '?';

// ─── Init Bay UI ───────────────────────────────────────────────
document.getElementById('bayBadgeText').textContent = bayId !== '?' ? `ช่อง Bay ${bayId}` : 'ไม่ระบุช่อง';

// ─── View Elements ─────────────────────────────────────────────
const viewAuth = document.getElementById('viewAuth');
const viewOTP = document.getElementById('viewOTP');
const viewInfo = document.getElementById('viewInfo');
const toastEl = document.getElementById('toast');

// ─── State ─────────────────────────────────────────────────────
let authMode = 'login';
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
    [viewAuth, viewOTP, viewInfo].forEach(el => el.classList.add('hidden'));
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

// ─── ยืนยันการจ่ายเงิน (ลูกค้ากดหลังสแกน QR) ──────────────────
async function confirmPayment() {
    if (!currentQrRef || !currentQrAmount) return showToast('ไม่พบข้อมูลการเติมเงิน', 'error');

    const btn = document.getElementById('btnConfirmPay');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    btn.disabled = true;

    const token = localStorage.getItem('cw_token');
    if (!token) return showToast('กรุณาเข้าสู่ระบบก่อน', 'error');

    try {
        const res = await fetch('/api/topup/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                qrRef: currentQrRef,
                amount: currentQrAmount
            })
        });
        const data = await res.json();

        if (res.ok) {
            showToast(`✅ เติมเงินสำเร็จ ฿${currentQrAmount}!`);
            document.getElementById('infoBalance').textContent = data.balance;
            currentQrRef = null;
            currentQrAmount = 0;
            closeTopupModal();
        } else {
            showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (e) {
        showToast('Connection Error', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> ฉันจ่ายเงินแล้ว';
    btn.disabled = false;
}

// ─── Start ─────────────────────────────────────────────────────
init();