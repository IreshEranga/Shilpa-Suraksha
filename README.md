# Shilpa-Suraksha 🎓🇱🇰  

**Academic Risk Prediction & Student Support System for Sri Lankan Primary Schools**

ShilpaSuraksha is a data-driven academic risk prediction and student support platform designed specifically for Sri Lankan primary schools. The system identifies at-risk students early using **attendance**, **behaviour**, **exam performance**, and **emotional well-being** indicators, and supports schools with **student clustering** and **personalized learning roadmaps**.

---

## 🚀 Key Objectives

- Early identification of academically at-risk students  
- Holistic analysis beyond marks (behaviour + emotional well-being)  
- Data-informed interventions via AI-generated teaching strategies 
- Fair, explainable, and scalable student analytics  

---

## 🧠 Core Features

### 1. Academic Risk Prediction

Predicts student academic risk using machine learning models based on:

- **Attendance records**
- **Behavioural indicators**
- **Exam and continuous assessment results**

Output:

- Risk score (Low / Medium / High)
- Probability-based predictions
- Explainable feature contributions

---

### 2. Attendance Analysis

- Daily and monthly attendance tracking  
- Detection of chronic absenteeism  
- Attendance trend impact on academic risk  

Key Metrics:

- Attendance percentage
- Consecutive absences
- Attendance deviation from class average  

---

### 3. Behaviour Monitoring

Behavioural data is collected from teachers and school records:

- Classroom participation
- Discipline records
- Homework submission patterns
- Teacher observations

Used to:

- Detect disengagement
- Correlate behaviour with academic performance

---

### 4. Exam Performance Analysis

- Subject-wise and term-wise performance tracking  
- Score normalization across subjects  
- Performance trend analysis  

Supports:

- Weak subject identification  
- Progress monitoring over time  

---

### 5. Emotional Well-Being Assessment

A non-clinical, school-friendly emotional monitoring module:

- Simple questionnaires
- Teacher observations
- Student self-reflections (age-appropriate)

Indicators include:

- Stress levels
- Motivation
- Social engagement
- Emotional stability trends  

⚠️ *This module supports early awareness, not medical diagnosis.*

---

### 6. Student Clustering

Unsupervised learning to group students based on similarities in:

- Academic performance
- Attendance patterns
- Behaviour and emotional indicators  

Techniques:

- K-Means / Hierarchical Clustering  

Use Cases:

- Group-based interventions  
- Peer learning groups  
- Resource allocation  

---

### 7. Personalized Learning Roadmap Generation

A state-of-the-art "AI Co-Teacher" module that converts risk data into actionable education. Automatically generates improvement roadmaps for each student.

- **Root-Cause Diagnosis:** Uses Knowledge Graphs to find prerequisite gaps (e.g., failing 'Decimals' due to 'Place Value' weakness).
- **Localized Lesson Planning:** Generates 5-step teaching activities grounded in the Sri Lankan syllabus.
- **Automated Micro-Assessments:** Creates 6-question MCQ quizzes tailored to the student's current learning path.
- **Bilingual Adaptation:** Automatically detects and generates content in Sinhala or English based on the subject.

---

### 6. Probabilistic Progress Tracking
- **Bayesian Analytics:** Moves beyond simple averages to predict a student's future scores using mathematical momentum and variance.
- **Trend Visualization:** Provides teachers with a confidence-weighted forecast of student improvement.

---

## 🏗️ System Architecture (High Level)

- **Frontend**: React-based dashboard for teachers & administrators. 
- **Backend**: Node.js & Express RESTful APIs.  
- **ML Layer**: 
  - Supervised/Unsupervised models for Risk & Clustering.
  - **Custom NLP Model:** TF-IDF & Cosine Similarity for resource retrieval.
  - **Knowledge Graph:** Directed Acyclic Graph (DAG) for prerequisite mapping.
  - **LLM Integration:** Google Gemini (RAG architecture) for content synthesis.
- **Database**: PostgreSQL (Student records, behavior data, and localized educational resources).

---

## 🧪 Machine Learning Overview

- Supervised models for risk prediction  
- Unsupervised models for clustering  
- Feature engineering from raw school data  
- Model evaluation using accuracy, precision, recall, and F1-score
- Natural Language Processing (NLP): Custom-trained TF-IDF vectorizer for localized content matching.
- Retrieval-Augmented Generation (RAG): Grounding Large Language Models in local syllabus data to prevent hallucinations.
- Bayesian Networks: Used for probabilistic time-series forecasting of student performance.
- Graph Theory: Knowledge Mapping for prerequisite discovery. 

---

## 📊 Target Users

- Primary school teachers  
- School administrators  
- Educational authorities  
- Academic counselors  

---

## 🇱🇰 Localized for Sri Lanka

- Aligned with Sri Lankan primary education context  
- Supports local grading systems  
- Designed for real-world school data constraints
- Cultural Grounding: AI generates lesson examples using local contexts (e.g., village markets, local geography).
- Syllabus Alignment: RAG ensures all AI suggestions follow the National Institute of Education (NIE) guidelines.
- Bilingual Interface: Supports both Sinhala and English pedagogical requirements.

---

## 🔐 Data Privacy & Ethics

- Student data confidentiality maintained  
- Role-based access control (RBAC)  
- No medical diagnosis or stigmatization  
- Decision-support system, not a replacement for teachers  

---

## 🛣️ Future Enhancements

- Parent portal integration  
- Mobile application support  
- Advanced explainable AI dashboards  
- Longitudinal student tracking across grades  

---

## 🤝 Contribution

Contributions are welcome to improve:

- Model accuracy  
- Feature engineering  
- UI/UX  
- Localization and accessibility  

---

## 📄 License

This project is developed for academic and educational purposes.

---

**ShilpaSuraksha – Protecting Education, Empowering Futures.**
