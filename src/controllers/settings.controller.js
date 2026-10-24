import { Tutor } from '../models/Tutor.js';

export async function getSettings(req, res) {
  try {
    const tutor = await Tutor.findById(req.tutor._id).select(
      'displayName sendTime timezone dailyLimit autoSendEnabled email name'
    );
    return res.json({ success: true, settings: tutor });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateSettings(req, res) {
  try {
    const { displayName, sendTime, timezone, dailyLimit, autoSendEnabled } = req.body;
    const update = {};

    if (displayName !== undefined) update.displayName = displayName;
    if (sendTime !== undefined) update.sendTime = sendTime;
    if (timezone !== undefined) update.timezone = timezone;
    if (dailyLimit !== undefined) update.dailyLimit = dailyLimit;
    if (autoSendEnabled !== undefined) update.autoSendEnabled = Boolean(autoSendEnabled);

    const tutor = await Tutor.findByIdAndUpdate(
      req.tutor._id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('displayName sendTime timezone dailyLimit autoSendEnabled email name');

    return res.json({ success: true, settings: tutor });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
