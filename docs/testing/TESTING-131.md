# Testing #131 — ผลทดสอบ

รอบตรวจ 8 พฤศจิกายน 2569 บน branch `test/testing` ต่อจาก QA commit `6b057aa80532f2dea602d8d3a468add6415cd6c6` ไฟล์ในรอบนี้ยังอยู่ใน working tree; hash ของ source/config ที่ตรวจอยู่ใน [source-manifest.json](evidence/source-manifest.json)

## สถานะตามรายการงาน

| Issue | งาน | ผล |
|---|---|---|
| #134 | Unit tests | ผ่าน — 27 tests ใหม่ และ regression เดิม 13 กลุ่ม |
| #137 | Scraper functions | ผ่าน — 10 tests: ZIP/PDF จริงจาก fixture, CP874/UTF-8, document picking, RSS และ URL encoding |
| #138 | LLM parser output | ผ่าน — 8 tests สำหรับ deterministic validation/mapping; ไม่ใช่การวัด model accuracy บน TOR จริง |
| #139 | Search/filter logic | ผ่าน — 9 unit tests และการกรอง/sort/scope/pagination ผ่าน MongoDB จริง |
| #140 | Integration test | ผ่าน — 23 tests รวม parser pipeline → MongoDB → API และ OAuth จำลอง |
| #141 | End-to-end test | ผ่าน — 84 checks รวม Chrome/Firefox/WebKit บน production frontend + API + DB จริง |
| #142 | Load test | ผ่านตามเกณฑ์ demo ในเครื่อง — 1/10/50 ผู้ใช้พร้อมกัน ไม่มี request errors |
| #143 | Pilot test | เตรียมแล้ว / ยังไม่รัน — ยังไม่มีผู้เข้าร่วม ตามขอบเขตที่กำหนด |

#131 ยังไม่ถือว่าทดลองกับผู้ใช้งานจริงครบ เพราะ #143 เป็นการเตรียมทดลอง ยังไม่เปลี่ยนสถานะ issue บน GitHub และยังไม่ได้ commit/push งานรอบนี้

## หลักฐาน

| ชุดตรวจ | หลักฐาน |
|---|---|
| Unit ใหม่ | [unit.txt](evidence/unit.txt) |
| Test scripts / fixtures types | [test-types.txt](evidence/test-types.txt) |
| QA regressions | [results](evidence/regressions/offline-results.json), [log](evidence/regressions.txt) |
| Integration + local OAuth | [integration.txt](evidence/integration.txt) |
| Load | [load-results.json](evidence/load-results.json), [log](evidence/load.txt) |
| Production frontend build | [e2e-build.txt](evidence/e2e-build.txt) |
| Chrome / Firefox / WebKit | [cross-browser-results.json](evidence/e2e/cross-browser-results.json), [log](evidence/e2e.txt) |
| คำสั่ง, exit codes และระยะเวลา | [run-results.json](evidence/run-results.json) |
| Pilot | [status](evidence/pilot-status.json), [แผนทดลอง](PILOT-143.md), [CSV template](pilot-results-template.csv) |

## สิ่งที่ทดสอบจริง

Unit สร้าง ZIP ทั้ง store/deflate และ PDF ที่อ่านด้วย `unpdf` จริง ไม่มีการดาวน์โหลดข้อมูลรัฐบาล Integration ใช้ Express routes และ MongoDB 7 จริงบน QA port กับ DB สุ่ม นอกจากบัญชี/consent/ownership/search/export/delete ยังตรวจเส้นทาง ZIP → prepare → payload review → SDK จำลอง → validate → MongoDB → อ่านผ่าน API โดยตรวจค่าคุณสมบัติ ราคา และ confidence หลังบันทึก

E2E ใช้ frontend production standalone และ API/DB จริง เริ่ม session ด้วย signed JWT ของบัญชีสมมติ ตรวจ 1440×1000, 768×1024 และ 390×844 ต่อ engine รวม navigation/tour, bilingual search, no-results recovery, ช่วงราคา, bookmarks, confidence, profile persistence, consent, export และการลบบัญชีที่ทำให้ token เก่าใช้ไม่ได้ ไม่ได้ใช้ Google provider จริงหรือส่ง TOR ไป Vertex

## Load test และเกณฑ์

ใช้ 1,000 บัญชีและ TOR ที่ parsed แล้ว 5,000 รายการตามขนาด SRS ทดสอบ closed-loop ที่ 1/10 ผู้ใช้ 10 วินาทีต่อระดับ และ 50 ผู้ใช้ 30 วินาที มีการ warm up ก่อนวัด ทุก request ต้องเป็น 200 พร้อม JSON ที่ตรงเงื่อนไขค้นหา/ราคา ไม่ใช้ health endpoint มานับแทนงานจริง

เกณฑ์ของ demo รอบนี้: p95 ≤ 2,000 ms, error rate 0, ระยะเวลาถึงเป้า และ in-flight ถึงจำนวนผู้ใช้ที่กำหนด SRS ระบุ 50 ผู้ใช้พร้อมกันและขนาดข้อมูล แต่ไม่ได้ระบุ latency SLA เป็นตัวเลข จึงไม่อ้างว่า 2 วินาทีเป็นเกณฑ์ที่อาจารย์กำหนด ผลเป็น localhost บนเครื่องเดียว ไม่ครอบคลุม soak, distributed production, queue architecture, profile-heavy matching หรือกำลังรองรับของ Vertex

| ผู้ใช้พร้อมกัน | ระยะเวลา (วินาที) | Requests | p95 (ms) | Requests/s | Errors |
|---|---|---|---|---|---|
| 1 | 10.0 | 2,665 | 7.0 | 266.5 | 0 |
| 10 | 10.0 | 8,850 | 18.3 | 884.6 | 0 |
| 50 | 30.0 | 25,343 | 76.9 | 844.2 | 0 |

สภาพแวดล้อม: macOS ARM64, Node v22.18.0, 10 logical CPUs, RAM 16 GiB; process ของ load driver/API อยู่เครื่องเดียวกับ MongoDB ตัวเลขนี้ไม่แทนผลบน server จริง

## CI และการรันซ้ำ

แทนที่ขั้น Test เดิมที่พิมพ์ข้อความว่าผ่านด้วย unit/regression จริง เพิ่ม jobs สำหรับ integration/load กับ MongoDB service และ E2E บน 3 engines แนบ logs/JSON เป็น artifacts และให้ build รอ tests ไฟล์ workflow ผ่านการตรวจ YAML ในเครื่อง แต่ยังไม่ได้รัน GitHub Actions จริงในรอบนี้

ใช้ `npm run test:all` จาก repo root; ดู prerequisites, การติดตั้ง browser/MongoDB และคำสั่งแยกใน [README](README.md) ผล QA เดิมไม่ถูกเขียนทับ ใช้ test dependency Playwright จาก root lockfile แทนการพึ่ง package ที่อยู่นอก repo

## ข้อจำกัดและงานต่อ

- #143 ต้องมีผู้เข้าร่วมและผล/feedback จริงก่อนสรุป completion rate หรือปิด pilot มีแผนและแบบบันทึกพร้อมแล้ว
- ข้อความ “ผ่าน” ของ parser หมายถึง output contract/logic/fixture เท่านั้น ไม่ใช่คุณภาพ OCR หรือ extraction accuracy ของ external LLM
- WebKit engine ไม่ใช่ installed Safari หรือ iPhone จริง ไม่ได้ทดสอบสองรุ่นล่าสุดทุก browser; ผล iOS เดิมในรายงาน QA เป็นอีกชุดหนึ่ง
- สิทธิ์ต้นทาง #136 ยังติดตามภายหลังตามขอบเขต QA; ไม่มี live scraper/Google/Vertex/SMTP requests ใน Testing รอบนี้
- ไม่ใช้ `.env` database หรือข้อมูลบัญชีจริง สร้าง/ลบเฉพาะ scratch DB ของแต่ละ suite หยุด process ที่ runner เปิดเองและลบ temp เมื่อจบ ภาพ PNG อยู่ในเครื่องและ ignore จาก Git
