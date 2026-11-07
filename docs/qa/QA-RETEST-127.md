# QA Retest #127 — ผลหลังแก้ไข

ตรวจวันที่ 7 พฤศจิกายน 2569 บน `test/qa-check` ต่อจาก baseline commit `79e9c3bdbe446bad3be73e00dcb89c6b3259b700` การแก้ไขยังอยู่ใน working tree ไม่ได้ commit/push; ดู hash ของไฟล์ที่ตรวจใน [source-manifest.json](evidence/source-manifest.json)

**แก้ High ทั้ง 6 ข้อและข้อบกพร่องอื่นใน baseline รวม 14 ข้อแล้ว** การทดสอบซ้ำที่รันผ่านทั้งหมด แต่ยังไม่อ้างว่าปิด QA ตาม SRS ทุกข้อ เพราะมีรายการนอกขอบเขตโครงงานสาธิตและเงื่อนไขต้นทางที่ยังไม่ผ่าน

ขอบเขตระบบเป็นโครงงานส่งอาจารย์ ไม่เปิดบริการทั่วไป มี notice อธิบายการสาธิตและการใช้ข้อมูลสมมติ โดยไม่ระบุชื่อ/อีเมลติดต่อหรือข้อมูลหน่วยงานที่ไม่มีข้อมูลจริง

**ผลตรวจการใช้งานด้วยมือ: ผ่าน** — ตรวจการใช้งาน Google OAuth, AI extraction/confidence, personal data removed, UI บนอุปกรณ์/browser และ scraper แล้ว ใช้งานได้ครบทั้ง 5 หัวข้อ ผลนี้เป็นการตรวจด้านการใช้งาน ไม่ใช่ผลทดสอบอัตโนมัติรอบใหม่ ยังไม่มีรายละเอียดชุดข้อมูล รุ่นอุปกรณ์ หรือหลักฐานรายกรณีเพิ่มเติม ข้อจำกัดของหลักฐานและข้อสังเกตจากการตรวจโค้ดด้านล่างยังคงไว้ตามเดิม

**ผลตรวจรายละเอียดและ iOS: ผ่าน** — ตรวจรายละเอียดแล้วถูกต้อง และทดสอบบน iOS ใช้งานได้ครบทุกอย่าง ยังไม่มีรายละเอียดรุ่นอุปกรณ์ เวอร์ชัน iOS หรือ browser จึงครอบคลุมเฉพาะการใช้งานบน iOS ที่ตรวจ ไม่ถือเป็นผลครบสองรุ่นล่าสุดของ browser ทุกตัว และผลตรวจความถูกต้องของรายละเอียดไม่ใช่หลักฐาน redaction ของ PDF ทุกหน้าโดยอัตโนมัติ

## การแก้เพิ่มหลังผล manual

| งานค้าง | สิ่งที่ทำแล้ว | หลักฐาน / ข้อจำกัด |
|---|---|---|
| OAuth state | เพิ่ม transaction สุ่ม 256 bits ใช้ครั้งเดียว อายุ 10 นาที ผูก browser ด้วย HttpOnly/SameSite=Lax cookie; Secure เมื่อ callback HTTPS | unit 3 tests และ HTTP 5 tests ผ่าน รวม callback/provider จำลอง, state หาย/ผิด/คนละ browser/ใช้ซ้ำ; [unit](evidence/oauth-state.txt), [HTTP](evidence/oauth-boundary.txt) |
| Scraper controls | egp2/process5/RSS ผ่านตัวตรวจ origin ที่ผู้ดูแลรับรอง, robots, Crawl-delay, shared per-origin queue, cooldown/Retry-After และไม่ตาม redirect | 8 tests ผ่านด้วย transport/clock จำลอง: [source-enforcement.txt](evidence/source-enforcement.txt); ไม่ได้อ้างอนุมัติ terms แทนเจ้าของแหล่งข้อมูล |
| PII ก่อนส่ง AI | scrub ตัวระบุรูปแบบที่รู้จักใน prompt/output และบังคับ review ทุก PDF/text part ตาม exact SHA-256; ใช้ PDF ที่ redact ในเครื่องแทนต้นฉบับได้; hash เปลี่ยน/approval หาย/หมดอายุจะหยุดก่อนส่งและก่อน retry | 7 tests ผ่าน: [payload-privacy.txt](evidence/payload-privacy.txt); provider เป็น mock, PDF bytes จำลอง ไม่ใช่ OCR/redaction ภาพจริงอัตโนมัติ และยังไม่มีชุดเอกสารจริงที่รับรองแล้ว |
| Confidence evaluation | เพิ่ม count, accuracy, Brier score, ECE และ bins ใน evaluator; ชุดว่างเป็น null ไม่แต่ง accuracy | 3 tests ผ่าน: [confidence-metrics.txt](evidence/confidence-metrics.txt); gold scalar และ qualification heuristic เป็น label เบื้องต้น ต้องตรวจโดยคน; ยังไม่มีผล model ของชุดจริง |

**ผลต่อการใช้งาน:** ข้อมูลเดิมยังเปิดดูได้ แต่งานดึงข้อมูลใหม่ต้องตั้ง `SCRAPER_APPROVED_ORIGINS` หลังตรวจสิทธิ์แล้ว และงานส่งเอกสาร AI ใหม่ต้องตั้ง `AI_PRIVACY_REVIEW_MANIFEST` ที่ผ่านการตรวจจริง มิฉะนั้นระบบหยุด ไม่ได้แก้ `.env` ของผู้ใช้หรืออนุมัติข้อมูลให้โดยอัตโนมัติ วิธีตั้งค่าและ workflow อยู่ใน [README QA](README.md#การตั้งค่าหลังเพิ่ม-source-controls-และ-ai-privacy-gate)

OAuth store และ source queue เป็น per-process เหมาะกับ demo instance เดียว; restart/ข้าม instance จะปฏิเสธ OAuth transaction เดิม หากขยายระบบต้องใช้ shared transaction store/ingestion worker เดียวหรือ shared scheduler ก่อน

## สิ่งที่แก้และหลักฐาน

| ปัญหาเดิม | การแก้ | ผลตรวจซ้ำ |
|---|---|---|
| BUG-01 / High | ทุก request รวม `/auth/me` โหลดสถานะบัญชีและ role ปัจจุบันจาก DB; ไม่เชื่อ role/status เก่าใน JWT; บัญชีที่ลบหรือแบนใช้ token เดิมต่อไม่ได้ | PASS — SEC-03/05/09, DB-01/08/09, browser E2E ทั้ง 3 engines |
| BUG-02 / High | บังคับ consent ฉบับปัจจุบันก่อนสร้าง/แก้ profile และประเมิน TOR; การถอนหยุด matching และการสร้าง match notifications; UI opt-in ไม่ติ๊กไว้ล่วงหน้า | PASS — PD-02/06/07/09, DB-02/06, PD-UI-03/04/05 และ E2E |
| BUG-03 / High | cast userId เป็น ObjectId ใน aggregation และ sort เวลา+_id เพื่ออ่านสถานะล่าสุด | PASS — PD-03 และ grant/revoke บน MongoDB จริง DB-02/06 |
| BUG-04 / High | ปิดบัญชีก่อน cleanup; ลบ user/profile/bookmarks/notifications/corrections/consents จริง; ปิดข้อมูลอ้างอิงใน audit; หากไม่ครบคืน 202 และคง `deletedAt` เป็นงานค้างให้ worker ลองซ้ำทุก 60 วินาทีและเมื่อ server เริ่ม | PASS — PD-04/08 และ DB-08; ทดสอบ partial failure/retry ด้วย stubs ไม่ได้ทำให้ MongoDB จริงขัดข้อง |
| BUG-11 / High | แสดง confidence แยกใน scope/summary, median price, qualifications และ evaluation; มีข้อความเตือนต่ำกว่า 60% และไม่แต่งค่าเมื่อไม่มีข้อมูล | PASS — FR-B-UI-02 ด้วยค่า 91/85/55/75% |
| BUG-12 / High | privacy link เปิด `/privacy` ได้จริงก่อน login; เลิกใช้ข้อความเข้าเว็บเท่ากับให้ consent; เพิ่มอ่าน notice/ให้/ถอน consent/export/delete ใน profile | PASS — PD-UI-01–05 และ E2E |
| BUG-05/06/07 | ตรวจ pagination เป็นจำนวนเต็มบวก, escape agency regex และปฏิเสธ query ที่ชนิดไม่ถูกต้อง | PASS — FR-A-06/07/08 |
| BUG-08/09/10 | ตรวจวันที่ที่ไม่มีจริง, เลือก Gregorian calendar เมื่อร้องขอ และรองรับเลขไทย | PASS — TH-03/04/05 |
| BUG-13 | เอา limit 100 ออกจาก personal-data export | PASS — PD-05 และ DB-07 ซึ่งใส่ 105 notifications |
| UI-01 | ต่อ MobileNav เข้ากับ TopBar พร้อมชื่อปุ่มที่อ่านได้ด้วย accessibility API | PASS — Chrome fixture และ Chrome/Firefox/WebKit real-API E2E ที่ 390 px |

การเปลี่ยนแปลง audit log เก็บ event/action/date/status ต่อ แต่ปิด reference ผู้ใช้ที่ถูกลบและ free-text reason ที่อาจมีชื่อ ไม่ใช่การลบประวัติทุก event ทั้งระบบ

## ผลทดสอบปัจจุบัน

| ชุดตรวจ | ผล | หลักฐาน |
|---|---|---|
| Backend / Frontend TypeScript | PASS | [backend](evidence/backend-types.txt), [frontend](evidence/frontend-types.txt) |
| Frontend ESLint | PASS, 0 errors / 9 warnings เดิม | [log](evidence/frontend-lint.txt) |
| Search baseline | 17 assertions ผ่าน | [log](evidence/search-baseline.txt) |
| Pipeline offline | filter 16 / phase 7 ผ่าน; ข้าม network groups ตาม `--offline` | [log](evidence/pipeline-offline.txt) |
| Extraction deterministic checks | 73 ผ่าน | [log](evidence/extraction-offline.txt) |
| QA regressions | 32 tests ผ่าน / 0 ไม่ผ่าน | [log](evidence/qa-regressions.txt), [คำสั่งและ exit codes](evidence/offline-results.json) |
| Evaluator safety | 3 tests ผ่าน; cached mode ไม่ต่อ DB, cache ผิด version ถูกปฏิเสธ, local file หายไม่ย้อนกลับไปดึง e-GP | [eval-safety.txt](evidence/eval-safety.txt) |
| OAuth local boundaries | 5 tests ผ่าน รวม state gate และ JWT callback ด้วย provider จำลอง | [oauth-boundary.txt](evidence/oauth-boundary.txt); ไม่ได้แลก code กับ Google จริง |
| OAuth state unit | 3 tests ผ่าน | [oauth-state.txt](evidence/oauth-state.txt) |
| Source enforcement | 8 tests ผ่าน | [source-enforcement.txt](evidence/source-enforcement.txt) |
| AI payload privacy | 7 tests ผ่าน | [payload-privacy.txt](evidence/payload-privacy.txt) |
| Confidence metric calculation | 3 tests ผ่าน | [confidence-metrics.txt](evidence/confidence-metrics.txt) |
| Evaluator / smoke / new QA script TypeScript | PASS | [qa-script-types.txt](evidence/qa-script-types.txt) |
| Vertex text smoke จริง | ยังไม่ผ่าน — รอบล่าสุด HTTP 429 | [ai-readiness.json](evidence/ai-readiness.json) |
| Real HTTP + MongoDB | 9 tests ผ่าน / 0 ไม่ผ่าน | [integration-results.txt](evidence/integration-results.txt) |
| Chrome frontend + mock API | 35 checks ผ่าน / 0 ไม่ผ่าน | [browser-results.json](evidence/browser-results.json) |
| Real frontend + API + MongoDB บน Chrome | 25 checks ผ่าน | [cross-browser-results.json](evidence/cross-browser-results.json) |
| Real frontend + API + MongoDB บน Firefox | 25 checks ผ่าน | ผลเดียวกัน |
| Real frontend + API + MongoDB บน WebKit | 25 checks ผ่าน | ผลเดียวกัน |
| Backend build | PASS | [backend-build.txt](evidence/backend-build.txt) |
| Frontend production build (webpack) | PASS | [frontend-build-webpack.txt](evidence/frontend-build-webpack.txt) |
| Standalone output | PASS | หน้านโยบายและ JS static ตอบ 200; [standalone-results.json](evidence/standalone-results.json) |

Frontend build ใช้ `npm run build -- --webpack` ซึ่ง Next.js เวอร์ชันใน repo รองรับ ไม่ได้เปลี่ยน default `npm run build` ที่ใช้ Turbopack ผลเดิมที่ติด environment ยังเก็บใน [baseline](QA-CHECK-127.md) ไม่ได้อ้างว่าแก้ข้อจำกัด Turbopack แล้ว

รอบ dev ของ WebKit พบ access-control errors ตอนเปลี่ยนหน้าเร็ว จึงเก็บ [ผลครั้งแรก](evidence/cross-browser-dev-first-run.json) ไว้ และทวนด้วย production runtime พร้อมรอคำขอของแต่ละหน้าให้เสร็จก่อนเปลี่ยนหน้า ไม่ได้กรอง error ออกจาก assertion; ผล production ทั้ง 3 engines ไม่มี uncaught page errors

## สิ่งที่ browser E2E ทำจริง

- ใช้ frontend ที่ build แล้ว, Express routes จริง และ MongoDB `7.0.16` บน localhost:27019 กับ database ชื่อสุ่มแยกจากข้อมูลผู้ใช้
- ใช้ **JWT ที่เซ็นสำหรับบัญชีสมมติ** เพื่อเริ่ม session ไม่ใช่การเข้าสู่ระบบ Google จริง
- ตรวจ 5 หน้าหลักและทัวร์ 6 ส่วน ที่ 1440×1000, 768×1024, 390×844 รวม mobile navigation
- กรองราคาผ่าน UI ไปยัง DB จริง, ให้ consent, บันทึก profile, reload ตรวจ persistence, download export และอ่าน JSON ที่ได้, ถอน consent, ยืนยันลบบัญชี และตรวจ token เดิมได้ 401
- ใช้ Chrome `156.0.8078.80`, Playwright Firefox `134.0` และ WebKit `18.2` ที่ติดตั้งแยกใน `/tmp`
- Playwright WebKit ไม่ใช่ Safari ที่ติดตั้งจริง และไม่ได้ครอบคลุมสองรุ่นล่าสุด/อุปกรณ์จริงตาม SRS; ไม่เรียกหลักฐานนี้ว่า “ผ่านทุก browser ตามข้อกำหนด”
- ภาพ PNG อยู่ในเครื่องและถูก ignore จาก Git รวมถึงภาพหลังแก้ ไม่ได้โพสต์ภาพหรือเปลี่ยนสถานะ issue บน GitHub
- ปิด frontend/API/browser/MongoDB QA หลังตรวจ และยืนยันว่าไม่เหลือฐานข้อมูลชื่อสุ่มหรือ session จำลองแล้ว: [cleanup-results.json](evidence/cleanup-results.json)

## หลักฐานต้นทางของ #136 — ยังไม่รับรองสิทธิ์การดึงข้อมูล

อ่าน `robots.txt` หนึ่งครั้งต่อ origin โดยไม่รัน scraper และไม่ข้าม WAF: [source-policy-results.json](evidence/source-policy-results.json)

| Source | ผลอ่าน | ข้อสังเกต |
|---|---|---|
| egp2.bangkok.go.th | 200, ได้ robots text | wildcard Allow `/`, Crawl-delay 1 และ Disallow `/api/`, `/_next/`, `/admin/` |
| process.gprocurement.go.th | 200, ได้ robots text | wildcard Disallow `/` ซึ่งครอบคลุม RSS path ที่ client ใช้ |
| process5.gprocurement.go.th | 404 | ไม่ได้พิสูจน์ว่าได้รับอนุญาตตาม terms |

**แยก path ให้ถูกต้อง:** egp2 client ใช้ `/appapi/api` ไม่ใช่ `/api/` จึงไม่ควรสรุปว่า Disallow `/api/` ห้าม endpoint ปัจจุบันโดยอัตโนมัติ baseline เดิมมี page delay 300 ms; รอบนี้แก้เป็นอย่างน้อย 1 วินาที พร้อม shared request spacing default 2 วินาทีและเคารพ Crawl-delay ที่มากกว่าแล้ว เพิ่ม robots enforcement ครบทั้ง 3 clients แต่ยังไม่อนุมัติ terms แทนเจ้าของต้นทาง RSS domain ระบุ Disallow `/` จึงต้องหยุดดึงตามนโยบาย ไม่ใช่ฝืนให้ request สำเร็จ

การอ่าน policy สำเร็จเป็นหลักฐานเพิ่ม ไม่ใช่การแก้ source compliance หรือการอนุญาตให้ดึงข้อมูลต่อ ไม่ได้เรียก scraper/RSS/SMTP กับบริการจริง ส่วนรอบเพิ่มเติมเรียก Vertex เฉพาะข้อความสมมติ ไม่ส่ง TOR หรือข้อมูลส่วนบุคคล

## หลักฐานรอบก่อนและสถานะหลังแก้

ผล text smoke/ไม่มี cache ด้านล่างเป็นหลักฐานรอบก่อน ส่วนข้อสังเกตด้านโค้ดได้รับการปรับดังนี้:

- **Personal data removed (#149):** มี workflow ใช้ไฟล์ที่คนปิดข้อมูลจริงแล้วและตรวจ exact bytes ก่อนส่งครบทุก part ไม่ใช่ OCR อัตโนมัติ ขั้นต่อไปคือใช้เอกสารจริงที่ได้รับอนุญาต ตรวจทุกหน้า/ภาพ/text และเก็บหลักฐานก่อนรับรอง end-to-end removal
- **OAuth security:** แก้ state/transaction binding แล้ว และทดสอบ state ผิด หาย หมดอายุ คนละ browser และใช้ซ้ำผ่าน
- **Scraper compliance (#136):** เพิ่ม enforcement/spacing แล้วและทดสอบ Allow/Disallow/429/timeout ด้วย transport จำลองผ่าน แต่ terms/สิทธิ์ต้นทางยังต้องมีหลักฐานก่อนเปิด live ingestion
- **ความครบของหลักฐาน:** ตัวเลข accuracy/calibration ต้องเทียบกับเฉลยที่คนอ่านและเกณฑ์ยอมรับ; browser matrix ต้องระบุ OS/device/version ผลตรวจการใช้งานด้วยมือยังไม่มีหลักฐานรายละเอียดเหล่านี้

- OAuth tests อัตโนมัติล่าสุดใช้ provider จำลองเพื่อทดสอบ state gate และ callback จริงของแอป ไม่ส่ง code ไป Google และไม่ต่อ DB ส่วนการเข้าสู่ระบบ Google จริงตรวจการใช้งานด้วยมือแล้ว: ผ่าน
- Vertex มี configuration ครบ ลองข้อความสมมติ `Reply with exactly QA_OK.` เท่านั้น ครั้งแรกที่ output budget 64 ไม่ได้ผลตรงที่คาด ([first run](evidence/ai-readiness-first-run.json)); เพิ่ม budget เป็น 2048 แล้วเรียกอีกครั้งได้ HTTP 429 จึงไม่ retry ต่อและไม่อ้างว่า AI พร้อมใช้งาน ไม่มีการส่ง PDF
- มี gold 3 โครงการ รวม 53 qualifications แต่ยังไม่มี cached model outputs ของ v4 ลอง cached evaluation ได้ exit 1 / evaluated 0 จึงยังไม่มีผล accuracy: [ai-cached-eval.txt](evidence/ai-cached-eval.txt)
- ปรับ evaluator ให้ default ตาม active prompt v4, ไม่ต่อ DB เว้นแต่ระบุ `--with-db-context`, cached mode ไม่ต่อ DB และเพิ่ม `--archive-dir` อ่าน ZIP ในเครื่องแทน e-GP (ยังเรียก Vertex เมื่อไม่ได้ใช้ `--cached`) การประเมินไม่ครบคืน exit 1 และบันทึกจำนวน expected/evaluated/failed ไม่แสดงผลบางส่วนเป็นงานที่ครบแล้ว
- ชุด offline ล่าสุดมี 13 กลุ่มรวม script types และ tests ใหม่ ไม่มีการเปลี่ยน frontend เพิ่มในรอบนี้ หลักฐาน browser E2E เป็นรอบก่อนเพิ่ม OAuth/source/privacy controls; รอบปัจจุบันทวน backend build, real HTTP/MongoDB 9 tests และ OAuth HTTP 5 tests เพิ่ม ไม่อ้างว่ารัน browser matrix ใหม่

## รายการที่ยังไม่อ้างว่าผ่าน

| ขอบเขต | สถานะปัจจุบัน |
|---|---|
| การตรวจชื่อ/เบอร์/อีเมลใน TOR ทั้ง PDF และก่อนส่ง AI (#149) | มี exact-payload review gate, local redacted replacement และ text/output scrub แล้ว; ยังไม่มีหลักฐานเอกสารจริงและไม่ได้มี OCR อัตโนมัติ |
| LLM accuracy / confidence calibration | Vertex text smoke ล่าสุดได้ 429; ยังไม่ส่งเอกสารจริงและไม่มี v4 cache; schema/UI/logic ผ่าน ไม่เท่ากับ extraction accuracy |
| Google OAuth provider flow / security | state binding/replay/expiry และ simulated callback ผ่าน 8 tests รวม; การเข้าสู่ระบบ Google จริงตรวจการใช้งานด้วยมือแล้ว: ผ่าน |
| Chrome/Firefox/Safari/Edge สองรุ่นล่าสุดและอุปกรณ์จริง | มีหลักฐาน 3 engines บนเครื่องเดียว ไม่ใช่ full SRS matrix |
| การอนุมัติเงื่อนไขต้นทางและ robots enforcement | enforcement ผ่าน tests แล้ว; source permission/terms ยังไม่มีหลักฐาน และ RSS Disallow `/` ยังถูกหยุด |
| PDPA สำหรับบริการสาธารณะ, retention ทั้งโครงงาน, controller contact และ operational audit ครบทุกจุด | ไม่รับรองสำหรับ production; ผู้ใช้ระบุเป็น demo และไม่ต้องการ contact; notice ระบุการใช้งานจริงของ demo ตามนี้ |
| Load / pilot tests | ยังไม่ได้ทำ; เป็น #142/#143 แยกจากการแก้ High รอบนี้ |

ก่อนส่งงานสามารถใช้อ้างอิงผล “แก้ baseline defects และทดสอบซ้ำผ่าน” ได้ แต่ไม่ควรเปลี่ยนรายการ PENDING/BLOCKED ทั้งหมดเป็น PASS โดยไม่มีหลักฐานเพิ่ม
