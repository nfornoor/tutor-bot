import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Tutor } from '../src/models/Tutor.js';
import { config } from '../src/config/env.js';

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim();
  const password = args[1]?.trim();
  const name = args[2]?.trim();

  if (!email || !password) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: Email and password are required.');
    console.log('\nUsage:');
    console.log('  npm run create-admin -- <email> <password> [optionalName]');
    console.log('\nExample:');
    console.log('  npm run create-admin -- admin@tutorbot.com StrongPassword123! "Super Admin"\n');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: Password must be at least 6 characters.');
    process.exit(1);
  }

  try {
    const uri = config.mongodbUri || 'mongodb://127.0.0.1:27017/tutorbot';
    console.log(`Connecting to MongoDB at ${uri}...`);
    await mongoose.connect(uri);

    const normalizedEmail = email.toLowerCase();
    let tutor = await Tutor.findOne({ email: normalizedEmail });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (tutor) {
      console.log(`Found existing tutor with email ${normalizedEmail}. Promoting to admin...`);
      tutor.role = 'admin';
      tutor.status = 'active';
      tutor.passwordHash = passwordHash;
      if (name) tutor.name = name;
      await tutor.save();
      console.log('\x1b[32m%s\x1b[0m', `✓ Successfully promoted ${tutor.email} to admin!`);
    } else {
      console.log(`Creating new admin account for ${normalizedEmail}...`);
      tutor = await Tutor.create({
        name: name || email.split('@')[0] || 'Admin',
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        status: 'active'
      });
      console.log('\x1b[32m%s\x1b[0m', `✓ Successfully created new admin ${tutor.email}!`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to create/promote admin:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  }
}

main();
