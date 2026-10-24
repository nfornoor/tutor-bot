import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Tutor } from '../models/Tutor.js';
import { Template, DEFAULT_STUDENT_TEMPLATE, DEFAULT_PARENT_TEMPLATE } from '../models/Template.js';
import { config } from '../config/env.js';
import { getSetting } from '../services/settingsService.js';

function generateToken(tutorId, role = 'tutor') {
  return jwt.sign({ id: tutorId, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

export async function register(req, res) {
  try {
    // Check dynamic registrationOpen setting
    const isRegistrationOpen = await getSetting('registrationOpen', true);
    if (!isRegistrationOpen) {
      return res.status(403).json({
        success: false,
        error: 'Registration is currently closed by the platform administrator.'
      });
    }

    const { name, email, password, displayName } = req.body;

    const existingTutor = await Tutor.findOne({ email: email.toLowerCase() });
    if (existingTutor) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    const defaultLimit = await getSetting('defaultDailyLimit', 100);
    const defaultStudentTpl = await getSetting('defaultStudentTemplate', DEFAULT_STUDENT_TEMPLATE);
    const defaultParentTpl = await getSetting('defaultParentTemplate', DEFAULT_PARENT_TEMPLATE);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const tutor = await Tutor.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName || name || 'নূর ভাইয়া',
      role: 'tutor',
      status: 'active',
      sendTime: '18:00',
      timezone: 'Asia/Dhaka',
      dailyLimit: defaultLimit
    });

    // Seed student & parent templates for this tutor using current platform defaults
    await Template.create([
      {
        tutorId: tutor._id,
        type: 'student',
        body: defaultStudentTpl
      },
      {
        tutorId: tutor._id,
        type: 'parent',
        body: defaultParentTpl
      }
    ]);

    const token = generateToken(tutor._id, tutor.role);

    return res.status(201).json({
      success: true,
      token,
      tutor: {
        id: tutor._id,
        name: tutor.name,
        email: tutor.email,
        displayName: tutor.displayName,
        role: tutor.role,
        status: tutor.status,
        sendTime: tutor.sendTime,
        timezone: tutor.timezone,
        dailyLimit: tutor.dailyLimit
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({
      success: false,
      error: 'Registration failed: ' + err.message
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const tutor = await Tutor.findOne({ email: email.toLowerCase() });
    if (!tutor) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check account status
    if (tutor.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended. Please contact platform administration.'
      });
    }

    // Check maintenanceMode setting (admins can always log in)
    const isMaintenance = await getSetting('maintenanceMode', false);
    if (isMaintenance && tutor.role !== 'admin') {
      return res.status(503).json({
        success: false,
        error: 'The platform is currently undergoing maintenance. Please try again shortly.'
      });
    }

    const isMatch = await bcrypt.compare(password, tutor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const token = generateToken(tutor._id, tutor.role);

    return res.json({
      success: true,
      token,
      tutor: {
        id: tutor._id,
        name: tutor.name,
        email: tutor.email,
        displayName: tutor.displayName,
        role: tutor.role,
        status: tutor.status,
        sendTime: tutor.sendTime,
        timezone: tutor.timezone,
        dailyLimit: tutor.dailyLimit
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      error: 'Login failed: ' + err.message
    });
  }
}

export async function getMe(req, res) {
  return res.json({
    success: true,
    tutor: req.tutor
  });
}
