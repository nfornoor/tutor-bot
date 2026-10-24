import crypto from 'crypto';
import { Student } from '../models/Student.js';
import { DailyRecord } from '../models/DailyRecord.js';

export async function listStudents(req, res) {
  try {
    const { active, search } = req.query;
    const filter = { tutorId: req.tutor._id };

    if (active !== undefined) {
      filter.active = active === 'true';
    }

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const students = await Student.find(filter).sort({ name: 1 });

    // Ensure all existing students have a shareToken
    for (const s of students) {
      if (!s.shareToken) {
        s.shareToken = crypto.randomBytes(12).toString('hex');
        await s.save();
      }
    }

    return res.json({ success: true, count: students.length, students });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function createStudent(req, res) {
  try {
    const { name, studentPhone, parentPhone, sendToStudent, sendToParent, active } = req.body;

    const student = await Student.create({
      tutorId: req.tutor._id,
      name,
      studentPhone,
      parentPhone,
      sendToStudent: sendToStudent ?? true,
      sendToParent: sendToParent ?? true,
      active: active ?? true,
      shareToken: crypto.randomBytes(12).toString('hex')
    });

    return res.status(201).json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getStudentById(req, res) {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      tutorId: req.tutor._id
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    if (!student.shareToken) {
      student.shareToken = crypto.randomBytes(12).toString('hex');
      await student.save();
    }

    return res.json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateStudent(req, res) {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, tutorId: req.tutor._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    return res.json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteStudent(req, res) {
  try {
    const student = await Student.findOneAndDelete({
      _id: req.params.id,
      tutorId: req.tutor._id
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    // Also delete associated daily records and message logs
    await DailyRecord.deleteMany({ studentId: req.params.id, tutorId: req.tutor._id });

    return res.json({ success: true, message: 'Student and history deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function patchMessaging(req, res) {
  try {
    const { sendToStudent, sendToParent } = req.body;
    const update = {};
    if (sendToStudent !== undefined) update.sendToStudent = sendToStudent;
    if (sendToParent !== undefined) update.sendToParent = sendToParent;

    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, tutorId: req.tutor._id },
      { $set: update },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    return res.json({ success: true, student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getStudentHistory(req, res) {
  try {
    // Security: verify student belongs to this tutor
    const student = await Student.findOne({
      _id: req.params.id,
      tutorId: req.tutor._id
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    if (!student.shareToken) {
      student.shareToken = crypto.randomBytes(12).toString('hex');
      await student.save();
    }

    const records = await DailyRecord.find({
      studentId: student._id,
      tutorId: req.tutor._id
    }).sort({ date: -1 });

    // Format for charts and tables
    const formattedRecords = records.map((r) => {
      const obj = r.toObject();
      obj.percentage =
        r.marksObtained !== null && r.marksTotal !== null && r.marksTotal > 0
          ? Number(((r.marksObtained / r.marksTotal) * 100).toFixed(2))
          : null;
      return obj;
    });

    return res.json({
      success: true,
      student,
      records: formattedRecords
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
