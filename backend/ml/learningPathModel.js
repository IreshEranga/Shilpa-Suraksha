const db = require('../config/database');
const natural = require('natural');
const fs = require('fs');
const path = require('path');
const { getPrerequisiteConcepts } = require('./knowledgeGraph');

const TfIdf = natural.TfIdf;
const MODEL_DIR = path.join(__dirname, '../../models/learning-path-model');
const MODEL_PATH = path.join(MODEL_DIR, 'model.json');
const TRAINING_DATA_PATH = path.join(__dirname, 'learningPathTrainingData.json');

let cachedModel = null;
let cachedModelMtime = 0;

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const toTokens = (text) => { const tokens = (text || '').toString().toLowerCase().match(/[\p{L}\p{N}]+/gu); return tokens ? tokens.filter(Boolean) : []; };
const safeJsonRead = (filePath) => { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; } };

const loadTrainedModel = () => {
  try {
    if (!fs.existsSync(MODEL_PATH)) return null;
    const stat = fs.statSync(MODEL_PATH);
    if (cachedModel && cachedModelMtime === stat.mtimeMs) return cachedModel;
    const model = safeJsonRead(MODEL_PATH);
    if (!model || !model.idf || !Array.isArray(model.docs)) return null;
    cachedModel = model; cachedModelMtime = stat.mtimeMs;
    return model;
  } catch { return null; }
};

const buildQueryVector = (tokens, idf) => {
  const tf = Object.create(null); const total = tokens.length || 1;
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const vec = Object.create(null); let norm = 0;
  for (const [t, c] of Object.entries(tf)) { const w = (c / total) * (idf[t] || 0); if (w === 0) continue; vec[t] = w; norm += w * w; }
  return { vec, norm: Math.sqrt(norm) || 1 };
};

const cosineSimilarity = (aVec, aNorm, bVec, bNorm) => {
  let dot = 0; const aKeys = Object.keys(aVec); const bKeys = Object.keys(bVec);
  const iterA = aKeys.length <= bKeys.length; const keys = iterA ? aKeys : bKeys;
  const x = iterA ? aVec : bVec; const y = iterA ? bVec : aVec;
  for (const k of keys) { const xv = x[k]; const yv = y[k]; if (xv && yv) dot += xv * yv; }
  return dot / ((aNorm || 1) * (bNorm || 1));
};

const fetchResourcesByTopic = async (subject, querySection, gradeLevel, limit = 5, model) => {
  const subjectNorm = (subject || '').toString().toLowerCase().trim();
  const sectionNorm = (querySection || '').toString().toLowerCase().trim();
  const queryTokens = toTokens(`${sectionNorm} ${sectionNorm} ${subjectNorm}`);
  const { vec: qVec, norm: qNorm } = buildQueryVector(queryTokens, model.idf);

  const candidates = model.docs.filter(d => {
    const isSubjMatch = !subjectNorm || (d.subject || '').toString().toLowerCase().trim() === subjectNorm;
    const isGradeMatch = !gradeLevel || !d.grade_level || d.grade_level === gradeLevel || d.grade_level === (gradeLevel - 1);
    return isSubjMatch && isGradeMatch;
  });

  const scored = candidates.map(d => {
    let score = cosineSimilarity(qVec, qNorm, d.vector || {}, d.norm || 1);
    if (d.section && d.section.toLowerCase().includes(sectionNorm)) score += 0.5;
    return { id: d.id, score };
  }).filter(d => d.score > 0.1).sort((a, b) => b.score - a.score).slice(0, limit);

  if (scored.length > 0) {
    const ids = scored.map(s => s.id).filter(Boolean);
    const resourcesRes = await db.query('SELECT * FROM sinhala_resources WHERE id = ANY($1::int[])', [ids]);
    const byId = new Map(resourcesRes.rows.map(r => [r.id, r]));
    return scored.map(s => byId.get(s.id)).filter(Boolean);
  }
  return [];
};

const generateLearningPath = async (data) => {
  try {
    const { subject, section, gradeLevel, riskLevel } = data;
    const model = loadTrainedModel();
    let finalResources = [];
    let prerequisitesMapped = [];
    const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';

    if (model) {
      // 1. Fetch Main Topic Resources
      finalResources = await fetchResourcesByTopic(subject, section, gradeLevel, 8, model);

      // 2. Knowledge Graph Injection (GNN Concept)
      if (isHighRisk) {
        const preReqs = getPrerequisiteConcepts(section) || [];
        for (const req of preReqs) {
          const reqResources = await fetchResourcesByTopic(subject, req, gradeLevel - 1, 2, model);
          if (reqResources.length > 0) {
            prerequisitesMapped.push(req);
            reqResources.forEach(r => r.is_prerequisite = true);
            finalResources = [...reqResources, ...finalResources];
          }
        }
      }

      if (finalResources.length > 0) {
        return { 
          content: generatePathContent(finalResources, subject, section, gradeLevel, prerequisitesMapped), 
          resources: finalResources,
          prerequisites: prerequisitesMapped
        };
      }
    }
    return generateTemplatePath(subject, section, gradeLevel);
  } catch (error) { return generateTemplatePath(data.subject, data.section, data.gradeLevel); }
};

const generatePathContent = (resources, subject, section, gradeLevel, prerequisitesMapped) => {
  const gradeText = gradeLevel ? `${gradeLevel} ශ්‍රේණිය` : 'පොදු';
  let content = `📚 [ ${gradeText} | විෂය: ${subject} | කොටස: ${section} ] සඳහා විශේෂිත ඉගෙනුම් මාර්ගය\n`;
  
  if (prerequisitesMapped && prerequisitesMapped.length > 0) {
    content += `\n🧠 Knowledge Graph AI: පදනම් දුර්වලතා හඳුනාගෙන ${prerequisitesMapped.join(', ')} යන පූර්ව-පාඩම් ද එක් කර ඇත.\n\n`;
  } else {
    content += `\n`;
  }

  const preReqLessons = resources.filter(r => r.is_prerequisite);
  const lessons = resources.filter(r => r.resource_type === 'lesson' && !r.is_prerequisite);
  const examples = resources.filter(r => r.resource_type === 'example');
  const exercises = resources.filter(r => r.resource_type === 'exercise');

  if (preReqLessons.length > 0) {
    content += `🧩 0. පූර්ව අවශ්‍යතා (Foundational Lessons):\n`;
    preReqLessons.forEach((r) => { content += `  • ${r.content}\n`; });
    content += `\n`;
  }
  if (lessons.length > 0) {
    content += `📖 1. ප්‍රධාන පාඩම් (Main Lessons):\n`;
    lessons.forEach((r) => { content += `  • ${r.content}\n`; });
    content += `\n`;
  }
  if (examples.length > 0) {
    content += `💡 2. උදාහරණ (Examples):\n`;
    examples.forEach((r) => { content += `  • ${r.content}\n`; });
    content += `\n`;
  }
  if (exercises.length > 0) {
    content += `✍️ 3. ව්‍යායාම (Exercises):\n`;
    exercises.forEach((r) => { content += `  • ${r.content}\n`; });
    content += `\n`;
  }
  return content.trim();
};

const generateTemplatePath = (subject, section, gradeLevel) => {
  const content = `📚 [ ${gradeLevel} ශ්‍රේණිය | විෂය: ${subject} | කොටස: ${section} ]\n\nසටහන: දත්ත ගබඩාවේ නිශ්චිත සම්පත් නැත.`;
  return { content, resources: [], prerequisites: [] };
};

const loadSinhalaResources = async () => {
  try {
    const trainingData = safeJsonRead(TRAINING_DATA_PATH);
    const sampleResources = Array.isArray(trainingData?.resources) ? trainingData.resources : [];
    for (const resource of sampleResources) {
      const existing = await db.query(`SELECT id FROM sinhala_resources WHERE subject = $1 AND section = $2 AND content = $3`, [resource.subject, resource.section, resource.content]);
      if (existing.rows.length === 0) {
        await db.query(`INSERT INTO sinhala_resources (subject, section, content, resource_type, grade_level) VALUES ($1, $2, $3, $4, $5)`, [resource.subject, resource.section, resource.content, resource.resource_type, resource.grade_level]);
      }
    }
  } catch (error) { console.error('Error loading Sinhala resources:', error); }
};

const trainLearningPathModel = async () => {
  const res = await db.query('SELECT id, subject, section, content, grade_level FROM sinhala_resources');
  const rows = res.rows || [];
  if (rows.length === 0) return { trained: false, reason: 'no_resources' };

  const N = rows.length; const df = Object.create(null);
  const docsTokens = rows.map(r => {
    const tokens = toTokens(`${r.subject} ${r.section} ${r.content}`);
    const unique = new Set(tokens);
    for (const t of unique) df[t] = (df[t] || 0) + 1;
    return tokens;
  });

  const idf = Object.create(null);
  for (const [t, c] of Object.entries(df)) idf[t] = Math.log((N + 1) / (c + 1)) + 1;

  const docs = rows.map((r, i) => {
    const tokens = docsTokens[i]; const tf = Object.create(null);
    const total = tokens.length || 1;
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    const vector = Object.create(null); let norm = 0;
    for (const [t, c] of Object.entries(tf)) {
      const w = (c / total) * (idf[t] || 0);
      if (w === 0) continue;
      vector[t] = w; norm += w * w;
    }
    return { id: r.id, subject: r.subject, section: r.section, grade_level: r.grade_level, vector, norm: Math.sqrt(norm) || 1 };
  });

  ensureDir(MODEL_DIR);
  const model = { version: 1, createdAt: new Date().toISOString(), idf, docs };
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model));
  cachedModel = model; cachedModelMtime = fs.statSync(MODEL_PATH).mtimeMs;
  return { trained: true, docCount: docs.length };
};

module.exports = { generateLearningPath, loadSinhalaResources, trainLearningPathModel };