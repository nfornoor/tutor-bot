import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tutorbot',
  jwtSecret: process.env.JWT_SECRET || 'tutorbot_jwt_secret_dev_key_2026_xyz',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  waEncryptionKey: process.env.WA_ENCRYPTION_KEY || '12345678901234567890123456789012', // 32 chars
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development'
};
