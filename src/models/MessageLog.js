import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tutor',
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    recipient: {
      type: String,
      enum: ['student', 'parent'],
      required: true
    },
    recipientPhone: {
      type: String,
      required: true
    },
    body: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'skipped'],
      default: 'queued',
      index: true
    },
    error: {
      type: String,
      default: null
    },
    attempts: {
      type: Number,
      default: 0
    },
    sentAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Unique index to prevent double sends
messageLogSchema.index({ studentId: 1, date: 1, recipient: 1 }, { unique: true });
messageLogSchema.index({ tutorId: 1, date: 1, status: 1 });

export const MessageLog = mongoose.model('MessageLog', messageLogSchema);
