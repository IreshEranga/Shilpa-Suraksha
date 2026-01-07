const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/database');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/students', require('./routes/students'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/academic', require('./routes/academic'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/weak-students', require('./routes/weakStudents'));
app.use('/api/learning-paths', require('./routes/learningPaths'));
app.use('/api/components', require('./routes/components'));
app.use('/api/behavioral', require('./routes/behavioral'));
app.use('/api/ml', require('./routes/ml'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Initialize database and start server
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });

module.exports = app;

