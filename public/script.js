// ─── Utilities ───────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getAdminToken() {
    return localStorage.getItem('admin_token') || '';
}

function adminHeaders(extra = {}) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAdminToken()}`,
        ...extra
    };
}

async function adminFetch(url, options = {}) {
    options.headers = adminHeaders(options.headers);
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        adminLogout();
        throw new Error('Unauthorized');
    }
    return res;
}

// ─── Login Gate ──────────────────────────────────────────────
async function handleGateLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!username || !password) {
        errorEl.textContent = 'กรุณากรอก Username และ Password';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
    errorEl.style.display = 'none';

    try {
        const res = await fetch('/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok || !data.token) {
            errorEl.textContent = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
            errorEl.style.display = 'block';
            return;
        }

        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_name', data.user?.name || username);

        enterDashboard();
    } catch (e) {
        errorEl.textContent = 'ไม่สามารถเชื่อมต่อ Server ได้';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบ';
    }
}

function enterDashboard() {
    document.getElementById('loginGate').style.display = 'none';
    const name = localStorage.getItem('admin_name') || 'Admin';
    document.getElementById('adminName').textContent = name;
    document.getElementById('adminInfo').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    fetchMachines();
    if (!pollTimer) {
        pollTimer = setInterval(() => { fetchMachines(); }, 3000);
    }
}

function adminLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    document.getElementById('loginGate').style.display = 'flex';
    document.getElementById('adminInfo').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function handleLogout() {
    const token = getAdminToken();
    if (token) {
        fetch('/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
    adminLogout();
}

// Auto-login if token exists
async function checkExistingSession() {
    const token = getAdminToken();
    if (!token) return;
    try {
        const res = await fetch('/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.user?.role === 'admin') {
            localStorage.setItem('admin_name', data.user.name || data.user.username || 'Admin');
            enterDashboard();
        } else {
            adminLogout();
        }
    } catch {
        adminLogout();
    }
}

// ─── Clock ────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('clockDate').textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── Navigation ──────────────────────────────────────────────
function showSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + name).classList.add('active');
    document.querySelector(`.nav-item[onclick*="'${name}'"]`).classList.add('active');
    if (name === 'members') fetchUsers();
    if (name === 'control') fetchMachines();
    if (name === 'finance') fetchFinance();
    if (name === 'admins') fetchAdmins();
    if (name === 'bayqr') fetchBayQRCodes();
}

function refreshAll() {
    fetchMachines();
}

// ─── Toast ────────────────────────────────────────────────────
const toastEl = document.getElementById('toast');
function showToast(message, type = 'success') {
    toastEl.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> <span>${message}</span>`;
    toastEl.className = `toast show ${type}`;
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => { toastEl.className = `toast hidden ${type}`; }, 4000);
}

// ─── State ────────────────────────────────────────────────────
let allMachines = [];
let selectedBayId = null;
let pollTimer = null;

// ─── Machines ─────────────────────────────────────────────────
async function fetchMachines() {
    if (allMachines.length === 0) {
        document.getElementById('machinesList').innerHTML = '<div class="loading-spinner"></div>';
    }
    try {
        const res = await fetch('/machines');
        const data = await res.json();
        if (data.data) {
            allMachines = data.data;
            renderMachines(data.data);
            renderBaySelector(data.data);
            renderControlBays(data.data);
        }
    } catch (err) {
        document.getElementById('machinesList').innerHTML = '<p style="color:#ef4444; text-align:center;">Connection Error</p>';
    }
}

function getElapsed(startTime) {
    if (!startTime) return '—';
    const start = new Date(startTime);
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    let diffMs = now - start;
    diffMs += offsetMs;

    if (diffMs < 0) return '0 วิ';
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins === 0) return `${secs} วิ`;
    return `${mins} นาที ${secs} วิ`;
}

function renderMachines(machines) {
    const el = document.getElementById('machinesList');
    if (machines.length === 0) {
        el.innerHTML = '<div class="loading-state">ไม่พบตู้ระบบ</div>';
        return;
    }

    // Stat cards
    const busy = machines.filter(m => m.status === 'busy').length;
    const idle = machines.filter(m => m.status !== 'busy').length;
    document.getElementById('statBusy')?.innerText !== undefined && (document.getElementById('statBusy').textContent = busy);
    document.getElementById('statIdle')?.innerText !== undefined && (document.getElementById('statIdle').textContent = idle);

    el.innerHTML = machines.map(m => {
        const isBusy = m.status === 'busy';
        const hasSession = !!m.session_id;
        const displayName = m.user_name || m.user_phone || m.user_email || 'แอดมิน (Admin)';

        return `
        <div class="bay-card ${isBusy ? 'busy' : 'idle'}" onclick="showSection('control'); selectBay(${m.id});" style="cursor:pointer;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
            <div class="bay-card-header">
                <div class="bay-name"><i class="fa-solid fa-droplet" style="font-size:0.9rem; margin-right:0.4rem; color:${isBusy ? '#f87171' : '#34d399'}"></i>${m.name}</div>
                <span class="bay-status-pill ${isBusy ? 'pill-busy' : 'pill-idle'}">
                    <span class="pill-dot"></span>
                    ${isBusy ? 'กำลังใช้' : 'ว่าง'}
                </span>
            </div>
            <div class="bay-user-info">
                ${isBusy ? `
                    <div>ผู้ใช้: <strong>${displayName}</strong></div>
                    ${hasSession ? `<div>ยอดเงิน: <strong style="color:#60a5fa">฿${m.user_balance ?? '—'}</strong></div>
                    <div class="bay-elapsed" data-start="${m.start_time}">${getElapsed(m.start_time)}</div>` : '<div style="color:var(--muted); font-size:0.8rem; margin-top:4px;">ไม่มีเซสชันถูกหักเงิน</div>'}
                    <button onclick="forceResetBay(${m.id})" style="margin-top:0.5rem; padding:0.25rem 0.65rem; font-size:0.72rem; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.1); color:#f87171; cursor:pointer; font-family:'Outfit',sans-serif; font-weight:600; transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">⟳ Force Reset</button>
                ` : '<span style="font-size:0.85rem;">ไม่มีผู้ใช้งาน</span>'}
            </div>
        </div>`;
    }).join('');
}

// อัปเดต elapsed time ทุก 5 วินาทีโดยไม่ต้องเรียก server
setInterval(() => {
    document.querySelectorAll('[data-start]').forEach(el => {
        el.textContent = getElapsed(el.getAttribute('data-start'));
    });
}, 5000);

function renderBaySelector(machines) {
    const el = document.getElementById('baySelector');
    if (!el) return;
    el.innerHTML = machines.map(m => `
        <button class="bay-tab ${selectedBayId == m.id ? 'selected' : ''}" onclick="selectBay(${m.id})">
            <span class="machine-status-dot ${m.status === 'idle' ? 'dot-idle' : 'dot-busy'}"></span>Bay ${m.id}
        </button>
    `).join('');
    if (!selectedBayId && machines.length > 0) {
        selectBay(machines[0].id);
    }
}

function selectBay(id) {
    selectedBayId = id;
    document.querySelectorAll('.bay-tab').forEach(btn => btn.classList.remove('selected'));
    const tabs = document.querySelectorAll('.bay-tab');
    tabs.forEach(t => { if (t.textContent.includes(`Bay ${id}`)) t.classList.add('selected'); });
    const cmdResult = document.getElementById('cmdResult');
    if (cmdResult) {
        cmdResult.textContent = `เลือกช่อง Bay ${id} แล้ว`;
        cmdResult.style.color = '#94a3b8';
    }
}

// ─── Control Bay Cards (Card-per-Bay Design) ─────────────────
function renderControlBays(machines) {
    const el = document.getElementById('controlBayGrid');
    if (!el) return;
    if (machines.length === 0) {
        el.innerHTML = '<div class="loading-state">ไม่พบตู้ระบบ</div>';
        return;
    }

    el.innerHTML = machines.map(m => {
        const isBusy = m.status === 'busy';
        const hasSession = !!m.session_id;
        const displayName = m.user_name || m.user_phone || m.user_email || 'แอดมิน (Admin)';

        const infoContent = isBusy
            ? `<div>ผู้ใช้: <strong>${displayName}</strong></div>
               ${hasSession ? `<div>ยอดเงิน: <strong style="color:#60a5fa">฿${m.user_balance ?? '—'}</strong>
               <span class="cbc-elapsed" data-start="${m.start_time}">${getElapsed(m.start_time)}</span></div>` : '<div style="color:var(--muted); font-size:0.8rem;">ไม่มีเซสชันถูกหักเงิน</div>'}`
            : '<span style="color:var(--muted)"><i class="fa-solid fa-check-circle" style="color:#34d399; margin-right:0.3rem;"></i>ว่าง — พร้อมใช้งาน</span>';

        return `
        <div class="control-bay-card ${isBusy ? 'cbc-busy' : 'cbc-idle'}">
            <div class="control-bay-header">
                <div class="control-bay-name">
                    <span class="cbc-dot"></span>
                    ${m.name}
                </div>
                <span class="control-bay-status">${isBusy ? 'กำลังใช้' : 'ว่าง'}</span>
            </div>

            <div class="control-bay-info">
                <div>${infoContent}</div>
            </div>

            <div class="control-cmd-grid">
                <button class="control-cmd-btn ccb-water" onclick="sendCommandToBay(${m.id}, 'WATER_ON', this)">
                    <i class="fa-solid fa-droplet"></i><span>ฉีดน้ำ</span>
                </button>
                <button class="control-cmd-btn ccb-foam" onclick="sendCommandToBay(${m.id}, 'FOAM_ON', this)">
                    <i class="fa-solid fa-soap"></i><span>ฉีดโฟม</span>
                </button>
                <button class="control-cmd-btn ccb-air" onclick="sendCommandToBay(${m.id}, 'AIR_DRY', this)">
                    <i class="fa-solid fa-wind"></i><span>เป่าลม</span>
                </button>
                <button class="control-cmd-btn ccb-air-fill" onclick="sendCommandToBay(${m.id}, 'AIR_FILL', this)">
                    <i class="fa-solid fa-fan"></i><span>เติมลม</span>
                </button>
                <button class="control-cmd-btn ccb-vacuum" onclick="sendCommandToBay(${m.id}, 'VACUUM', this)">
                    <i class="fa-solid fa-tornado"></i><span>ดูดฝุ่น</span>
                </button>
                <button class="control-cmd-btn ccb-wax" onclick="sendCommandToBay(${m.id}, 'WAX_ON', this)">
                    <i class="fa-solid fa-star"></i><span>เคลือบเงา</span>
                </button>
                <button class="control-cmd-btn ccb-tyre" onclick="sendCommandToBay(${m.id}, 'TYRE_ON', this)">
                    <i class="fa-solid fa-circle-dot"></i><span>ยางดำ</span>
                </button>
                <button class="control-cmd-btn ccb-handwash" onclick="sendCommandToBay(${m.id}, 'HAND_WASH', this)">
                    <i class="fa-solid fa-water"></i><span>ล้างมือ</span>
                </button>
                <button class="control-cmd-btn ccb-stop" onclick="sendCommandToBay(${m.id}, 'STOP', this)">
                    <i class="fa-solid fa-stop"></i><span>หยุด</span>
                </button>
            </div>
            ${isBusy ? `<button class="cbc-reset-btn" onclick="forceResetBay(${m.id})"><i class="fa-solid fa-rotate-left"></i> Force Reset</button>` : ''}
        </div>`;
    }).join('');
}

async function sendCommandToBay(machineId, command, btnEl) {
    // Visual feedback on the button
    if (btnEl) btnEl.classList.add('sending');

    try {
        const res = await adminFetch('/admin/command', {
            method: 'POST',
            body: JSON.stringify({ machine_id: machineId, command })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`${CMD_LABELS[command]} → Bay ${machineId} สำเร็จ!`);
        } else {
            showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
        }
        fetchMachines();
    } catch (e) {
        if (e.message !== 'Unauthorized') showToast('Connection Error', 'error');
    } finally {
        if (btnEl) {
            setTimeout(() => btnEl.classList.remove('sending'), 600);
        }
    }
}

// ─── Service Command ──────────────────────────────────────────
const CMD_LABELS = {
    WATER_ON: '💧 ฉีดน้ำ', 
    FOAM_ON: '🫧 ฉีดโฟม', 
    AIR_DRY: '💨 เป่าลม',
    AIR_FILL: '🌬️ เติมลม',
    VACUUM: '🌀 ดูดฝุ่น',
    WAX_ON: '⭐ เคลือบเงา', 
    TYRE_ON: '⚫ ยางดำ', 
    HAND_WASH: '🚰 ล้างมือ',
    STOP: '✋ หยุด'
};

async function forceResetBay(machineId) {
    if (!confirm(`Force Reset Bay ${machineId}? ระบบจะปิด Session และคืนสถานะเป็น "ว่าง"`)) return;
    try {
        const res = await adminFetch('/admin/reset-bay', {
            method: 'POST',
            body: JSON.stringify({ machine_id: machineId })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) fetchMachines();
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}

async function sendCommand(command) {
    if (!selectedBayId) return showToast('กรุณาเลือกช่อง Bay ก่อน', 'error');

    const cmdEl = document.getElementById('cmdResult');
    cmdEl.textContent = `กำลังส่งคำสั่ง ${CMD_LABELS[command]} → Bay ${selectedBayId}...`;
    cmdEl.style.color = '#94a3b8';

    try {
        const res = await adminFetch('/admin/command', {
            method: 'POST',
            body: JSON.stringify({ machine_id: selectedBayId, command })
        });
        const data = await res.json();
        if (res.ok) {
            cmdEl.textContent = `✅ ส่งคำสั่ง ${CMD_LABELS[command]} → Bay ${selectedBayId} สำเร็จ!`;
            cmdEl.style.color = '#34d399';
            showToast(`${CMD_LABELS[command]} → Bay ${selectedBayId} สำเร็จ!`);
        } else {
            cmdEl.textContent = data.message;
            cmdEl.style.color = '#f87171';
        }
        fetchMachines();
    } catch (e) {
        cmdEl.textContent = 'Connection Error';
        cmdEl.style.color = '#f87171';
    }
}

// ─── Users Table ──────────────────────────────────────────────
async function fetchUsers() {
    const tbody = document.getElementById('userTableBody');
    try {
        const res = await adminFetch('/admin/users');
        const data = await res.json();
        if (data.users) {
            renderUsers(data.users);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">ไม่พบข้อมูลสมาชิก</td></tr>';
        }
    } catch (err) {
        console.error('fetchUsers error:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted);">Connection Error</td></tr>';
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('userTableBody');

    // Update stat cards
    document.getElementById('statUsers').textContent = users.length;
    const totalWallet = users.reduce((a, u) => a + (u.balance || 0), 0);
    document.getElementById('statWallet').textContent = totalWallet.toLocaleString();

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">ยังไม่มีสมาชิก</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td style="color:var(--muted)">${u.id}</td>
            <td>${u.name || '<span style="color:var(--muted)">-</span>'}</td>
            <td>${u.phone || u.email || '-'}</td>
            <td style="font-weight:700; color:#60a5fa">฿${u.balance}</td>
            <td>
                <span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-pending'}">
                    ${u.status === 'active' ? '✅ ใช้งาน' : '⏳ รอยืนยัน'}
                </span>
            </td>
            <td>
                <div class="topup-inline">
                    <input type="number" id="topup_${u.id}" placeholder="฿" min="1" />
                    <button class="add" onclick="adminTopup(${u.id})">เติม</button>
                </div>
            </td>
            <td>
                <div class="topup-inline">
                    <input type="number" id="deduct_${u.id}" placeholder="฿" min="1" />
                    <button class="sub" onclick="adminDeduct(${u.id})">ลด</button>
                </div>
            </td>
            <td>
                <div style="display:flex; gap:0.4rem;">
                    <button data-userid="${u.id}" data-username="${escapeHtml(u.name || u.phone || u.email || '')}" onclick="openChangePasswordModal(this.dataset.userid, this.dataset.username)" title="เปลี่ยนรหัสผ่าน"
                        style="padding:0.35rem 0.6rem; border-radius:8px; border:1px solid rgba(59,130,246,0.4); background:rgba(59,130,246,0.1); color:#60a5fa; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button data-userid="${u.id}" data-username="${escapeHtml(u.name || u.phone || u.email || '')}" onclick="deleteUser(this.dataset.userid, this.dataset.username)" title="ลบสมาชิก"
                        style="padding:0.35rem 0.6rem; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.1); color:#f87171; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function adminTopup(userId) {
    const amtInput = document.getElementById(`topup_${userId}`);
    const amount = parseInt(amtInput.value);
    if (!amount || amount <= 0) return showToast('ระบุจำนวนเงิน', 'error');
    try {
        const res = await adminFetch('/admin/topup', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, amount })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) { amtInput.value = ''; fetchUsers(); }
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}

async function adminDeduct(userId) {
    const amtInput = document.getElementById(`deduct_${userId}`);
    const amount = parseInt(amtInput.value);
    if (!amount || amount <= 0) return showToast('ระบุจำนวนเงินที่จะลด', 'error');
    try {
        const res = await adminFetch('/admin/deduct', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, amount })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) { amtInput.value = ''; fetchUsers(); }
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}

// ─── Finance Dashboard ────────────────────────────────────────
async function fetchFinance() {
    const dailyEl = document.getElementById('finDaily');
    const weeklyEl = document.getElementById('finWeekly');
    const monthlyEl = document.getElementById('finMonthly');

    try {
        const res = await adminFetch('/admin/finance');
        const data = await res.json();
        
        if (!data.data) {
            console.warn('Finance data is missing in response');
            showEmptyFinance();
            return;
        }

        const s = data.data.summary?.[0] || {};
        document.getElementById('finToday').textContent = (s.today || 0).toLocaleString();
        document.getElementById('finWeek').textContent = (s.week || 0).toLocaleString();
        document.getElementById('finMonth').textContent = (s.month || 0).toLocaleString();
        document.getElementById('finAlltime').textContent = (s.alltime || 0).toLocaleString();
        
        renderFinanceTable('finDaily', data.data.daily, 'วันที่');
        renderFinanceTable('finWeekly', data.data.weekly, 'สัปดาห์');
        renderFinanceTable('finMonthly', data.data.monthly, 'เดือน');
    } catch (err) {
        console.error('fetchFinance error:', err);
        showEmptyFinance('Connection Error');
    }
}

function showEmptyFinance(message = 'ยังไม่มีข้อมูล') {
    const emptyMsg = `<div class="table-empty" style="padding:1.5rem; text-align:center; color:var(--muted);">${message}</div>`;
    document.getElementById('finDaily').innerHTML = emptyMsg;
    document.getElementById('finWeekly').innerHTML = emptyMsg;
    document.getElementById('finMonthly').innerHTML = emptyMsg;
    
    document.getElementById('finToday').textContent = '0';
    document.getElementById('finWeek').textContent = '0';
    document.getElementById('finMonth').textContent = '0';
    document.getElementById('finAlltime').textContent = '0';
}

function renderFinanceTable(elId, rows, labelText) {
    const el = document.getElementById(elId);
    if (!rows || rows.length === 0) {
        el.innerHTML = '<div class="table-empty" style="padding:1.5rem; text-align:center; color:var(--muted);">ยังไม่มีข้อมูล</div>';
        return;
    }

    const maxTotal = Math.max(...rows.map(r => r.total || 0));

    el.innerHTML = rows.map(r => {
        const pct = maxTotal > 0 ? Math.round((r.total / maxTotal) * 100) : 0;
        return `
        <div style="margin-bottom:0.8rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:0.3rem;">
                <span style="color:var(--muted);">${r.label}</span>
                <span style="font-weight:600; color:var(--text);">฿${(r.total || 0).toLocaleString()} <span style="color:var(--muted); font-weight:400;">(${r.count} ครั้ง)</span></span>
            </div>
            <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, var(--primary), #8b5cf6); border-radius:4px; transition:width 0.5s ease;"></div>
            </div>
        </div>`;
    }).join('');
}

// ─── Admin Management ─────────────────────────────────────────

async function fetchAdmins() {
    const tbody = document.getElementById('adminTableBody');
    try {
        const res = await adminFetch('/admin/admins');
        const data = await res.json();
        if (data.admins) {
            renderAdmins(data.admins);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">ไม่พบข้อมูล</td></tr>';
        }
    } catch (err) {
        if (err.message !== 'Unauthorized') {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted);">Connection Error</td></tr>';
        }
    }
}

function renderAdmins(admins) {
    const tbody = document.getElementById('adminTableBody');
    if (admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">ยังไม่มีแอดมิน</td></tr>';
        return;
    }
    tbody.innerHTML = admins.map(a => `
        <tr>
            <td style="color:var(--muted)">${a.id}</td>
            <td style="font-weight:600; color:#a78bfa;">
                ${escapeHtml(a.username || '')}
                ${a.is_primary ? '<span style="display:inline-block; margin-left:0.4rem; padding:0.1rem 0.45rem; font-size:0.65rem; background:rgba(234,179,8,0.15); color:#facc15; border:1px solid rgba(234,179,8,0.3); border-radius:6px; font-weight:600;">ADMIN หลัก</span>' : ''}
            </td>
            <td>${escapeHtml(a.name || '')}</td>
            <td style="color:var(--muted); font-size:0.82rem;">${a.created_at ? new Date(a.created_at).toLocaleDateString('th-TH') : '-'}</td>
            <td>
                <div style="display:flex; gap:0.4rem;">
                    <button data-adminid="${a.id}" data-adminname="${escapeHtml(a.username || '')}" onclick="changeAdminPassword(this.dataset.adminid, this.dataset.adminname)" title="เปลี่ยนรหัสผ่าน"
                        style="padding:0.35rem 0.6rem; border-radius:8px; border:1px solid rgba(139,92,246,0.4); background:rgba(139,92,246,0.1); color:#a78bfa; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    ${a.is_primary ? '' : `<button data-adminid="${a.id}" data-adminname="${escapeHtml(a.username || '')}" onclick="deleteAdmin(this.dataset.adminid, this.dataset.adminname)" title="ลบแอดมิน"
                        style="padding:0.35rem 0.6rem; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.1); color:#f87171; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-trash"></i>
                    </button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddAdminModal() {
    document.getElementById('addAdminUsername').value = '';
    document.getElementById('addAdminName').value = '';
    document.getElementById('addAdminPassword').value = '';
    document.getElementById('modalAddAdmin').style.display = 'flex';
}

function closeAddAdminModal() {
    document.getElementById('modalAddAdmin').style.display = 'none';
}

async function submitAddAdmin() {
    const username = document.getElementById('addAdminUsername').value.trim();
    const name = document.getElementById('addAdminName').value.trim();
    const password = document.getElementById('addAdminPassword').value;
    if (!username || !name || !password) {
        return showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
    }
    if (password.length < 8) {
        return showToast('Password ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
    }
    try {
        const res = await adminFetch('/admin/admins', {
            method: 'POST',
            body: JSON.stringify({ username, name, password })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) { closeAddAdminModal(); fetchAdmins(); }
    } catch (e) {
        if (e.message !== 'Unauthorized') showToast('Connection Error', 'error');
    }
}

async function deleteAdmin(id, name) {
    if (!confirm(`ลบแอดมิน "${name}" ออกจากระบบ?`)) return;
    try {
        const res = await adminFetch(`/admin/admins/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) fetchAdmins();
    } catch (e) {
        if (e.message !== 'Unauthorized') showToast('Connection Error', 'error');
    }
}

async function changeAdminPassword(id, name) {
    const password = prompt(`ตั้งรหัสผ่านใหม่สำหรับ "${name}" (อย่างน้อย 8 ตัว):`);
    if (!password) return;
    if (password.length < 8) return showToast('Password ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
    try {
        const res = await adminFetch(`/admin/admins/${id}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
    } catch (e) {
        if (e.message !== 'Unauthorized') showToast('Connection Error', 'error');
    }
}

// ─── Bay QR Codes ────────────────────────────────────────────

async function fetchBayQRCodes() {
    const grid = document.getElementById('bayQrGrid');
    grid.innerHTML = '<div class="card" style="text-align:center; padding:2rem; color:#475569;">กำลังโหลด...</div>';
    try {
        const res = await adminFetch('/admin/bay-qrcodes');
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        if (!data.bays || data.bays.length === 0) {
            grid.innerHTML = '<div class="card" style="text-align:center; padding:2rem; color:#475569;">ไม่พบข้อมูล Bay</div>';
            return;
        }

        grid.innerHTML = data.bays.map(bay => {
            const statusColor = bay.status === 'idle' ? '#10b981' : '#ef4444';
            const statusText = bay.status === 'idle' ? 'ว่าง' : 'ใช้งาน';
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bay.url)}`;
            return `<div class="card" style="text-align:center; padding:1.5rem;" data-bay-qr>
                <div style="margin-bottom:1rem;">
                    <span style="font-size:1.3rem; font-weight:800; color:#3b82f6;">${escapeHtml(bay.bay_name || 'Bay ' + bay.bay_id)}</span>
                    <span style="display:inline-block; margin-left:0.5rem; padding:0.2rem 0.6rem; border-radius:6px; font-size:0.7rem; font-weight:600; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44;">${statusText}</span>
                </div>
                <div style="background:white; display:inline-block; padding:12px; border-radius:12px; margin-bottom:1rem;">
                    <img src="${qrApiUrl}" alt="QR Bay ${bay.bay_id}" style="width:180px; height:180px; display:block;">
                </div>
                <div style="font-size:0.75rem; color:#64748b; word-break:break-all; margin-bottom:0.75rem;">${escapeHtml(bay.url)}</div>
                <button onclick="copyBayUrl('${escapeHtml(bay.url)}')" style="padding:0.4rem 1rem; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); color:#93c5fd; border-radius:8px; font-family:inherit; font-size:0.8rem; cursor:pointer; transition:all 0.2s;">
                    <i class="fa-solid fa-copy"></i> คัดลอก URL
                </button>
            </div>`;
        }).join('');
    } catch (e) {
        if (e.message !== 'Unauthorized') {
            grid.innerHTML = `<div class="card" style="text-align:center; padding:2rem; color:#f87171;">${escapeHtml(e.message)}</div>`;
        }
    }
}

function copyBayUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('คัดลอก URL แล้ว', 'success');
    }).catch(() => {
        showToast('คัดลอกไม่สำเร็จ', 'error');
    });
}

function printBayQR() {
    const cards = document.querySelectorAll('[data-bay-qr]');
    if (cards.length === 0) return showToast('ไม่พบ QR Code ให้พิมพ์', 'error');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>พิมพ์ QR Code - Green Energy Car Wash</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 1rem; }
            .qr-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
            .qr-item { text-align: center; border: 2px solid #e2e8f0; border-radius: 16px; padding: 1.5rem; page-break-inside: avoid; }
            .qr-item h2 { margin: 0 0 0.5rem; font-size: 1.5rem; color: #1e293b; }
            .qr-item img { width: 200px; height: 200px; }
            .qr-item p { margin: 0.5rem 0 0; font-size: 0.8rem; color: #64748b; }
            .qr-item .scan-text { font-size: 1rem; font-weight: 600; color: #334155; margin-top: 0.75rem; }
            @media print { body { padding: 0; } .qr-grid { gap: 1rem; } }
        </style></head><body>
        <div class="qr-grid">`);
    cards.forEach(card => {
        const name = card.querySelector('span[style*="font-weight:800"]')?.textContent || '';
        const img = card.querySelector('img');
        const url = card.querySelector('div[style*="word-break"]')?.textContent || '';
        win.document.write(`<div class="qr-item">
            <h2>${name}</h2>
            <img src="${img?.src || ''}" alt="${name}">
            <p class="scan-text">สแกนเพื่อเข้าใช้บริการ</p>
            <p>${url}</p>
        </div>`);
    });
    win.document.write('</div></body></html>');
    win.document.close();
    setTimeout(() => win.print(), 500);
}

// ─── Init ─────────────────────────────────────────────────────

window.onload = () => {
    checkExistingSession();
};
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else {
        fetchMachines();
        if (!pollTimer) {
            pollTimer = setInterval(() => { fetchMachines(); }, 3000);
        }
    }
});

// ─── User Management ─────────────────────────────────────────

// ── Delete User ──
async function deleteUser(userId, name) {
    if (!confirm(`⚠️ ลบสมาชิก "${name}" ออกจากระบบ?\nข้อมูลและธุรกรรมทั้งหมดจะถูกลบด้วย`)) return;
    try {
        const res = await adminFetch(`/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) fetchUsers();
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}

// ── Add User Modal ──
function openAddUserModal() {
    document.getElementById('addName').value = '';
    document.getElementById('addPhone').value = '';
    document.getElementById('addEmail').value = '';
    document.getElementById('addPassword').value = '';
    const m = document.getElementById('modalAddUser');
    m.style.display = 'flex';
}
function closeAddUserModal() {
    document.getElementById('modalAddUser').style.display = 'none';
}
async function submitAddUser() {
    const name = document.getElementById('addName').value.trim();
    const phone = document.getElementById('addPhone').value.trim();
    const email = document.getElementById('addEmail').value.trim();
    const pwd = document.getElementById('addPassword').value;
    if (!name || (!phone && !email)) {
        return showToast('ต้องระบุชื่อ และ เบอร์โทร/อีเมล อย่างน้อย 1 อย่าง', 'error');
    }
    try {
        const res = await adminFetch('/admin/users', {
            method: 'POST',
            body: JSON.stringify({ name, phone: phone || null, email: email || null, password: pwd || null })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) { closeAddUserModal(); fetchUsers(); }
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}

// ── Change Password Modal ──
function openChangePasswordModal(userId, name) {
    document.getElementById('pwdUserId').value = userId;
    document.getElementById('changePwdLabel').textContent = `เปลี่ยนรหัสผ่านสำหรับ: ${name}`;
    document.getElementById('newPassword').value = '';
    const m = document.getElementById('modalChangePassword');
    m.style.display = 'flex';
}
function closeChangePasswordModal() {
    document.getElementById('modalChangePassword').style.display = 'none';
}
async function submitChangePassword() {
    const userId = document.getElementById('pwdUserId').value;
    const password = document.getElementById('newPassword').value;
    if (!password || password.length < 8) {
        return showToast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
    }
    try {
        const res = await adminFetch(`/admin/users/${userId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) closeChangePasswordModal();
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}
