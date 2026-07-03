// Transaction Log - read-only activity rollup across PMO modules.

const LOG_MODULES = {
  all: 'All modules',
  memo: 'Memo',
  resource: 'Resource',
  license: 'License',
  device: 'Device',
};

let _logState = { q: '', module: 'all', action: 'all', from: '', to: '' };

function logDateValue(v) {
  if(!v) return null;
  const d = new Date(String(v).length === 10 ? String(v) + 'T00:00:00' : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function logDateTime(v) {
  const d = logDateValue(v);
  return d ? d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function pushLog(rows, item) {
  rows.push({
    at: item.at || '',
    module: item.module || 'system',
    action: item.action || 'Updated',
    ref: item.ref || '-',
    title: item.title || '-',
    actor: item.actor || 'System',
    detail: item.detail || '',
    project: item.project || '',
    status: item.status || '',
  });
}

function collectMemoLogs(rows) {
  const memos = typeof loadMemos === 'function' ? loadMemos() : [];
  memos.forEach(m => {
    pushLog(rows, {
      at: m.createdAt || m.submittedAt || m.date,
      module: 'memo',
      action: (m.status === 'draft') ? 'Draft created' : 'Memo created',
      ref: m.memoNo,
      title: m.subject || m.typeLabel || 'Memo',
      actor: m.requesterName || 'Requester',
      project: m.project,
      status: m.status,
      detail: m.reason || '',
    });
    if(m.submittedAt && m.submittedAt !== m.createdAt) {
      pushLog(rows, {
        at: m.submittedAt,
        module: 'memo',
        action: 'Submitted',
        ref: m.memoNo,
        title: m.subject || 'Memo',
        actor: m.requesterName || 'Requester',
        project: m.project,
        status: m.status,
      });
    }
    if(m.approvedAt) {
      pushLog(rows, {
        at: m.approvedAt,
        module: 'memo',
        action: 'Approved',
        ref: m.memoNo,
        title: m.subject || 'Memo',
        actor: m.approvedBy || m.approverName || 'Approver',
        project: m.project,
        status: 'completed',
        detail: m.approvalNote || '',
      });
    }
    if(m.rejectedAt) {
      pushLog(rows, {
        at: m.rejectedAt,
        module: 'memo',
        action: 'Rejected',
        ref: m.memoNo,
        title: m.subject || 'Memo',
        actor: m.rejectedBy || 'Approver',
        project: m.project,
        status: 'rejected',
        detail: m.rejectionReason || '',
      });
    }
    (m.auditLog || []).forEach(e => pushLog(rows, {
      at: e.timestamp || e.at || m.updatedAt,
      module: 'memo',
      action: e.action || 'Audit',
      ref: m.memoNo,
      title: m.subject || 'Memo',
      actor: e.actor || e.by || 'User',
      project: m.project,
      status: m.status,
      detail: e.comment || e.remark || '',
    }));
  });
}

function collectResourceLogs(rows) {
  const resources = typeof loadResources === 'function' ? loadResources() : [];
  resources.forEach(r => {
    pushLog(rows, {
      at: r.createdAt || r.requestDate,
      module: 'resource',
      action: 'Request created',
      ref: r.id,
      title: r.position || r.resourceName || 'Resource request',
      actor: r.requesterName || 'Requester',
      project: r.project,
      status: r.status,
      detail: [r.cancelReason ? `Cancel: ${r.cancelReason}` : '', r.remark || ''].filter(Boolean).join(' / '),
    });
    (r.activityLog || []).forEach(e => pushLog(rows, {
      at: e.at || r.updatedAt,
      module: 'resource',
      action: e.action || 'Activity',
      ref: r.id,
      title: r.position || r.resourceName || 'Resource request',
      actor: e.by || 'User',
      project: r.project,
      status: e.to || r.status,
      detail: [e.from && e.to ? `${e.from} -> ${e.to}` : '', e.cancelReason ? `Cancel: ${e.cancelReason}` : '', e.remark || ''].filter(Boolean).join(' / '),
    }));
  });
}

function collectLicenseLogs(rows) {
  const licenses = typeof getAllLicenses === 'function' ? getAllLicenses() : [];
  licenses.forEach(l => {
    pushLog(rows, {
      at: l.updatedAt || l.createdAt || l.purchaseDate,
      module: 'license',
      action: l.source === 'memo' ? 'License generated from memo' : 'License saved',
      ref: l.memoNo || l.id,
      title: l.name || 'License',
      actor: l.owner || 'System',
      project: l.project,
      status: l.statusOverride || 'active',
      detail: `${l.seats || 0} seats / ${l.months || '-'} months`,
    });
  });
}

function collectDeviceLogs(rows) {
  const devices = typeof loadDevices === 'function' ? loadDevices() : [];
  devices.forEach(d => {
    pushLog(rows, {
      at: d.updatedAt || d.createdAt || d.assignedDate,
      module: 'device',
      action: d.memoRef ? 'Device generated from memo' : 'Device saved',
      ref: d.assetTag || d.serial || d.id,
      title: d.name || d.brand || 'Device',
      actor: d.owner || 'System',
      project: d.project,
      status: d.status,
      detail: [d.platform, d.type, d.note].filter(Boolean).join(' / '),
    });
  });
}

function collectTransactionLogs() {
  const rows = [];
  collectMemoLogs(rows);
  collectResourceLogs(rows);
  collectLicenseLogs(rows);
  collectDeviceLogs(rows);
  return rows.sort((a, b) => (logDateValue(b.at)?.getTime() || 0) - (logDateValue(a.at)?.getTime() || 0));
}

function filteredTransactionLogs() {
  const q = (_logState.q || '').trim().toLowerCase();
  const from = _logState.from ? new Date(_logState.from + 'T00:00:00') : null;
  const to = _logState.to ? new Date(_logState.to + 'T23:59:59') : null;
  return collectTransactionLogs().filter(row => {
    const at = logDateValue(row.at);
    if(_logState.module !== 'all' && row.module !== _logState.module) return false;
    if(_logState.action !== 'all' && row.action !== _logState.action) return false;
    if(from && (!at || at < from)) return false;
    if(to && (!at || at > to)) return false;
    if(!q) return true;
    return [row.module, row.action, row.ref, row.title, row.actor, row.detail, row.project, row.status]
      .some(v => String(v || '').toLowerCase().includes(q));
  });
}

function renderTransactionLog() {
  const root = document.getElementById('transaction-log-root');
  if(!root) return;
  const rows = filteredTransactionLogs();
  const allRows = collectTransactionLogs();
  const actions = [...new Set(allRows.map(r => r.action).filter(Boolean))].sort();
  const counts = allRows.reduce((acc, r) => {
    acc.total++;
    acc[r.module] = (acc[r.module] || 0) + 1;
    return acc;
  }, { total: 0 });

  root.innerHTML = `
    <style>
      .log-filter-grid{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(120px,.9fr) minmax(130px,.9fr) 130px 130px auto;gap:8px;align-items:end}
      .log-field label{display:block;font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:5px}
      .log-field input,.log-field select{box-sizing:border-box;width:100%;height:38px;min-height:38px;padding:7px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;outline:none}
      .log-field input:focus,.log-field select:focus{border-color:var(--blue);box-shadow:0 0 0 3px var(--focus-ring)}
      @media (max-width:1100px){.log-filter-grid{grid-template-columns:1fr 1fr}.log-filter-grid .btn-ghost{height:38px}}
    </style>
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text)">Transaction Log</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px">Activity rollup from Memo, Resource, License, and Device records</div>
        </div>
        <button class="btn-sm" onclick="exportTransactionLogCsv()">Export CSV</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:14px">
        ${[
          ['All', counts.total || 0],
          ['Memo', counts.memo || 0],
          ['Resource', counts.resource || 0],
          ['License', counts.license || 0],
          ['Device', counts.device || 0],
        ].map(([label, value]) => `
          <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;background:var(--bg)">
            <div style="font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase">${label}</div>
            <div style="font-size:20px;font-weight:800;margin-top:2px">${value}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="log-filter-grid" data-motion-suppress="true">
        <div class="log-field"><label>Search</label><input id="log-q" type="text" value="${esc(_logState.q)}" placeholder="ref, actor, project, detail" oninput="setTransactionLogFilter('q', this.value)"></div>
        <div class="log-field"><label>Module</label><select id="log-module" data-native-select="true" onchange="setTransactionLogFilter('module', this.value)">
          ${Object.entries(LOG_MODULES).map(([value,label]) => `<option value="${value}" ${_logState.module===value?'selected':''}>${label}</option>`).join('')}
        </select></div>
        <div class="log-field"><label>Action</label><select id="log-action" data-native-select="true" onchange="setTransactionLogFilter('action', this.value)">
          <option value="all">All actions</option>
          ${actions.map(action => `<option value="${esc(action)}" ${_logState.action===action?'selected':''}>${esc(action)}</option>`).join('')}
        </select></div>
        <div class="log-field"><label>From</label><input type="date" data-native-date="true" value="${esc(_logState.from)}" onchange="setTransactionLogFilter('from', this.value)"></div>
        <div class="log-field"><label>To</label><input type="date" data-native-date="true" value="${esc(_logState.to)}" onchange="setTransactionLogFilter('to', this.value)"></div>
        <button class="btn-ghost" onclick="resetTransactionLogFilters()" style="height:38px">Reset</button>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:800">${rows.length} transactions</div>
        <div style="font-size:11px;color:var(--text-3)">Latest first</div>
      </div>
      <div style="overflow:auto">
        <table class="hist-table">
          <thead><tr>
            <th style="padding-left:14px;width:13%">Time</th>
            <th style="width:10%">Module</th>
            <th style="width:14%">Action</th>
            <th style="width:12%">Ref</th>
            <th>Title / Detail</th>
            <th style="width:13%">Actor</th>
            <th style="width:11%">Project</th>
            <th style="width:9%">Status</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.slice(0, 500).map(row => `
              <tr>
                <td style="padding-left:14px;white-space:nowrap">${esc(logDateTime(row.at))}</td>
                <td><span class="badge badge-blue" style="font-size:9px">${esc(LOG_MODULES[row.module] || row.module)}</span></td>
                <td>${esc(row.action)}</td>
                <td style="font-family:'IBM Plex Mono',monospace;font-size:11px">${esc(row.ref)}</td>
                <td>
                  <div style="font-weight:700">${esc(row.title)}</div>
                  ${row.detail ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(row.detail)}</div>` : ''}
                </td>
                <td>${esc(row.actor)}</td>
                <td>${esc(row.project || '-')}</td>
                <td>${row.status ? `<span class="badge badge-gray" style="font-size:9px">${esc(row.status)}</span>` : '-'}</td>
              </tr>
            `).join('') : `<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--text-3)">No transactions found</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function setTransactionLogFilter(key, value) {
  _logState = { ..._logState, [key]: value };
  renderTransactionLog();
}

function resetTransactionLogFilters() {
  _logState = { q: '', module: 'all', action: 'all', from: '', to: '' };
  renderTransactionLog();
}

function exportTransactionLogCsv() {
  const rows = filteredTransactionLogs();
  const header = ['time','module','action','ref','title','actor','project','status','detail'];
  const csv = [header, ...rows.map(r => [
    logDateTime(r.at), LOG_MODULES[r.module] || r.module, r.action, r.ref, r.title, r.actor, r.project, r.status, r.detail,
  ])].map(cols => cols.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transaction-log-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
