# Taskboard – Full-Stack Task Manager

Express + JWT auth + WebSocket live updates + responsive vanilla JS frontend. No build step, no database server.

## Run
```bash
cd task-manager
npm install
npm start          # http://localhost:3000
```
Optional: `JWT_SECRET=your-long-random-string PORT=4000 npm start`

## Structure
```
task-manager/
├── package.json
├── server/
│   ├── server.js   # REST API, JWT auth, authorization, WebSocket server
│   ├── db.js       # JSON-file storage (users, tasks) -> server/data.json
├── public/
│   ├── index.html  # login/register + task board
│   ├── style.css   # responsive, light/dark
│   └── app.js      # API calls, rendering, WebSocket client
```

## API
| Method | Route | Notes |
|---|---|---|
| POST | /api/auth/register | `{name,email,password}` -> `{token,user}` (first user = admin) |
| POST | /api/auth/login | `{email,password}` -> `{token,user}` |
| GET | /api/auth/me | current user |
| GET | /api/tasks | own tasks; `?status=todo`; admin `?all=1` |
| POST | /api/tasks | `{title,description,priority,status,dueDate}` |
| PUT | /api/tasks/:id | partial update (owner or admin) |
| DELETE | /api/tasks/:id | owner or admin |

Send `Authorization: Bearer <token>` on task routes.

## Concepts covered
- **Authentication**: bcrypt-hashed passwords, JWT (7 days)
- **Authorization**: users touch only their tasks; admin can access all
- **CRUD + validation**: REST endpoints with status/priority checks
- **Real-time**: WebSocket at `/ws?token=...`; open two tabs and edit in one to see the other update
- **Responsive**: single column on phones, sidebar form on desktop

## Next steps
Replace `db.js` with SQLite/PostgreSQL/MongoDB, add due-date reminders, drag-and-drop columns, tests (Jest + Supertest).
