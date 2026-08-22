// ======================================================
// === ADMIN RBAC PAGE JS ===
// ======================================================

async function openAdminRbacPanel() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (!data.success) return alert(data.error);

    const userSelect = document.getElementById('rbacUserSelect');
    userSelect.innerHTML = '<option value="">-- Select User --</option>' + data.users.map(u =>
      `<option value="${u.userID}">${u.employeeName}${u.isSystemAdmin ? ' (Admin)' : ''}</option>`
    ).join('');

    userSelect.onchange = () => loadUserRights(userSelect.value);
    if (data.users.length > 0) {
      userSelect.value = data.users[0].userID;
      loadUserRights(data.users[0].userID);
    }
  } catch (err) {
    console.error('Error loading admin users:', err);
  }

  // Wire up Save button (once)
  const saveBtn = document.getElementById('saveRightsBtn');
  if (saveBtn && !saveBtn._rbacInitialized) {
    saveBtn._rbacInitialized = true;
    saveBtn.addEventListener('click', async () => {
      const userID = document.getElementById('rbacUserSelect').value;
      if (!userID) return;

      const checkboxes = document.querySelectorAll('.rbac-checkbox');
      const menuRights = {};
      checkboxes.forEach(cb => { menuRights[cb.dataset.menukey] = cb.checked; });

      try {
        const res = await fetch(`/api/admin/user-rights/${userID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menuRights })
        });
        const data = await res.json();
        if (data.success) {
          alert('Access rights saved successfully!');
        } else {
          alert('Failed to save rights: ' + data.error);
        }
      } catch (err) {
        alert('Network error saving rights.');
      }
    });
  }
}

async function loadUserRights(userID) {
  try {
    const res = await fetch(`/api/admin/user-rights/${userID}`);
    const data = await res.json();
    if (!data.success) return alert(data.error);

    const tbody = document.getElementById('rbacRightsTableBody');
    tbody.innerHTML = data.menus.map(m => `
      <tr>
        <td>${m.icon} <strong>${m.menuTitle}</strong></td>
        <td><code>${m.menuKey}</code></td>
        <td>${m.parentKey || '<span style="color:var(--text-muted);">-</span>'}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" class="rbac-checkbox" data-menukey="${m.menuKey}" ${m.hasAccess ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading user rights:', err);
  }
}

// ── Global: Branch & Syllabus context switcher (wired once on first load) ──
(function initContextSwitcher() {
  const branchSel = document.getElementById('branchSelect');
  const syllabusSel = document.getElementById('syllabusSelect');

  if (branchSel && !branchSel._contextListenerAttached) {
    branchSel._contextListenerAttached = true;
    branchSel.addEventListener('change', async (e) => {
      await updateContext(e.target.value, document.getElementById('syllabusSelect').value);
    });
  }

  if (syllabusSel && !syllabusSel._contextListenerAttached) {
    syllabusSel._contextListenerAttached = true;
    syllabusSel.addEventListener('change', async (e) => {
      await updateContext(document.getElementById('branchSelect').value, e.target.value);
    });
  }
})();

async function updateContext(branchID, syllabusID) {
  try {
    const response = await fetch('/api/auth/switch-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchID, syllabusID })
    });
    const resData = await response.json();
    if (resData.success) {
      if (appData) appData.context = resData.context;
      // Update syllabus dropdown
      const syllabusSelect = document.getElementById('syllabusSelect');
      if (resData.syllabuses && syllabusSelect) {
        syllabusSelect.innerHTML = resData.syllabuses.map(s =>
          `<option value="${s.syllabusID}" ${s.syllabusID == resData.context.syllabusID ? 'selected' : ''}>${s.serviceName || 'Syllabus ' + s.syllabusID}</option>`
        ).join('');
      }
      const ayBadge = document.getElementById('ayBadge');
      if (ayBadge) ayBadge.textContent = resData.context.academicYearDes;
      filterOptions = null; // reset analytics filter cache
    } else {
      alert('Failed to switch context: ' + resData.error);
    }
  } catch (err) {
    console.error('Error switching context:', err);
    alert('Network error switching branch/syllabus context.');
  }
}