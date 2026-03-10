-- Create database schema for primary school teacher system

-- Schools table
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100) UNIQUE NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    principal_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- School Administrators table
CREATE TABLE IF NOT EXISTS school_administrators (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teachers table (updated)
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'teacher',
    credentials_sent BOOLEAN DEFAULT FALSE,
    temp_password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    grade INTEGER NOT NULL,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    student_id VARCHAR(50) UNIQUE NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    date_of_birth DATE,
    gender VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Academic records table
CREATE TABLE IF NOT EXISTS academic_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    score DECIMAL(5,2),
    max_score DECIMAL(5,2) DEFAULT 100,
    exam_type VARCHAR(50),
    exam_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, date)
);

-- Weak students identification table
CREATE TABLE IF NOT EXISTS weak_students (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    weak_subject VARCHAR(100),
    weak_section TEXT,
    identified_by_model VARCHAR(50), -- 'academic', 'handwriting', 'both'
    confidence_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, teacher_id)
);

-- Learning paths table
CREATE TABLE IF NOT EXISTS learning_paths (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    weak_student_id INTEGER REFERENCES weak_students(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    section TEXT NOT NULL,
    path_content TEXT NOT NULL, -- Sinhala content for learning path
    resources JSONB, -- Additional resources
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Handwriting/drawing analysis table
CREATE TABLE IF NOT EXISTS handwriting_analysis (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    image_path VARCHAR(500),
    emotion_detected VARCHAR(50),
    confidence_score DECIMAL(5,2),
    analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sinhala resources table
CREATE TABLE IF NOT EXISTS sinhala_resources (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(100) NOT NULL,
    section TEXT NOT NULL,
    content TEXT NOT NULL,
    resource_type VARCHAR(50), -- 'lesson', 'exercise', 'example'
    grade_level INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Behavioral records table
CREATE TABLE IF NOT EXISTS behavioral_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id),
    observation_date DATE NOT NULL,
    behavior_type VARCHAR(50) CHECK (behavior_type IN ('positive', 'negative', 'neutral')),
    description TEXT,
    category VARCHAR(100),
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student clusters table (for Component 4)
CREATE TABLE IF NOT EXISTS student_clusters (
    id SERIAL PRIMARY KEY,
    cluster_name VARCHAR(100),
    cluster_type VARCHAR(50) CHECK (cluster_type IN ('academic', 'behavioral', 'combined')),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student cluster assignments
CREATE TABLE IF NOT EXISTS student_cluster_assignments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES student_clusters(id) ON DELETE CASCADE,
    confidence_score DECIMAL(5,2),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, cluster_id)
);

-- Intervention history
CREATE TABLE IF NOT EXISTS intervention_history (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    cluster_id INTEGER REFERENCES student_clusters(id),
    intervention_type VARCHAR(50) CHECK (intervention_type IN ('individual', 'group')),
    activity_description TEXT,
    source_suggestion JSONB,
    assigned_by INTEGER,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    effectiveness_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Progress tracking
CREATE TABLE IF NOT EXISTS progress_tracking (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    learning_path_id INTEGER REFERENCES learning_paths(id),
    assignment_result DECIMAL(5,2),
    task_completed BOOLEAN DEFAULT FALSE,
    assessment_score DECIMAL(5,2),
    improvement_trend VARCHAR(20) CHECK (improvement_trend IN ('improving', 'stable', 'declining')),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- At-risk students (Guidance Page)
CREATE TABLE IF NOT EXISTS at_risk_students (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    risk_type VARCHAR(50) CHECK (risk_type IN ('academic', 'behavioral', 'emotional', 'combined')),
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    identified_by VARCHAR(50) CHECK (identified_by IN ('early_warning', 'emotion_analysis', 'both')),
    confidence_score DECIMAL(5,2),
    risk_factors JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id)
);

-- Alter existing tables to add new columns (for existing databases)
-- These will fail gracefully if columns already exist
-- Note: IF NOT EXISTS for ALTER TABLE ADD COLUMN requires PostgreSQL 9.6+
-- For older versions, these will show warnings but won't break
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='school_id') THEN
        ALTER TABLE teachers ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='role') THEN
        ALTER TABLE teachers ADD COLUMN role VARCHAR(50) DEFAULT 'teacher';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='credentials_sent') THEN
        ALTER TABLE teachers ADD COLUMN credentials_sent BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='temp_password') THEN
        ALTER TABLE teachers ADD COLUMN temp_password VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='email_verified') THEN
        ALTER TABLE teachers ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='email_verification_token') THEN
        ALTER TABLE teachers ADD COLUMN email_verification_token VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='credentials_sent_at') THEN
        ALTER TABLE teachers ADD COLUMN credentials_sent_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='last_login_at') THEN
        ALTER TABLE teachers ADD COLUMN last_login_at TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intervention_history' AND column_name='source_suggestion') THEN
        ALTER TABLE intervention_history ADD COLUMN source_suggestion JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intervention_history' AND column_name='assigned_by') THEN
        ALTER TABLE intervention_history ADD COLUMN assigned_by INTEGER;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if columns already exist or other issues
    NULL;
END $$;

-- Create indexes for better performance (after columns are added)
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_academic_student ON academic_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_weak_students_student ON weak_students(student_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_student ON learning_paths(student_id);
CREATE INDEX IF NOT EXISTS idx_sinhala_resources_subject ON sinhala_resources(subject);
-- Only create index if school_id column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teachers' AND column_name='school_id') THEN
        CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_behavioral_student ON behavioral_records(student_id);
CREATE INDEX IF NOT EXISTS idx_cluster_assignments_student ON student_cluster_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_at_risk_students_student ON at_risk_students(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_tracking_student ON progress_tracking(student_id);

