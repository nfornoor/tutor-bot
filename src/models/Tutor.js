import mongoose from 'mongoose';

const tutorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    displayName: {
      type: String,
      default: 'নূর ভাইয়া',
      trim: true
    },
    role: {
      type: String,
      enum: ['tutor', 'admin'],
      default: 'tutor',
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true
    },
    sendTime: {
      type: String,
      default: '18:00', // HH:mm 24-hr format
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    timezone: {
      type: String,
      default: 'Asia/Dhaka'
    },
    dailyLimit: {
      type: Number,
      default: 100
    },
    autoSendEnabled: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Explicit compound / list query indexes
tutorSchema.index({ status: 1, createdAt: -1 });
tutorSchema.index({ role: 1, status: 1 });

export const Tutor = mongoose.model('Tutor', tutorSchema);
