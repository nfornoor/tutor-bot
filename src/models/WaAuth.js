import mongoose from 'mongoose';

const waAuthSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tutor',
      required: true,
      index: true
    },
    key: {
      type: String,
      required: true
    },
    value: {
      type: String, // Encrypted payload (iv:tag:ciphertext)
      required: true
    }
  },
  { timestamps: true }
);

waAuthSchema.index({ tutorId: 1, key: 1 }, { unique: true });

export const WaAuth = mongoose.model('WaAuth', waAuthSchema);
