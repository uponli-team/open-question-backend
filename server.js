const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// NEW: import helper modules
const supabaseAdmin = require('./utils/supabaseAdmin');
const { ingestArxiv } = require('./ingestion/arxiv');
const { getEmbedding } = require('./utils/embedding');

const app = express();
const PORT = process.env.PORT || 5000;
const PAGE_SIZE = 50;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Global client for auth checks (anon key)
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ENHANCED AUTHENTICATION MIDDLEWARE (adds role from user_profiles) ---
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = { role: 'anonymous', plan: 'unpaid' };
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'UNAUTHORIZED_TOKEN', error: 'Invalid or expired session.' });
    }

    // Fetch role from user_profiles table (service role bypasses RLS)
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile ? profile.role : 'user';   // 'user', 'admin', 'superadmin'

    req.user = {
      ...user,
      role,
      plan: 'full_access',
      token
    };
    next();
  } catch (err) {
    res.status(500).json({ message: 'AUTH_CRITICAL_FAILURE', error: err.message });
  }
};

// --- RATE LIMITING ---
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'RATE_LIMIT_EXCEEDED', error: 'Public limits reached.' }
});

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use('/api', publicLimiter);
app.use(authenticate);

// ==================== YOUR EXISTING TABLE DEFINITIONS (unchanged) ====================
const tables = [
  {
    name: 'papers',
    label: 'Papers',
    desc: 'Browse global research papers.',
    default_select: '*',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'title', t: 'varchar', c: 'NOT NULL (Searchable)' },
      { f: 'abstract', t: 'text', c: 'NULL' },
      { f: 'publish_date', t: 'date', c: 'NULL' },
      { f: 'doi', t: 'varchar', c: 'UNIQUE' },
      { f: 'arxiv_id', t: 'varchar', c: 'UNIQUE' },
      { f: 'source_url', t: 'text', c: 'NULL' },
      { f: 'created_at', t: 'timestamp', c: 'DEFAULT now()' }
    ],
    post_body: '{\n  "title": "Automated Paper Test",\n  "doi": "10.1234/test",\n  "publish_date": "2024-04-07"\n}'
  },
  {
    name: 'authors',
    label: 'Authors',
    desc: 'Manage researchers and authors.',
    default_select: '*',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'name', t: 'varchar', c: 'NOT NULL' },
      { f: 'affiliation', t: 'varchar', c: 'NULL' },
      { f: 'orcid', t: 'varchar', c: 'UNIQUE' },
      { f: 'created_at', t: 'timestamp', c: 'DEFAULT now()' }
    ],
    post_body: '{\n  "name": "Alan Turing",\n  "orcid": "0000-0000-0000-0000"\n}'
  },
  {
    name: 'paper_authors',
    label: 'Paper Authors',
    desc: 'Junction table linking papers and authors.',
    default_select: '*, papers(title), authors(name)',
    fields: [
      { f: 'paper_id', t: 'uuid', c: 'PK, FK' },
      { f: 'author_id', t: 'uuid', c: 'PK, FK' },
      { f: 'author_order', t: 'integer', c: 'NULL' }
    ],
    post_body: '{\n  "paper_id": "UUID",\n  "author_id": "UUID",\n  "author_order": 1\n}'
  },
  {
    name: 'sections',
    label: 'Sections',
    desc: 'Document structure and sections of a given paper.',
    default_select: '*, papers(title)',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'paper_id', t: 'uuid', c: 'FK, NOT NULL' },
      { f: 'section_label', t: 'varchar', c: 'NULL' },
      { f: 'title', t: 'text', c: 'NULL (Searchable)' },
      { f: 'content', t: 'text', c: 'NULL' },
      { f: 'position', t: 'integer', c: 'NULL' },
      { f: 'created_at', t: 'timestamp', c: 'DEFAULT now()' }
    ],
    post_body: '{\n  "paper_id": "UUID",\n  "title": "Abstract",\n  "position": 0\n}'
  },
  {
    name: 'open_questions',
    label: 'Open Questions',
    desc: 'Extracted open problems and gaps identified in papers.',
    default_select: '*, papers(title, doi)',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'paper_id', t: 'uuid', c: 'FK, NOT NULL' },
      { f: 'section_id', t: 'uuid', c: 'FK, NULL' },
      { f: 'title', t: 'text', c: 'NULL (Searchable)' },
      { f: 'extracted_text', t: 'text', c: 'NOT NULL' },
      { f: 'structured_summary', t: 'text', c: 'NULL' },
      { f: 'category', t: 'varchar', c: 'NULL' },
      { f: 'source_type', t: 'varchar', c: 'NULL' },
      { f: 'confidence_score', t: 'numeric', c: 'NULL' },
      { f: 'importance_score', t: 'numeric', c: 'NULL' },
      { f: 'unsolved_indicators', t: 'jsonb', c: 'NULL' },
      { f: 'is_resolved', t: 'boolean', c: 'DEFAULT false' },
      { f: 'croissant_metadata', t: 'jsonb', c: 'NULL' },
      { f: 'created_at', t: 'timestamp', c: 'DEFAULT now()' }
    ],
    post_body: '{\n  "paper_id": "UUID",\n  "extracted_text": "Sample unresolved problem metric."\n}'
  },
  {
    name: 'paper_citations',
    label: 'Paper Citations',
    desc: 'Graph edges representing citations between papers.',
    default_select: '*',
    fields: [
      { f: 'source_paper_id', t: 'uuid', c: 'PK, FK' },
      { f: 'cited_paper_id', t: 'uuid', c: 'PK, FK' },
      { f: 'context', t: 'text', c: 'NULL' }
    ],
    post_body: '{\n  "source_paper_id": "UUID",\n  "cited_paper_id": "UUID",\n  "context": "as referenced by..."\n}'
  },
  {
    name: 'problem_relations',
    label: 'Problem Relations',
    desc: 'Dependency relationships between identified open questions.',
    default_select: '*',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'from_problem_id', t: 'uuid', c: 'FK, NOT NULL' },
      { f: 'to_problem_id', t: 'uuid', c: 'FK, NOT NULL' },
      { f: 'relation_type', t: 'varchar', c: 'NULL' },
      { f: 'weight', t: 'numeric', c: 'NULL' }
    ],
    post_body: '{\n  "from_problem_id": "UUID",\n  "to_problem_id": "UUID",\n  "relation_type": "is_prerequisite_of",\n  "weight": 0.8\n}'
  }
];

// ==================== DYNAMIC CRUD ENDPOINTS (with role checks) ====================
tables.forEach((t) => {
  // GET (public, with limits)
  app.get(`/api/${t.name}`, async (req, res) => {
    try {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.authorization || '' } }
      });

      let query = client.from(t.name).select(t.default_select);

      Object.keys(req.query).forEach(key => {
        if (key === 'search' && t.fields.some(f => f.f === 'title')) {
          query = query.ilike('title', `%${req.query[key]}%`);
        } else if (t.fields.some(f => f.f === key)) {
          query = query.eq(key, req.query[key]);
        }
      });

      const limit = req.user.role === 'anonymous' ? 10 : PAGE_SIZE;
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      res.status(200).json({ access: req.user.role, limit, count: data.length, results: data });
    } catch (error) {
      res.status(500).json({ status: 'INTERNAL_ERROR', error: error.message });
    }
  });

  // POST (admin or superadmin)
  app.post(`/api/${t.name}`, async (req, res) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Permission Denied: Admin or Superadmin role required.' });
      }

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });

      const { data, error } = await client.from(t.name).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // PUT (admin or superadmin)
  app.put(`/api/${t.name}/:id`, async (req, res) => {
    try {
      if (!['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Permission Denied: Admin or Superadmin role required.' });
      }

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });

      const { data, error } = await client.from(t.name).update(req.body).eq('id', req.params.id).select();
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ error: 'Record not found or update failed.' });
      res.status(200).json(data[0]);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE (superadmin only)
  app.delete(`/api/${t.name}/:id`, async (req, res) => {
    try {
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Permission Denied: Superadmin role required for deletion.' });
      }

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });

      const { data, error } = await client.from(t.name).delete().eq('id', req.params.id).select();
      if (error) throw error;
      res.status(200).json({ status: 'SUCCESS', message: `Deleted ${req.params.id}` });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
});

// ==================== NEW ENDPOINTS: USER MANAGEMENT, INGESTION, SEARCH, MCP ====================

// 1. List all users (admin or superadmin)
app.get('/api/admin/users', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, role, created_at');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// 2. Update user role (superadmin only)
app.patch('/api/admin/users/:userId/role', async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can change roles' });
  }
  const { userId } = req.params;
  const { role } = req.body;
  if (!['user', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .update({ role })
    .eq('id', userId);
  if (error) return res.status(400).json({ error });
  res.json({ message: 'Role updated', user: data[0] });
});

// 3. Delete user (superadmin only)
app.delete('/api/admin/users/:userId', async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can delete users' });
  }
  const { userId } = req.params;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(400).json({ error });
  res.json({ message: 'User deleted' });
});

// 4. Trigger arXiv ingestion (admin or superadmin)
app.post('/api/admin/ingest', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { daysBack = 7, maxResults = 200 } = req.query;
  // Run in background to avoid timeout
  ingestArxiv(parseInt(daysBack), parseInt(maxResults))
    .then(count => console.log(`Ingested ${count} new problems`))
    .catch(err => console.error('Ingestion failed:', err));
  res.json({ message: 'Ingestion started in background' });
});

// 5. Hybrid search endpoint (public, rate limited)
app.get('/api/search', publicLimiter, async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const embedding = await getEmbedding(q);
    const { data, error } = await supabaseAdmin.rpc('match_problems', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: parseInt(limit),
    });
    if (error) throw error;
    if (!data.length) return res.json([]);
    const ids = data.map(d => d.id);
    const { data: problems } = await supabaseAdmin
      .from('open_questions')
      .select('*')
      .in('id', ids);
    res.json(problems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. MCP endpoint for AI agents (public)
app.get('/api/mcp/problems', publicLimiter, async (req, res) => {
  const { limit = 1000 } = req.query;
  const { data, error } = await supabaseAdmin
    .from('open_questions')
    .select('id, source_url, title, extracted_text, confidence_score')
    .limit(parseInt(limit));
  if (error) return res.status(500).json({ error });
  const mcpItems = data.map(p => ({
    type: 'problem',
    id: p.id,
    source: p.source_url || `paper_id:${p.paper_id}`,
    title: p.title,
    statement: p.extracted_text,
    confidence: p.confidence_score || 0,
  }));
  res.json({ problems: mcpItems, total: mcpItems.length, version: '1.0' });
});

// 7. Cron endpoint for scheduled ingestion (protected by API key)
const cronApiKey = process.env.CRON_API_KEY;
app.post('/api/cron/ingest', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== cronApiKey) return res.status(403).json({ error: 'Invalid key' });
  ingestArxiv(1, 200).catch(console.error);
  res.json({ message: 'Cron ingestion started' });
});

// ==================== DOCUMENTATION UI (unchanged) ====================
app.get('/', (req, res) => {
  const cardsHtml = tables.map(t => `
    <div class="endpoint-card">
        <h2 style="margin-top:0;">${t.label} <code>/api/${t.name}</code></h2>
        <p>${t.desc}</p>
        
        <div class="test-section" style="border:none; padding:0;">
            <span class="badge get">GET</span> <span class="badge tier">Limit: 10/50</span>
            <div class="schema-title">📁 TABLE SCHEMA</div>
            <table class="schema-table">
                <thead><tr><th>Field</th><th>Type</th><th>Note</th></tr></thead>
                <tbody>
                    ${t.fields.map(f => `<tr><td><code>${f.f}</code></td><td class="type">${f.t}</td><td>${f.c}</td></tr>`).join('')}
                </tbody>
            </table>
            
            <div style="margin-top: 15px;">
              <div style="display:flex; gap:10px;">
                <input type="text" id="${t.name}-search" placeholder="Search title (keyword)...">
                <input type="text" id="${t.name}-query" placeholder="Filter (id=uuid)">
              </div>
              <button class="test-btn" style="margin-top: 10px;" onclick="runTest('GET', '/api/${t.name}', '${t.name}-get-res', '${t.name}-query', '${t.name}-search')">Execute</button>
              <div id="${t.name}-get-res" class="response-area"></div>
            </div>
        </div>

        <div class="test-section admin-section" style="margin-top:25px; border-top:1px dashed var(--border);">
            <div style="display:flex; gap:5px; margin-bottom:10px;">
                <span class="badge post">POST</span>
                <span class="badge put" style="background:rgba(251, 191, 36, 0.2); color:#fbbf24;">PUT</span>
                <span class="badge delete" style="background:rgba(239, 68, 68, 0.2); color:#ef4444;">DELETE</span>
                <span class="badge admin-badge" style="background:var(--admin); color:#fff; margin-left:auto;">ADMIN ONLY</span>
            </div>
            
            <input type="text" id="${t.name}-id" placeholder="Record ID (required for PUT / DELETE)" style="margin-bottom:10px; border-color:var(--admin);">
            <textarea id="${t.name}-body" style="height: 100px; margin-top:5px;" placeholder="JSON Body for POST / PUT">${t.post_body}</textarea>
            
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button class="test-btn" style="background:var(--admin); flex:1;" onclick="runTest('POST', '/api/${t.name}', '${t.name}-admin-res', null, null, '${t.name}-body')">POST</button>
              <button class="test-btn" style="background:#fbbf24; color:#000; flex:1;" onclick="runTest('PUT', '/api/${t.name}', '${t.name}-admin-res', null, null, '${t.name}-body', '${t.name}-id')">PUT</button>
              <button class="test-btn" style="background:#ef4444; color:#fff; flex:1;" onclick="runTest('DELETE', '/api/${t.name}', '${t.name}-admin-res', null, null, null, '${t.name}-id')">DELETE</button>
            </div>
            <div id="${t.name}-admin-res" class="response-area"></div>
        </div>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Open Problem Peppers API v6.1 - CRUD Admin Edition</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --accent: #38bdf8; --border: #334155; --admin: #ef4444; }
            body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            .endpoint-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 30px; margin-bottom: 30px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; margin-right: 5px; }
            .get { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
            .post { background: rgba(52, 211, 153, 0.2); color: #34d399; }
            .schema-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; color: #94a3b8; }
            .schema-table th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border); }
            .test-btn { background: var(--accent); color: var(--bg); border: none; padding: 10px 15px; border-radius: 8px; font-weight: 600; cursor: pointer; }
            input, textarea { background: #0f172a; border: 1px solid var(--border); color: #fff; padding: 10px; border-radius: 8px; width: 100%; font-family: monospace; }
            .response-area { background: #000; color: #34d399; padding: 15px; border-radius: 8px; margin-top: 10px; font-family: monospace; font-size: 0.85rem; max-height: 200px; overflow: auto; display:none; }
            .token-input { border: 2px solid #34d399; margin-bottom: 30px; padding: 15px; font-size: 1rem; }
        </style>
    </head>
    <body class="container">
        <header style="text-align:center; margin-bottom:50px;">
            <h1 style="color:var(--accent);">🌶️ API v6.0: RLS Scoped Edition</h1>
            <p style="color:#94a3b8;">Full RLS Identity Support & Safety Limits Enabled</p>
            <input type="text" id="user-token" class="token-input" placeholder="Paste JWT Bearer Token for Admin Access...">
        </header>

        ${cardsHtml}

        <script>
            async function runTest(method, endpoint, resultId, queryId, searchId, bodyId, idInputId) {
                const resArea = document.getElementById(resultId);
                const token = document.getElementById('user-token').value;
                resArea.style.display = 'block'; resArea.innerText = 'Connecting...';
                
                try {
                    let url = endpoint;
                    if (idInputId) {
                        const idVal = document.getElementById(idInputId).value;
                        if (idVal) url += '/' + idVal;
                    }

                    const params = new URLSearchParams();
                    
                    if (queryId) {
                      const q = document.getElementById(queryId).value;
                      if (q) q.split('&').forEach(p => { const [k,v] = p.split('='); params.append(k,v); });
                    }
                    if (searchId) {
                      const s = document.getElementById(searchId).value;
                      if (s) params.append('search', s);
                    }
                    if (params.toString()) url += '?' + params.toString();

                    const options = {
                        method,
                        headers: { 'Content-Type': 'application/json', 'Authorization': token ? 'Bearer ' + token : '' }
                    };
                    if (bodyId) {
                        const b = document.getElementById(bodyId).value;
                        if (b) options.body = b;
                    }

                    const response = await fetch(url, options);
                    const data = await response.json();
                    resArea.innerText = JSON.stringify(data, null, 2);
                } catch (err) { resArea.innerText = 'ERROR: ' + err.message; }
            }
        </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[STABLE v6.0] Engine online at ${PORT}`);
});
