import { Student } from '../models/Student.js';
import { DailyRecord } from '../models/DailyRecord.js';
import { Tutor } from '../models/Tutor.js';

export async function getPublicStudentReport(req, res) {
  try {
    const token = req.params.token?.trim();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Share token is required' });
    }

    const student = await Student.findOne({ shareToken: token });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student report not found or link has expired' });
    }

    const tutor = await Tutor.findById(student.tutorId).select('name displayName');

    const records = await DailyRecord.find({
      studentId: student._id
    }).sort({ date: -1 });

    const formattedRecords = records.map((r) => {
      const obj = r.toObject();
      obj.percentage =
        r.marksObtained !== null && r.marksTotal !== null && r.marksTotal > 0
          ? Number(((r.marksObtained / r.marksTotal) * 100).toFixed(2))
          : null;
      return obj;
    });

    const exams = formattedRecords.filter((r) => r.percentage !== null);
    const avgPercentage =
      exams.length > 0
        ? Number((exams.reduce((sum, e) => sum + e.percentage, 0) / exams.length).toFixed(1))
        : null;

    return res.json({
      success: true,
      student: {
        _id: student._id,
        name: student.name,
        studentPhone: student.studentPhone,
        parentPhone: student.parentPhone
      },
      tutor: {
        name: tutor?.displayName || tutor?.name || 'শিক্ষক'
      },
      summary: {
        totalDays: formattedRecords.length,
        totalExams: exams.length,
        averagePercentage: avgPercentage,
        latestRecord: formattedRecords[0] || null
      },
      records: formattedRecords
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
