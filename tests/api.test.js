process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/server.js';
import { queueMessagesForTutor } from '../src/jobs/scheduler.js';

let server;
let baseUrl;
let mongod;
let tokenA;
let tutorA;
let studentA1;
let tokenB;
let tutorB;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

describe('API Integration Tests', () => {
  it('registers Tutor A and automatically seeds default templates', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'নূর আহমেদ',
        email: 'tutor.a@example.com',
        password: 'password123',
        displayName: 'নূর ভাইয়া'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.token);
    assert.strictEqual(data.tutor.displayName, 'নূর ভাইয়া');

    tokenA = data.token;
    tutorA = data.tutor;

    // Check templates seeded
    const tplRes = await fetch(`${baseUrl}/api/templates`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const tplData = await tplRes.json();
    assert.strictEqual(tplData.success, true);
    assert.ok(tplData.templates.student.includes('{{student_name}}'));
    assert.ok(tplData.templates.parent.includes('{{status_sentence}}'));
  });

  it('registers Tutor B for data isolation verification', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'কামাল হোসেন',
        email: 'tutor.b@example.com',
        password: 'password123',
        displayName: 'কামাল স্যার'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    tokenB = data.token;
    tutorB = data.tutor;
  });

  it('creates students with 01XXXXXXXXX phone validation', async () => {
    // Invalid phone should fail
    const badRes = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'সাকিব',
        studentPhone: '12345',
        parentPhone: '01811111111'
      })
    });
    assert.strictEqual(badRes.status, 400);

    // Valid student
    const validRes = await fetch(`${baseUrl}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'সাকিব আল হাসান',
        studentPhone: '01711112222',
        parentPhone: '01811112222',
        sendToStudent: true,
        sendToParent: true
      })
    });

    const validData = await validRes.json();
    assert.strictEqual(validRes.status, 201);
    assert.strictEqual(validData.student.name, 'সাকিব আল হাসান');
    studentA1 = validData.student;
  });

  it('verifies Tutor B CANNOT access Tutor A student by ID (Tenant Isolation)', async () => {
    const res = await fetch(`${baseUrl}/api/students/${studentA1._id}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'Student not found');
  });

  it('batches daily record entry and auto-calculates percentage', async () => {
    const batchRes = await fetch(`${baseUrl}/api/records/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        date: '2026-10-23',
        records: [
          {
            studentId: studentA1._id,
            homework: 'অনুশীলনী ৫.২ এর ১-১০',
            homeworkStatus: 'complete',
            examTopic: 'বীজগণিত',
            marksObtained: 23,
            marksTotal: 32
          }
        ]
      })
    });

    const batchData = await batchRes.json();
    assert.strictEqual(batchRes.status, 200);
    assert.strictEqual(batchData.success, true);

    // Verify history endpoint
    const histRes = await fetch(`${baseUrl}/api/students/${studentA1._id}/history`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const histData = await histRes.json();
    assert.strictEqual(histData.success, true);
    assert.strictEqual(histData.records.length, 1);
    assert.strictEqual(histData.records[0].marksObtained, 23);
    assert.strictEqual(histData.records[0].marksTotal, 32);
    assert.strictEqual(histData.records[0].percentage, 71.88);
  });

  it('toggles student messaging switches with PATCH', async () => {
    const toggleRes = await fetch(`${baseUrl}/api/students/${studentA1._id}/messaging`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        sendToStudent: false,
        sendToParent: true
      })
    });

    const toggleData = await toggleRes.json();
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleData.student.sendToStudent, false);
    assert.strictEqual(toggleData.student.sendToParent, true);
  });

  it('queues messages and prevents duplicate sends via unique compound index', async () => {
    const res1 = await queueMessagesForTutor(tutorA.id);
    assert.ok(res1.queued >= 0);

    const res2 = await queueMessagesForTutor(tutorA.id);
    assert.strictEqual(res2.queued, 0);
  });
});
