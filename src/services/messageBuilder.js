import { renderTemplate, getStatusSentence } from './templateEngine.js';

/**
 * Builds variables dictionary and renders the message for student or parent
 * @param {Object} options
 * @param {Object} options.tutor
 * @param {Object} options.student
 * @param {Object} options.todayRecord
 * @param {Object} [options.lastExamRecord]
 * @param {'student' | 'parent'} options.recipientType
 * @param {string} options.templateBody
 * @param {Record<string, string>} [options.statusSentences]
 * @returns {string}
 */
export function buildMessage({
  tutor,
  student,
  todayRecord,
  lastExamRecord = null,
  recipientType = 'student',
  templateBody,
  statusSentences = null
}) {
  const tutorName = tutor.displayName || tutor.name || 'শিক্ষক';
  const studentName = student.name || 'শিক্ষার্থী';
  const homework = todayRecord?.homework?.trim() || 'আজ কোনো বাড়ির কাজ ছিল না';
  const statusSentence = getStatusSentence(todayRecord?.homeworkStatus || 'complete', statusSentences);

  // Determine exam data: prioritize today's exam if entered, otherwise use lastExamRecord
  let examRec = null;
  if (
    todayRecord &&
    (todayRecord.marksTotal > 0 || (todayRecord.examTopic && todayRecord.examTopic.trim()))
  ) {
    examRec = todayRecord;
  } else if (
    lastExamRecord &&
    (lastExamRecord.marksTotal > 0 || (lastExamRecord.examTopic && lastExamRecord.examTopic.trim()))
  ) {
    examRec = lastExamRecord;
  }

  let examTopic = 'আজ কোনো পরীক্ষা ছিল না';
  let marks = 'N/A';
  let percentage = 'N/A';

  if (examRec) {
    if (examRec.examTopic && examRec.examTopic.trim()) {
      examTopic = examRec.examTopic.trim();
    }
    if (
      examRec.marksObtained !== null &&
      examRec.marksObtained !== undefined &&
      examRec.marksTotal !== null &&
      examRec.marksTotal !== undefined &&
      examRec.marksTotal > 0
    ) {
      marks = `${examRec.marksObtained}/${examRec.marksTotal}`;
      const pct = ((examRec.marksObtained / examRec.marksTotal) * 100).toFixed(2);
      percentage = `${pct}%`;
    }
  }

  const variables = {
    student_name: studentName,
    homework: homework,
    exam_topic: examTopic,
    marks: marks,
    percentage: percentage,
    status_sentence: statusSentence,
    tutor_name: tutorName
  };

  return renderTemplate(templateBody, variables);
}
