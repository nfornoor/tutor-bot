import { waProvider } from '../whatsapp/provider.js';

export async function connectWhatsApp(req, res) {
  try {
    const { method = 'qr', phone, phoneNumber } = req.body || {};
    const targetPhone = phone || phoneNumber;

    if (method === 'code' && !targetPhone) {
      return res.status(400).json({
        success: false,
        error: 'কোড দিয়ে কানেক্ট করতে আপনার WhatsApp ফোন নম্বর প্রদান করুন'
      });
    }

    const result = await waProvider.connect(req.tutor._id, {
      method,
      phoneNumber: targetPhone
    });
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getWhatsAppStatus(req, res) {
  try {
    const status = await waProvider.getStatus(req.tutor._id);
    return res.json({ success: true, ...status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function disconnectWhatsApp(req, res) {
  try {
    await waProvider.disconnect(req.tutor._id);
    return res.json({ success: true, message: 'WhatsApp session disconnected and logged out' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
