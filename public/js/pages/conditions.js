// ======================================================
// === CONDITIONS PAGE JS ===
// All DOM access deferred until after the page HTML is loaded
// ======================================================
let conditionMasters = [];

function initConditionsPage() {
  const masterSelect = document.getElementById('condMasterSelect');
  if (!masterSelect || masterSelect._conditionsInitialized) return;
  masterSelect._conditionsInitialized = true;

  masterSelect.addEventListener('change', async (e) => {
    const masID = e.target.value;
    if (!masID) {
      document.getElementById('condDetailsSection').style.display = 'none';
      return;
    }

    // Populate branch and syllabus selects from the global header dropdowns
    const globalBranch = document.getElementById('branchSelect');
    const globalSyllabus = document.getElementById('syllabusSelect');
    if (globalBranch && document.getElementById('condBranchSelect')) {
      document.getElementById('condBranchSelect').innerHTML = '<option value="">All Branches</option>' + globalBranch.innerHTML;
    }
    if (globalSyllabus && document.getElementById('condSyllabusSelect')) {
      document.getElementById('condSyllabusSelect').innerHTML = '<option value="">All Syllabi</option>' + globalSyllabus.innerHTML;
    }

    try {
      const res = await fetch(`/api/conditions/details/${masID}`);
      const data = await res.json();
      if (data.success) {
        document.getElementById('condDetailsSection').style.display = 'flex';
        const detail = data.data.length > 0 ? data.data[0] : null;
        if (detail) {
          document.getElementById('condActiveCheck').checked = detail.conditionActive === 1;
          document.getElementById('condPassMark').value = detail.passMark || '';
          document.getElementById('condFormulaText').value = detail.conformula || '';
          document.getElementById('condBranchSelect').value = detail.branchID || '';
          document.getElementById('condSyllabusSelect').value = detail.syllabusID || '';
        } else {
          document.getElementById('condActiveCheck').checked = false;
          document.getElementById('condPassMark').value = '';
          document.getElementById('condFormulaText').value = '';
          document.getElementById('condBranchSelect').value = '';
          document.getElementById('condSyllabusSelect').value = '';
        }
      }
    } catch (err) {
      console.error('Failed to load condition details', err);
    }
  });

  const saveBtn = document.getElementById('saveConditionBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const masID = document.getElementById('condMasterSelect').value;
      if (!masID) { alert('Please select a condition module.'); return; }

      const payload = {
        conditionMasID: masID,
        conditionActive: document.getElementById('condActiveCheck').checked,
        passMark: parseFloat(document.getElementById('condPassMark').value) || null,
        conformula: document.getElementById('condFormulaText').value,
        branchID: document.getElementById('condBranchSelect').value || 0,
        syllabusID: document.getElementById('condSyllabusSelect').value || 0
      };

      try {
        const res = await fetch('/api/conditions/details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('Condition saved successfully!');
        } else {
          alert('Failed to save condition: ' + data.error);
        }
      } catch (err) {
        console.error(err);
        alert('Network error saving condition.');
      }
    });
  }
}

async function loadConditionMasters() {
  // Ensure the page HTML and its event listeners are initialized first
  initConditionsPage();

  try {
    const res = await fetch('/api/conditions/master');
    const data = await res.json();
    if (data.success) {
      conditionMasters = data.data;
      const select = document.getElementById('condMasterSelect');
      select.innerHTML = '<option value="">Select Condition Module...</option>' +
        conditionMasters.map(m => `<option value="${m.conditionMasID}">${m.conditionName} (${m.conditionModuleType})</option>`).join('');
      document.getElementById('condDetailsSection').style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load condition masters', err);
  }
}