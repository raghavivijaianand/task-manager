const $ = (s) => document.querySelector(s);
const api = '/api';
let token = localStorage.getItem('token');
let tasks = [], filter = '', editingId = null, registerMode = false, ws;

/* ---------- API helper ---------- */
async function request(path, method = 'GET', body) {
  const res = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401 && token) logout();
    throw new Error(json.error || 'Something went wrong.');
  }
  return json;
}

/* ---------- Auth ---------- */
function setMode(reg) {
  registerMode = reg;
  $('#name').hidden = !reg;
  $('#name').required = reg;
  $('#auth-submit').textContent = reg ? 'Create account' : 'Log in';
  $('#auth-toggle').textContent = reg ? 'Have an account? Log in' : 'New here? Create an account';
  $('#auth-sub').textContent = reg ? 'Create an account to start tracking tasks.' : 'Log in to see your tasks.';
  $('#auth-error').textContent = '';
}
$('#auth-toggle').onclick = () => setMode(!registerMode);

$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const out = await request(registerMode ? '/auth/register' : '/auth/login', 'POST', {
      name: $('#name').value, email: $('#email').value, password: $('#password').value,
    });
    token = out.token;
    localStorage.setItem('token', token);
    start(out.user);
  } catch (err) { $('#auth-error').textContent = err.message; }
};

function logout() {
  localStorage.removeItem('token');
  token = null;
  ws && ws.close();
  $('#app').hidden = true;
  $('#auth').hidden = false;
}
$('#logout').onclick = logout;

async function start(user) {
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#user-name').textContent = user.name + (user.role === 'admin' ? ' (admin)' : '');
  await load();
  connectSocket();
}

/* ---------- Real-time ---------- */
function connectSocket() {
  ws && ws.close();
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
  ws.onopen = () => $('#live').classList.add('on');
  ws.onclose = () => { $('#live').classList.remove('on'); if (token) setTimeout(connectSocket, 3000); };
  ws.onmessage = () => load(); // another tab/device changed something: refetch
}

/* ---------- Tasks ---------- */
async function load() {
  tasks = await request('/tasks');
  render();
}

const LABELS = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render() {
  ['todo', 'in-progress', 'done'].forEach((s) => ($('#c-' + s).textContent = tasks.filter((t) => t.status === s).length));
  $('#c-all').textContent = tasks.length;
  const shown = tasks.filter((t) => !filter || t.status === filter);
  $('#empty').hidden = shown.length > 0;
  const today = new Date().toISOString().slice(0, 10);
  $('#list').innerHTML = shown.map((t) => `
    <li class="task ${t.priority} ${t.status}" data-id="${t.id}">
      <h3>${esc(t.title)}</h3>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <div class="meta">
        <span>${LABELS[t.status]}</span><span>${t.priority} priority</span>
        ${t.dueDate ? `<span class="${t.dueDate < today && t.status !== 'done' ? 'overdue' : ''}">Due ${t.dueDate}</span>` : ''}
      </div>
      <div class="actions">
        <button class="btn" data-a="next">${t.status === 'done' ? 'Reopen' : t.status === 'todo' ? 'Start' : 'Mark done'}</button>
        <button class="btn" data-a="edit">Edit</button>
        <button class="btn" data-a="delete">Delete</button>
      </div>
    </li>`).join('');
}

$('#filters').onclick = (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
  render();
};

$('#list').onclick = async (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const id = btn.closest('.task').dataset.id;
  const task = tasks.find((t) => t.id === id);
  try {
    if (btn.dataset.a === 'delete' && confirm('Delete this task?')) await request('/tasks/' + id, 'DELETE');
    if (btn.dataset.a === 'next') await request('/tasks/' + id, 'PUT', { status: { todo: 'in-progress', 'in-progress': 'done', done: 'todo' }[task.status] });
    if (btn.dataset.a === 'edit') return startEdit(task);
    await load();
  } catch (err) { alert(err.message); }
};

function startEdit(t) {
  editingId = t.id;
  $('#form-title').textContent = 'Edit task';
  $('#t-save').textContent = 'Save changes';
  $('#t-cancel').hidden = false;
  $('#t-title').value = t.title; $('#t-desc').value = t.description;
  $('#t-priority').value = t.priority; $('#t-status').value = t.status; $('#t-due').value = t.dueDate;
  $('#t-title').focus();
}
function resetForm() {
  editingId = null;
  $('#task-form').reset();
  $('#form-title').textContent = 'New task';
  $('#t-save').textContent = 'Add task';
  $('#t-cancel').hidden = true;
}
$('#t-cancel').onclick = resetForm;

$('#task-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = { title: $('#t-title').value, description: $('#t-desc').value, priority: $('#t-priority').value, status: $('#t-status').value, dueDate: $('#t-due').value };
  try {
    await (editingId ? request('/tasks/' + editingId, 'PUT', body) : request('/tasks', 'POST', body));
    resetForm();
    await load();
  } catch (err) { alert(err.message); }
};

/* ---------- Boot ---------- */
(async () => {
  if (!token) return;
  try { start((await request('/auth/me')).user); } catch { logout(); }
})();
