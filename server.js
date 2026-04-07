const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- DUAL-TIER AUTHENTICATION MIDDLEWARE ---
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = { role: 'anonymous', plan: 'unpaid' };
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'UNAUTHORIZED_TOKEN', error: 'Invalid or expired session.' });
    }
    req.user = { ...user, role: 'authenticated', plan: 'full_access' };
    next();
  } catch (err) {
    res.status(500).json({ message: 'AUTH_CRITICAL_FAILURE', error: err.message });
  }
};

// --- SECURITY BEST PRACTICES ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 req per 15 min for public endpoints to prevent abuse.
  message: { message: 'RATE_LIMIT_EXCEEDED', error: 'Public limits reached.' }
});

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use('/api', limiter); 
app.use(authenticate);

// --- TABLE & SCHEMA DEFINITIONS ---
// This powers both the dynamic endpoints and the documentation UI
const tables = [
  {
    name: 'papers',
    label: 'Papers',
    desc: 'Browse global research papers.',
    default_select: '*',
    fields: [
      { f: 'id', t: 'uuid', c: 'PK, DEFAULT' },
      { f: 'title', t: 'varchar', c: 'NOT NULL' },
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
      { f: 'title', t: 'text', c: 'NULL' },
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
      { f: 'title', t: 'text', c: 'NULL' },
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
      let query = supabase.from(t.name).select(t.default_select);
      
      // Allow dynamic filtering via query string
      Object.keys(req.query).forEach(key => {
        if (t.fields.some(f => f.f === key)) {
          query = query.eq(key, req.query[key]);
        }
      });

      // Role Logic: 10 vs Unlimited
      if (req.user.role === 'anonymous') query = query.limit(10);

      const { data, error } = await query;
      if (error) throw error;
      
      res.status(200).json({ access: req.user.role, limit: req.user.role === 'anonymous' ? 10 : 'unlimited', count: data.length, results: data });
    } catch (error) { res.status(500).json({ status: 'INTERNAL_ERROR', error: error.message }); }
  });

  // POST Endpoint (Admin/Auth Only)
  app.post(`/api/${t.name}`, async (req, res) => {
    try {
      if (req.user.role !== 'authenticated') {
        return res.status(403).json({ error: 'Permission Denied: Administrative access (JWT) required to mutate records.' });
      }
      const { data, error } = await supabase.from(t.name).insert([req.body]).select();
      if (error) throw error;
      res.status(201).json(data[0]);
    } catch (error) { res.status(400).json({ status: 'DB_ERROR', error: error.message }); }
  });
});

// --- DOCUMENTATION LANDING PAGE UI ---
app.get('/', (req, res) => {
  const cardsHtml = tables.map(t => `
    <div class="endpoint-card">
        <h2 style="margin-top: 0; margin-bottom: 5px;">${t.label} <code>/api/${t.name}</code></h2>
        <p style="margin-bottom: 20px;">${t.desc}</p>
        
        <div class="test-section" style="border:none; padding:0; margin:0;">
            <span class="badge get">GET</span> <span class="badge tier">Public: Limit 10</span> <span class="badge auth-badge">Auth: Unlimited</span>
            <div class="schema-title">📁 TABLE SCHEMA</div>
            <table class="schema-table">
                <thead><tr><th>Field</th><th>Type</th><th>Constraints</th></tr></thead>
                <tbody>
                    ${t.fields.map(f => `<tr><td><code>${f.f}</code></td><td class="type">${f.t}</td><td>${f.c}</td></tr>`).join('')}
                </tbody>
            </table>
            
            <div style="margin-top: 15px;">
              <input type="text" id="${t.name}-query" placeholder="Filter parameter (e.g. title=Quantum or id=123)">
              <button class="test-btn" style="margin-top: 10px;" onclick="runTest('GET', '/api/${t.name}', '${t.name}-get-res', '${t.name}-query')">Fetch Data</button>
              <div id="${t.name}-get-res" class="response-area"></div>
            </div>
        </div>

        <div class="test-section admin-section" style="margin-top: 25px; padding-top: 20px;">
            <span class="badge post">POST</span> <span class="badge admin-badge">ADMIN/AUTH ONLY</span>
            <p>Requires Bearer Token. Insert new record format via JSON.</p>
            <textarea id="${t.name}-body" style="height: 100px; margin-bottom: 10px;">${t.post_body}</textarea>
            <button class="test-btn" style="background: var(--admin)" onclick="runTest('POST', '/api/${t.name}', '${t.name}-post-res', null, '${t.name}-body')">Send Secure POST</button>
            <div id="${t.name}-post-res" class="response-area"></div>
        </div>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Open Problem Peppers API v5.0 - Final Omni-Schema Base</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a; --card-bg: #1e293b; --text: #f8fafc; --accent: #38bdf8;
                --muted: #94a3b8; --border: #334155; --success: #34d399; --admin: #ef4444;
                --gold: #f59e0b; --code-bg: #000;
            }
            body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; line-height: 1.6; }
            .container { max-width: 1100px; margin: 0 auto; }
            header { text-align: center; margin-bottom: 60px; }
            h1 { font-size: 2.8rem; margin-bottom: 10px; background: linear-gradient(to right, var(--accent), #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .endpoint-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; margin-right: 10px; text-transform: uppercase; vertical-align: middle; }
            .get { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
            .post { background: rgba(52, 211, 153, 0.2); color: var(--success); }
            .tier { background: rgba(56, 189, 248, 0.1); color: var(--accent); border: 1px solid var(--accent); }
            .auth-badge { background: rgba(52, 211, 153, 0.1); color: var(--success); border: 1px solid var(--success); }
            .admin-badge { background: rgba(239, 68, 68, 0.1); color: var(--admin); border: 1px solid var(--admin); }
            .admin-section { border-top: 2px dashed var(--border); }
            
            /* Schema Table */
            .schema-title { font-size: 0.85rem; font-weight: 600; margin-top: 15px; color: var(--accent); letter-spacing: 1px; }
            .schema-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85rem; color: var(--muted); background: rgba(0,0,0,0.2); border-radius: 8px; overflow: hidden; }
            .schema-table th, .schema-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #2a3648; }
            .schema-table th { color: #fff; font-weight: 600; background: #2a3648; }
            .schema-table tr:last-child td { border-bottom: none; }
            .type { color: #fca5a5; font-family: monospace; }
            code { color: #93c5fd; background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
            
            /* Testing UI */
            .test-btn { color: var(--bg); border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: transform 0.1s; }
            .test-btn:active { transform: scale(0.98); }
            input, textarea { background: #0f172a; border: 1px solid var(--border); color: var(--text); padding: 10px; border-radius: 8px; width: 100%; box-sizing: border-box; font-family: monospace; }
            .response-area { background: var(--code-bg); color: var(--success); padding: 15px; border-radius: 8px; margin-top: 15px; font-family: monospace; font-size: 0.85rem; max-height: 300px; overflow-y: auto; display: none; white-space: pre-wrap; word-wrap: break-word;}
            .token-input { background: #1e293b; border: 2px solid var(--success); padding: 18px; margin-bottom: 40px; border-radius: 12px; font-size: 1rem; color: #fff; box-shadow: 0 0 15px rgba(52, 211, 153, 0.2); }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>🌶️ Open Problem Peppers API v5.0</h1>
                <p style="color: var(--muted); font-size: 1.1rem;">Omni-Schema Multi-Table Support Active.</p>
                <div style="margin-top: 30px;">
                    <input type="text" id="user-token" class="token-input" placeholder="💳 AUTHENTICATED USERS: Paste your JWT Bearer Token for complete database access...">
                </div>
            </header>

            ${cardsHtml}

            <footer style="text-align: center; color: var(--muted); margin-top: 60px; font-size: 0.8rem; padding-bottom: 40px;">
                Deploy Ready Engine v5.0 | Dynamic Architecture | Powered by Node.js & Supabase
            </footer>
        </div>

        <script>
            async function runTest(method, endpoint, resultId, queryId = null, bodyId = null) {
                const resArea = document.getElementById(resultId);
                const token = document.getElementById('user-token').value;
                resArea.style.display = 'block'; resArea.innerText = 'Connecting via server...';
                
                try {
                    let url = endpoint;
                    if (method === 'GET' && queryId) {
                        const qVal = document.getElementById(queryId).value;
                        if (qVal) url += '?' + qVal; // primitive query string pass
                    }

                    const options = {
                        method: method,
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': token ? 'Bearer ' + token : '' 
                        }
                    };
                    
                    if (method === 'POST' && bodyId) options.body = document.getElementById(bodyId).value;
                    
                    const response = await fetch(url, options);
                    const data = await response.json();
                    resArea.innerText = JSON.stringify(data, null, 2);
                } catch (err) { resArea.innerText = 'SERVER_ERROR: ' + err.message; }
            }
        </script>
    </body>
    </html>
  `);
});

// Use 0.0.0.0 for deployment to external environments (Vercel/Render/Heroku/Railway)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[DEPLOYMENT READY v5.0] Backend online at http://0.0.0.0:${PORT}`);
});
