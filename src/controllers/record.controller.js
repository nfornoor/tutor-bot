import { DailyRecord } from '../models/DailyRecord.js';
import { Student } from '../models/Student.js';
import { getDhakaNow } from '../jobs/scheduler.js';

export async function createOrUpdateForStudent(req, res) {
  try {
    const studentId = req.params.id;
    // Security check: student belongs to tutor
    const student = await Student.findOne({
      _id: studentId,
      tutorId: req.tutor._id
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const { dateStr } = getDhakaNow(req.tutor.timezone || 'Asia/Dhaka');
    const recordDate = req.body.date || dateStr;

    const record = await DailyRecord.findOneAndUpdate(
      {
        tutorId: req.tutor._id,
        studentId: student._id,
        date: recordDate
      },
      {
        $set: {
          homework: req.body.homework || '',
          homeworkStatus: req.body.homeworkStatus || 'complete',
          examTopic: req.body.examTopic || '',
          marksObtained: req.body.marksObtained !== undefined ? req.body.marksObtained : null,
          marksTotal: req.body.marksTotal !== undefined ? req.body.marksTotal : null
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateRecord(req, res) {
  try {
    const record = await DailyRecord.findOneAndUpdate(
      { _id: req.params.id, tutorId: req.tutor._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    return res.json({ success: true, record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteRecord(req, res) {
  try {
    const record = await DailyRecord.findOneAndDelete({
      _id: req.params.id,
      tutorId: req.tutor._id
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    return res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function getTodayRecords(req, res) {
  try {
    const { dateStr } = getDhakaNow(req.tutor.timezone || 'Asia/Dhaka');
    const targetDate = req.query.date || dateStr;

    const records = await DailyRecord.find({
      tutorId: req.tutor._id,
      date: targetDate
    });

    return res.json({ success: true, date: targetDate, records });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function batchUpdateRecords(req, res) {
  try {
    const { date, records } = req.body;
    const { dateStr } = getDhakaNow(req.tutor.timezone || 'Asia/Dhaka');
    const recordDate = date || dateStr;

    const bulkOps = records.map((item) => ({
      updateOne: {
        filter: {
          tutorId: req.tutor._id,
          studentId: item.studentId,
          date: recordDate
        },
        update: {
          $set: {
            homework: item.homework || '',
            homeworkStatus: item.homeworkStatus || 'complete',
            examTopic: item.examTopic || '',
            marksObtained: item.marksObtained !== undefined ? item.marksObtained : null,
            marksTotal: item.marksTotal !== undefined ? item.marksTotal : null
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await DailyRecord.bulkWrite(bulkOps);
    }

    const updatedRecords = await DailyRecord.find({
      tutorId: req.tutor._id,
      date: recordDate
    });

    return res.json({
      success: true,
      message: `Updated records for ${bulkOps.length} students on ${recordDate}`,
      records: updatedRecords
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
