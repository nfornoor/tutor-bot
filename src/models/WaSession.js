import mongoose from 'mongoose';

const waSessionSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tutor',
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: ['disconnected', 'connecting', 'qr_ready', 'code_ready', 'connected'],
      default: 'disconnected'
    },
    qr: {
      type: String,
      default: null
    },
    pairingCode: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      default: null
    },
    lastConnectedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export const WaSession = mongoose.model('WaSession', waSessionSchema);
