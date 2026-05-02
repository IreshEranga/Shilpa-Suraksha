require('dotenv').config();
const db = require('../config/database');
const { generateLearningPath } = require('./learningPathModel');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getPrerequisiteConcepts } = require('./knowledgeGraph');

// Initialize Gemini API
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const getEThaksalawaLink = (grade, subject) => {
  const g = parseInt(grade);
  const sub = (subject || '').toLowerCase();
  if (g === 1) {
    if (sub.includes('sinhala') || sub.includes('මව්බස')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=340';
    if (sub.includes('math') || sub.includes('ගණිතය')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=282';
    if (sub.includes('env') || sub.includes('පරිසරය') || sub.includes('sci')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=295';
    if (sub.includes('buddhism') || sub.includes('බුද්ධ')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=343';
    return 'https://e-thaksalawa.moe.gov.lk/lcms/course/index.php?categoryid=25';
  }
  if (g === 2) {
    if (sub.includes('sinhala') || sub.includes('මව්බස')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=287';
    if (sub.includes('math') || sub.includes('ගණිතය')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=280';
    if (sub.includes('env') || sub.includes('පරිසරය') || sub.includes('sci')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=285';
    if (sub.includes('buddhism') || sub.includes('බුද්ධ')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=300';
    return 'https://e-thaksalawa.moe.gov.lk/lcms/course/index.php?categoryid=26';
  }
  if (g === 3) {
    if (sub.includes('sinhala') || sub.includes('මව්බස')) return 'http://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=291';
    if (sub.includes('math') || sub.includes('ගණිතය')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=279';
    if (sub.includes('env') || sub.includes('පරිසරය') || sub.includes('sci')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=283';
    if (sub.includes('eng') || sub.includes('ඉංග්‍රීසි')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=298';
    return 'https://e-thaksalawa.moe.gov.lk/lcms/course/index.php?categoryid=27';
  }
  if (g === 4) {
    if (sub.includes('sinhala') || sub.includes('මව්බස')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=284';
    if (sub.includes('math') || sub.includes('ගණිතය')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=277';
    if (sub.includes('env') || sub.includes('පරිසරය') || sub.includes('sci')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=281';
    if (sub.includes('eng') || sub.includes('ඉංග්‍රීසි')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=286';
    return 'https://e-thaksalawa.moe.gov.lk/lcms/course/index.php?categoryid=28';
  }
  if (g === 5) {
    if (sub.includes('sinhala') || sub.includes('මව්බස')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=332';
    if (sub.includes('math') || sub.includes('ගණිතය')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=318';
    if (sub.includes('env') || sub.includes('පරිසරය') || sub.includes('sci')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=330';
    if (sub.includes('eng') || sub.includes('ඉංග්‍රීසි')) return 'https://e-thaksalawa.moe.gov.lk/lcms/course/view.php?id=333';
    return 'https://e-thaksalawa.moe.gov.lk/lcms/course/index.php?categoryid=43';
  }
  return 'https://e-thaksalawa.moe.gov.lk/';
};

const generatePersonalizedLearningPath = async (data) => {
  try {
    const { student_id, weak_subject, weak_section, risk_level, grade_level } = data;

    if (!student_id || !weak_subject || !weak_section) throw new Error('student_id, weak_subject, and weak_section are required');

    if (!genAI) {
      console.warn("⚠️ GEMINI_API_KEY IS MISSING! System is forced to use the Fallback Rules.");
    }

    // 1. GNN Knowledge Mapping
    const prerequisites = getPrerequisiteConcepts(weak_section);
    let graphInsight = "";
    if (prerequisites) {
      graphInsight = `Knowledge Graph detected that difficulties in ${weak_section} are often caused by gaps in foundational concepts like: ${prerequisites.join(', ')}. Include these in the path.`;
    }

    // 2. NLP TF-IDF Database Retrieval
    const dbResources = await generateLearningPath({
      subject: weak_subject, section: weak_section, studentId: student_id, gradeLevel: grade_level
    });

    const encodedSubject = encodeURIComponent(weak_subject);
    const encodedSection = encodeURIComponent(weak_section);
    const onlineResources = [
      { title: `Grade ${grade_level} ${weak_subject} on e-Thaksalawa`, url: getEThaksalawaLink(grade_level, weak_subject), platform: 'e-Thaksalawa' },
      { title: `Watch ${weak_section} Lessons`, url: `https://www.youtube.com/results?search_query=Grade+${grade_level}+${encodedSubject}+${encodedSection}+Sinhala`, platform: 'YouTube' }
    ];

    // 3. Enhanced Multimodal Generative AI
    if (genAI) {
      
      // Dynamic Language Logic
      const isEnglishSubject = weak_subject.toLowerCase().includes('english');
      const contentLanguage = isEnglishSubject ? 'English' : 'Sinhala';

      const prompt = `
        You are a highly advanced AI Educational Expert for Sri Lankan primary schools.
        Your target audience is the TEACHER, NOT the student. You are advising the teacher on how to help the student.
        
        Student Profile: Grade ${grade_level}, weak in ${weak_subject} (${weak_section}). Risk level: ${risk_level}.
        
        SYSTEM DIRECTIVES:
        1. Knowledge Graph Analysis: ${graphInsight}
        2. Available Database Materials: ${JSON.stringify(dbResources.resources)}

        CRITICAL RULES: 
        - NEVER mention database IDs (like ID 16, ID 86), source materials, or technical references in the text. Speak naturally to the teacher.
        - The Subject is ${weak_subject}. Therefore, the Micro-Quiz questions, options, answers, and the Activity Titles MUST be written in ${contentLanguage}.
        - The instructions addressing the teacher (ai_intro, prerequisites_note, and activity descriptions) MUST be in Sinhala.

        TASK: Generate a STRICT JSON object. DO NOT wrap the JSON in Markdown backticks. DO NOT add any text outside the curly braces.
        It must contain exactly 5 distinct activities using Sri Lankan cultural examples.
        It must contain exactly 6 MCQ Questions for the micro_quiz in ${contentLanguage}.

        Format strictly as:
        {
          "ai_intro": "Encouraging introductory paragraph in Sinhala ADDRESSED TO THE TEACHER (Start with: 'ආදරණීය ගුරුතුමනි/ගුරුතුමියනි, මෙම සිසුවාට...').",
          "prerequisites_note": "A short note in Sinhala advising the TEACHER to review foundational concepts with the student first.",
          "activities": [ 
            { "title": "Activity Name (in ${contentLanguage})", "type": "Visual / Game / Written / Practical", "description": "Instructions FOR THE TEACHER in Sinhala on how to conduct this activity.", "estimatedTime": "15 mins" } 
          ],
          "micro_quiz": [
            { "question": "Question in ${contentLanguage}?", "options": ["A", "B", "C", "D"], "answer": "Correct Option" }
          ],
          "strategies": [ { "title": "Strategy Name (in Sinhala)", "description": "Teaching strategy for the teacher in Sinhala" } ]
        }
      `;

      let aiResponseText = null;
      
      const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
        "gemini-pro"
      ];

      for (const modelName of modelsToTry) {
        try {
          console.log(`[AI Engine] Attempting to connect using model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          aiResponseText = result.response.text();
          console.log(`[AI Engine] ✅ Success with ${modelName}!`);
          break; 
        } catch (err) {
          console.warn(`[AI Engine] ⚠️ Model ${modelName} failed. Trying next...`);
        }
      }

      if (aiResponseText) {
        try {
          const firstBraceIndex = aiResponseText.indexOf('{');
          const lastBraceIndex = aiResponseText.lastIndexOf('}');
          
          if (firstBraceIndex === -1 || lastBraceIndex === -1) {
              throw new Error("Gemini returned an invalid JSON format.");
          }
          
          const cleanJsonString = aiResponseText.substring(firstBraceIndex, lastBraceIndex + 1);
          const aiData = JSON.parse(cleanJsonString);

          const combinedContent = `${aiData.ai_intro}\n\n${aiData.prerequisites_note ? `💡 පදනම් සටහන: ${aiData.prerequisites_note}\n\n` : ''}${dbResources.content}`;

          return {
            student_id, subject: weak_subject, section: weak_section, grade_level,
            content: combinedContent,
            resources: {
              db_materials: dbResources.resources,
              activities: aiData.activities,
              micro_quiz: aiData.micro_quiz,
              online_resources: onlineResources,
              graph_prerequisites: prerequisites
            },
            activities: aiData.activities,
            strategies: aiData.strategies,
            estimatedDuration: "2-4 weeks"
          };
        } catch (jsonErr) {
          console.error("❌ Failed to parse Gemini JSON:", jsonErr.message);
        }
      }
    }

    // 4. Fallback System
    console.log("⚠️ Using Rule-Based Fallback System");
    const activities = [
      { title: `Basic Concepts (${grade_level})`, type: "Written", description: `${weak_section} කොටස සිසුවාට පැහැදිලි කරන්න.`, estimatedTime: '30 mins' },
      { title: `Practical Training`, type: "Practical", description: `පන්ති කාමරයේ ඇති දේවල් යොදාගෙන සිසුවාට ප්‍රායෝගිකව උගන්වන්න.`, estimatedTime: '20 mins' }
    ];
    return {
      student_id, subject: weak_subject, section: weak_section, grade_level,
      content: `ආදරණීය ගුරුතුමනි/ගුරුතුමියනි, මෙම සිසුවාට ${weak_subject} විෂයයේ ${weak_section} කොටස ඉගැන්වීම සඳහා පහත පියවර අනුගමනය කරන්න.\n\n${graphInsight}\n\n${dbResources.content}`,
      resources: { db_materials: dbResources.resources, activities: activities, micro_quiz: [], online_resources: onlineResources, graph_prerequisites: prerequisites },
      activities: activities, strategies: [{ title: 'මාර්ගගත අධ්‍යයනය', description: 'YouTube සහ e-Thaksalawa සබැඳි භාවිතා කරන්න.' }], estimatedDuration: "2-4 weeks"
    };

  } catch (error) { throw error; }
};

module.exports = { generatePersonalizedLearningPath };