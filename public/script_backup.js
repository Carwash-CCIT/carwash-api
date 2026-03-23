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
                    <i class="fa-solid fa-droplet"></i><span>น้ำ</span>
                </button>
                <button class="control-cmd-btn ccb-foam" onclick="sendCommandToBay(${m.id}, 'FOAM_ON', this)">
                    <i class="fa-solid fa-soap"></i><span>โฟม</span>
                </button>
                <button class="control-cmd-btn ccb-air" onclick="sendCommandToBay(${m.id}, 'AIR_ON', this)">
                    <i class="fa-solid fa-wind"></i><span>เป่าลม</span>
                </button>
                <button class="control-cmd-btn ccb-wax" onclick="sendCommandToBay(${m.id}, 'WAX_ON', this)">
                    <i class="fa-solid fa-star"></i><span>เคลือบสี</span>
                </button>
                <button class="control-cmd-btn ccb-tyre" onclick="sendCommandToBay(${m.id}, 'TYRE_ON', this)">
                    <i class="fa-solid fa-circle-dot"></i><span>ยางดำ</span>
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
        const res = await fetch('/admin/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        showToast('Connection Error', 'error');
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
    AIR_FILL: '🌬 เติมลม',
    VACUUM: '🌀 ดูดฝุ่น',
    WAX_ON: '⭐ เคลือบเงา', 
    TYRE_ON: '⚫ ยางดำ', 
    HAND_WASH: '🚰 ล้างมือ',
    STOP: '✋ หยุด'
};

async function forceResetBay(machineId) {
    if (!confirm(`Force Reset Bay ${machineId}? ระบบจะปิด Session และคืนสถานะเป็น "ว่าง"`)) return;
    try {
        const res = await fetch('/admin/reset-bay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch('/admin/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch('/admin/users');
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
                    <button onclick="openChangePasswordModal(${u.id}, '${u.name || u.phone || u.email}')" title="เปลี่ยนรหัสผ่าน"
                        style="padding:0.35rem 0.6rem; border-radius:8px; border:1px solid rgba(59,130,246,0.4); background:rgba(59,130,246,0.1); color:#60a5fa; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button onclick="deleteUser(${u.id}, '${u.name || u.phone || u.email}')" title="ลบสมาชิก"
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
        const res = await fetch('/admin/topup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch('/admin/deduct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const res = await fetch('/admin/finance');
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

// ─── Init ─────────────────────────────────────────────────────

window.onload = () => {
    fetchMachines();
    // Don't fetch users/finance on load since they need admin auth
    if (!pollTimer) {
        pollTimer = setInterval(() => { fetchMachines(); }, 10000);
    }
};
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else {
        fetchMachines();
        if (!pollTimer) {
            pollTimer = setInterval(() => { fetchMachines(); }, 10000);
        }
    }
});

// ─── User Management ─────────────────────────────────────────

// ── Delete User ──
async function deleteUser(userId, name) {
    if (!confirm(`⚠️ ลบสมาชิก "${name}" ออกจากระบบ?\nข้อมูลและธุรกรรมทั้งหมดจะถูกลบด้วย`)) return;
    try {
        const res = await fetch(`/admin/users/${userId}`, { method: 'DELETE' });
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
        const res = await fetch('/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    if (!password || password.length < 6) {
        return showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
    }
    try {
        const res = await fetch(`/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) closeChangePasswordModal();
    } catch (e) {
        showToast('Connection Error', 'error');
    }
}
