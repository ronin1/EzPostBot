import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'history.db');

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

// Initialize SQLite
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    request_headers TEXT,
    request_body TEXT,
    response_status INTEGER,
    response_status_text TEXT,
    response_headers TEXT,
    response_body TEXT,
    error TEXT,
    duration_ms INTEGER,
    diagnosis TEXT,
    preflight TEXT
  )
`);

// Migration: add columns if they don't exist yet (for existing databases)
try { db.exec('ALTER TABLE requests ADD COLUMN diagnosis TEXT'); } catch {}
try { db.exec('ALTER TABLE requests ADD COLUMN preflight TEXT'); } catch {}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend in production
app.use(express.static(join(__dirname, 'dist')));

// --- API Routes ---

// Save a request
app.post('/api/history', (req, res) => {
  const r = req.body;
  const stmt = db.prepare(`
    INSERT INTO requests (timestamp, method, url, request_headers, request_body, response_status, response_status_text, response_headers, response_body, error, duration_ms, diagnosis, preflight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    r.timestamp, r.method, r.url,
    r.requestHeaders || null, r.requestBody || null,
    r.responseStatus || null, r.responseStatusText || null,
    r.responseHeaders || null, r.responseBody || null,
    r.error || null, r.durationMs || null,
    r.diagnosis || null, r.preflight || null
  );
  res.json({ id: result.lastInsertRowid });
});

// Query requests with filters + pagination
app.get('/api/history', (req, res) => {
  const {
    method: methodFilter,
    url: urlFilter,
    statusMin,
    statusMax,
    page = '1',
    pageSize = '20',
    sortDir = 'DESC',
  } = req.query;

  const conditions = [];
  const params = [];

  if (methodFilter) {
    const methods = methodFilter.split(',').map(m => m.trim()).filter(Boolean);
    if (methods.length === 1) {
      conditions.push('method = ?');
      params.push(methods[0]);
    } else if (methods.length > 1) {
      conditions.push(`method IN (${methods.map(() => '?').join(',')})`);
      params.push(...methods);
    }
  }
  if (urlFilter) {
    conditions.push('url LIKE ?');
    params.push(`%${urlFilter}%`);
  }
  if (statusMin) {
    conditions.push('response_status >= ?');
    params.push(Number(statusMin));
  }
  if (statusMax) {
    conditions.push('response_status <= ?');
    params.push(Number(statusMax));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';
  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM requests ${where}`).get(...params).cnt;

  const rows = db.prepare(`
    SELECT * FROM requests ${where}
    ORDER BY timestamp ${dir}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ rows, total });
});

// Delete one request
app.delete('/api/history/:id', (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Delete all requests
app.delete('/api/history', (_req, res) => {
  db.prepare('DELETE FROM requests').run();
  res.json({ ok: true });
});

// SPA fallback — serve index.html for any non-API route
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
