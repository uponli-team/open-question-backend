const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const PAGE_SIZE = 50; // Safety limit for authenticated users

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Global client for auth checks
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DUAL-TIER AUTHENTICATION MIDDLEWARE ---
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = { role: 'anonymous', plan: 'unpaid' };
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'UNAUTHORIZED_TOKEN', error: 'Invalid or expired session.' });
    }
    req.user = { ...user, role: 'authenticated', plan: 'full_access', token };
    next();
  } catch (err) {
    res.status(500).json({ message: 'AUTH_CRITICAL_FAILURE', error: err.message });
  }
};

// --- SECURITY BEST PRACTICES ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, 
  message: { message: 'RATE_LIMIT_EXCEEDED', error: 'Public limits reached.' }
});

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use('/api', limiter); 
app.use(authenticate);

// --- TABLE & SCHEMA DEFINITIONS ---
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

// --- DYNAMIC API ENDPOINT REGISTRATION ---
tables.forEach((t) => {
  // GET Endpoint
  app.get(`/api/${t.name}`, async (req, res) => {
    try {
      // --- IMPROVEMENT 1: SCOPED CLIENT (Fix RLS Identity Gap) ---
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.authorization || '' } }
      });

      let query = client.from(t.name).select(t.default_select);
      
      // --- IMPROVEMENT 3: DYNAMIC FILTERING (Beyond eq) ---
      Object.keys(req.query).forEach(key => {
        if (key === 'search' && t.fields.some(f => f.f === 'title')) {
           query = query.ilike('title', `%${req.query[key]}%`);
        } else if (t.fields.some(f => f.f === key)) {
          query = query.eq(key, req.query[key]);
        }
      });

      // --- IMPROVEMENT 2: SAFETY LIMITS ---
      const limit = req.user.role === 'anonymous' ? 10 : PAGE_SIZE;
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      
      res.status(200).json({ access: req.user.role, limit, count: data.length, results: data });
    } catch (error) { res.status(500).json({ status: 'INTERNAL_ERROR', error: error.message }); }
  });

  // POST Endpoint (Admin Only)
  app.post(`/api/${t.name}`, async (req, res) => {
    try {
      if (req.user.role !== 'authenticated') {
        return res.status(403).json({ error: 'Permission Denied: Admin JWT required.' });
      }

      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });

      const { data, error } = await client.from(t.name).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  // PUT Endpoint (Admin Only) - Update by ID
  app.put(`/api/${t.name}/:id`, async (req, res) => {
    try {
      if (req.user.role !== 'authenticated') {
        return res.status(403).json({ error: 'Permission Denied: Admin JWT required.' });
      }
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });
      const { data, error } = await client.from(t.name).update(req.body).eq('id', req.params.id).select();
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ error: 'Record not found or update failed.' });
      res.status(200).json(data[0]);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  // DELETE Endpoint (Admin Only) - Delete by ID
  app.delete(`/api/${t.name}/:id`, async (req, res) => {
    try {
      if (req.user.role !== 'authenticated') {
        return res.status(403).json({ error: 'Permission Denied: Admin JWT required.' });
      }
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${req.user.token}` } }
      });
      const { data, error } = await client.from(t.name).delete().eq('id', req.params.id).select();
      if (error) throw error;
      res.status(200).json({ status: 'SUCCESS', message: `Deleted ${req.params.id}` });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
});

// --- DOCUMENTATION UI ---
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[STABLE v6.0] Engine online at ${PORT}`);
});
