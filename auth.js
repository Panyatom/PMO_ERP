// Auth/session facade for the current PoC and future Supabase OAuth.
// The app keeps working without real OAuth, but all role-aware modules can
// read one normalized session shape from here.
(function(global) {
  const KEY = 'orbit-pmo-auth-session-v1';
  const DEFAULT_SESSION = {
    signedIn: false,
    provider: 'mock',
    user: {
      name: 'Chuen K.',
      email: 'chuen.k@orbitdigital.co.th',
      initials: 'CK',
    },
    role: 'pmo',
    roles: ['pmo_admin'],
    roleSource: '',
    organizationId: 'orbit-digital',
    project: '',
    accessToken: '',
    updatedAt: '',
  };

  function safeParse(raw) {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch(e) {
      return {};
    }
  }

  function initials(name, email) {
    const source = String(name || email || 'PMO User').trim();
    const parts = source.split(/[\s._-]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
  }

  function normalizeRoles(value, fallback='pmo') {
    if(global.PMO_ACCESS?.normalizeRoleKeys) return global.PMO_ACCESS.normalizeRoleKeys(value, fallback);
    const aliases = { pmo:'pmo_admin', user:'employee', bbik:'recruiter' };
    const source = Array.isArray(value) ? value : [value];
    const roles = [...new Set(source.map(role => aliases[String(role || '').trim()] || String(role || '').trim()).filter(Boolean))];
    return roles.length ? roles : [aliases[fallback] || fallback || 'employee'];
  }

  function loadSession() {
    let saved = {};
    try { saved = safeParse(localStorage.getItem(KEY)); } catch(e) {}
    const user = { ...DEFAULT_SESSION.user, ...(saved.user || {}) };
    user.initials = initials(user.name, user.email);
    const roles = normalizeRoles(saved.roles?.length ? saved.roles : (saved.role || DEFAULT_SESSION.role));
    return {
      ...DEFAULT_SESSION,
      ...saved,
      user,
      role: saved.role || DEFAULT_SESSION.role,
      roles,
      project: saved.project || '',
    };
  }

  function storeSession(session) {
    const roles = normalizeRoles(session.roles?.length ? session.roles : (session.role || DEFAULT_SESSION.role));
    const next = {
      ...DEFAULT_SESSION,
      ...session,
      role: session.role || roles[0],
      roles,
      user: { ...DEFAULT_SESSION.user, ...(session.user || {}) },
      updatedAt: new Date().toISOString(),
    };
    next.user.initials = initials(next.user.name, next.user.email);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch(e) {}
    renderAuthSession(next);
    global.dispatchEvent(new CustomEvent('pmo:session-change', { detail: next }));
    return next;
  }

  function currentSession() {
    return loadSession();
  }

  function getAccessToken() {
    const session = loadSession();
    return session.signedIn && session.accessToken ? session.accessToken : '';
  }

  function setSessionRole(role) {
    if(!role) return loadSession();
    return storeSession({ ...loadSession(), role, roles: normalizeRoles(role), roleSource:'session' });
  }

  function setSessionProject(project) {
    return storeSession({ ...loadSession(), project: project || '' });
  }

  function signInMock(data) {
    const name = String(data?.name || DEFAULT_SESSION.user.name).trim();
    const email = String(data?.email || DEFAULT_SESSION.user.email).trim();
    return storeSession({
      ...loadSession(),
      signedIn: true,
      provider: 'mock',
      user: { name, email, initials: initials(name, email) },
      role: data?.role || 'pmo',
      roles: normalizeRoles(data?.roles?.length ? data.roles : (data?.role || 'pmo')),
      roleSource: 'session',
      project: data?.project || '',
      accessToken: '',
    });
  }

  function signOut() {
    return storeSession({ ...DEFAULT_SESSION, signedIn: false, updatedAt: new Date().toISOString() });
  }

  function roleLabel(role) {
    if(global.PMO_ACCESS?.roleLabel) return global.PMO_ACCESS.roleLabel(role);
    return ({ pmo:'PMO / Dir', user:'Requester', bbik:'BBIK' })[role] || role || 'PMO';
  }

  function authRoleOptions(selectedRole) {
    if(!global.PMO_ACCESS?.ROLE_TEMPLATES) {
      return `<option value="pmo">PMO / Dir</option><option value="user">Requester</option><option value="bbik">BBIK</option>`;
    }
    const selected = global.PMO_ACCESS.normalizeRoleKey(selectedRole) || 'pmo_admin';
    return Object.entries(global.PMO_ACCESS.ROLE_TEMPLATES).map(([key, role]) =>
      `<option value="${key}" ${key === selected ? 'selected' : ''}>${role.label}</option>`
    ).join('');
  }

  function ensureAuthModal() {
    if(document.getElementById('auth-modal')) return;
    const style = document.createElement('style');
    style.id = 'auth-session-style';
    style.textContent = `
      .auth-status-chip{height:32px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface-2,var(--surface));color:var(--text-2);padding:0 10px;display:inline-flex;align-items:center;gap:7px;font:600 12px var(--font-ui);cursor:pointer}
      .auth-status-chip:hover{background:var(--bg);color:var(--text)}
      .auth-status-dot{width:7px;height:7px;border-radius:50%;background:var(--amber)}
      .auth-status-chip.is-signed-in .auth-status-dot{background:var(--green)}
      .auth-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;align-items:center;justify-content:center;padding:18px}
      .auth-modal.is-open{display:flex}
      .auth-panel{width:440px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 22px 70px rgba(0,0,0,.22);padding:22px}
      .auth-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .auth-panel-title{font-size:16px;font-weight:800;color:var(--text)}
      .auth-panel-sub{font-size:12px;color:var(--text-3);margin-top:2px}
      .auth-oauth-row{display:grid;gap:8px;margin-bottom:14px}
      .auth-oauth-row button{justify-content:center}
      .auth-disabled-note{font-size:11px;color:var(--text-3);margin-top:-4px}
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-panel-head">
          <div>
            <div id="auth-title" class="auth-panel-title">Sign in session</div>
            <div class="auth-panel-sub">Mock session now, OAuth provider later.</div>
          </div>
          <button class="btn-sm" type="button" onclick="closeAuthModal()" aria-label="Close">x</button>
        </div>
        <div class="auth-oauth-row">
          <button class="btn-ghost" type="button" disabled title="Ready for Supabase OAuth provider configuration">Continue with OAuth</button>
          <div class="auth-disabled-note">OAuth is intentionally disabled until Supabase Auth providers and RLS are configured.</div>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:10px">
          <div class="fg"><label>Name</label><input id="auth-name" class="ri" autocomplete="name"></div>
          <div class="fg"><label>Email</label><input id="auth-email" class="ri" autocomplete="email"></div>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px">
          <div class="fg"><label>Role</label><select id="auth-role" class="ri">${authRoleOptions('pmo_admin')}</select></div>
          <div class="fg"><label>Project scope</label><input id="auth-project" class="ri" placeholder="Optional"></div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px">
          <button class="btn-ghost" type="button" onclick="pmoSignOut();closeAuthModal()">Sign out</button>
          <button class="btn-primary" type="button" onclick="saveAuthMockSession()">Use session</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if(e.target === modal) closeAuthModal(); });
    document.body.appendChild(modal);
  }

  function renderAuthSession(session=loadSession()) {
    const top = document.getElementById('auth-status-chip');
    if(top) {
      top.classList.toggle('is-signed-in', !!session.signedIn);
      const label = session.signedIn ? session.user.name : 'Sign in';
      top.querySelector('.auth-status-text').textContent = label;
      const roles = normalizeRoles(session.roles?.length ? session.roles : session.role);
      top.title = session.signedIn ? `${session.user.email} - ${roles.map(roleLabel).join(', ')}` : 'Open mock sign in';
    }
  }

  function openAuthModal() {
    ensureAuthModal();
    const session = loadSession();
    document.getElementById('auth-name').value = session.user.name || '';
    document.getElementById('auth-email').value = session.user.email || '';
    document.getElementById('auth-role').innerHTML = authRoleOptions(session.roles?.[0] || session.role || 'pmo_admin');
    document.getElementById('auth-project').value = session.project || '';
    document.getElementById('auth-modal').classList.add('is-open');
  }

  function closeAuthModal() {
    document.getElementById('auth-modal')?.classList.remove('is-open');
  }

  function saveAuthMockSession() {
    const session = signInMock({
      name: document.getElementById('auth-name')?.value,
      email: document.getElementById('auth-email')?.value,
      role: document.getElementById('auth-role')?.value,
      project: document.getElementById('auth-project')?.value,
    });
    closeAuthModal();
  }

  function initAuthSession() {
    ensureAuthModal();
    renderAuthSession(loadSession());
  }

  global.pmoCurrentSession = currentSession;
  global.pmoAuthAccessToken = getAccessToken;
  global.pmoSetSessionRole = setSessionRole;
  global.pmoSetSessionProject = setSessionProject;
  global.pmoSignInMock = signInMock;
  global.pmoSignOut = signOut;
  global.initAuthSession = initAuthSession;
  global.openAuthModal = openAuthModal;
  global.closeAuthModal = closeAuthModal;
  global.saveAuthMockSession = saveAuthMockSession;
})(window);
