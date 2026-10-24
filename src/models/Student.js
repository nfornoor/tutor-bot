import mongoose from 'mongoose';
import crypto from 'crypto';

const studentSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tutor',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    studentPhone: {
      type: String,
      required: true,
      trim: true,
      match: /^01[3-9]\d{8}$/
    },
    parentPhone: {
      type: String,
      required: true,
      trim: true,
      match: /^01[3-9]\d{8}$/
    },
    sendToStudent: {
      type: Boolean,
      default: true
    },
    sendToParent: {
      type: Boolean,
      default: true
    },
    active: {
      type: Boolean,
      default: true
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    }
  },
  { timestamps: true }
);

studentSchema.index({ tutorId: 1, active: 1 });

studentSchema.pre('save', function (next) {
  if (!this.shareToken) {
    this.shareToken = crypto.randomBytes(12).toString('hex');
  }
  next();
});

/**
 * Ensures all existing students in the database have a persistent shareToken
 */
export async function ensureStudentShareTokens() {
  try {
    const rawStudents = await mongoose.connection.db
      .collection('students')
      .find({ $or: [{ shareToken: { $exists: false } }, { shareToken: null }, { shareToken: '' }] })
      .toArray();

    if (rawStudents.length > 0) {
      console.log(`[Student] Generating persistent shareTokens for ${rawStudents.length} students...`);
      for (const s of rawStudents) {
        const token = crypto.randomBytes(12).toString('hex');
        await mongoose.connection.db
          .collection('students')
          .updateOne({ _id: s._id }, { $set: { shareToken: token } });
      }
      console.log('[Student] All student shareTokens successfully persisted.');
    }
  } catch (err) {
    console.error('[Student] Error ensuring student shareTokens:', err.message);
  }
}

export const Student = mongoose.model('Student', studentSchema);
