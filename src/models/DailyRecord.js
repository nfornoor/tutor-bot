import mongoose from 'mongoose';

const dailyRecordSchema = new mongoose.Schema(
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
      type: String, // YYYY-MM-DD in Asia/Dhaka
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    homework: {
      type: String,
      default: '',
      trim: true
    },
    homeworkStatus: {
      type: String,
      enum: ['complete', 'partial', 'incomplete'],
      default: 'complete'
    },
    examTopic: {
      type: String,
      default: '',
      trim: true
    },
    marksObtained: {
      type: Number,
      default: null,
      min: 0
    },
    marksTotal: {
      type: Number,
      default: null,
      min: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Unique index: (tutorId, studentId, date)
dailyRecordSchema.index({ tutorId: 1, studentId: 1, date: 1 }, { unique: true });
dailyRecordSchema.index({ studentId: 1, date: -1 });

// Virtual for percentage
dailyRecordSchema.virtual('percentage').get(function () {
  if (
    this.marksObtained !== null &&
    this.marksTotal !== null &&
    this.marksTotal > 0
  ) {
    return Number(((this.marksObtained / this.marksTotal) * 100).toFixed(2));
  }
  return null;
});

export const DailyRecord = mongoose.model('DailyRecord', dailyRecordSchema);
