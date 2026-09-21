// Google Apps Script for the cyclo-code-versailles leaderboard.
//
// This is a STANDALONE script, not a bound one. The sibling game
// (cyclo-guess-versailles) already owns the bound script of its spreadsheet,
// and a spreadsheet can only have one. So this one opens the spreadsheet by id
// instead, which also means the "scores_code" tab can live either in that same
// spreadsheet or in one of its own.
//
// Setup:
//   1. The target tab is "scores_code", with this header row:
//        A: timestamp   B: name   C: score
//   2. Create the script at script.google.com > New project, paste this file.
//   3. Fill SPREADSHEET_ID below. It is the long id in the sheet's URL:
//        https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
//   4. Deploy > New deployment > type "Web app",
//        - Execute as: Me            (so it reaches the sheet with your rights)
//        - Who has access: Anyone
//   5. Copy the resulting /exec URL into VITE_LEADERBOARD_URL, both in
//      .env.local and in the repo's Actions secrets.
//
// Do NOT point this at the "scores" tab: that one belongs to the sibling game
// and the two classements must stay separate.

const SPREADSHEET_ID = "PASTE_THE_SPREADSHEET_ID_HERE";
const SHEET_NAME = "scores_code";

function sheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

// Read: returns the top scores. Supports JSONP via ?callback=fn (used by the app).
function doGet(e) {
  const rows = sheet_().getDataRange().getValues();
  const data = rows
    .slice(1) // drop header
    .filter((r) => r[1] !== "" || r[2] !== "")
    .map((r) => ({ ts: r[0], name: String(r[1]), score: Number(r[2]) || 0 }));
  data.sort((a, b) => b.score - a.score);

  const payload = JSON.stringify({ scores: data.slice(0, 100) });
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + payload + ")").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(payload).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Write: appends one score row.
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const name = String(body.name || "Anonyme").slice(0, 30);
  const score = Number(body.score) || 0;
  sheet_().appendRow([new Date(), name, score]);
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}
