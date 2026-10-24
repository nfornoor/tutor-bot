import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { Tutor } from '../models/Tutor.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token missing or invalid'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const tutor = await Tutor.findById(decoded.id).select('-passwordHash');
    if (!tutor) {
      return res.status(401).json({
        success: false,
        error: 'Tutor account not found'
      });
    }

    if (tutor.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended. Please contact platform administration.'
      });
    }

    req.tutor = tutor;
    req.user = tutor;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired, please login again'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }
}

/**
 * Middleware ensuring current tutor has role 'admin'
 * Checks role directly from the database, not only from the JWT
 */
export async function requireAdmin(req, res, next) {
  try {
    if (!req.tutor) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Direct database verification
    const tutor = await Tutor.findById(req.tutor._id).select('role status');
    if (!tutor || tutor.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Platform admin privileges required'
      });
    }

    if (tutor.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Admin account suspended. Please contact platform administration.'
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Authorization check failed: ' + err.message });
  }
}
