/**
 * Google Sheets Client
 *
 * Provides two methods to fetch data from Google Sheets:
 * - Method A: Fetch from public CSV URL (simpler, no auth required)
 * - Method B: Use Google Sheets API (requires service account)
 */

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
 * Method A: Fetch sheet as CSV from published URL
 *
 * Instructions to get CSV URL:
 * 1. Open your Google Sheet
 * 2. File → Share → Publish to web
 * 3. Select "Entire Document" or specific sheet
 * 4. Choose "Comma-separated values (.csv)" format
 * 5. Click "Publish" and copy the URL
 * 6. Add to .env.local as GOOGLE_SHEET_CSV_URL
 */
export async function fetchSheetAsCSV(csvUrl: string): Promise<SheetRow[]> {
  try {
    console.log(`📥 Fetching CSV from: ${csvUrl}`);

    const response = await fetch(csvUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();

    if (!csvText || csvText.trim().length === 0) {
      throw new Error('Empty CSV response');
    }

    return parseCSV(csvText);
  } catch (error) {
    console.error('❌ Error fetching CSV:', error);
    throw new Error(`Failed to fetch CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Method B: Fetch sheet via Google Sheets API
 *
 * Requires:
 * - GOOGLE_SHEETS_API_KEY (or service account credentials)
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL (if using service account)
 * - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (if using service account)
 */
export async function fetchSheetViaAPI(
  spreadsheetId: string,
  range: string = 'Sheet1'
): Promise<SheetRow[]> {
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (!apiKey) {
      throw new Error('GOOGLE_SHEETS_API_KEY not set. Use Method A (CSV) instead or configure API key.');
    }

    console.log(`📥 Fetching from Google Sheets API: ${spreadsheetId}`);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    if (!data.values || !Array.isArray(data.values)) {
      throw new Error('Invalid response format from Google Sheets API');
    }

    return parseSheetValues(data.values);
  } catch (error) {
    console.error('❌ Error fetching via API:', error);
    throw new Error(`Failed to fetch via API: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse CSV text into SheetRow objects
 * Handles quoted fields with commas correctly
 */
function parseCSV(csvText: string): SheetRow[] {
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('CSV is empty');
  }

  // Skip header row
  const dataLines = lines.slice(1);
  const rows: SheetRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];

    try {
      const fields = parseCSVLine(line);

      // Expecting 7 columns: Timestamp, Company, Question Text, Question Type, Interview Type, Comments, Notes
      if (fields.length < 4) {
        console.warn(`⚠️  Row ${i + 2} has fewer than 4 fields, skipping: ${line.substring(0, 50)}...`);
        continue;
      }

      rows.push({
        timestamp: fields[0] || '',
        company: fields[1] || '',
        questionText: fields[2] || '',
        questionType: fields[3] || '',
        interviewType: fields[4] || '',
        comments: fields[5] || '',
        notes: fields[6] || '',
      });
    } catch (error) {
      console.warn(`⚠️  Error parsing row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields correctly
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Add last field
  fields.push(currentField.trim());

  return fields;
}

/**
 * Parse Google Sheets API response values into SheetRow objects
 */
function parseSheetValues(values: string[][]): SheetRow[] {
  // Skip header row
  const dataRows = values.slice(1);
  const rows: SheetRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];

    // Skip empty rows
    if (!row || row.length === 0 || !row.some(cell => cell && cell.trim())) {
      continue;
    }

    // Expecting 7 columns
    if (row.length < 4) {
      console.warn(`⚠️  Row ${i + 2} has fewer than 4 fields, skipping`);
      continue;
    }

    rows.push({
      timestamp: row[0] || '',
      company: row[1] || '',
      questionText: row[2] || '',
      questionType: row[3] || '',
      interviewType: row[4] || '',
      comments: row[5] || '',
      notes: row[6] || '',
    });
  }

  return rows;
}

/**
 * Validate that a sheet row has required fields
 */
export function validateSheetRow(row: SheetRow): { valid: boolean; error?: string } {
  if (!row.questionText || row.questionText.trim().length === 0) {
    return { valid: false, error: 'Missing question text' };
  }

  if (!row.questionType || row.questionType.trim().length === 0) {
    return { valid: false, error: 'Missing question type' };
  }

  return { valid: true };
}
