import { Template, DEFAULT_STUDENT_TEMPLATE, DEFAULT_PARENT_TEMPLATE } from '../models/Template.js';
import { renderTemplate, getStatusSentence } from '../services/templateEngine.js';

export async function getTemplates(req, res) {
  try {
    let studentTpl = await Template.findOne({ tutorId: req.tutor._id, type: 'student' });
    let parentTpl = await Template.findOne({ tutorId: req.tutor._id, type: 'parent' });

    if (!studentTpl) {
      studentTpl = await Template.create({
        tutorId: req.tutor._id,
        type: 'student',
        body: DEFAULT_STUDENT_TEMPLATE
      });
    }

    if (!parentTpl) {
      parentTpl = await Template.create({
        tutorId: req.tutor._id,
        type: 'parent',
        body: DEFAULT_PARENT_TEMPLATE
      });
    }

    return res.json({
      success: true,
      templates: {
        student: studentTpl.body,
        parent: parentTpl.body
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateTemplates(req, res) {
  try {
    const { studentTemplate, parentTemplate } = req.body;

    if (studentTemplate) {
      await Template.findOneAndUpdate(
        { tutorId: req.tutor._id, type: 'student' },
        { body: studentTemplate },
        { upsert: true }
      );
    }

    if (parentTemplate) {
      await Template.findOneAndUpdate(
        { tutorId: req.tutor._id, type: 'parent' },
        { body: parentTemplate },
        { upsert: true }
      );
    }

    return res.json({
      success: true,
      message: 'Templates updated successfully',
      templates: {
        student: studentTemplate,
        parent: parentTemplate
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function previewTemplate(req, res) {
  try {
    const { templateBody, homeworkStatus = 'complete', marksObtained = 23, marksTotal = 32 } = req.body;

    const sampleVariables = {
      student_name: 'রাফি হাসান',
      homework: 'গণিত অনুশীলনী ৩.১ এর ৫-১০ নম্বর অঙ্ক',
      exam_topic: 'বীজগণিত অধ্যায় ৩',
      marks: `${marksObtained}/${marksTotal}`,
      percentage: `${((marksObtained / marksTotal) * 100).toFixed(2)}%`,
      status_sentence: getStatusSentence(homeworkStatus),
      tutor_name: req.tutor.displayName || req.tutor.name || 'নূর ভাইয়া'
    };

    const rendered = renderTemplate(templateBody, sampleVariables);
    return res.json({ success: true, preview: rendered, variables: sampleVariables });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
