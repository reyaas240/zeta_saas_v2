// === TEMPLATE BUILDER ===
let tbMarksCategories = [];

function initTemplatePage() {
  const addBtn = document.getElementById('addTemplateColBtn');
  const saveBtn = document.getElementById('saveTemplateConfigBtn');
  if (!addBtn || addBtn._tbInitialized) return;
  addBtn._tbInitialized = true;

  addBtn.addEventListener('click', () => addTemplateColumnRow());

  saveBtn.addEventListener('click', async () => {
    const examID = document.getElementById('tbExam').value;
    if (!examID) { alert('Please select an exam first.'); return; }

    const rows = Array.from(document.querySelectorAll('#tbColumnsBody tr, #tbStaticColumnsBody tr'));
    const columns = rows.map(tr => ({
      colLabel:    tr.querySelector('.tb-col-label').value.trim(),
      colType:     tr.querySelector('.tb-col-type').value,
      testMarksID: tr.querySelector('.tb-marks-cat')?.value || null,
      formula:     tr.querySelector('.tb-formula')?.value.trim() || null,
    }));

    if (columns.some(c => !c.colLabel)) { alert('All columns must have a label.'); return; }

    try {
      const res = await fetch('/api/template/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examID: parseInt(examID), columns })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Template configuration saved successfully!');
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error saving template.');
    }
  });
}

async function loadTemplateFilters() {
  initTemplatePage();

      try {
        const res = await fetch('/api/template/filters');
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Populate Academic Year
        const ayEl = document.getElementById('tbAcademicYear');
        ayEl.innerHTML = '<option value="">All Years</option>' +
          data.academicYears.map(a => `<option value="${a.id}">${a.label}</option>`).join('');

        // Populate Terms
        const termEl = document.getElementById('tbTerm');
        termEl.innerHTML = '<option value="">All Terms</option>' +
          data.terms.map(t => `<option value="${t.id}">${t.label}</option>`).join('');

        // Populate Classes
        const classEl = document.getElementById('tbClass');
        classEl.innerHTML = '<option value="">All Classes</option>' +
          data.classes.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

        // Populate Subjects
        const subEl = document.getElementById('tbSubject');
        subEl.innerHTML = '<option value="">All Subjects</option>' +
          data.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('');

        // Attach change listeners to refresh exam list
        ['tbAcademicYear', 'tbTerm', 'tbClass', 'tbSubject'].forEach(id => {
          document.getElementById(id).addEventListener('change', loadTemplateExams);
        });

        // Initial exam load
        await loadTemplateExams();
      } catch (err) {
        console.error('[Template Filters Error]', err);
      }
    }

    async function loadTemplateExams() {
      const ayID    = document.getElementById('tbAcademicYear').value;
      const termID  = document.getElementById('tbTerm').value;
      const classID = document.getElementById('tbClass').value;
      const subID   = document.getElementById('tbSubject').value;

      const params = new URLSearchParams();
      if (ayID)    params.append('ayID', ayID);
      if (termID)  params.append('termID', termID);
      if (classID) params.append('classID', classID);
      if (subID)   params.append('subID', subID);

      try {
        const res = await fetch('/api/template/exams?' + params.toString());
        const data = await res.json();
        const examEl = document.getElementById('tbExam');
        examEl.innerHTML = '<option value="">-- Select an Exam --</option>' +
          (data.data || []).map(e => `<option value="${e.id}">${e.label}</option>`).join('');
        document.getElementById('templateWorkspace').style.display = 'none';
      } catch (err) {
        console.error('[Template Exams Error]', err);
      }
    }

    document.getElementById('tbExam').addEventListener('change', async function() {
      const examID = this.value;
      if (!examID) {
        document.getElementById('templateWorkspace').style.display = 'none';
        return;
      }
      await loadTemplateColumns(examID);
    });

    async function loadTemplateColumns(examID) {
      try {
        const res = await fetch(`/api/template/columns/${examID}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        tbMarksCategories = data.marksCategories || [];

        // Show marks category reference box
        const refEl = document.getElementById('tbMarksCategoriesRef');
        const listEl = document.getElementById('tbMarksCategoriesList');
        if (tbMarksCategories.length > 0) {
          refEl.style.display = 'block';
          listEl.innerHTML = tbMarksCategories.map(m =>
            `<span style="background:#1e293b;border:1px solid #334155;border-radius:4px;padding:0.25rem 0.6rem;font-size:0.8rem;color:#94a3b8;">
              <strong style="color:#fff;">${m.label}</strong> (Max: ${m.maxMarks}) — ID: ${m.id}
            </span>`
          ).join('');
        } else {
          refEl.style.display = 'none';
        }

        // Render column rows
        const tbody = document.getElementById('tbColumnsBody');
        const staticTbody = document.getElementById('tbStaticColumnsBody');
        tbody.innerHTML = '';
        staticTbody.innerHTML = '';
        
        const cols = data.columns || [];
        const dynamicCols = cols.filter(c => c.ColType !== 'final_total' && c.ColType !== 'final_grade');
        let totalCol = cols.find(c => c.ColType === 'final_total');
        let gradeCol = cols.find(c => c.ColType === 'final_grade');

        dynamicCols.forEach(col => addTemplateColumnRow(col));

        // Always enforce static columns
        if (!totalCol) totalCol = { ColLabel: 'Final Total', ColType: 'final_total', Formula: '' };
        if (!gradeCol) gradeCol = { ColLabel: 'Final Grade', ColType: 'final_grade', Formula: '' };
        
        addTemplateColumnRow(totalCol, true, 'tbStaticColumnsBody');
        addTemplateColumnRow(gradeCol, true, 'tbStaticColumnsBody');

        document.getElementById('templateWorkspace').style.display = 'block';
      } catch (err) {
        console.error('[Load Template Columns Error]', err);
        alert('Error loading template columns: ' + err.message);
      }
    }

    function addTemplateColumnRow(col = {}, isStatic = false, targetTbodyId = 'tbColumnsBody') {
      const tbody = document.getElementById(targetTbodyId);
      const rowIdx = document.querySelectorAll('#tbColumnsBody tr, #tbStaticColumnsBody tr').length + 1;
      const marksCatOptions = tbMarksCategories.map(m =>
        `<option value="${m.id}" ${col.TestMarksID == m.id ? 'selected' : ''}>${m.label} (Max: ${m.maxMarks})</option>`
      ).join('');

      const tr = document.createElement('tr');
      const isGrade = col.ColType === 'final_grade';
      
      tr.innerHTML = `
        <td style="color:var(--text-muted);text-align:center;" class="tb-row-idx">${rowIdx}</td>
        <td><input type="text" class="tb-col-label" value="${col.ColLabel || ''}" placeholder="e.g. Paper I / Total" ${isStatic && isGrade ? 'readonly style="background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid transparent;padding:0.4rem 0.6rem;border-radius:6px;width:100%;"' : 'style="background:#0f172a;border:1px solid var(--border-color);color:#fff;padding:0.4rem 0.6rem;border-radius:6px;width:100%;"'} ></td>
        <td>
          ${isStatic ? `
             <input type="hidden" class="tb-col-type" value="${col.ColType}">
             <div style="background:rgba(99,102,241,0.1);color:var(--primary-light);padding:0.4rem;border-radius:6px;font-size:0.85rem;text-align:center;">🔒 ${isGrade ? 'Auto Grade' : 'Final Total'}</div>
          ` : `
          <select class="tb-col-type" style="background:#0f172a;border:1px solid var(--border-color);color:#fff;padding:0.4rem 0.6rem;border-radius:6px;width:100%;">
            <option value="marks"    ${(col.ColType||'marks')==='marks'    ? 'selected' : ''}>Marks Entry</option>
            <option value="computed" ${col.ColType==='computed' ? 'selected' : ''}>Computed / Formula</option>
            <option value="total"    ${col.ColType==='total'    ? 'selected' : ''}>Total</option>
            <option value="label"    ${col.ColType==='label'    ? 'selected' : ''}>Label Only</option>
          </select>
          `}
        </td>
        <td>
          <div class="tb-marks-cell" style="${col.ColType==='marks'||!col.ColType ? '' : 'display:none;'}">
            <select class="tb-marks-cat" style="background:#0f172a;border:1px solid var(--border-color);color:#fff;padding:0.4rem 0.6rem;border-radius:6px;width:100%;">
              <option value="">-- Link Marks Category --</option>
              ${marksCatOptions}
            </select>
          </div>
          <div class="tb-formula-cell" style="${col.ColType==='computed'||col.ColType==='total'||col.ColType==='final_total' ? '' : 'display:none;'}">
            <input type="text" class="tb-formula" value="${col.Formula || ''}" placeholder="e.g. [col1]+[col2] or SUM"
              style="background:#0f172a;border:1px solid var(--border-color);color:#fff;padding:0.4rem 0.6rem;border-radius:6px;width:100%;font-family:monospace;">
          </div>
          ${isGrade ? '<span style="font-size:0.8rem;color:var(--text-muted);">Calculated automatically from Final Total.</span>' : ''}
        </td>
        <td style="text-align:center;">
          ${isStatic ? `<span style="color:var(--text-muted);font-size:0.8rem;">Required</span>` : `
          <button onclick="this.closest('tr').remove(); renumberTemplateRows();"
            style="background:rgba(239,68,68,0.15);color:#fca5a5;border:none;padding:0.35rem 0.7rem;border-radius:5px;cursor:pointer;">✕</button>
          `}
        </td>
      `;

      // Toggle marks/formula cell on type change (only for dynamic)
      if (!isStatic) {
        tr.querySelector('.tb-col-type').addEventListener('change', function() {
          const isMarks    = this.value === 'marks';
          const isFormula  = this.value === 'computed' || this.value === 'total' || this.value === 'final_total';
          tr.querySelector('.tb-marks-cell').style.display   = isMarks   ? '' : 'none';
          tr.querySelector('.tb-formula-cell').style.display = isFormula ? '' : 'none';
        });
      }

      tbody.appendChild(tr);
    }

    function renumberTemplateRows() {
      document.querySelectorAll('#tbColumnsBody tr, #tbStaticColumnsBody tr').forEach((tr, i) => {
        tr.querySelector('.tb-row-idx').textContent = i + 1;
      });
    }

// === END TEMPLATE BUILDER ===