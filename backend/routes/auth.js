const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const crypto = require('crypto');
const { sendCredentialsEmail } = require('../services/emailService');

// School Registration (School Administrator)
router.post('/register-school', async (req, res) => {
  try {
    const { 
      schoolName, 
      registrationNumber, 
      address, 
      phone, 
      email, 
      principalName,
      adminName,
      adminEmail,
      adminPassword 
    } = req.body;

    // Validate required fields
    if (!schoolName || !registrationNumber || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if school already exists
    const existingSchool = await db.query(
      'SELECT id FROM schools WHERE registration_number = $1',
      [registrationNumber]
    );

    if (existingSchool.rows.length > 0) {
      return res.status(400).json({ error: 'School with this registration number already exists' });
    }

    // Check if admin email exists
    const existingAdmin = await db.query(
      'SELECT id FROM school_administrators WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({ error: 'Admin email already exists' });
    }

    // Create school
    const schoolResult = await db.query(
      `INSERT INTO schools (name, registration_number, address, phone, email, principal_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, registration_number`,
      [schoolName, registrationNumber, address || null, phone || null, email || null, principalName || null]
    );

    const schoolId = schoolResult.rows[0].id;

    // Create admin account
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminResult = await db.query(
      `INSERT INTO school_administrators (school_id, name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
      [schoolId, adminName, adminEmail, hashedPassword]
    );

    res.status(201).json({
      message: 'School and administrator registered successfully',
      school: schoolResult.rows[0],
      admin: adminResult.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Registration number or email already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Multi-role Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let user = null;
    let userRole = null;
    let schoolId = null;

    // Try admin first if role is 'admin' or not specified
    if (!role || role === 'admin') {
      const adminResult = await db.query(
        `SELECT sa.*, s.id as school_id, s.name as school_name
         FROM school_administrators sa
         JOIN schools s ON sa.school_id = s.id
         WHERE sa.email = $1`,
        [email]
      );

      if (adminResult.rows.length > 0) {
        const admin = adminResult.rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        
        if (isValidPassword) {
          user = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            school_id: admin.school_id,
            school_name: admin.school_name
          };
          userRole = 'admin';
          schoolId = admin.school_id;
        }
      }
    }

    // Try teacher if not found as admin or role is 'teacher'
    if (!user && (!role || role === 'teacher')) {
      const teacherResult = await db.query(
        `SELECT t.*, s.id as school_id, s.name as school_name
         FROM teachers t
         LEFT JOIN schools s ON t.school_id = s.id
         WHERE t.email = $1`,
        [email]
      );

      if (teacherResult.rows.length > 0) {
        const teacher = teacherResult.rows[0];
        const isValidPassword = await bcrypt.compare(password, teacher.password_hash);
        
        if (isValidPassword) {
          user = {
            id: teacher.id,
            name: teacher.name,
            email: teacher.email,
            school_id: teacher.school_id,
            school_name: teacher.school_name,
            role: teacher.role
          };
          userRole = 'teacher';
          schoolId = teacher.school_id;
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: userRole,
        school_id: schoolId
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        ...user,
        role: userRole
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Login (explicit)
router.post('/admin-login', async (req, res) => {
  req.body.role = 'admin';
  return router.handle(req, res);
});

// Teacher Login (explicit)
router.post('/teacher-login', async (req, res) => {
  req.body.role = 'teacher';
  return router.handle(req, res);
});

module.exports = router;
