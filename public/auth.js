// ─── Authentication Management ───────────────────────────────────────────
// Check if user is logged in and show/hide login button
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userBtn = document.getElementById('userBtn');
    const loginBtn = document.getElementById('loginBtn');

    if (token && user.name) {
        // User is logged in
        userBtn.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('userName').textContent = user.name.split(' ')[0]; // First name only
    } else {
        // User is not logged in
        userBtn.style.display = 'none';
        loginBtn.style.display = 'block';
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function logout() {
    if (confirm('แน่ใจว่าต้องการออกจากระบบ?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

// Add token to API requests
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    
    if (!options.headers) {
        options.headers = {};
    }
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, options);
    
    // If 401, try to refresh token
    if (res.status === 401) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            try {
                const refreshRes = await fetch('/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
                const refreshData = await refreshRes.json();
                if (refreshRes.ok) {
                    localStorage.setItem('token', refreshData.token);
                    localStorage.setItem('refreshToken', refreshData.refreshToken);
                    // Retry the original request with new token
                    options.headers['Authorization'] = `Bearer ${refreshData.token}`;
                    return fetch(url, options);
                }
            } catch (e) {
                console.error('Token refresh failed:', e);
            }
        }
        // If refresh fails, redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
    
    return res;
}

// Override original fetch functions to use fetchWithAuth
const originalFetchUsers = window.fetchUsers;
const originalFetchFinance = window.fetchFinance;

window.fetchUsers = async function() {
    const tbody = document.getElementById('userTableBody');
    try {
        const res = await fetchWithAuth('/admin/users');
        const data = await res.json();
        if (res.ok && data.users) {
            renderUsers(data.users);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">ต้องเข้าสู่ระบบเพื่อดูรายชื่อสมาชิก</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted);">Connection Error</td></tr>';
    }
};

window.fetchFinance = async function() {
    try {
        const res = await fetchWithAuth('/admin/finance');
        if (!res.ok) {
            console.log('Finance requires admin authentication');
            return;
        }
        const data = await res.json();
        if (!data.data) return;
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
    }
};

// Wrap admin functions to use fetchWithAuth
window.adminTopup = async function(userId) {
    const amtInput = document.getElementById(`topup_${userId}`);
    const amount = parseInt(amtInput.value);
    if (!amount || amount <= 0) return showToast('ระบุจำนวนเงิน', 'error');
    try {
        const res = await fetchWithAuth('/admin/topup', {
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
};

window.adminDeduct = async function(userId) {
    const amtInput = document.getElementById(`deduct_${userId}`);
    const amount = parseInt(amtInput.value);
    if (!amount || amount <= 0) return showToast('ระบุจำนวนเงินที่จะลด', 'error');
    try {
        const res = await fetchWithAuth('/admin/deduct', {
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
};

window.deleteUser = async function(userId, name) {
    if (!confirm(`⚠️ ลบสมาชิก "${name}" ออกจากระบบ?\nข้อมูลและธุรกรรมทั้งหมดจะถูกลบด้วย`)) return;
    try {
        const res = await fetchWithAuth(`/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
        if (res.ok) fetchUsers();
    } catch (e) {
        showToast('Connection Error', 'error');
    }
};

window.submitAddUser = async function() {
    const name = document.getElementById('addName').value.trim();
    const phone = document.getElementById('addPhone').value.trim();
    const email = document.getElementById('addEmail').value.trim();
    const pwd = document.getElementById('addPassword').value;
    if (!name || (!phone && !email)) {
        return showToast('ต้องระบุชื่อ และ เบอร์โทร/อีเมล อย่างน้อย 1 อย่าง', 'error');
    }
    try {
        const res = await fetchWithAuth('/admin/users', {
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
};

window.submitChangePassword = async function() {
    const userId = document.getElementById('pwdUserId').value;
    const password = document.getElementById('newPassword').value;
    if (!password || password.length < 6) {
        return showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
    }
    try {
        const res = await fetchWithAuth(`/admin/users/${userId}/password`, {
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
};

// Initialize on page load
window.addEventListener('load', () => {
    checkAuth();
});

// Close user menu when clicking outside
document.addEventListener('click', (e) => {
    const userBtn = document.getElementById('userBtn');
    const userMenu = document.getElementById('userMenu');
    if (userBtn && userMenu && !userBtn.contains(e.target) && !userMenu.contains(e.target)) {
        userMenu.style.display = 'none';
    }
});
