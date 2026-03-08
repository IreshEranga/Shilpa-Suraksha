// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const db = require('./config/database');
// const os = require('os');

// // Load environment variables
// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 5001;

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Routes
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/admin', require('./routes/admin'));
// app.use('/api/teachers', require('./routes/teachers'));
// app.use('/api/students', require('./routes/students'));
// app.use('/api/classes', require('./routes/classes'));
// app.use('/api/academic', require('./routes/academic'));
// app.use('/api/attendance', require('./routes/attendance'));
// app.use('/api/weak-students', require('./routes/weakStudents'));
// app.use('/api/learning-paths', require('./routes/learningPaths'));
// app.use('/api/components', require('./routes/components'));
// app.use('/api/behavioral', require('./routes/behavioral'));
// app.use('/api/ml', require('./routes/ml'));
// app.use('/api/thresholds', require('./routes/thresholdsRoutes'));

// // Health check
// app.get('/api/health', (req, res) => {
//   res.json({ status: 'OK', message: 'Server is running' });
// });

// // Initialize database and start server
// db.init()
//   .then(() => {
//     app.listen(PORT, () => {
//       console.log(`Server running on port ${PORT}`);
//     });
//   })
//   .catch((error) => {
//     console.error('Failed to initialize database:', error);
//     process.exit(1);
//   });

// module.exports = app;

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/database');
const os = require('os');
const helmet = require('helmet');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// ================= MIDDLEWARE =================
app.use(helmet()); // Security headers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // Logging

// ================= ROUTES =================
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
app.use('/api/thresholds', require('./routes/thresholdsRoutes'));


// ================= HEALTH CHECK (LIVENESS) =================
app.get('/api/health', async (req, res) => {
  try {
    let dbStatus = 'Connected';

    try {
      await db.query('SELECT 1');
    } catch (err) {
      dbStatus = 'Disconnected';
    }

    res.status(200).json({
      status: dbStatus === 'Connected' ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      memoryUsage: process.memoryUsage(),
    });

  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message,
    });
  }
});




// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({
    status: 'ERROR',
    message: 'Route not found'
  });
});


// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error('Global Error:', err);

  res.status(err.status || 500).json({
    status: 'ERROR',
    message: err.message || 'Internal Server Error'
  });
});


// ================= GRACEFUL SHUTDOWN =================
const server = app.listen(PORT, async () => {
  try {
    await db.init();
    console.log(`🚀 Server running on port ${PORT}`);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;
