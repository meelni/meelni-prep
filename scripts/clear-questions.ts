/**
 * Clear all questions from the database
 * Use this before re-syncing to get fresh data with all fields
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { db } from '@/lib/db';
import { interviewQuestion } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

async function clearQuestions() {
  console.log('\n🗑️  Clearing all questions from database...\n');

  try {
    const result = await db.delete(interviewQuestion);
    console.log('✅ All questions cleared successfully');
    console.log('\n💡 Now run: npm run sync:questions\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing questions:', error);
    process.exit(1);
  }
}

clearQuestions();
