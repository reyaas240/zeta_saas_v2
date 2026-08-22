    // Exam Analytics Loader & Filter Handler
    async function loadExamAnalyticsFiltersAndData() {
      if (!filterOptions) {
        try {
          const res = await fetch('/api/analytics/exam/filters');
          filterOptions = await res.json();
          populateFilterDropdowns();
        } catch (err) {
          console.error('Error fetching exam filters:', err);
          return;
        }
      }
      await fetchAndRenderExamData();
    }

    function populateFilterDropdowns() {
      if (!filterOptions || !filterOptions.success) return;

      const aySelect = document.getElementById('filterAcademicYear');
      const currentAy = aySelect.value || filterOptions.defaultAcademicYearID;
      
      aySelect.innerHTML = filterOptions.academicYears.map(ay => 
        `<option value="${ay.academicYearID}" ${ay.academicYearID == currentAy ? 'selected' : ''}>${ay.description}</option>`
      ).join('');

      const termSelect = document.getElementById('filterTerm');
      const currentTerm = termSelect.value;
      const selectedAyID = aySelect.value;
      const termsForAy = filterOptions.terms.filter(t => !t.academicYearID || t.academicYearID == selectedAyID);
      termSelect.innerHTML = '<option value="">All Terms</option>' + termsForAy.map(t => 
        `<option value="${t.termID}" ${t.termID == currentTerm ? 'selected' : ''}>${t.termDescription}</option>`
      ).join('');

      const classSelect = document.getElementById('filterClass');
      const currentClass = classSelect.value;
      classSelect.innerHTML = '<option value="">All Classes</option>' + filterOptions.classes.map(c => 
        `<option value="${c.classID}" ${c.classID == currentClass ? 'selected' : ''}>${c.className}</option>`
      ).join('');

      const groupSelect = document.getElementById('filterGroup');
      const currentGroup = groupSelect.value;
      groupSelect.innerHTML = '<option value="">All Groups</option>' + filterOptions.groups.map(g => 
        `<option value="${g.grpID}" ${g.grpID == currentGroup ? 'selected' : ''}>${g.groupName}</option>`
      ).join('');

      // Wire change handlers
      aySelect.onchange = () => {
        populateFilterDropdowns();
        fetchAndRenderExamData();
      };
      termSelect.onchange = fetchAndRenderExamData;
      classSelect.onchange = fetchAndRenderExamData;
      groupSelect.onchange = fetchAndRenderExamData;
    }

    async function fetchAndRenderExamData() {
      const ay = document.getElementById('filterAcademicYear').value;
      const term = document.getElementById('filterTerm').value;
      const cls = document.getElementById('filterClass').value;
      const grp = document.getElementById('filterGroup').value;

      const queryParams = new URLSearchParams();
      if (ay) queryParams.append('academicYearID', ay);
      if (term) queryParams.append('termID', term);
      if (cls) queryParams.append('classID', cls);
      if (grp) queryParams.append('grpID', grp);

      try {
        const res = await fetch(`/api/analytics/exam/data?${queryParams.toString()}`);
        const data = await res.json();
        if (!data.success) return;

        // Render KPIs
        document.getElementById('kpiAverage').textContent = data.kpis.overallAverage;
        document.getElementById('kpiPassRate').textContent = `${data.kpis.passRate}%`;
        document.getElementById('kpiHighest').textContent = data.kpis.highestScore;

        // Render Charts Container
        const grid = document.getElementById('cardsGrid');
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(420px, 1fr))';
        grid.innerHTML = `
          <div class="chart-card" style="grid-column: 1 / -1;">
            <div class="chart-header">
              <span class="chart-title">Subject Class Average vs Highest</span>
              <span style="font-size:11px;color:#64748b;margin-left:8px;">Source: srp_termreportmarksaverage</span>
            </div>
            <div class="chart-canvas-wrapper" style="height:320px;"><canvas id="subjectPerfChart"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><span class="chart-title">Grade Distribution</span></div>
            <div class="chart-canvas-wrapper"><canvas id="gradeDistChart"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><span class="chart-title">Term Progression Trend</span></div>
            <div class="chart-canvas-wrapper"><canvas id="termTrendChart"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><span class="chart-title">Class Average Comparison</span></div>
            <div class="chart-canvas-wrapper"><canvas id="classPerfChart"></canvas></div>
          </div>
        `;

        destroyCharts();
        renderExamCharts(data);
      } catch (err) {
        console.error('Error fetching exam data:', err);
      }
    }

    function renderExamCharts(data) {
      // 1. Grade Distribution Donut
      const gradeLabels = Object.keys(data.gradeDistribution);
      const gradeCounts = Object.values(data.gradeDistribution);

      chartInstances.grade = new Chart(document.getElementById('gradeDistChart'), {
        type: 'doughnut',
        data: {
          labels: gradeLabels,
          datasets: [{
            data: gradeCounts,
            backgroundColor: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } } }
      });

      // 2. Subject Performance Grouped Bar (from srp_termreportmarksaverage)
      const subLabels = data.subjectPerformance.map(s => s.subjectName);
      const subAvgs  = data.subjectPerformance.map(s => s.classAvg);
      const subHighs = data.subjectPerformance.map(s => s.highestMark);

      chartInstances.subject = new Chart(document.getElementById('subjectPerfChart'), {
        type: 'bar',
        data: {
          labels: subLabels,
          datasets: [
            {
              label: 'Class Avg',
              data: subAvgs,
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              borderColor: '#6366f1',
              borderWidth: 1,
              borderRadius: 5
            },
            {
              label: 'Highest Mark',
              data: subHighs,
              backgroundColor: 'rgba(6, 182, 212, 0.85)',
              borderColor: '#06b6d4',
              borderWidth: 1,
              borderRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          layout: {
            padding: {
              top: 15
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#94a3b8',
                maxRotation: 35,
                font: { size: 11 }
              },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              min: 0,
              max: 105,
              ticks: {
                color: '#94a3b8',
                callback: v => v <= 100 ? v + '%' : ''
              },
              grid: { color: 'rgba(255,255,255,0.06)' }
            }
          },
          plugins: {
            legend: {
              labels: { color: '#cbd5e1', boxWidth: 14, padding: 24 }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}%`
              }
            }
          }
        },
        plugins: [{
          id: 'barLabels',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#cbd5e1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            chart.data.datasets.forEach((dataset, i) => {
              if (!chart.isDatasetVisible(i)) return;
              const meta = chart.getDatasetMeta(i);
              meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (val !== null && val !== undefined) {
                  ctx.fillText(Number(val).toFixed(2), bar.x, bar.y - 4);
                }
              });
            });
            ctx.restore();
          }
        }]
      });

      // 3. Term Trend Line Chart
      const termLabels = data.termTrend.map(t => t.termDescription);
      const termAvgs = data.termTrend.map(t => t.termAvg);

      chartInstances.trend = new Chart(document.getElementById('termTrendChart'), {
        type: 'line',
        data: {
          labels: termLabels,
          datasets: [{
            label: 'Overall Term Average',
            data: termAvgs,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#06b6d4',
            pointRadius: 5
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } }
          },
          plugins: { legend: { labels: { color: '#94a3b8' } } }
        }
      });

      // 4. Class Average Comparison Bar
      const classLabels = data.classPerformance.map(c => c.className);
      const classAvgs = data.classPerformance.map(c => c.classAvg);

      chartInstances.class = new Chart(document.getElementById('classPerfChart'), {
        type: 'bar',
        data: {
          labels: classLabels,
          datasets: [{
            label: 'Class Average %',
            data: classAvgs,
            backgroundColor: classAvgs.map((v, i) => `hsla(${240 + i * 20}, 70%, 60%, 0.8)`),
            borderRadius: 5
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } }
          },
          plugins: { legend: { labels: { color: '#94a3b8' } } }
        }
      });
    }
