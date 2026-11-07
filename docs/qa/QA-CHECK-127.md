# QA Check #127 — รอบตรวจวันที่ 7 พฤศจิกายน 2569

> รายงานนี้เป็น **baseline ก่อนแก้** ผลปัจจุบันและรายการที่แก้แล้วอยู่ใน [QA Retest #127](QA-RETEST-127.md) ภาพ PNG ในเครื่องถูกสร้างใหม่หลังแก้ จึงไม่ใช้ภาพเหล่านั้นเป็นหลักฐานของข้อบกพร่องรอบ baseline


**ผลรวม: ยังไม่ผ่านสำหรับปิด QA Check #127** พบข้อบกพร่องที่ทำซ้ำได้และยังมีรายการที่ต้องตรวจบนระบบทดสอบจริง รายงานนี้เป็นผลตรวจ ไม่ได้แก้ business logic หรือปิด issue ใน GitHub

## เวอร์ชันและขอบเขต

- Branch: `test/qa-check`
- Baseline commit: `79e9c3bdbe446bad3be73e00dcb89c6b3259b700`
- ใช้หัวข้องานจากภาพของผู้ใช้ และเกณฑ์จาก [SRS](../../SRS/Bangkok_Procurement_Tracker_SRS.docx) โดยไม่ได้อ่านรายละเอียด issue บน GitHub จึงยังต้องเทียบ acceptance criteria ใน issue ก่อนลงนามปิดงาน
- FR-A ในภาพเทียบกับ SRS F8 / FR-11; FR-B เทียบกับ F3 / FR-6 / FR-8
- Node `v22.18.0`; timezone ของ offline tests: `Asia/Bangkok`
- Browser: Chrome headless `156.0.8078.80`; viewport 1440×1000, 768×1024 และ 390×844
- ทดสอบ API handlers จริงใน process โดย stub Mongoose และบล็อก database/network connections; เป็นหลักฐาน validation, authorization และโครงสร้าง query ไม่ใช่หลักฐานการทำงานของ MongoDB/index จริง
- Browser ใช้ frontend จริงกับ API responses จำลอง รวมถึงผู้ใช้และ TOR จำลอง ไม่มีการใช้บัญชีจริง เขียนข้อมูลจริง ส่งอีเมล เรียก Vertex AI หรือรัน scraper กับเว็บราชการ
- Browser ทดสอบ profile ในสถานะยังไม่เคยสร้าง, bookmarks/alerts ว่าง และ TOR สำเร็จรูปจำลอง ไม่ได้ครอบคลุมทุกสถานะของแต่ละหน้า

## ผลตามหัวข้อในภาพ

| Issue | หัวข้อ | สถานะ | หลักฐาน / สิ่งที่ยังขาด |
|---|---|---|---|
| #146 | Verify PDPA | FAIL | Consent gate, consent aggregation, deletion และ export มีปัญหา ดู BUG-02/03/04/13; retention/access logging ยังไม่ครบ |
| #149 | Personal data removed | PARTIAL / NOT SIGNED OFF | offline extraction tests ผ่านการไม่เก็บชื่อเจ้าหน้าที่ใน announcement dates; ยังไม่มีการปิดข้อมูลส่วนบุคคลทั้ง pipeline หรือพิสูจน์กับชุด TOR จริง |
| #147 | Consent and privacy notice | FAIL | BUG-02/03/12; หน้า login มี privacy link เป็น `#`; profile ไม่มีเครื่องมือ consent/export/delete ให้ผู้ใช้เข้าถึง |
| #129 | FR-A: search, filter and sort | PARTIAL / FAIL | การประกอบ query และ UI หลักผ่าน แต่ BUG-05/06/07 ยังอยู่; ยังขาดการพิสูจน์ query/count/order/page กับ MongoDB จริง และขาดตัวกรองบางรายการตาม SRS |
| #130 | FR-B: extracted with confidence | FAIL | schema confidence และ deterministic extraction tests ผ่าน แต่ UI ไม่แสดง confidence รายฟิลด์ (BUG-11); ยังไม่ได้วัดความถูกต้อง LLM กับเอกสารจริง |
| #132 | Verify security | FAIL | token/role/owner-filter checks หลายกรณีผ่าน แต่ token ที่ออกก่อนแบนยังใช้ได้ (BUG-01); ยังไม่ยืนยัน OAuth/HTTPS/production config |
| #133 | UI on devices and browsers | PARTIAL / FAIL | Chrome 3 viewports ผ่าน overflow ของ 5 หน้าหลักและทัวร์ แต่ mobile navigation ไม่ครบ (UI-01); browser อื่นและอุปกรณ์จริงยังไม่ตรวจ |
| #135 | Thai formatting | PARTIAL / FAIL | ข้อความไทย/บาท/พ.ศ. บน fixture และ parser หลักผ่าน; date helper มี BUG-08/09/10 |
| #136 | Scraper compliance | BLOCKED / IMPLEMENTATION GAP | พบ delay/retry แต่ไม่พบ robots/terms gate; อ่าน robots.txt ผ่านเครื่องมือเว็บไม่ได้ จึงไม่ถือว่าอนุญาตหรือผ่าน compliance |

`PARTIAL` หมายถึงมีหลักฐานผ่านเฉพาะบางส่วน ไม่ใช่สถานะพร้อมปิด issue; `BLOCKED` หมายถึงหลักฐานภายนอกที่จำเป็นยังไม่ได้มา

## ผลเครื่องมือที่รันแล้ว

| การตรวจ | ผล | หลักฐาน |
|---|---|---|
| Backend TypeScript | PASS | [backend-types.txt](evidence/baseline/backend-types.txt) (exit 0; successful tsc has no output) |
| Frontend TypeScript | PASS | [frontend-types.txt](evidence/baseline/frontend-types.txt) |
| Frontend ESLint | PASS with warnings | 0 errors, 9 warnings เดิม; [frontend-lint.txt](evidence/baseline/frontend-lint.txt) |
| Backend production build | PASS | `npm run build`; [backend-build.txt](evidence/baseline/backend-build.txt) |
| Frontend production build | BLOCKED by environment | ครั้งแรกดึง Google Fonts ไม่ได้; เมื่อลองพร้อมสิทธิ์เครือข่ายแล้ว Turbopack ยังติดการเปิด port ของ subprocess (`EPERM`) จึงยังไม่ถือว่า production build ผ่าน; [ครั้งแรก](evidence/baseline/frontend-build-sandbox.txt), [ลองซ้ำ](evidence/baseline/frontend-build.txt) |
| Search baseline | PASS | 17 assertions; [search-baseline.txt](evidence/baseline/search-baseline.txt) |
| Pipeline offline | PASS for offline scope | filter 16 cases, phase 7 cases; network 2 groups ข้ามตาม `--offline`; [pipeline-offline.txt](evidence/baseline/pipeline-offline.txt) |
| Extraction offline | PASS | 73 checks; [extraction-offline.txt](evidence/baseline/extraction-offline.txt) |
| QA regressions เพิ่มใหม่ | FAIL | 27 tests: ผ่าน 16 / ไม่ผ่าน 11; [qa-regressions.txt](evidence/baseline/qa-regressions.txt) |
| Chrome fixture UI | FAIL | 31 checks: ผ่าน 28 / ไม่ผ่าน 3; [browser-results.json](evidence/baseline/browser-results.json) |

Exit code ของ QA runner เป็น `1` ตามผลไม่ผ่านจริง ไม่ได้เปลี่ยน known failures เป็น skip/todo เพื่อให้ผลเขียว ดูคำสั่งและ exit codes ที่ [offline-results.json](evidence/baseline/offline-results.json)

## ข้อบกพร่องที่ยืนยันได้

ระดับ High ควรแก้ก่อน pilot ที่ใช้ข้อมูลส่วนบุคคล; Medium ควรแก้ก่อนปิดหัวข้อ QA; Low เป็นปัญหา utility ที่ยังไม่พบการเรียกใช้บนเส้นทาง UI ที่ทดสอบ

| ID | ระดับ | ผลที่พบ / ผลที่ควรได้ | ทำซ้ำและตำแหน่ง |
|---|---|---|---|
| BUG-01 | High | JWT เดิมที่ claim `active` ยังผ่านแม้ข้อมูลบัญชีถูกแบน/ลบ เพราะ middleware ไม่อ่านสถานะปัจจุบัน; ควรถูกปฏิเสธหรือมี session revocation | `SEC-05`; [auth.ts](../../backend/src/middleware/auth.ts), `authenticate` |
| BUG-02 | High | สร้าง profile ได้ `201` แม้ consent ไม่อนุญาต ตาม NFR-PD1 ควรตรวจ consent ก่อนเก็บข้อมูล | `PD-02`; [profile.routes.ts](../../backend/src/routes/profile.routes.ts); มี `requireConsent` แต่ไม่ได้ใช้กับเส้นทางนี้ |
| BUG-03 | High | `/pdpa/consent` ใส่ string ใน aggregation `$match.userId` แต่ schema เก็บ ObjectId; ควรใช้ชนิดให้ตรงกันเพื่ออ่านสถานะที่มีอยู่ | `PD-03`; [pdpa.routes.ts](../../backend/src/routes/pdpa.routes.ts) และ [consent-record.ts](../../backend/src/db/models/consent-record.ts) |
| BUG-04 | High | `/pdpa/delete` เปลี่ยนชื่อ/อีเมล/สถานะ user และตอบว่าจะเสร็จใน 30 วัน แต่ไม่มี purge job หรือเส้นทางลบ profile/bookmarks/corrections/consents/notifications ที่เกี่ยวข้อง; `googleId` ก็ยังคงอยู่ | `PD-04` ตรวจการเรียก handler ร่วมกับ code review; [pdpa.routes.ts](../../backend/src/routes/pdpa.routes.ts). ไม่ได้รอ 30 วันหรือทดลองลบข้อมูลจริง |
| BUG-05 | Medium | `page=abc&limit=abc` ผ่าน validation และส่ง NaN ไป query; ควรปฏิเสธ `400` หรือ normalize เป็นค่าที่ถูกต้องก่อนใช้ | `FR-A-06`; [tor.routes.ts](../../backend/src/routes/tor.routes.ts) |
| BUG-06 | Medium | `agency=.*` ถูกใช้เป็น regex จึงตรงกับชื่อใดก็ได้; ควรค้นเครื่องหมายตามตัวอักษรและไม่เปิดให้ผู้ใช้ส่ง regex ซับซ้อน | `FR-A-07`; [tor.routes.ts](../../backend/src/routes/tor.routes.ts) |
| BUG-07 | Medium | `techStack=react&techStack=node` กลายเป็น array แล้ว `.split()` ทำให้ `500`; ควร validate เป็น `400` หรือรองรับหลายค่าโดยตั้งใจ | `FR-A-08`; [tor.routes.ts](../../backend/src/routes/tor.routes.ts) |
| BUG-08 | Low | `parseThaiDate("31/02/2569")` กลายเป็นเดือนมีนาคมแทน `null` | `TH-03`; [date-converter.ts](../../frontend/lib/utils/date-converter.ts) |
| BUG-09 | Low | `formatThaiDate(date, false)` ยังคงแสดงปี พ.ศ. เพราะ `th-TH` ใช้ Buddhist calendar โดยปริยาย | `TH-04`; [date-converter.ts](../../frontend/lib/utils/date-converter.ts) |
| BUG-10 | Low | `parseThaiDate("๑๕/๐๘/๒๕๖๙")` อ่านไม่ได้ | `TH-05`; [date-converter.ts](../../frontend/lib/utils/date-converter.ts). หมายเหตุ: backend archive parser คนละตัวรองรับเลขไทยและผ่าน tests แล้ว |
| BUG-11 | High | แม้ส่ง extraction confidence 0.91/0.85/0.75 และ qualification 0.55 มาให้ หน้า detail ก็ไม่มีค่าความเชื่อมั่นรายฟิลด์; matching score/data coverage เป็นคนละค่า | `FR-B-UI-02`; [detail page](../../frontend/app/(dashboard)/procurement/[id]/page.tsx) |
| BUG-12 | High | กดนโยบายความเป็นส่วนตัวที่หน้า login แล้วไป `#` ไม่ใช่ notice ที่อ่านได้ก่อนเริ่ม OAuth | `PD-UI-01`; [login page](../../frontend/app/(auth)/login/page.tsx) |
| BUG-13 | Medium | Export คืน notification แค่ 100 จาก fixture 105 รายการ ทั้งที่ endpoint ระบุ export ข้อมูลทั้งหมด | `PD-05`; [data-exporter.ts](../../backend/src/services/pdpa/data-exporter.ts) |
| UI-01 | Medium | 390 px ซ่อน Sidebar แต่ไม่มีปุ่มเปิด MobileNav; ไม่พบทางไป bookmarks จากเมนูหลัก ขณะที่ profile ยังเข้าได้ผ่าน avatar | `UI-mobile: main navigation is reachable`; [TopBar](../../frontend/components/layout/TopBar.tsx), [layout](../../frontend/app/(dashboard)/layout.tsx) |

### ช่องว่างเพิ่มเติมจาก code review

- **#149:** [archive-facts](../../backend/src/services/ingestion/archive-facts.ts) ปิดชื่อใน context ของวันที่และข้าม signature stamp แล้ว แต่ [tor-parser](../../backend/src/services/ai/tor-parser.ts) ยังส่ง PDF bytes และ bidding-document text เข้าโมเดลโดยไม่มีขั้นตอนปิดข้อมูลส่วนบุคคลก่อนส่ง ไม่ได้ยืนยันว่ามีข้อมูลส่วนบุคคลจริงในไฟล์ใด; ต้องกำหนดขอบเขต removal และตรวจเอกสารตัวอย่างก่อนให้ #149 ผ่าน
- **#146/#147:** ยังไม่พบ retention/purge policy ที่ทำงานจริง, user-facing consent/export/delete controls หรือ audit ของการเข้าถึง/ประมวลผลข้อมูลส่วนบุคคลทุกจุด ตาม NFR-PD2/3/4. การบันทึก consent มี purpose/scope/time แต่ไม่มี notice version
- **#129:** API `budgetMin/budgetMax` กรอง `medianPrice` เท่านั้น; UI เรียกว่า “ช่วงราคากลาง” ถูกต้อง แต่ยังไม่มีตัวกรองงบประมาณแยก, date range, tech stack และ eligibility ตาม F8/FR-11 ครบใน UI
- **#132:** JWT fallback secret เป็นค่าคงที่ใน source; ยังไม่พบ OAuth state configuration, security headers/rate limiter ใน Express app. เป็น configuration/code-review findings ยังไม่ได้ยืนยัน exploit หรือค่า production
- **#136:** RSS ระบุ User-Agent ของโปรเจกต์, เว้นคำขอ 5 วินาที และ retry 429/5xx ด้วย backoff; egp2 เว้นแต่ละ page และ document ingest เว้นแต่ละโครงการ อย่างไรก็ตาม document client ใช้ browser User-Agent และไม่พบ robots/terms decision ก่อน fetch; delay อย่างเดียวไม่ใช่หลักฐานว่าต้นทางอนุญาต
- **CI:** `.github/workflows/ci.yml` งาน `test` ยังเป็นคำสั่ง echo ว่าผ่าน ไม่ได้รันชุดทดสอบจริง รายงานนี้เพิ่ม runner ให้เรียกได้ แต่ไม่ได้เปลี่ยน CI ให้แดงจาก known defects โดยไม่แยกงานแก้ไข

## รายการที่ต้องทำต่อก่อนปิด QA

1. แก้ BUG-01/02/03/04/11/12 และตัดสินใจเรื่อง retention, consent/ฐานการประมวลผล และขอบเขตการปิดข้อมูลส่วนบุคคล
2. แก้ search validation, export และ mobile navigation จากนั้นรัน regression suite ซ้ำ; ตรวจ utility date failures ก่อนนำ helper ไปใช้เพิ่ม
3. บนฐานข้อมูล **ทดสอบแยก** ใส่ TOR ที่รู้ผลล่วงหน้า แล้วตรวจ inclusive price boundaries, ทุกคำค้น/synonym, compound filters, total, order และ pagination จริง รวมถึงสิทธิ์ของผู้ใช้ A/B และ consent grant/revoke
4. ใช้บัญชี QA ทดสอบ OAuth ครบ flow, การถอน consent, export มากกว่า 100 รายการ, ลบข้อมูลและทวนผลตาม retention schedule. ตรวจ token เดิมหลังแบน/ลบและหลังเปลี่ยน role
5. เลือก TOR ตัวอย่างที่มี ground truth ตรวจ Scope/Qualifications/Median Price/Evaluation และ confidence เทียบต้นฉบับ; ทดสอบ low-confidence/missing/failed extraction บน UI. ไม่ตีความ confidence ของโมเดลเป็น accuracy ที่สอบเทียบแล้ว
6. ตรวจ Chrome/Firefox/Safari/Edge สองเวอร์ชันล่าสุดตาม NFR-CO1 และอุปกรณ์จริง; viewport emulation บน Chrome ไม่เท่ากับ Safari/iOS หรือ Firefox
7. เก็บหลักฐาน robots.txt/terms/permission ของแต่ละ source พร้อมวันที่, เส้นทางที่อนุญาต, policy owner และเพดาน request; ตรวจ HTTPS/TLS และ secret/config ของ staging ก่อน pilot
8. รัน frontend production build บน environment ที่เปิด subprocess/port และเข้าถึง Google Fonts ได้ พร้อมเก็บ build result ก่อน release

ยังไม่ได้ทดสอบ load/pilot ในรอบนี้ เพราะเป็นงาน Testing #142/#143 แยกจากขอบเขตภาพ QA #127 และยังมี High findings

## หลักฐานหน้าจอ

ภาพใช้ข้อมูลจำลองทั้งหมด เก็บเฉพาะ viewport ปัจจุบัน ไม่ใช่ screenshot ทั้งหน้า ภาพ PNG เก็บเฉพาะในเครื่องที่ `docs/qa/evidence/` และถูกละเว้นจาก Git ผู้ clone repo สามารถสร้างภาพใหม่ตาม [วิธีรัน browser QA](README.md#รัน-chrome-ui-qa-ด้วยข้อมูลจำลอง)

ภาพที่เลือกไว้สำหรับแนบ issue/PR เมื่อรายงานปัญหา:

| ปัญหา | Issue | ชื่อไฟล์ในเครื่อง |
|---|---|---|
| BUG-11: confidence ไม่แสดง | #130 | `tor-detail-desktop.png` |
| BUG-12: ลิงก์ privacy notice ใช้ไม่ได้ | #147 | `login-privacy.png` |
| UI-01: เมนูหลักบนมือถือไม่ครบ | #133 | `procurement-mobile.png` |

ยังไม่ได้อัปโหลดภาพหรือโพสต์ issue/PR จึงไม่มีลิงก์ attachment ในรายงาน เมื่อแนบแล้วให้เพิ่ม URL ตรงข้อบกพร่องที่เกี่ยวข้อง ภาพการแสดงผลอื่นยังเก็บในเครื่องสำหรับตรวจซ้ำได้

## แหล่งอ้างอิงภายนอก

ผล PDPA ในรายงานตัดสินตาม SRS ไม่ใช่คำรับรองการปฏิบัติตามกฎหมายทุกประการ การเลือกฐานการประมวลผลและข้อยกเว้นต้องพิจารณาตามบริบทจริง ไม่ใช่ถือว่าทุกการประมวลผลต้องใช้ consent เสมอ ดู [พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562](https://ratchakitcha.soc.go.th/documents/17082307.pdf) สำหรับรายละเอียดความยินยอม การแจ้งข้อมูล สิทธิ และหน้าที่ของผู้ควบคุมข้อมูล

Mongoose ระบุว่า aggregation pipeline ไม่ cast ค่าตาม schema อัตโนมัติ จึงต้องทำ ObjectId ให้ถูกต้องใน BUG-03: [Aggregate API](https://mongoosejs.com/docs/api/aggregate.html)

[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) อธิบาย Robots Exclusion Protocol และระบุว่า robots rules ไม่ใช่การให้สิทธิ์เข้าถึง ต้องตรวจ terms/permission แยกกัน การเปิด URL ต่อไปนี้ด้วยเครื่องมือเว็บในรอบนี้อ่านไม่ได้ จึงไม่มีเนื้อหาหรือ HTTP status ที่ใช้ลงนามผ่านได้:

- `https://egp2.bangkok.go.th/robots.txt`
- `https://process.gprocurement.go.th/robots.txt`
- `https://process5.gprocurement.go.th/robots.txt`

ห้ามตีความการอ่านไม่ได้ว่าเป็น “ไม่มี robots.txt” หรือ “อนุญาตให้ scrape”
