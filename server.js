import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Storage for uploaded videos (in /uploads)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const id = uuidv4().slice(0,8);
    const ext = path.extname(file.originalname || '.mp4');
    cb(null, `${Date.now()}_${id}${ext}`);
  }
});
const upload = multer({ storage });

// --- Mock "pro players" dataset with feature vectors (normalized 0..1) ---
const pros = JSON.parse(fs.readFileSync(path.join(__dirname, 'pros.json'), 'utf8'));

// Utility: cosine similarity between two equal-length arrays
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) + 1e-9;
  return dot / denom;
}

// Very simple feature extractor placeholder: derives features from attributes and a few heuristics.
// In production, this would run a real model (pose, speed, touches, etc.).
function extractFeatures({ height_cm, dominant_foot, position, age, pace=0.6, dribbling=0.6, passing=0.6, shooting=0.6 }) {
  // Normalize/encode categorical inputs
  const footR = dominant_foot === 'right' ? 1 : 0;
  const footL = dominant_foot === 'left' ? 1 : 0;
  const footTwo = dominant_foot === 'two-footed' ? 1 : 0;
  const posMap = ['winger','striker','midfielder','defender','goalkeeper'];
  const posVec = posMap.map(p => (p === position ? 1 : 0));
  const h = Math.min(Math.max((height_cm - 150) / 50, 0), 1); // 150–200cm -> 0..1
  const a = Math.min(Math.max((age - 12) / 20, 0), 1);        // 12–32 -> 0..1

  // Combine into a simple vector (length 5 + 3 + 5 + 4 = 17)
  const feats = [
    h, a, pace, dribbling, passing, shooting,
    footR, footL, footTwo,
    ...posVec
  ];
  return feats;
}

// Mock analyzer that pretends to compute metrics from the video.
// Replace this with a real pipeline later.
function analyzeVideoMock() {
  // random but stable-looking numbers
  const kneeFlex = Math.round(30 + Math.random()*60); // 30–90°
  const bodyLean = Math.round(5 + Math.random()*25);  // 5–30°
  const sprintTempo = Math.round(140 + Math.random()*60); // steps/min
  const touches = Math.round(10 + Math.random()*25);
  return { kneeFlex, bodyLean, sprintTempo, touches };
}

// Turn metrics into coaching suggestions
function suggestionsFromMetrics(m) {
  const out = [];
  if (m.kneeFlex < 50) out.push("Increase knee flexion during acceleration to improve power (add wall-sit holds and mini-hurdles).");
  if (m.bodyLean < 10) out.push("Add forward body-lean on first 2–3 steps; try 'lean & go' resisted sprints.");
  if (m.sprintTempo < 160) out.push("Improve step cadence with 10m fast-feet ladders and 5x10m accelerations.");
  if (m.touches < 15) out.push("Raise ball-contact frequency; 3x2min tight touches and V-pulls.");
  if (out.length === 0) out.push("Great base mechanics—progress to position-specific drills and resisted sprints.");
  return out;
}

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Analyze endpoint: expects multipart/form-data with fields: video(file), attributes(json string)
app.post('/analyze', upload.single('video'), async (req, res) => {
  try {
    const attrRaw = req.body.attributes;
    if (!attrRaw) return res.status(400).json({ error: 'Missing attributes' });
    const attrs = JSON.parse(attrRaw);

    // 1) Extract features from attributes (later: + video metrics too)
    const feats = extractFeatures(attrs);

    // 2) Mock video analysis (replace with real model)
    const metrics = analyzeVideoMock();

    // 3) Build player vector combining attrs + scaled metrics (placeholder)
    const metricVec = [
      Math.min(metrics.kneeFlex/120,1),
      Math.min(metrics.bodyLean/45,1),
      Math.min(metrics.sprintTempo/220,1),
      Math.min(metrics.touches/60,1)
    ];
    const playerVec = feats.concat(metricVec);

    // 4) Compute similarity to pros
    const ranked = pros.map(p => {
      const sim = cosineSim(playerVec, p.features);
      return { name: p.name, position: p.position, club: p.club, similarity: sim };
    }).sort((a,b) => b.similarity - a.similarity);

    const top = ranked.slice(0, 5);

    // 5) Coaching suggestions
    const suggestions = suggestionsFromMetrics(metrics);

    // 6) Save a minimal "session" record to disk (for demo)
    const id = uuidv4().slice(0,8);
    const record = {
      id,
      created_at: new Date().toISOString(),
      attrs: attrs,
      metrics,
      similar_players: top
    };
    const storePath = path.join(__dirname, 'sessions');
    if (!fs.existsSync(storePath)) fs.mkdirSync(storePath);
    fs.writeFileSync(path.join(storePath, `${id}.json`), JSON.stringify(record, null, 2));

    res.json({
      session_id: id,
      metrics,
      suggestions,
      similar_players: top
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to analyze' });
  }
});

// Simple GET to retrieve a past session
app.get('/sessions/:id', (req, res) => {
  const p = path.join(__dirname, 'sessions', `${req.params.id}.json`);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  const data = JSON.parse(fs.readFileSync(p,'utf8'));
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('AI Soccer backend running on port', PORT);
});
