// === MARKS ENTRY PAGE JS ===
let meGridData = null; // { columns, marksCategories, students, existingMarks }

    async function loadMarksEntryFilters(forceEmpID = null) {
      try {
        const empQuery = forceEmpID ? `?empID=${forceEmpID}` : '';
        const res = await fetch(`/api/marks-entry/filters${empQuery}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const ayEl = document.getElementById('meAcademicYear');
        const currentAy = ayEl.value; // retain selection on refresh
        ayEl.innerHTML = '<option value="">All Years</option>' +
          data.academicYears.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
        if (currentAy) ayEl.value = currentAy;

        const termEl = document.getElementById('meTerm');
        const currentTerm = termEl.value;
        termEl.innerHTML = '<option value="">All Terms</option>' +
          data.terms.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
        if (currentTerm) termEl.value = currentTerm;

        const classEl = document.getElementById('meClass');
        classEl.innerHTML = '<option value="">All Classes</option>' +
          data.classes.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

        const subjectEl = document.getElementById('meSubject');
        subjectEl.innerHTML = '<option value="">All Subjects</option>' +
          data.subjects.map(s => `<option value="${s.id}">${s.label}</option>`).join('');

        // Handle Employee Dropdown (Admin only)
        const empContainer = document.getElementById('meEmployeeContainer');
        const empSelect = document.getElementById('meEmployee');
        
        if (data.isSystemAdmin) {
          empContainer.style.display = 'flex';
          if (empSelect.options.length <= 1) { // Populate only once
            empSelect.innerHTML = '<option value="">All Employees</option>' + 
              data.employees.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
            
            empSelect.addEventListener('change', (e) => {
              loadMarksEntryFilters(e.target.value);
            });
          }
        } else {
          empContainer.style.display = 'none';
        }

        // Auto-load exams
        await loadMarksEntryExams();

        // Wire filter change events (only once)
        if (!window._meFiltersWired) {
          window._meFiltersWired = true;
          ['meAcademicYear', 'meTerm', 'meClass', 'meSubject'].forEach(id => {
            document.getElementById(id).addEventListener('change', loadMarksEntryExams);
          });
        }
      } catch (err) {
        console.error('[Marks Entry Filters Error]:', err);
      }
    }

    async function loadMarksEntryExams() {
      const ayID = document.getElementById('meAcademicYear').value;
      const termID = document.getElementById('meTerm').value;
      const classID = document.getElementById('meClass').value;
      const subID = document.getElementById('meSubject').value;

      const params = new URLSearchParams();
      if (ayID) params.append('ayID', ayID);
      if (termID) params.append('termID', termID);
      if (classID) params.append('classID', classID);
      if (subID) params.append('subID', subID);

      try {
        const res = await fetch(`/api/marks-entry/exams?${params.toString()}`);
        const data = await res.json();
        const examEl = document.getElementById('meExam');
        if (data.success && data.data.length > 0) {
          examEl.innerHTML = '<option value="">Select Exam...</option>' +
            data.data.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
        } else {
          examEl.innerHTML = '<option value="">No exams with templates found</option>';
        }
      } catch (err) {
        console.error('[Marks Entry Exams Error]:', err);
      }
    }

    async function loadMarksGrid() {
      const examID = document.getElementById('meExam').value;
      if (!examID) {
        alert('Please select an exam first.');
        return;
      }

      document.getElementById('meGridWorkspace').style.display = 'none';
      document.getElementById('meGridStatus').textContent = 'Loading grid...';

      try {
        const res = await fetch(`/api/marks-entry/grid/${examID}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        meGridData = data;
        renderMarksGrid(examID);
      } catch (err) {
        console.error('[Load Marks Grid Error]:', err);
        alert('Failed to load grid: ' + err.message);
      }
    }

    function renderMarksGrid(examID) {
      const { columns, marksCategories, students, existingMarks, existingMasterMarks,
              isSubjectCommentRequired, isEffortCodeRequired, subjectCommentLength, effortCodes } = meGridData;

      const marksIndex = {};
      existingMarks.forEach(m => {
        if (!marksIndex[m.StuID]) marksIndex[m.StuID] = {};
        marksIndex[m.StuID][m.TestMarksID] = { marks: m.Marks, stuAb_status: m.stuAb_status };
      });

      // Build master marks index (SubjectComment, EffortID)
      const masterIndex = {};
      (existingMasterMarks || []).forEach(m => { masterIndex[m.StudentID] = m; });

      // Build a map of marks category label -> TestMarksID for formula resolution
      const catLabelToID = {};
      marksCategories.forEach(mc => { catLabelToID[mc.label] = mc.id; });

      // Separate INPUT columns (type 'marks') from COMPUTED ones
      // Strictly use the columns from the Template Builder in their configured SortOrder
      const finalColumns = columns.map(c => ({
        ...c,
        maxMarks: c.TestMarksID ? (marksCategories.find(mc => mc.id === c.TestMarksID)?.maxMarks ?? '') : ''
      }));

      const inputCols = finalColumns.filter(c => c.TestMarksID != null);
      const computedCols = finalColumns.filter(c => c.TestMarksID == null);

      // Render header
      const thead = document.getElementById('meGridHead');
      const thStyle = 'padding:0.6rem 0.75rem; text-align:left; font-size:0.8rem; letter-spacing:0.04em; color:var(--text-muted); border-bottom:1px solid var(--border-color); white-space:nowrap;';
      let headHtml = '<tr>';
      headHtml += `<th style="${thStyle}">#</th>`;
      headHtml += `<th style="${thStyle}">Student</th>`;
      headHtml += `<th style="${thStyle}">Adm No</th>`;

      // All columns
      finalColumns.forEach(col => {
        const maxM = col.maxMarks;
        headHtml += `<th style="${thStyle}">${col.ColLabel}${maxM ? ` <span style="opacity:0.5;font-size:0.75rem;">/${maxM}</span>` : ''}</th>`;
      });
      // Optional extra columns
      if (isSubjectCommentRequired) headHtml += `<th style="${thStyle}">Subject Comment</th>`;
      if (isEffortCodeRequired)     headHtml += `<th style="${thStyle}">Effort</th>`;
      headHtml += '</tr>';
      thead.innerHTML = headHtml;

      // Render rows
      const tbody = document.getElementById('meGridBody');
      const tdStyle = 'padding:0.4rem 0.6rem; border-bottom:1px solid rgba(255,255,255,0.04); font-size:0.9rem;';
      const inputStyle = 'width:70px; background:#0f172a; color:#fff; border:1px solid var(--border-color); border-radius:5px; padding:0.3rem 0.4rem; text-align:center; font-size:0.9rem;';
      const computedStyle = 'background:rgba(99,102,241,0.1); color:var(--primary-light); font-weight:600; padding:0.3rem 0.6rem; border-radius:4px; display:inline-block; min-width:60px; text-align:center;';

      let bodyHtml = '';
      students.forEach((stu, idx) => {
        bodyHtml += `<tr data-stu-id="${stu.id}">`;
        bodyHtml += `<td style="${tdStyle} color:var(--text-muted);">${idx + 1}</td>`;
        bodyHtml += `<td style="${tdStyle} font-weight:500; color:#fff;">${stu.name}</td>`;
        bodyHtml += `<td style="${tdStyle} color:var(--text-muted); font-size:0.8rem;">${stu.admNo || '-'}</td>`;

        finalColumns.forEach(col => {
          if (col.TestMarksID != null) {
            // INPUT column
            const existingObj = marksIndex[stu.id]?.[col.TestMarksID];
            const existingVal = existingObj?.stuAb_status === 1 ? 'AB' : (existingObj?.marks ?? '');
            const maxM = col.maxMarks;
            bodyHtml += `<td style="${tdStyle}">
              <input type="text" 
                class="me-marks-input" 
                data-stu-id="${stu.id}" 
                data-marks-id="${col.TestMarksID}" 
                data-col-label="${col.ColLabel}"
                data-original="${existingVal}"
                value="${existingVal}"
                style="${inputStyle}"
                oninput="this.value = this.value.toUpperCase() === 'AB' ? 'AB' : this.value.replace(/[^0-9.]/g, ''); recalcComputedCols(${stu.id});"
                ondblclick="this.value = this.value === 'AB' ? '0' : 'AB'; recalcComputedCols(${stu.id});"
              />
            </td>`;
          } else if (col.ColType === 'computed' || col.ColType === 'total' || col.ColType === 'final_total' || col.ColType === 'final_grade') {
            // COMPUTED or FINAL column
            bodyHtml += `<td style="${tdStyle}">
              <span id="computed_${stu.id}_${col.TemplateColID}" style="${computedStyle}">-</span>
            </td>`;
          } else {
            bodyHtml += `<td style="${tdStyle}">-</td>`;
          }
        });
        
        // Optional extra fields after Final Grade
        if (isSubjectCommentRequired) {
          const existingComment = masterIndex[stu.id]?.SubjectComment || '';
          bodyHtml += `<td style="${tdStyle}">
            <textarea
              class="me-subject-comment"
              data-stu-id="${stu.id}"
              maxlength="${subjectCommentLength || 50}"
              style="width:180px; background:#0f172a; color:#fff; border:1px solid var(--border-color); border-radius:5px; padding:0.3rem 0.4rem; font-size:0.8rem; resize:vertical; min-height:40px;"
            >${existingComment}</textarea>
          </td>`;
        }
        if (isEffortCodeRequired) {
          const existingEffortID = masterIndex[stu.id]?.EffortID || '';
          const effortOptions = effortCodes.map(e =>
            `<option value="${e.id}" ${e.id == existingEffortID ? 'selected' : ''}>${e.code} - ${e.label}</option>`
          ).join('');
          bodyHtml += `<td style="${tdStyle}">
            <select
              class="me-effort-select"
              data-stu-id="${stu.id}"
              style="background:#0f172a; color:#fff; border:1px solid var(--border-color); border-radius:5px; padding:0.3rem 0.4rem; font-size:0.8rem; min-width:130px;">
              <option value="">-- Select --</option>
              ${effortOptions}
            </select>
          </td>`;
        }

        bodyHtml += '</tr>';
      });

      tbody.innerHTML = bodyHtml;

      // Update title
      const examLabel = document.getElementById('meExam').selectedOptions[0]?.text || 'Exam';
      document.getElementById('meGridTitle').textContent = `📋 ${examLabel} — ${students.length} Students, ${finalColumns.length} Columns`;
      document.getElementById('meGridStatus').textContent = `${inputCols.length} input column(s), ${computedCols.length} computed column(s).`;
      document.getElementById('meGridWorkspace').style.display = 'block';

      // Recalculate all computed columns on initial render (show values if existing marks)
      students.forEach(stu => recalcComputedCols(stu.id));

      // Wire save button
      document.getElementById('saveMarksBtn').onclick = () => saveMarks(examID);
    }

    function recalcComputedCols(stuID) {
      if (!meGridData) return;
      const { columns, marksCategories } = meGridData;

      // Build a label -> value map for this student's current inputs
      const labelToValue = {};
      document.querySelectorAll(`.me-marks-input[data-stu-id="${stuID}"]`).forEach(inp => {
        const label = inp.dataset.colLabel;
        const val = parseFloat(inp.value) || 0;
        labelToValue[label] = val;
      });
      // Also map by marks category label
      marksCategories.forEach(mc => {
        const inp = document.querySelector(`.me-marks-input[data-stu-id="${stuID}"][data-marks-id="${mc.id}"]`);
        if (inp) labelToValue[mc.label] = parseFloat(inp.value) || 0;
      });

      // Now evaluate each computed column formula
      columns.filter(c => (c.ColType === 'computed' || c.ColType === 'total' || c.ColType === 'final_total') && c.Formula).forEach(col => {
        let formula = col.Formula;
        // Replace label tokens like [M1] or M1 with actual values
        // Match tokens that are either [LABEL] or just LABEL if found in labelToValue
        Object.keys(labelToValue).forEach(label => {
          // Replace [Label] and bare Label (word boundary)
          formula = formula.replace(new RegExp('\\[' + label + '\\]', 'gi'), labelToValue[label]);
          formula = formula.replace(new RegExp('(?<![\\w\\d])' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w\\d])', 'gi'), labelToValue[label]);
        });

        let result = '-';
        try {
          // eslint-disable-next-line no-eval
          const evaluated = eval(formula);
          if (typeof evaluated === 'number' && !isNaN(evaluated)) {
            result = Math.round(evaluated * 100) / 100;
          } else {
            result = evaluated;
          }
        } catch (e) {
          result = '!';
        }

        const cell = document.getElementById(`computed_${stuID}_${col.TemplateColID}`);
        if (cell) {
          cell.textContent = result;
          labelToValue[col.ColLabel] = result !== '!' && result !== '-' ? parseFloat(result) || 0 : 0;
        }
      });
      
      // Handle Final Grade lookup if applicable
      const totalCol = columns.find(c => c.ColType === 'final_total');
      const gradeCol = columns.find(c => c.ColType === 'final_grade');
      
      if (totalCol && gradeCol && meGridData.markingScheme) {
        const totalCell = document.getElementById(`computed_${stuID}_${totalCol.TemplateColID}`);
        const gradeCell = document.getElementById(`computed_${stuID}_${gradeCol.TemplateColID}`);
        if (totalCell && gradeCell && totalCell.textContent !== '-' && totalCell.textContent !== '!') {
           const finalTotal = parseFloat(totalCell.textContent) || 0;
           const outOff = meGridData.marksOutOff > 0 ? meGridData.marksOutOff : 100;
           const percentage = (finalTotal / outOff) * 100;
           
           const match = meGridData.markingScheme.find(s => percentage >= s.MarkFrom && percentage <= s.MarkTo);
           gradeCell.textContent = match ? match.Grade : '-';
        } else if (gradeCell) {
           gradeCell.textContent = '-';
        }
      }
    }

    async function saveMarks(examID) {
      const inputs = document.querySelectorAll('.me-marks-input');
      const marks = [];
      inputs.forEach(inp => {
        let val = inp.value.trim().toUpperCase();
        
        // If they cleared an existing value (like 'AB' or '50'), treat it as '0' to update the DB
        if (val === '' && inp.dataset.original !== '') {
          val = '0';
        }

        if (val !== '') {
          const isAb = (val === 'AB');
          marks.push({
            stuID: parseInt(inp.dataset.stuId),
            testMarksID: parseInt(inp.dataset.marksId),
            marks: isAb ? 0 : (parseFloat(val) || 0),
            stuAb_status: isAb ? 1 : 0
          });
        }
      });

      if (marks.length === 0) {
        alert('No marks to save. Please enter marks first.');
        return;
      }
      
      const finalTotals = {};
      const finalGrades = {};
      if (meGridData) {
        const totalCol = meGridData.columns.find(c => c.ColType === 'final_total');
        const gradeCol = meGridData.columns.find(c => c.ColType === 'final_grade');
        if (totalCol) {
          document.querySelectorAll(`span[id$="_${totalCol.TemplateColID}"]`).forEach(span => {
            const stuID = span.id.split('_')[1];
            finalTotals[stuID] = span.textContent !== '!' && span.textContent !== '-' ? parseFloat(span.textContent) : 0;
          });
        }
        if (gradeCol) {
          document.querySelectorAll(`span[id$="_${gradeCol.TemplateColID}"]`).forEach(span => {
            const stuID = span.id.split('_')[1];
            finalGrades[stuID] = span.textContent !== '-' ? span.textContent : null;
          });
        }
      }

      // Collect SubjectComments and EffortIDs
      const subjectComments = {};
      document.querySelectorAll('.me-subject-comment').forEach(ta => {
        subjectComments[ta.dataset.stuId] = ta.value.trim();
      });
      const effortIDs = {};
      document.querySelectorAll('.me-effort-select').forEach(sel => {
        if (sel.value) effortIDs[sel.dataset.stuId] = sel.value;
      });

      const btn = document.getElementById('saveMarksBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Saving...';

      try {
        const res = await fetch('/api/marks-entry/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examID: parseInt(examID), marks, finalTotals, finalGrades, subjectComments, effortIDs })
        });
        const data = await res.json();
        if (data.success) {
          btn.textContent = '✅ Saved!';
          document.getElementById('meGridStatus').textContent = `✅ ${data.message}`;
          setTimeout(() => { btn.textContent = '💾 Save All Marks'; btn.disabled = false; }, 2500);
        } else {
          alert('Failed to save: ' + data.error);
          btn.textContent = '💾 Save All Marks';
          btn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        alert('Network error saving marks.');
        btn.textContent = '💾 Save All Marks';
        btn.disabled = false;
      }
    }
    function exportMarksToExcel() {
      if (!meGridData) return alert('Please load a grid first.');
      const examLabel = document.getElementById('meExam').selectedOptions[0]?.text || 'Exam_Marks';
      let csv = [];
      const rows = document.querySelectorAll('#meGrid tr');
      
      rows.forEach((row) => {
        let cols = row.querySelectorAll('th, td');
        let rowData = [];
        cols.forEach((col) => {
          let text = '';
          const input = col.querySelector('input');
          if (input) {
            text = input.value;
          } else {
            text = col.innerText.replace(/\n/g, ' ').replace(/"/g, '""');
          }
          rowData.push(`"${text}"`);
        });
        csv.push(rowData.join(','));
      });

      const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
      const downloadLink = document.createElement('a');
      downloadLink.download = `${examLabel.replace(/[^a-z0-9]/gi, '_')}.csv`;
      downloadLink.href = window.URL.createObjectURL(csvFile);
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }

    function printMarksToPDF() {
      if (!meGridData) return alert('Please load a grid first.');
      const examLabel = document.getElementById('meExam').selectedOptions[0]?.text || 'Exam Marks';
      
      // Create a temporary container to render for PDF (avoid modifying live DOM)
      const printContainer = document.createElement('div');
      printContainer.innerHTML = `
        <div style="padding: 20px; font-family: sans-serif; color: #000; background: #fff;">
          <h2 style="text-align: center; margin-bottom: 20px;">${examLabel}</h2>
          ${document.getElementById('meGrid').outerHTML}
        </div>
      `;
      
      // Style the table for PDF
      const table = printContainer.querySelector('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      printContainer.querySelectorAll('th, td').forEach(cell => {
        cell.style.border = '1px solid #ddd';
        cell.style.padding = '8px';
        cell.style.color = '#000';
        if (cell.tagName === 'TH') cell.style.backgroundColor = '#f4f4f4';
      });
      // Replace inputs with text spans
      printContainer.querySelectorAll('input').forEach(inp => {
        inp.outerHTML = '<span>' + (inp.value || '-') + '</span>';
      });

      // Show loading state
      const modal = document.getElementById('pdfModal');
      const frame = document.getElementById('pdfViewerFrame');
      modal.style.display = 'flex';
      frame.src = '';
      
      const opt = {
        margin:       0.5,
        filename:     `${examLabel.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
      };

      // Generate PDF as Blob and load into iframe
      html2pdf().set(opt).from(printContainer).output('bloburl').then(function(pdfUrl) {
        frame.src = pdfUrl;
      }).catch(err => {
        console.error('PDF Generation Error:', err);
        alert('Failed to generate PDF.');
        modal.style.display = 'none';
      });
    }
// === END MARKS ENTRY ===