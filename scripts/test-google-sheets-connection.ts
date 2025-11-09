/**
 * Test Google Sheets API Connection
 *
 * Run this script to verify your Google Sheets credentials are working
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { testGoogleSheetsConnection, fetchSheetViaAPI } from '@/lib/google-sheets-api';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

async function testConnection() {
  console.log('🔍 Testing Google Sheets API Connection...\n');

  console.log('Configuration:');
  console.log(`  Sheet ID: ${SHEET_ID}`);
  console.log(`  Sheet Name: ${SHEET_NAME}`);
  console.log(`  Range: ${SHEET_NAME}!A1:Z1000\n`);

  // Check environment variables
  console.log('📋 Environment Variables:');
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    console.log('  ✅ GOOGLE_SHEETS_API_KEY is set');
  } else if (process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64) {
    console.log('  ✅ GOOGLE_SHEETS_CREDENTIALS_BASE64 is set');
  } else if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    console.log('  ✅ GOOGLE_SHEETS_CREDENTIALS is set');
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    console.log('  ✅ GOOGLE_SERVICE_ACCOUNT_EMAIL is set');
    console.log('  ✅ GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is set');
  } else {
    console.log('  ❌ No Google Sheets credentials found!');
    console.log('\n⚠️  Please set one of:');
    console.log('     - GOOGLE_SHEETS_API_KEY (simple, for public sheets)');
    console.log('     - GOOGLE_SHEETS_CREDENTIALS_BASE64 (service account)');
    console.log('     - GOOGLE_SHEETS_CREDENTIALS (JSON string)\n');
    console.log('See QUICK_FIX_API_KEY.md for setup instructions');
    process.exit(1);
  }

  if (!process.env.GOOGLE_SHEET_ID) {
    console.log('  ⚠️  GOOGLE_SHEET_ID not set, using default from URL');
  } else {
    console.log('  ✅ GOOGLE_SHEET_ID is set');
  }

  if (!process.env.GOOGLE_SHEET_NAME) {
    console.log('  ⚠️  GOOGLE_SHEET_NAME not set, using default "Sheet1"');
  } else {
    console.log('  ✅ GOOGLE_SHEET_NAME is set');
  }

  console.log('\n🔌 Testing connection...\n');

  try {
    // Test connection
    const result = await testGoogleSheetsConnection(SHEET_ID, SHEET_NAME);

    if (result.success) {
      console.log('✅ Connection successful!\n');
      console.log(`📊 Found ${result.rowCount} rows in sheet\n`);

      // Fetch first few rows to preview
      console.log('📋 Fetching preview...\n');
      const rows = await fetchSheetViaAPI(SHEET_ID, SHEET_NAME);

      if (rows.length > 0) {
        console.log('First 3 questions:');
        rows.slice(0, 3).forEach((row, i) => {
          console.log(`\n${i + 1}. ${row.questionText}`);
          console.log(`   Company: ${row.company || '(none)'}`);
          console.log(`   Type: ${row.questionType}`);
          console.log(`   Timestamp: ${row.timestamp || '(none)'}`);
        });
      }

      console.log('\n✨ Success! Your credentials are working correctly.');
      console.log('\nNext steps:');
      console.log('1. Run sync with dry-run: npm run sync:questions -- --dry-run');
      console.log('2. Run live sync: npm run sync:questions');
      console.log('3. Add credentials to Vercel for production\n');
    } else {
      console.log('❌ Connection failed!\n');
      console.log(`Error: ${result.error}\n`);
      console.log('Common issues:');
      console.log('1. Service account email not added to sheet as Viewer');
      console.log('2. Wrong sheet name/tab name');
      console.log('3. Invalid credentials format');
      console.log('4. Google Sheets API not enabled in Google Cloud Console\n');
      console.log('See /scripts/setup-google-sheets-env.md for troubleshooting');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ Error testing connection:\n');
    console.error(error);
    console.log('\nSee /scripts/setup-google-sheets-env.md for setup instructions');
    process.exit(1);
  }
}

testConnection();
