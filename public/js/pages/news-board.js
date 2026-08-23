let nbCanManage = false;
let quillInstance = null;

const nbEscape = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const nbToday = () => new Date().toISOString().slice(0, 10);

// Initialize Quill rich text editor
async function initQuillEditor() {
  if (quillInstance) return quillInstance;
  
  // Load Quill CSS and JS from CDN
  if (!document.getElementById('quill-css')) {
    const link = document.createElement('link');
    link.id = 'quill-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
    document.head.appendChild(link);
  }
  
  if (!window.Quill && !document.getElementById('quill-js')) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'quill-js';
      script.src = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  const editorContainer = document.getElementById('nbDescriptionEditor');
  if (!editorContainer || !window.Quill) return null;
  
  quillInstance = new Quill('#nbDescriptionEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        ['clean']
      ]
    },
    placeholder: 'Write the notice here with rich formatting...'
  });
  
  // Sync Quill content to hidden textarea on change
  quillInstance.on('text-change', () => {
    const textarea = document.getElementById('nbDescription');
    if (textarea) {
      textarea.value = quillInstance.root.innerHTML;
    }
  });
  
  return quillInstance;
}

async function loadNewsBoard() {
  const list = document.getElementById('nbList');
  if (!list) return;
  list.innerHTML = '<div class="page-loading">Loading notices…</div>';
  const params = new URLSearchParams({ status: document.getElementById('nbStatusFilter').value });
  const date = document.getElementById('nbDateFilter').value;
  if (date) params.set('date', date);
  try {
    const response = await fetch(`/api/news-board?${params}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    nbCanManage = data.canManage;
    document.getElementById('nbAddButton').style.display = nbCanManage ? 'inline-block' : 'none';
    list.innerHTML = data.notices.length ? data.notices.map(renderNoticeCard).join('') : '<div class="news-board-empty">No notices match these filters.</div>';
    // Render HTML descriptions after inserting cards
    renderNoticeDescriptions();
  } catch (error) { list.innerHTML = `<div class="news-board-empty">${nbEscape(error.message)}</div>`; }
}

async function loadNewsBoardDates() {
  try {
    const response = await fetch('/api/news-board/dates');
    const data = await response.json();
    if (!data.success) return;
    const dateSelect = document.getElementById('nbDateFilter');
    const selected = dateSelect.value;
    dateSelect.innerHTML = '<option value="">All dates</option>' + data.dates.map(date => `<option value="${date}">${date}</option>`).join('');
    dateSelect.value = selected;
  } catch (error) { console.error('[News Board Dates Error]', error); }
}

function renderNoticeCard(notice) {
  const expired = notice.expiresOn && notice.expiresOn < nbToday();
  // Store raw HTML in data attribute to prevent escaping
  const descriptionHtml = notice.description || '';
  return `<article class="notice-card ${expired ? 'is-expired' : ''}" data-notice-id="${notice.id}">
    <div class="notice-card-meta"><span>${nbEscape(notice.newsDate)}</span><span>${nbEscape(notice.author || 'School')}</span><span>${nbEscape(notice.audience)}</span><span class="notice-status ${notice.isSubmitted ? 'published' : 'draft'}">${notice.isSubmitted ? 'Published' : 'Draft'}</span></div>
    <div class="notice-card-title-row"><h3>${nbEscape(notice.subject)}</h3>${nbCanManage ? `<div><button class="nb-icon-action" onclick="editNotice(${notice.id})" aria-label="Edit notice">✎</button><button class="nb-icon-action danger" onclick="deleteNotice(${notice.id})" aria-label="Delete notice">×</button></div>` : ''}</div>
    <div class="notice-card-description" data-html="${btoa(unescape(encodeURIComponent(descriptionHtml)))}">${descriptionHtml}</div>
    ${notice.expiresOn ? `<p class="notice-card-expiry">Expires ${nbEscape(notice.expiresOn)}</p>` : ''}
  </article>`;
}

// Render HTML descriptions in notice cards
function renderNoticeDescriptions() {
  document.querySelectorAll('.notice-card-description').forEach(el => {
    const encodedHtml = el.getAttribute('data-html');
    if (encodedHtml) {
      try {
        // Decode base64 HTML and render it
        const html = decodeURIComponent(escape(atob(encodedHtml)));
        el.innerHTML = html;
      } catch (e) {
        console.error('Failed to decode description HTML', e);
        el.textContent = el.textContent;
      }
    } else {
      el.innerHTML = el.textContent;
    }
  });
}

async function openNoticeForm(notice = null) {
  if (!nbCanManage) return;
  
  // Initialize Quill editor first
  await initQuillEditor();
  
  document.getElementById('nbForm').reset();
  document.getElementById('nbId').value = notice?.id || '';
  document.getElementById('nbFormTitle').textContent = notice ? 'Edit notice' : 'Add notice';
  document.getElementById('nbNewsDate').value = notice?.newsDate || nbToday();
  document.getElementById('nbExpiresOn').value = notice?.expiresOn || '';
  document.getElementById('nbSubject').value = notice?.subject || '';
  
  // Set description in Quill editor
  const descriptionHtml = notice?.description || '';
  document.getElementById('nbDescription').value = descriptionHtml;
  if (quillInstance) {
    quillInstance.root.innerHTML = descriptionHtml;
  }
  
  document.getElementById('nbForEmployees').checked = Boolean(notice?.isForEmployees);
  document.getElementById('nbForStudents').checked = Boolean(notice?.isForStudents);
  document.getElementById('nbForParents').checked = Boolean(notice?.isForParents);
  document.getElementById('nbCoverImage').value = notice?.coverImage || '';
  document.getElementById('nbSubmitted').checked = Boolean(notice?.isSubmitted);
  document.getElementById('nbModal').hidden = false;
}

function closeNoticeForm() { document.getElementById('nbModal').hidden = true; }

async function editNotice(id) {
  const response = await fetch(`/api/news-board/${id}`);
  const data = await response.json();
  if (data.success) openNoticeForm(data.notice);
  else showNewsBoardMessage(data.error, true);
}

async function deleteNotice(id) {
  if (!confirm('Delete this notice?')) return;
  const response = await fetch(`/api/news-board/${id}`, { method: 'DELETE' });
  const data = await response.json();
  showNewsBoardMessage(data.message || data.error, !data.success);
  if (data.success) loadNewsBoard();
}

function showNewsBoardMessage(message, isError = false) {
  const messageEl = document.getElementById('nbMessage');
  messageEl.textContent = message;
  messageEl.className = `news-board-message ${isError ? 'error' : 'success'}`;
}

function wireNewsBoard() {
  const form = document.getElementById('nbForm');
  if (!form || form.dataset.wired) return;
  form.dataset.wired = 'true';
  ['nbDateFilter', 'nbStatusFilter'].forEach(id => document.getElementById(id).addEventListener('change', loadNewsBoard));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const id = document.getElementById('nbId').value;
    const payload = {
      newsDate: document.getElementById('nbNewsDate').value,
      expiresOn: document.getElementById('nbExpiresOn').value,
      subject: document.getElementById('nbSubject').value,
      description: document.getElementById('nbDescription').value,
      isForEmployees: document.getElementById('nbForEmployees').checked,
      isForStudents: document.getElementById('nbForStudents').checked,
      isForParents: document.getElementById('nbForParents').checked,
      coverImage: document.getElementById('nbCoverImage').value,
      isSubmitted: document.getElementById('nbSubmitted').checked
    };
    const response = await fetch(id ? `/api/news-board/${id}` : '/api/news-board', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    showNewsBoardMessage(data.message || data.error, !data.success);
    if (data.success) { closeNoticeForm(); loadNewsBoard(); }
  });
}

function loadNewsBoardPage() { 
  wireNewsBoard(); 
  loadNewsBoardDates(); 
  loadNewsBoard(); 
}

// Export for use in app.html
window.loadNewsBoardPage = loadNewsBoardPage;
window.openNoticeForm = openNoticeForm;
window.closeNoticeForm = closeNoticeForm;
window.editNotice = editNotice;
window.deleteNotice = deleteNotice;
