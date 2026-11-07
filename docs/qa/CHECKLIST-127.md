# Checklist ตรวจซ้ำ — QA Check #127

**นี่คือ checklist รอบ baseline ก่อนแก้** ดู [ผลตรวจซ้ำปัจจุบัน](QA-RETEST-127.md) สำหรับสถานะหลังแก้

Baseline และหลักฐานอยู่ใน [รายงาน](QA-CHECK-127.md) ช่องผลด้านล่างเป็นผลรอบแรก ไม่ใช่ acceptance sign-off ทุกหัวข้อ

## #146 / #147 — Consent, privacy notice และ self-service

| Case | วิธีตรวจ / Expected | ผลรอบแรก |
|---|---|---|
| PD-UI-01 | เปิด login ก่อน OAuth แล้วกด privacy notice ต้องเปิดเนื้อหาที่อ่านได้ | FAIL — BUG-12; link `#` |
| PD-02 | ผู้ใช้ที่ไม่มี consent/ถอน consent ต้องไม่สร้าง profile ได้ตาม NFR-PD1 | FAIL — BUG-02; handler คืน 201 |
| PD-03 | สร้าง grant แล้ว revoke; GET consent ต้องคืนสถานะล่าสุดของแต่ละ purpose | FAIL ที่โครงสร้าง aggregation — BUG-03; ต้องทวน actual records หลังแก้ |
| PD-01 | ส่งอีเมลยืนยันลบบัญชีที่ไม่ตรง ต้อง 400 และไม่เขียน DB | PASS — stubbed handler |
| PD-04 | ลบข้อมูลแล้วต้องมี erasure path ของข้อมูลที่เกี่ยวข้อง หรือ purge job ที่ติดตามได้ตามระยะเวลาที่แจ้ง | FAIL — BUG-04; ไม่พบ purge job |
| PD-05 | Export fixture ที่มี 105 notifications ต้องไม่ตกหล่นเหลือ 100 | FAIL — BUG-13 |
| PD-M01 | เปิด UI ให้ผู้ใช้ดู/ถอน consent, export และขอลบข้อมูลตนเอง | FAIL จาก code review — ไม่มี controls บน profile; ทวน UI หลังเพิ่ม |
| PD-M02 | ตรวจ notice version, purpose, retention, ผู้รับข้อมูล/AI provider และช่องทางใช้สิทธิ์กับผู้รับผิดชอบ | PENDING — ต้องมี policy ที่อนุมัติ |
| PD-M03 | บน QA DB ตรวจ access/export/delete ของผู้ใช้ A ไม่คืนข้อมูล B; ทวน audit และ retention jobs | PENDING — ยังไม่ใช้ DB จริง |

## #149 — Personal data removed

| Case | วิธีตรวจ / Expected | ผลรอบแรก |
|---|---|---|
| PII-01 | อ่านวันที่จากประกาศที่มีชื่อในลายเซ็น ต้องไม่เก็บชื่อเจ้าหน้าที่ใน date context | PASS — existing extraction checks |
| PII-02 | ข้อความเดือน “มิถุนายน” ต้องไม่ถูกปิดเพราะมีตัวอักษรคล้าย “นาย” | PASS — existing extraction checks |
| PII-03 | ตรวจทั้ง PDF/text ก่อนส่ง AI และก่อนบันทึก/แสดง ไม่ให้ข้อมูลที่อยู่นอกขอบเขตที่อนุมัติหลุดออกไป | PENDING / GAP — พบ raw PDF/text path; ยังไม่ตรวจ real sample |
| PII-04 | สร้างชุดตัวอย่างปลอมที่มีชื่อ เบอร์ อีเมล เลขประจำตัว; ตรวจทุก output/log/source metadata ตาม removal policy | PENDING — ต้องกำหนด removal policy และเกณฑ์ยกเว้นก่อน |

## #129 — Search / filter / sort

| Case | Input / Expected | ผลรอบแรก |
|---|---|---|
| SEARCH-01 | `เว็บไซต์` ↔ `website`, หลายคำ, วลี, เลขโครงการ, อักขระ regex ตามตัวอักษร | PASS — 17 existing search assertions; ไม่ใช่ Mongo query execution |
| FR-A-01 | คำค้น + phase + open + ราคาตั้งแต่ 500,000 ถึง 1,000,000 ต้องอยู่ร่วมใน query | PASS — handler query capture |
| FR-A-02 | ราคาข้างเดียว, เริ่มจาก 0 และ min=max ต้องประกอบ `$gte/$lte` ถูก | PASS — handler query capture |
| FR-A-03 | ค่าติดลบ, NaN, Infinity, min>max, repeated min และ whitespace ต้อง 400 | PASS — handler |
| FR-A-04 | Sort วันที่/ราคา/deadline และ page=2, limit=20 ต้องส่ง sort/skip/limit ถูก | PASS — handler query capture |
| FR-A-05 | q ซ้ำ, q ยาวเกิน, scope/status ไม่ถูกต้อง ต้อง 400 | PASS — handler |
| FR-A-06 | page/limit เป็นตัวอักษร ต้องไม่ส่ง NaN ไป DB | FAIL — BUG-05 |
| FR-A-07 | ชื่อหน่วยงาน `.*` ต้องไม่จับทุกชื่อ | FAIL — BUG-06 |
| FR-A-08 | techStack ซ้ำหลายค่า ต้อง 400 หรือรองรับโดยตั้งใจ ไม่เป็น 500 | FAIL — BUG-07 |
| FR-A-UI-01 | กรอก min 1,000,000 ต้องส่ง parameter และแสดง fixture 2 รายการ | PASS — Chrome + mock API |
| FR-A-UI-02 | min 1,000,000 / max 500,000 ต้องมีข้อความผิดพลาด และล้างช่วงราคาได้ | PASS — Chrome + mock API |
| FR-A-UI-03 | คำค้นที่ไม่ตรงต้องแสดง 0 รายการและ empty state | PASS — Chrome + mock API |
| SEARCH-M01 | บน QA MongoDB ใส่ราคา 499,999.99 / 500,000 / 1,000,000 / 1,000,000.01 และตรวจ inclusive boundaries | PENDING |
| SEARCH-M02 | Seed >20 records รวมวัน/ราคาซ้ำ ตรวจ total, page1/page2 ไม่ซ้ำไม่ตก และเปลี่ยน filter กลับ page1 | PENDING — ยังไม่มี DB-backed pagination test |
| SEARCH-M03 | ตรวจ filter ตาม F8/FR-11: agency, budget แยกจาก median, posting date, tech stack, eligibility | PARTIAL — UI/API ยังไม่ครบตาม SRS |
| SEARCH-M04 | พิมพ์เร็ว/สลับตัวกรองระหว่าง network response ช้า ต้องไม่ให้ response เก่าทับใหม่ | PENDING — มี AbortController ใน source แต่ยังไม่ได้ทดสอบ delayed response ใน browser |

## #130 — Extracted data and confidence

| Case | วิธีตรวจ / Expected | ผลรอบแรก |
|---|---|---|
| FR-B-01 | confidence นอกช่วง 0–1 ต้องไม่ผ่าน schema validation | PASS — Mongoose document validation แบบ offline |
| FR-B-UI-01 | ส่ง scope, qualifications, price, evaluation แบบจำลองแล้วต้องแสดงเนื้อหา | PASS — Chrome fixture |
| FR-B-UI-02 | confidence 0.91/0.85/0.75 และ low confidence 0.55 ต้องมีค่ารายฟิลด์ให้ผู้ใช้เห็น | FAIL — BUG-11 |
| EXTRACT-01 | วันยื่น, คำอ่านจำนวนเงิน, แยกงบ/ราคากลาง, ระยะเวลา, alternative qualifications และข้อมูลไม่ครบ | PASS — 73 existing deterministic checks รวมหลายหมวด; ไม่ใช่ 73 LLM accuracy cases |
| EXTRACT-M01 | เทียบ 4 ฟิลด์หลักกับ ground truth ของ TOR จริง และจด prompt/model/version | PENDING — ไม่เรียก external AI ในรอบนี้ |
| EXTRACT-M02 | ทวน UI เมื่อ pending/failed/missing/low-confidence; flag/correction ต้องบันทึกและตรวจย้อนหลังได้ | PENDING |

## #132 — Security

| Case | วิธีตรวจ / Expected | ผลรอบแรก |
|---|---|---|
| SEC-01 | ไม่มี token: TOR/profile/export/bookmarks/notifications/admin ต้อง 401 | PASS — handler |
| SEC-02 | token ปลอม/หมดอายุ ต้อง 401 | PASS — real JWT verification |
| SEC-03 | claim banned/suspended ต้อง 403 | PASS — handler |
| SEC-04 | role user เข้า admin ต้อง 403 | PASS — handler |
| SEC-05 | token active ที่ออกก่อนแบน/ลบต้องถูกยกเลิกตามสถานะปัจจุบัน | FAIL — BUG-01 |
| SEC-06/07/08 | profile query, ลบ bookmark และ mark notification ต้องผูกกับ authenticated owner | PASS — captured owner filters; ต้องทวน A/B บน DB จริง |
| SEC-M01 | OAuth state, callback URL, failure flow, session/token exposure และ role เปลี่ยนระหว่าง session | PENDING / CODE-REVIEW GAPS |
| SEC-M02 | ตรวจ staging HTTPS/TLS, CORS จริง, production secret, security headers, rate limits และ dependencies | PENDING — ไม่ใช่ penetration test หรือ dependency audit รอบเต็ม |

## #133 — UI / devices / browsers

| Case | Expected | ผลรอบแรก |
|---|---|---|
| UI-01 | Procurement/profile/bookmarks/alerts/detail ไม่ล้นแนวนอนที่ 1440, 768, 390 px | PASS — Chrome fixture 15 layout checks |
| UI-02 | เมนูหลักใช้ได้ทุก viewport | FAIL — mobile main navigation ไม่ครบ; ไม่ใช่การยืนยันว่าทุก route เข้าไม่ได้ |
| TOUR-01 | Profile อยู่ส่วนแรก, กล่องทัวร์ 6 ส่วนไม่ล้น และกด Escape ปิดได้ | PASS — Chrome ทั้ง 3 viewport |
| UI-03 | ไม่มี uncaught runtime exception ใน flow ที่ทดสอบ | PASS — Chrome Runtime.exceptionThrown |
| UI-M01 | Chrome/Firefox/Safari/Edge สองเวอร์ชันล่าสุด รวม iOS/Android จริง | PENDING — ตรวจ Chrome headless เวอร์ชันเดียวเท่านั้น |
| UI-M02 | Keyboard focus, screen reader, contrast, zoom 200%, long text และ slow/offline/error responses | PENDING — มีเพียง Escape และ viewport smoke; ยังไม่ใช่ accessibility audit |

## #135 — Thai formatting

| Case | Expected | ผลรอบแรก |
|---|---|---|
| TH-01 | วันที่ไทยชื่อเดือนเต็ม/ย่อและตัวเลข พ.ศ. แปลงเป็น 2026 ถูก | PASS — date helper |
| TH-02 | 1,234,567.50 จัดรูปแบบ THB และ parse กลับได้ | PASS — currency helper |
| TH-03 | 31 ก.พ. ต้องไม่เลื่อนเป็น มี.ค. โดยเงียบ | FAIL — BUG-08 |
| TH-04 | ขอ Gregorian ต้องได้ 2026 ไม่ใช่ 2569 | FAIL — BUG-09 |
| TH-05 | เลขไทยในวันที่ต้องอ่านได้ | FAIL — BUG-10 ใน frontend helper; backend parser ผ่าน |
| TH-M01 | Browser timezone อื่น, ข้ามเที่ยงคืน, ปีงบ, ค่าศูนย์/null/ทศนิยม และข้อความไทยยาวบนทุกหน้าจอ | PENDING — ทดสอบ utility/fixture บางส่วนเท่านั้น |

## #136 — Scraper compliance

| Case | Expected | ผลรอบแรก |
|---|---|---|
| SCR-01 | มี delay/backoff เมื่อหลายคำขอหรือ 429/5xx | PARTIAL — พบ source delay/backoff แต่ยังไม่ได้จำลอง quota/retry จริง |
| SCR-02 | มี source inventory, robots/terms/permission และวันที่ตรวจของ egp2/process/process5 | BLOCKED — robots เปิดด้วยเครื่องมือเว็บไม่ได้; ยังไม่มี terms approval |
| SCR-03 | ตัว scraper ตัดสิน allow/deny ก่อน fetch และหยุดเมื่อ policy ไม่อนุญาต | GAP — ยังไม่พบ implementation |
| SCR-04 | ทุก client มี identity/contact ที่เหมาะสมและใช้ rate ceiling ที่ได้รับอนุมัติ | PARTIAL — RSS ระบุโปรเจกต์; document client ใช้ browser UA; policy ยังไม่อนุมัติ |

## เกณฑ์ปิดรอบตรวจ

- [ ] แก้ High findings และ rerun failed tests จนได้ expected result
- [ ] ทดสอบ staging/QA database พร้อมข้อมูลจำลองและผู้ใช้ A/B
- [ ] มีหลักฐาน real-browser matrix และการเทียบ extraction กับต้นฉบับ
- [ ] ผู้รับผิดชอบรับรอง notice/retention/removal scope และ source permissions
- [ ] อัปเดต expected/actual และหลักฐานหลังแก้ ไม่อาศัยผลรอบนี้ปิดงานอัตโนมัติ
