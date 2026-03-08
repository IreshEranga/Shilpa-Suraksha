const db = require('../config/database');
const natural = require('natural');
const TfIdf = natural.TfIdf;
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '../../models/learning-path-model');
const MODEL_PATH = path.join(MODEL_DIR, 'model.json');
const TRAINING_DATA_PATH = path.join(__dirname, 'learningPathTrainingData.json');

let cachedModel = null;
let cachedModelMtime = 0;

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const toTokens = (text) => {
  const s = (text || '').toString().toLowerCase();
  // Unicode-aware tokenization (Sinhala + Latin + numbers)
  const tokens = s.match(/[\p{L}\p{N}]+/gu);
  return tokens ? tokens.filter(Boolean) : [];
};

const safeJsonRead = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const loadTrainedModel = () => {
  try {
    if (!fs.existsSync(MODEL_PATH)) return null;
    const stat = fs.statSync(MODEL_PATH);
    if (cachedModel && cachedModelMtime === stat.mtimeMs) return cachedModel;

    const model = safeJsonRead(MODEL_PATH);
    if (!model || !model.idf || !Array.isArray(model.docs)) return null;

    cachedModel = model;
    cachedModelMtime = stat.mtimeMs;
    return model;
  } catch {
    return null;
  }
};

const buildQueryVector = (tokens, idf) => {
  const tf = Object.create(null);
  const total = tokens.length || 1;
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const vec = Object.create(null);
  let norm = 0;
  for (const [t, c] of Object.entries(tf)) {
    const w = (c / total) * (idf[t] || 0);
    if (w === 0) continue;
    vec[t] = w;
    norm += w * w;
  }
  return { vec, norm: Math.sqrt(norm) || 1 };
};

const cosineSimilarity = (aVec, aNorm, bVec, bNorm) => {
  let dot = 0;
  const aKeys = Object.keys(aVec);
  const bKeys = Object.keys(bVec);
  const iterA = aKeys.length <= bKeys.length;
  const keys = iterA ? aKeys : bKeys;
  const x = iterA ? aVec : bVec;
  const y = iterA ? bVec : aVec;
  for (const k of keys) {
    const xv = x[k];
    const yv = y[k];
    if (xv && yv) dot += xv * yv;
  }
  return dot / ((aNorm || 1) * (bNorm || 1));
};

// Generate learning path strictly based on subject, section, and grade
const generateLearningPath = async (data) => {
  try {
    const { subject, section, studentId, gradeLevel } = data;

    const model = loadTrainedModel();
    if (model) {
      const subjectNorm = (subject || '').toString().toLowerCase().trim();
      const sectionNorm = (section || '').toString().toLowerCase().trim();
      
      // Weight the section heavily in the query
      const queryTokens = toTokens(`${sectionNorm} ${sectionNorm} ${subjectNorm}`);
      const { vec: qVec, norm: qNorm } = buildQueryVector(queryTokens, model.idf);

      // STRICT FILTERING: Must match Subject AND (Exact Grade OR 1 Grade Lower for remedial)
      const candidates = model.docs.filter(d => {
        const isSubjMatch = !subjectNorm || (d.subject || '').toString().toLowerCase().trim() === subjectNorm;
        const isGradeMatch = !gradeLevel || !d.grade_level || d.grade_level === gradeLevel || d.grade_level === (gradeLevel - 1);
        return isSubjMatch && isGradeMatch;
      });

      const scored = candidates
        .map(d => {
          let score = cosineSimilarity(qVec, qNorm, d.vector || {}, d.norm || 1);
          // Bonus if the specific section is directly mentioned
          if (d.section && d.section.toLowerCase().includes(sectionNorm)) {
            score += 0.5;
          }
          return { id: d.id, score };
        })
        .filter(d => d.score > 0.1) // THRESHOLD: Drop resources that do not match the section at all
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (scored.length > 0) {
        const ids = scored.map(s => s.id).filter(Boolean);
        const resourcesRes = await db.query('SELECT * FROM sinhala_resources WHERE id = ANY($1::int[])', [ids]);

        const byId = new Map(resourcesRes.rows.map(r => [r.id, r]));
        const topResources = scored.map(s => byId.get(s.id)).filter(Boolean);

        if (topResources.length > 0) {
          const pathContent = generatePathContent(topResources, subject, section, gradeLevel);
          const additionalResources = topResources.map(r => ({
            id: r.id,
            type: r.resource_type,
            grade: r.grade_level,
            content: r.content.substring(0, 200) + '...'
          }));
          return { content: pathContent, resources: additionalResources };
        }
      }
    }

    // FALLBACK: Dynamic DB search with strict Grade & Section isolation
    let resourcesQuery = `SELECT * FROM sinhala_resources WHERE subject ILIKE $1`;
    const queryParams = [subject];
    let paramCount = 1;

    if (gradeLevel) {
      resourcesQuery += ` AND (grade_level = $${paramCount + 1} OR grade_level = $${paramCount + 2} OR grade_level IS NULL)`;
      queryParams.push(gradeLevel, gradeLevel - 1);
      paramCount += 2;
    }

    const allSubjectResources = await db.query(resourcesQuery, queryParams);
    let sinhalaResources = allSubjectResources.rows;

    if (sinhalaResources.length === 0) {
      return generateTemplatePath(subject, section, gradeLevel);
    }

    // Rank by Section Relevance using TF-IDF
    const tfidf = new TfIdf();
    const sectionKeywords = section.toLowerCase().split(/\s+/);
    
    sinhalaResources.forEach(resource => {
      tfidf.addDocument(`${resource.section} ${resource.section} ${resource.content}`.toLowerCase());
    });

    const scoredResources = sinhalaResources.map((resource, index) => {
      let score = 0;
      sectionKeywords.forEach(keyword => {
        tfidf.tfidf(keyword, index, (idf, count) => {
          score += (idf * count);
        });
      });
      
      // Bonus points for exact matches
      if (resource.section.toLowerCase().includes(section.toLowerCase())) score += 10;
      if (resource.grade_level === gradeLevel) score += 5;

      return { resource, score };
    });

    // THRESHOLD: Remove everything that scored 0 (doesn't match the weak section)
    const matchedResources = scoredResources.filter(sr => sr.score > 0).sort((a, b) => b.score - a.score);
    const topResources = matchedResources.slice(0, 5).map(sr => sr.resource);

    if (topResources.length === 0) {
      return generateTemplatePath(subject, section, gradeLevel);
    }

    const pathContent = generatePathContent(topResources, subject, section, gradeLevel);
    const additionalResources = topResources.map(r => ({
      id: r.id,
      type: r.resource_type,
      grade: r.grade_level,
      content: r.content.substring(0, 200) + '...'
    }));

    return { content: pathContent, resources: additionalResources };

  } catch (error) {
    console.error('Error generating learning path:', error);
    return generateTemplatePath(data.subject, data.section, data.gradeLevel);
  }
};

// Generate a fallback template path when no resources are found for the specific section and grade
const generatePathContent = (resources, subject, section, gradeLevel) => {
  const gradeText = gradeLevel ? `${gradeLevel} ශ්‍රේණිය` : 'පොදු';
  let content = `\n[ ${gradeText} | විෂය: ${subject} | කොටස: ${section} ] සඳහා විශේෂිත ඉගෙනුම් මාර්ගය\n\n`;
  content += `මෙම ඉගෙනුම් මාර්ගය ශිෂ්‍යයාගේ දුර්වලතා හඳුනාගෙන, ${section} කොටස සඳහාම විශේෂයෙන් සකස් කර ඇත.\n\n`;

  resources.forEach((resource, index) => {
    content += `${index + 1}. ${resource.resource_type === 'lesson' ? 'පාඩම' : resource.resource_type === 'exercise' ? 'ව්‍යායාම' : 'උදාහරණය'} (ශ්‍රේණිය ${resource.grade_level || 'N/A'})\n`;
    content += `${resource.content}\n\n`;
  });

  content += `\nඋපදෙස්:\n`;
  content += `1. ඉහත පාඩම් පිළිවෙලට හැදෑරීමට පටන් ගන්න\n`;
  content += `2. සෑම පාඩමකින් පසුව ව්‍යායාම කරන්න\n`;
  content += `3. දුෂ්කරතා ඇති විට ගුරුවරයාගෙන් උපකාර ලබා ගන්න\n`;

  return content;
};

// Generate a fallback template path when no resources are found for the specific section and grade
const generateTemplatePath = (subject, section, gradeLevel) => {
  const gradeText = gradeLevel ? `${gradeLevel} ශ්‍රේණිය` : 'පොදු';
  const content = `\n[ ${gradeText} | විෂය: ${subject} | කොටස: ${section} ] සඳහා විශේෂිත ඉගෙනුම් මාර්ගය\n\n` +
    `සටහන: මෙම නිශ්චිත කොටස සඳහා දත්ත ගබඩාවේ සම්පත් සොයාගත නොහැකි විය. කරුණාකර පහත පියවර අනුගමනය කරන්න:\n\n` +
    `1. ${section} හි මූලික සංකල්ප පෙළපොතෙන් හැදෑරීම\n` +
    `2. උදාහරණ සමඟ පුහුණුවීම\n` +
    `3. ව්‍යායාම කිරීම\n` +
    `4. පුනරීක්ෂණය සහ තහවුරු කිරීම\n\n` +
    `ගුරුවරයාගෙන් අමතර උපකාර ලබා ගන්න.`;

  return { content, resources: [] };
};

// Load Sinhala resources from PDF or other sources
const loadSinhalaResources = async () => {
  try {
    // Load training data from JSON (acts as our "learning path dataset")
    const trainingData = safeJsonRead(TRAINING_DATA_PATH);
    const sampleResources = Array.isArray(trainingData?.resources) ? trainingData.resources : [];

    // Insert sample resources if they don't exist
    for (const resource of sampleResources) {
      // Check if resource already exists
      const existing = await db.query(
        `SELECT id FROM sinhala_resources 
         WHERE subject = $1::VARCHAR AND section = $2::TEXT AND content = $3::TEXT`,
        [resource.subject, resource.section, resource.content]
      );

      if (existing.rows.length === 0) {
        await db.query(
          `INSERT INTO sinhala_resources (subject, section, content, resource_type, grade_level)
           VALUES ($1::VARCHAR(100), $2::TEXT, $3::TEXT, $4::VARCHAR(50), $5::INTEGER)`,
          [resource.subject, resource.section, resource.content, resource.resource_type, resource.grade_level]
        );
      }
    }

    console.log('Sinhala resources loaded');
  } catch (error) {
    console.error('Error loading Sinhala resources:', error);
  }
};

// Train a lightweight TF-IDF cosine similarity model over sinhala_resources and persist it.
const trainLearningPathModel = async () => {
  // Added grade_level to the training data export so the model can filter by it
  const res = await db.query('SELECT id, subject, section, content, grade_level FROM sinhala_resources');
  const rows = res.rows || [];
  if (rows.length === 0) {
    console.warn('No sinhala_resources found; skipping learning path model training.');
    return { trained: false, reason: 'no_resources' };
  }

  // Build document frequency
  const N = rows.length;
  const df = Object.create(null);
  const docsTokens = rows.map(r => {
    const tokens = toTokens(`${r.subject} ${r.section} ${r.content}`);
    const unique = new Set(tokens);
    for (const t of unique) df[t] = (df[t] || 0) + 1;
    return tokens;
  });

  const idf = Object.create(null);
  for (const [t, c] of Object.entries(df)) {
    idf[t] = Math.log((N + 1) / (c + 1)) + 1;
  }

  const docs = rows.map((r, i) => {
    const tokens = docsTokens[i];
    const tf = Object.create(null);
    const total = tokens.length || 1;
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

    const vector = Object.create(null);
    let norm = 0;
    for (const [t, c] of Object.entries(tf)) {
      const w = (c / total) * (idf[t] || 0);
      if (w === 0) continue;
      vector[t] = w;
      norm += w * w;
    }

    return {
      id: r.id,
      subject: r.subject,
      section: r.section,
      grade_level: r.grade_level, // Included in JSON model
      vector,
      norm: Math.sqrt(norm) || 1
    };
  });

  ensureDir(MODEL_DIR);
  const model = {
    version: 1,
    createdAt: new Date().toISOString(),
    idf,
    docs
  };
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model));

  // reset cache
  cachedModel = model;
  cachedModelMtime = fs.statSync(MODEL_PATH).mtimeMs;

  console.log(`Learning path model trained and saved: ${MODEL_PATH}`);
  return { trained: true, docCount: docs.length };
};

module.exports = {
  generateLearningPath,
  loadSinhalaResources,
  trainLearningPathModel
};