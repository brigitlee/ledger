#!/usr/bin/env python3
# 記帳 App「同步記帳」：把雲端試算表的新帳寫進 2026 .ods 支出明細
# 用法：先用 curl 把雲端 JSON 抓到 /tmp/cloud.json，再執行本檔
#   curl -s -L "$(cat .sync-url)" > /tmp/cloud.json && python3 sync_to_ods.py
import zipfile, shutil, re, json, sys, os
from datetime import datetime, timezone, timedelta
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

ODS = os.environ.get('ANYU_ODS', '/Volumes/Wonderland/Documents/個人理財收支記錄表/2026財務規劃大藍圖.ods')
HERE = os.path.dirname(os.path.abspath(__file__))
SYNCED_FILE = os.path.join(HERE, '.synced-ids')
CLOUD = '/tmp/cloud.json'
T = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
X = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
tz8 = timezone(timedelta(hours=8))

def tw_date(v):
    if isinstance(v, str) and 'T' in v:
        return datetime.fromisoformat(v.replace('Z', '+00:00')).astimezone(tz8).date()
    return datetime.fromisoformat(str(v)[:10]).date()

def read_expense_sheet():
    """回傳 (列文字, month欄→該月最後一列index, 既有(月,細項,金額)集合)"""
    root = ET.fromstring(zipfile.ZipFile(ODS).read('content.xml'))
    for sh in root.iter('{%s}table' % T):
        if sh.get('{%s}name' % T) != '支出明細（原始資料）':
            continue
        rows = sh.findall('{%s}table-row' % T)
        existing = set()
        month_last = {}
        for ri, row in enumerate(rows):
            cells = []
            for c in row.findall('{%s}table-cell' % T):
                cells.append(' '.join(p.text or '' for p in c.iter('{%s}p' % X)).strip())
            vals = [c for c in cells if c != '']
            if not vals:
                continue
            # 結構：month, (日期可有可無), 項目, 細項, 金額, 付費...
            m = cells[0]
            if m.isdigit():
                month_last[int(m)] = ri
            # 既有比對鍵（月,細項,金額）
            digits = [c for c in cells if c.replace('.', '').isdigit()]
            txts = [c for c in cells if c and not c.replace('.', '').isdigit() and '月' not in c]
            existing.add((m, ' '.join(cells)))  # 保底
        return rows, month_last, existing
    return None, {}, set()

def main():
    data = json.load(open(CLOUD))
    synced = set(l.strip() for l in open(SYNCED_FILE) if l.strip()) if os.path.exists(SYNCED_FILE) else set()

    # 讀 .ods 現況，建立內容比對集合（月+細項+金額）
    root = ET.fromstring(zipfile.ZipFile(ODS).read('content.xml'))
    sheet = next(s for s in root.iter('{%s}table' % T) if s.get('{%s}name' % T) == '支出明細（原始資料）')
    rows = sheet.findall('{%s}table-row' % T)
    def row_cols(row, maxcol=6):
        # 依固定欄位展開（處理 number-columns-repeated）：0月 1日期 2項目 3細項 4金額 5付費
        cols = []
        for c in row.findall('{%s}table-cell' % T):
            rep = int(c.get('{%s}number-columns-repeated' % T, 1))
            txt = ' '.join(p.text or '' for p in c.iter('{%s}p' % X)).strip()
            for _ in range(rep):
                cols.append(txt)
                if len(cols) >= maxcol:
                    return cols
        return cols

    existing_keys = set()
    month_last = {}
    for ri, row in enumerate(rows):
        cols = row_cols(row, 6)
        if not any(cols):
            continue
        m = cols[0] if cols else ''
        if m.isdigit():
            month_last[int(m)] = ri
            detail = cols[3] if len(cols) > 3 else ''
            amtstr = cols[4] if len(cols) > 4 else ''
            amt = int(float(amtstr)) if amtstr.replace('.', '').isdigit() else None
            existing_keys.add((int(m), detail, amt))

    # 篩出要寫入的新支出
    to_write, dup, handled_ids = [], [], []
    for r in data:
        rid = str(r.get('id', ''))
        if rid.startswith(('test-', 'pv-')) or rid in synced:
            continue
        if r.get('類型') != '支出':
            continue  # 收入待實作
        d = tw_date(r.get('日期'))
        detail = str(r.get('細項', ''))
        amt = int(float(r.get('金額'))) if r.get('金額') not in (None, '') else None
        key = (d.month, detail, amt)
        item = {'id': rid, 'month': d.month, 'date': d.isoformat(), 'datestr': f"{d.month}月{d.day}日",
                'cat': str(r.get('分類', '')), 'detail': detail, 'amount': r.get('金額'),
                'pay': str(r.get('付費方式', '')), 'place': str(r.get('地點', ''))}
        if key in existing_keys:
            dup.append(item); handled_ids.append(rid)
        else:
            to_write.append(item); handled_ids.append(rid)

    print(f"雲端新帳：寫入 {len(to_write)} 筆，跳過重複 {len(dup)} 筆")
    for e in dup:
        print(f"  ⏭ 跳過（.ods 已有）：{e['datestr']} {e['detail']} {e['amount']}")
    for e in to_write:
        print(f"  ✅ 寫入：{e['datestr']} {e['cat']} {e['detail']} {e['amount']} {e['pay']} {e['place'] or ''}")
    if not to_write:
        # 仍把重複的標記為已處理，避免下次再比對
        if handled_ids:
            with open(SYNCED_FILE, 'a') as f:
                for i in handled_ids: f.write(i + '\n')
        print("沒有需要寫入的新帳。")
        return

    # 依月份分組，插在該月最後一列之後（落在正確的月份區段）
    def cs(s, t, e=''): return f'<table:table-cell table:style-name="{s}"{e} office:value-type="string"><text:p>{escape(t)}</text:p></table:table-cell>'
    def cf(s, v): return f'<table:table-cell table:style-name="{s}" office:value-type="float" office:value="{v}"><text:p>{v}</text:p></table:table-cell>'
    def cd(s, dv, t): return f'<table:table-cell table:style-name="{s}" office:value-type="date" office:date-value="{dv}"><text:p>{escape(t)}</text:p></table:table-cell>'
    def mk(e):
        cells = (cf('ce213', e['month']) + cd('ce219', e['date'], e['datestr']) +
                 cs('ce213', e['cat'], ' table:content-validation-name="val1"') + cs('ce226', e['detail']) +
                 cf('ce213', e['amount']) + cs('ce213', e['pay']) + cs('ce213', e['place']) +
                 '<table:table-cell table:number-columns-repeated="1017"/>')
        return f'<table:table-row table:style-name="ro57">{cells}</table:table-row>'

    xml = zipfile.ZipFile(ODS).read('content.xml').decode('utf-8')
    tbl_i = xml.find('table:name="支出明細（原始資料）"')
    tbl_end = xml.find('</table:table>', tbl_i)
    seg = xml[tbl_i:tbl_end]
    row_starts = [m.start() for m in re.finditer(r'<table:table-row', seg)]
    row_ends = row_starts[1:] + [len(seg)]

    # 計算每筆要插入的全域 offset（同月接在該月最後一列後；無該月則接最後一筆資料後）
    last_content = max((k for k in range(len(row_starts)) if 'office:value=' in seg[row_starts[k]:row_ends[k]]), default=0)
    inserts = {}  # offset -> 累積 row xml
    from collections import defaultdict
    by_month = defaultdict(list)
    for e in to_write:
        by_month[e['month']].append(e)
    for mth, items in by_month.items():
        anchor = month_last.get(mth, last_content)
        off = tbl_i + row_ends[anchor]
        inserts.setdefault(off, '')
        inserts[off] += ''.join(mk(e) for e in items)

    # 由大到小 offset 套用，避免位移
    xml2 = xml
    for off in sorted(inserts, reverse=True):
        xml2 = xml2[:off] + inserts[off] + xml2[off:]

    out = ODS + '.tmp'
    zin = zipfile.ZipFile(ODS)
    with zipfile.ZipFile(out, 'w') as zout:
        for it in zin.infolist():
            d = zin.read(it.filename)
            if it.filename == 'content.xml':
                d = xml2.encode('utf-8')
            zout.writestr(it, d, compress_type=(zipfile.ZIP_STORED if it.filename == 'mimetype' else zipfile.ZIP_DEFLATED))
    zin.close()
    shutil.move(out, ODS)

    with open(SYNCED_FILE, 'a') as f:
        for i in handled_ids:
            f.write(i + '\n')
    print(f"✅ 已寫入 {len(to_write)} 筆並記錄同步狀態。")

if __name__ == '__main__':
    main()
