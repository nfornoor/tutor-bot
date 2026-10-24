import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderTemplate, getStatusSentence } from '../src/services/templateEngine.js';
import { buildMessage } from '../src/services/messageBuilder.js';
import { encrypt, decrypt } from '../src/utils/crypto.js';
import { formatToJid } from '../src/whatsapp/sessionManager.js';

describe('Template Engine', () => {
  it('renders placeholders correctly', () => {
    const template = 'Hello {{student_name}}, your marks: {{marks}} ({{percentage}})';
    const variables = {
      student_name: 'রাফি',
      marks: '23/32',
      percentage: '71.88%'
    };
    const result = renderTemplate(template, variables);
    assert.strictEqual(result, 'Hello রাফি, your marks: 23/32 (71.88%)');
  });

  it('picks correct Bengali status sentences', () => {
    assert.strictEqual(getStatusSentence('complete'), 'আজকের বাড়ির কাজ সম্পূর্ণ করেছে।');
    assert.strictEqual(getStatusSentence('partial'), 'আজকের বাড়ির কাজ আংশিক সম্পন্ন করেছে।');
    assert.strictEqual(getStatusSentence('incomplete'), 'আজকের বাড়ির কাজ সম্পন্ন করেনি।');
  });
});

describe('Message Builder', () => {
  const tutor = { name: 'নূর আহমেদ', displayName: 'নূর ভাইয়া' };
  const student = { name: 'সাদিয়া রহমান', studentPhone: '01712345678', parentPhone: '01812345678' };
  const template = '{{student_name}}: {{homework}} | {{marks}} ({{percentage}}) | {{status_sentence}} - {{tutor_name}}';

  it('builds message with today exam record', () => {
    const todayRecord = {
      homework: 'পৃষ্ঠা ১২ এর অঙ্ক',
      homeworkStatus: 'complete',
      examTopic: 'ত্রিকোণমিতি',
      marksObtained: 25,
      marksTotal: 30
    };

    const msg = buildMessage({
      tutor,
      student,
      todayRecord,
      recipientType: 'student',
      templateBody: template
    });

    assert.ok(msg.includes('সাদিয়া রহমান'));
    assert.ok(msg.includes('পৃষ্ঠা ১২ এর অঙ্ক'));
    assert.ok(msg.includes('25/30'));
    assert.ok(msg.includes('83.33%'));
    assert.ok(msg.includes('আজকের বাড়ির কাজ সম্পূর্ণ করেছে।'));
    assert.ok(msg.includes('নূর ভাইয়া'));
  });

  it('falls back to last recorded exam if today has no exam', () => {
    const todayRecord = {
      homework: 'ইংরেজি গ্রামার',
      homeworkStatus: 'partial',
      examTopic: '',
      marksObtained: null,
      marksTotal: null
    };

    const lastExamRecord = {
      examTopic: 'পদার্থবিজ্ঞান অধ্যায় ২',
      marksObtained: 18,
      marksTotal: 20
    };

    const msg = buildMessage({
      tutor,
      student,
      todayRecord,
      lastExamRecord,
      recipientType: 'parent',
      templateBody: template
    });

    assert.ok(msg.includes('18/20'));
    assert.ok(msg.includes('90.00%'));
    assert.ok(msg.includes('আজকের বাড়ির কাজ আংশিক সম্পন্ন করেছে।'));
  });

  it('handles scenario when there are no exams ever recorded', () => {
    const todayRecord = {
      homework: 'ইতিহাস পড়া',
      homeworkStatus: 'incomplete',
      examTopic: '',
      marksObtained: null,
      marksTotal: null
    };

    const msg = buildMessage({
      tutor,
      student,
      todayRecord,
      lastExamRecord: null,
      recipientType: 'student',
      templateBody: template
    });

    assert.ok(msg.includes('N/A'));
    assert.ok(msg.includes('আজকের বাড়ির কাজ সম্পন্ন করেনি।'));
  });
});

describe('Crypto Utilities', () => {
  it('encrypts and decrypts strings with AES-256-GCM', () => {
    const secret = 'whatsapp-creds-token-12345-বাংলা-টেক্সট';
    const encrypted = encrypt(secret);
    assert.notStrictEqual(encrypted, secret);
    assert.ok(encrypted.includes(':'));

    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, secret);
  });
});

describe('Phone Number Normalization', () => {
  it('converts 01XXXXXXXXX to 8801XXXXXXXXX@s.whatsapp.net', () => {
    assert.strictEqual(formatToJid('01712345678'), '8801712345678@s.whatsapp.net');
    assert.strictEqual(formatToJid('+8801812345678'), '8801812345678@s.whatsapp.net');
    assert.strictEqual(formatToJid('019-1234-5678'), '8801912345678@s.whatsapp.net');
  });
});
