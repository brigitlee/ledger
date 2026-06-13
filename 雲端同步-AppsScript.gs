/**
 * 記帳 App 雲端信箱（Google Apps Script）
 * 貼進 Google 試算表的 Apps Script 編輯器，部署成「網頁應用程式」即可。
 * 手機 App 用 POST 寄帳進來；電腦用 GET 把帳讀出來寫進 .ods。
 */

const SHEET_NAME = '帳';
const HEADERS = ['id', '類型', '日期', '分類', '細項', '金額', '付費方式', '地點', '記錄時間'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

// 手機 App 寄帳進來（一筆或多筆）
function doPost(e) {
  try {
    const sheet = getSheet_();
    const existing = {};
    sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0) || 1, 1).getValues()
      .forEach(r => { if (r[0]) existing[r[0]] = true; });

    const body = JSON.parse(e.postData.contents);
    const rows = Array.isArray(body) ? body : (body.rows || [body]);
    let added = 0;
    rows.forEach(r => {
      if (r.id && existing[r.id]) return; // 已寄過就跳過，避免重複
      sheet.appendRow([r.id || '', r.type || '支出', r.date || '', r.cat || '',
        r.detail || '', r.amount || '', r.pay || '', r.place || '', r.ts || '']);
      added++;
    });
    return json_({ ok: true, added: added });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// 電腦把帳全部讀出來（之後在電腦端比對哪些還沒寫進 .ods）
function doGet(e) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const out = values.map(row => {
    const o = {};
    headers.forEach((h, i) => o[h] = row[i]);
    return o;
  });
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
