/**
 * Google Sheets API Client
 *
 * Supports multiple authentication methods:
 * - Simple API Key (for public/link-shareable sheets)
 * - Service Account (for private sheets with service account access)
 * - OAuth 2.0 (for private sheets using your Google account)
 */

import { google } from 'googleapis';

export interface SheetRow {
  timestamp: string;
  company: string;
  questionText: string;
  questionType: string;
  interviewType: string;
  comments: string;
  notes: string;
}

/**
 * Get Google Sheets API client with appropriate auth method
 */
function getGoogleSheetsClient() {
  // Method 1: Simple API Key (easiest, for public/link-shareable sheets)
  if (process.env.GOOGLE_SHEETS_API_KEY) {
    console.log('🔑 Using API Key authentication');
    return google.sheets({
      version: 'v4',
      auth: process.env.GOOGLE_SHEETS_API_KEY,
    });
  }

  // Method 2: Service Account (for private sheets)
  let credentials;

  // Try Base64 encoded credentials (easier for Vercel)
  if (process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64) {
    console.log('🔐 Using Service Account (base64) authentication');
    const decoded = Buffer.from(
      process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64,
      'base64'
    ).toString('utf-8');
    credentials = JSON.parse(decoded);
  }
  // Try Direct JSON string
  else if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    console.log('🔐 Using Service Account (JSON) authentication');
    credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
  }
  // Try Individual fields (legacy)
  else if (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  ) {
    console.log('🔐 Using Service Account (email+key) authentication');
    credentials = {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
        /\\n/g,
        '\n'
      ),
    };
  } else {
    throw new Error(
      'Google Sheets credentials not found. Set one of:\n' +
      '  - GOOGLE_SHEETS_API_KEY (simple, for public sheets)\n' +
      '  - GOOGLE_SHEETS_CREDENTIALS_BASE64 (service account)\n' +
      '  - GOOGLE_SHEETS_CREDENTIALS (service account JSON)'
    );
  }

  // Create auth client for service account
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  // Return sheets API client
  return google.sheets({ version: 'v4', auth });
}

/**
 * Fetch rows from Google Sheet
 *
 * @param spreadsheetId - The sheet ID from the URL (e.g., "1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4")
 * @param range - Sheet name and range (e.g., "Sheet1!A1:G1000" or just "Sheet1")
 * @returns Array of parsed rows
 */
export async function fetchSheetViaAPI(
  spreadsheetId: string,
  range: string = 'Sheet1'
): Promise<SheetRow[]> {
  try {
    console.log(`📥 Fetching from Google Sheets API...`);
    console.log(`   Sheet ID: ${spreadsheetId}`);
    console.log(`   Range: ${range}`);

    const sheets = getGoogleSheetsClient();

    // Fetch data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log('⚠️  No data found in sheet');
      return [];
    }

    console.log(`✅ Fetched ${rows.length} rows from sheet`);

    // Parse rows
    return parseSheetValues(rows);
  } catch (error) {
    console.error('❌ Error fetching from Google Sheets API:', error);

    if (error instanceof Error) {
      // Provide helpful error messages
      if (error.message.includes('permission')) {
        throw new Error(
          'Permission denied. Make sure the service account email has Viewer access to the sheet.'
        );
      }
      if (error.message.includes('Unable to parse range')) {
        throw new Error(
          `Invalid range "${range}". Check that the sheet name is correct.`
        );
      }
      if (error.message.includes('credentials')) {
        throw new Error(
          'Invalid credentials. Check GOOGLE_SHEETS_CREDENTIALS_BASE64 environment variable.'
        );
      }
    }

    throw error;
  }
}

/**
 * Parse raw sheet values into structured rows
 */
function parseSheetValues(values: unknown[][]): SheetRow[] {
  if (values.length === 0) return [];

  // First row is header
  const headers = values[0].map((h) => String(h).toLowerCase().trim());

  // Find column indexes
  const timestampIdx = headers.findIndex((h) =>
    h.includes('timestamp') || h.includes('time') || h.includes('date')
  );
  const companyIdx = headers.findIndex((h) => h.includes('company'));
  const questionIdx = headers.findIndex((h) => h.includes('question'));
  const typeIdx = headers.findIndex((h) =>
    h.includes('question type') || h.includes('type')
  );
  const interviewTypeIdx = headers.findIndex((h) =>
    h.includes('interview type')
  );

  console.log('📋 Column mapping:', {
    timestamp: timestampIdx,
    company: companyIdx,
    question: questionIdx,
    type: typeIdx,
    interviewType: interviewTypeIdx,
  });

  // Parse data rows
  const rows: SheetRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // Skip empty rows
    if (!row || row.length === 0 || !row.some((cell) => cell)) {
      continue;
    }

    // Extract values
    const questionText = questionIdx >= 0 ? String(row[questionIdx] || '').trim() : '';
    const questionType = typeIdx >= 0 ? String(row[typeIdx] || '').trim() : '';

    // Skip rows without question text
    if (!questionText) {
      continue;
    }

    rows.push({
      timestamp: timestampIdx >= 0 ? String(row[timestampIdx] || '') : '',
      company: companyIdx >= 0 ? String(row[companyIdx] || '').trim() : '',
      questionText,
      questionType,
      interviewType: interviewTypeIdx >= 0 ? String(row[interviewTypeIdx] || '').trim() : '',
      comments: '', // Not needed for sync
      notes: '', // Not needed for sync
    });
  }

  console.log(`✅ Parsed ${rows.length} valid question rows`);
  return rows;
}

/**
 * Test Google Sheets API connection
 *
 * Returns true if connection works, false otherwise
 */
export async function testGoogleSheetsConnection(
  spreadsheetId: string,
  range: string = 'Sheet1'
): Promise<{ success: boolean; error?: string; rowCount?: number }> {
  try {
    const rows = await fetchSheetViaAPI(spreadsheetId, range);
    return {
      success: true,
      rowCount: rows.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
