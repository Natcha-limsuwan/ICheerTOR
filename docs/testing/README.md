# Testing #131

งานบน branch `test/testing` แยกหลักฐานจาก `docs/qa/` ผลล่าสุดและสถานะราย issue อยู่ใน [TESTING-131.md](TESTING-131.md)

## เตรียมเครื่อง

ใช้ Node 22 และ MongoDB 7 สำหรับทดสอบ ติดตั้ง dependencies จาก repo root:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install firefox webkit
```

Playwright pin เวอร์ชันใน root lockfile เครื่อง macOS ใช้ Google Chrome ที่ติดตั้งใน `/Applications/Google Chrome.app`; ถ้าติดตั้งที่อื่นกำหนด `QA_CHROME_EXECUTABLE` เป็น absolute path บน Linux runner ใช้ bundled Chromium จึงติดตั้งด้วย `npx playwright install --with-deps chromium firefox webkit`

หากต้องเก็บ test engines ใน `/tmp` ให้ตั้ง `PLAYWRIGHT_BROWSERS_PATH` **ค่าเดียวกันทั้งตอน install และรัน tests** ตัวอย่างรอบตรวจนี้ใช้ `/tmp/icheertor-testing-browsers`

ติดตั้ง `mongod` ให้อยู่ใน PATH หรือระบุ `MONGOD_BINARY=/absolute/path/to/mongod` Runner จะเปิด MongoDB เฉพาะ localhost:27019 กับ data directory สุ่มใน temp และปิดเมื่อจบ รองรับ macOS/Linux ในรอบนี้มี fallback ไป binary QA เดิมใน `/tmp/icheertor-qa-mongodb/bin/mongod` หากมีอยู่ แต่เครื่องอื่นไม่ต้องพึ่ง path นี้

ถ้าเปิด MongoDB QA ไว้เองแล้วที่พอร์ต 27019 ให้ตั้ง `TEST_EXTERNAL_MONGO=1` เพื่อใช้ instance นั้น Runner จะไม่หยุด process ภายนอก ทดสอบแต่ละชุดสร้าง DB ชื่อสุ่มและลบเฉพาะของตนเอง ห้ามชี้พอร์ต QA ไป production/DB ที่มีข้อมูลจริง

## คำสั่ง

รันจาก repo root:

| คำสั่ง | งานที่ทำ |
|---|---|
| `npm test` | unit ใหม่, test script types, Next typegen และ QA regressions เดิม |
| `npm run test:integration` | real HTTP + MongoDB และ OAuth callback/provider จำลอง |
| `npm run test:load` | 1,000 บัญชี/5,000 TOR สมมติ, 1/10/50 ผู้ใช้พร้อมกัน |
| `npm run test:e2e` | สร้าง API/DB สมมติ, build production frontend และรัน 3 browser engines |
| `npm run test:all` | ทั้งหมดตามลำดับ พร้อม cleanup |

เลือกหลายส่วนได้ เช่น `node scripts/testing/run.mjs --integration --load` คำสั่งจบ nonzero หาก test, startup, build หรือ readiness ไม่ผ่าน ไม่แสดง PASS จากเพียงข้อความที่พิมพ์ออกมา

ทดสอบ browser ต้องมีพอร์ต 3100/3101 ว่าง Runner ไม่หยุด server เดิมที่ครองพอร์ต และทดสอบ DB ใช้แค่ 27019 โดยไม่ใช้ URI จาก `.env` โปรไฟล์และ JWT จำลองเก็บใน temp permission 0600 ไม่พิมพ์ลง logs ไม่ใช้ Google จริง/Vertex/SMTP หรือดึง TOR จากเว็บรัฐบาล

Build ใช้ `next build --webpack` ตาม Next CLI ใน repo และรัน standalone output จริง รองรับทั้ง `.next/standalone/server.js` และรูปแบบ monorepo `.next/standalone/frontend/server.js` คัดลอก public/static ไปยัง app directory ที่ถูกต้อง คืนไฟล์ `frontend/next-env.d.ts` ตามเดิมเมื่อจบ

## ชุดทดสอบ

- **#137 Scraper functions:** ZIP store/deflate, UTF-8/CP874, archive เสีย, เลือก TOR/ตัดสัญญา, RSS, URL encoding และอ่าน PDF text จริงจาก fixture; สืบทอด tests robots/pacing/privacy จาก QA
- **#138 LLM parser output:** แยกงบ/ราคากลาง, แก้เลขจากคำอ่าน, แยกระยะเวลาดำเนินงานจาก license term, null requirements, conflicts, low confidence และ mapping ต่อ field; provider เป็น fixture/mock จึงไม่ใช้แทน accuracy บน TOR จริง
- **#139 Search/filter:** synonyms ไทย–อังกฤษ, phrases, AND ข้าม fields, regex literal, ขอบเขตคำค้น และ Mongo จริงสำหรับราคา/sort/scope/status/pagination
- **#140 Integration:** Express routes จริงกับ MongoDB จริง รวม consent, ownership, export, deletion และ state gate แบบ provider จำลอง
- **#141 E2E:** frontend production + API + DB จริง, 3 viewport ต่อ engine, search/price/bookmark/confidence/tour/profile/consent/export/delete; session เริ่มจาก signed JWT สมมติ
- **#142 Load:** 1,000 บัญชีและ TOR ที่ parsed 5,000 รายการตามขนาดใน SRS ทดสอบ 1/10 ผู้ใช้ 10 วินาทีและ 50 ผู้ใช้ 30 วินาที อย่างน้อย 20 requests/ผู้ใช้ cap 5,000 requests/ผู้ใช้ วัด latency รวมการอ่านและตรวจ JSON, p50/p95/p99, throughput, error rate และ RSS memory
- **#143 Pilot:** [สถานการณ์และการดำเนินการทดลอง](PILOT-143.md) กับ [แบบบันทึก CSV](pilot-results-template.csv); ยังไม่รันเพราะยังไม่มีผู้เข้าร่วม

Load acceptance สำหรับ demo คือ p95 ≤ 2,000 ms, error rate 0, response contract ถูก และ in-flight ถึง concurrency ที่กำหนด ตัวเลขเวลาเป็นเกณฑ์ที่ตั้งสำหรับรอบนี้ ไม่ใช่ SLA ตัวเลขจาก SRS ไม่ใช้ผล localhost ระยะสั้นรับรอง soak/capacity/production หรือสรุปว่า queue architecture ผ่านแล้ว

## หลักฐานและ cleanup

`docs/testing/evidence/` เก็บ logs/JSON ของแต่ละชุด, `run-results.json`, `source-manifest.json`, `load-results.json` และ `e2e/cross-browser-results.json` ผลเก่าของ QA ไม่ถูกเขียนทับ ภาพ PNG เก็บเฉพาะในเครื่องและ ignore จาก Git ตามเดิม

ผล browser ระบุ versions จริง: Playwright WebKit เป็น engine ทดสอบ ไม่ใช่ installed Safari หรือ iPhone จริง ไม่อ้างว่า matrix สองรุ่นล่าสุดทุก browser ครบ ผล GitHub Actions ยังต้องดูหลัง push/PR; ไฟล์ workflow ที่เพิ่มไม่ได้พิสูจน์ว่ารันบน CI แล้ว

เมื่อรันจบ runner ปิด process ที่เปิดเองและลบ temp directory; test suites drop เฉพาะ DB สุ่มของตนเอง หาก force-kill เครื่องหรือ process จน cleanup ไม่ได้ ให้ดูชื่อ DB สุ่มจาก runtime ที่เป็นเจ้าของก่อนลบ ห้ามลบทุก DB ที่ชื่อคล้าย QA โดยไม่ตรวจรอบงาน
