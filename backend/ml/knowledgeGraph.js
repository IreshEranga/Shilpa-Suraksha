/**
 * Advanced Knowledge Graph Engine (GNN-inspired approach)
 * Maps relationships between concepts to identify foundational gaps.
 */

const knowledgeMap = {
  "Fractions": ["Division", "Multiplication"],
  "Division": ["Multiplication", "Subtraction"],
  "Multiplication": ["Addition", "Numbers and Counting"],
  "Area and Perimeter": ["Multiplication", "Addition", "Geometry"],
  "Decimals": ["Fractions", "Place Value"],
  "Percentages": ["Fractions", "Decimals", "Multiplication"],
  "Word Problems": ["Reading Comprehension", "Addition", "Subtraction"],
  "Geometry": ["හැඩතල (Shapes)"],
  "Water Cycle": ["Matter", "Environment"],
  "Pollution": ["Environment", "Conservation"],
  "Reading Comprehension": ["Grammar - Sentences", "Vocabulary"],
  "Essay Writing": ["Grammar - Sentences", "Spelling", "Vocabulary"],
  "Grammar - Sentences": ["Grammar - Nouns", "Grammar - Verbs", "Action Words (Verbs)"],
  "භාග": ["බෙදීම", "ගුණ කිරීම"],
  "දශම": ["භාග", "බෙදීම"],
  "ප්‍රතිශත": ["දශම", "භාග"],
  "වර්ගඵලය": ["ගුණ කිරීම"]
};

// Traverse the graph to find prerequisite knowledge
const getPrerequisiteConcepts = (weakSection) => {
  const normalized = weakSection.toLowerCase().trim();
  for (const [topic, prerequisites] of Object.entries(knowledgeMap)) {
    if (normalized.includes(topic.toLowerCase()) || topic.toLowerCase().includes(normalized)) {
      return prerequisites;
    }
  }
  return null; // No direct prerequisites mapped
};

module.exports = { getPrerequisiteConcepts };