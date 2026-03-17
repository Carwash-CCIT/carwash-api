// ─── Finance Dashboard ────────────────────────────────────────
async function fetchFinance() {
    try {
        const res = await fetch('/admin/finance');
        if (!res.ok) {
            // Show empty data if not authenticated
            console.log('Finance requires admin authentication - showing empty data');
            showEmptyFinanceData();
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
        showEmptyFinanceData();
    }
}

function showEmptyFinanceData() {
    document.getElementById('finToday').textContent = '—';
    document.getElementById('finWeek').textContent = '—';
    document.getElementById('finMonth').textContent = '—';
    document.getElementById('finAlltime').textContent = '—';
    
    const emptyMsg = '<div class="table-empty" style="padding:2rem; text-align:center; color:var(--muted);"><i class="fa-solid fa-lock" style="font-size:1.5rem; margin-bottom:0.5rem; display:block;"></i>ต้องเข้าสู่ระบบเพื่อดูข้อมูลการเงิน</div>';
    document.getElementById('finDaily').innerHTML = emptyMsg;
    document.getElementById('finWeekly').innerHTML = emptyMsg;
    document.getElementById('finMonthly').innerHTML = emptyMsg;
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
