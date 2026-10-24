import mongoose from 'mongoose';

export const DEFAULT_STUDENT_TEMPLATE = 
`আসসালামু আলাইকুম {{student_name}},
আজকের বাড়ির কাজ: {{homework}}
পরীক্ষার বিষয়: {{exam_topic}}
প্রাপ্ত নম্বর: {{marks}} ({{percentage}})

ভালো করে পড়াশোনা করবে।
- {{tutor_name}}`;

export const DEFAULT_PARENT_TEMPLATE = 
`আসসালামু আলাইকুম অভিভাবক,
আজকে {{student_name}}-এর আপডেট:
বাড়ির কাজ: {{homework}}
পরীক্ষার বিষয়: {{exam_topic}}
প্রাপ্ত নম্বর: {{marks}} ({{percentage}})
মন্তব্য: {{status_sentence}}

ধন্যবাদ,
- {{tutor_name}}`;

const templateSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tutor',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['student', 'parent'],
      required: true
    },
    body: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

// Unique index: (tutorId, type)
templateSchema.index({ tutorId: 1, type: 1 }, { unique: true });

export const Template = mongoose.model('Template', templateSchema);
