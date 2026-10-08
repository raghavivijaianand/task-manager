const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const { data, save } = require('./db');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const id = () => crypto.randomUUID();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

/* ---------- Auth helpers ---------- */
const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = data.users.find((u) => u.id === jwt.verify(token, SECRET).id);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}

/* ---------- Auth routes ---------- */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required.' });
  if (data.users.some((u) => u.email === email.toLowerCase()))
    return res.status(409).json({ error: 'That email is already registered.' });
  const user = {
    id: id(), name: name.trim(), email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    role: data.users.length === 0 ? 'admin' : 'user', // first account is admin
  };
  data.users.push(user);
  save();
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = data.users.find((u) => u.email === String(email).toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- Task routes (CRUD) ---------- */
const STATUSES = ['todo', 'in-progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

// Authorization: users see only their own tasks; admins may pass ?all=1 to see everyone's.
const canAccess = (user, task) => task.userId === user.id || user.role === 'admin';

app.get('/api/tasks', auth, (req, res) => {
  let tasks = data.tasks.filter((t) => (req.query.all === '1' && req.user.role === 'admin') || t.userId === req.user.id);
  if (req.query.status) tasks = tasks.filter((t) => t.status === req.query.status);
  res.json(tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post('/api/tasks', auth, (req, res) => {
  const { title, description = '', priority = 'medium', status = 'todo', dueDate = '' } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!PRIORITIES.includes(priority) || !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid priority or status.' });
  const now = new Date().toISOString();
  const task = { id: id(), userId: req.user.id, title: title.trim(), description, priority, status, dueDate, createdAt: now, updatedAt: now };
  data.tasks.push(task);
  save();
  notify(task.userId, 'created', task);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const task = data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!canAccess(req.user, task)) return res.status(403).json({ error: 'Not your task.' });
  const { title, description, priority, status, dueDate } = req.body || {};
  if (title !== undefined) { if (!title.trim()) return res.status(400).json({ error: 'Title is required.' }); task.title = title.trim(); }
  if (description !== undefined) task.description = description;
  if (dueDate !== undefined) task.dueDate = dueDate;
  if (priority !== undefined) { if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority.' }); task.priority = priority; }
  if (status !== undefined) { if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' }); task.status = status; }
  task.updatedAt = new Date().toISOString();
  save();
  notify(task.userId, 'updated', task);
  res.json(task);
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const i = data.tasks.findIndex((t) => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Task not found.' });
  const task = data.tasks[i];
  if (!canAccess(req.user, task)) return res.status(403).json({ error: 'Not your task.' });
  data.tasks.splice(i, 1);
  save();
  notify(task.userId, 'deleted', task);
  res.status(204).end();
});

/* ---------- Real-time updates (WebSockets) ---------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map(); // userId -> Set<ws>

wss.on('connection', (ws, req) => {
  try {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const userId = jwt.verify(token, SECRET).id;
    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId).add(ws);
    ws.on('close', () => sockets.get(userId)?.delete(ws));
  } catch {
    ws.close(4401, 'Unauthorized');
  }
});

function notify(userId, event, task) {
  const msg = JSON.stringify({ event, task });
  (sockets.get(userId) || []).forEach((ws) => ws.readyState === 1 && ws.send(msg));
}

server.listen(PORT, () => console.log(`Task Manager running at http://localhost:${PORT}`));
