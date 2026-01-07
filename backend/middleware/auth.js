const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.schoolId = decoded.school_id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Middleware to check if user is teacher
const requireTeacher = (req, res, next) => {
  if (req.userRole !== 'teacher') {
    return res.status(403).json({ error: 'Teacher access required' });
  }
  next();
};

// Middleware to check if user is admin or teacher
const requireAdminOrTeacher = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'teacher') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

module.exports = { 
  authenticate, 
  requireAdmin, 
  requireTeacher, 
  requireAdminOrTeacher 
};
