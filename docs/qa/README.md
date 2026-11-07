# QA Check #127

อ่าน [ผลตรวจซ้ำปัจจุบัน](QA-RETEST-127.md), [ปัญหารอบ baseline](QA-CHECK-127.md) และ [checklist รอบแรก](CHECKLIST-127.md) ก่อนปิดหัวข้อใน GitHub

ผลตรวจการใช้งานและข้อสังเกตด้าน implementation ที่ยังต้องแก้ เก็บไว้ใน [รายงานผลตรวจซ้ำ](QA-RETEST-127.md)

## ตรวจเพิ่มโดยไม่ใช้บัญชี Google จริง

จาก backend รัน `node --import tsx --test --test-reporter=spec scripts/qa/oauth-boundary.test.ts scripts/qa/oauth-state.test.ts` ใช้ localhost listener กับค่าจำลอง ไม่ติดต่อ Google หรือ DB ทดสอบ redirect/denial/token rejection, state binding, expiry, replay และ callback ที่จำลอง provider ยังไม่แทน provider login จริง

จาก backend รัน `node --import tsx scripts/qa/ai-readiness.ts` เพื่อตรวจ config/gold/cache โดยไม่เรียก AI หากเพิ่ม `--live` จะเรียก Vertex ด้วยข้อความสมมติหนึ่งคำขอ มี timeout 30 วินาทีและอาจใช้โควตา/มีค่าใช้จ่าย ไม่ส่ง TOR/ข้อมูลส่วนบุคคล ผลอยู่ใน `evidence/ai-readiness.json`; รอบล่าสุดได้ 429

## รัน offline QA

ใช้ Node 22 และติดตั้ง dependencies ของ backend/frontend จาก lockfiles ก่อน จาก repo root:

```bash
node scripts/qa/run-checks.mjs
```

ผลและ logs จะอยู่ใน `docs/qa/evidence/` ปัจจุบันคำสั่งจบด้วย exit `0` หลังแก้ defects แล้ว ผล baseline ที่เคยไม่ผ่านเก็บแยกใน `evidence/baseline/` และมี `source-manifest.json` สำหรับระบุ hash ของ source ที่ตรวจ

ชุดใหม่นี้ใช้ JWT และข้อมูลจำลอง, stub persistence, ปิดการเชื่อมต่อ DB/network และไม่มีการส่งอีเมลหรือเรียก AI. ไม่ใช้ผลนี้แทน integration test กับ MongoDB จริง

## การตั้งค่าหลังเพิ่ม source controls และ AI privacy gate

**พฤติกรรมที่เปลี่ยน:** ไม่ใส่ค่าด้านล่างจะหยุดงานดึงข้อมูล/ส่งเอกสารไป AI ใหม่อย่างชัดเจน ข้อมูลเก่าที่เก็บไว้ยังเปิดดูได้ ไม่ได้เพิ่มค่าหรืออนุมัติ origin ใน `.env` ของผู้ใช้ให้อัตโนมัติ

### Source origins

หลังตรวจ terms/สิทธิ์ของแต่ละ origin แล้วเท่านั้น กำหนด `SCRAPER_APPROVED_ORIGINS` ใน backend เป็น origin ที่ตรวจแล้วคั่นด้วย comma (ไม่มี path) ตัวอย่างรูปแบบ `https://source.example.invalid` การตั้งค่านี้เป็นรายการที่ผู้ดูแลรับรอง ไม่ใช่การพิสูจน์สิทธิ์จากระบบ

ทุก request ของ egp2, process5 และ RSS จะผ่าน `source-fetch.ts`: ใช้ User-Agent ICheerTOR, ตรวจ robots, เลือก path rule ที่เฉพาะที่สุด, รองรับ wildcard/Allow tie และรวม groups; ตั้งช่วงอย่างน้อย 1 วินาที หรือ `SCRAPER_RATE_LIMIT_MS` (default 2 วินาที) หรือ Crawl-delay ที่มากกว่า รวม request คู่ขนานใน process เดียว ใช้ worker ดึงข้อมูลเพียงตัวเดียวเมื่อรัน API หลาย instances

อ่าน robots ไม่ได้/404/timeout, policy อ่านไม่ได้, path ถูกห้าม หรือ redirect จะหยุดแบบ conservative ไม่ตาม redirect อัตโนมัติ HTTP 429/503 เคารพ Retry-After; ถ้า cooldown เกิน 60 วินาทีจะหยุดรอบนั้นให้ลองภายหลัง robots สำเร็จ cache 1 ชั่วโมง และ failure cache 1 นาที โค้ดอ้างอิง path matching จาก [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) โดยเลือกหยุดเข้มกว่ามาตรฐานในกรณี robots unavailable

RSS ต้นทางที่ประกาศ Disallow `/` ยังถูกหยุดแม้ใส่ approved origin แล้ว การอนุมัติ origin ไม่ใช่ช่องทางข้าม robots และไม่ให้ใส่ทุก origin เพื่อทำให้ test ผ่าน

### AI payload review

ระบบ scrub ชื่อที่มีคำนำหน้าบางรูปแบบ อีเมล เบอร์ และเลขระบุตัวบุคคลในข้อความทั้งก่อนส่งและในผล JSON แต่ regex ไม่รับรองการตรวจชื่อทุกแบบหรือ OCR จึงบังคับ human review ของ PDF bytes และ rendered prompt ทุก part ด้วย SHA-256

เตรียม ZIP ที่มีสิทธิ์ใช้ไว้นอก Git และเลือกโครงการที่ตรงกับ gold แล้วรันจาก backend เพื่อเขียน payload ในเครื่อง **โดยไม่เรียก Vertex**:

```bash
node --import tsx scripts/eval-prompt.ts --prompt=v4 --only=69049037572 \
  --archive-dir=/tmp/icheertor-cleared-tors --review-dir=/tmp/icheertor-private-review
```

จะได้โฟลเดอร์ `<review-dir>/<projectNumber>` ที่มี PDF, prompt text และ `review.json` ซึ่ง `piiRemoved: false` ทุก part คำสั่งจบ exit 1 เพราะยังไม่ได้ประเมิน accuracy; ข้อความระบุว่าเตรียมตรวจแล้ว ไม่ใช่ผล AI ล้มเหลว ใช้ review directory ใหม่ในแต่ละรอบเพื่อไม่ทับไฟล์เดิม

ตรวจ **ทุกหน้า รวมภาพสแกนและ text layer** ใช้เครื่องมือ redaction ที่ลบข้อมูลจริง ไม่ใช่สี่เหลี่ยมทับที่ยังเลือก/copy ข้อความได้ หากพบข้อมูลให้แก้ไฟล์ payload ในเครื่องให้ปลอดข้อมูลนั้นก่อนอนุมัติ

ในแต่ละ approval เก็บ `sourceSha256` เดิมไว้เพื่อผูกกับต้นฉบับ; `filePath` ต้องเป็น absolute path ของ payload ที่ตรวจ/ปิดข้อมูลแล้ว อัปเดต `sha256` ให้ตรงไฟล์หลังแก้ (บน macOS ใช้ `shasum -a 256 /absolute/path/to/part-1.pdf`), ตั้ง `piiRemoved: true` และ `reviewedAt` เป็น ISO UTC เวลาที่ตรวจจริง ทำครบทุก part แล้วตั้ง:

```bash
AI_PRIVACY_REVIEW_MANIFEST=/tmp/icheertor-private-review/69049037572/review.json \
node --import tsx scripts/eval-prompt.ts --prompt=v4 --only=69049037572 \
  --archive-dir=/tmp/icheertor-cleared-tors
```

ระบบส่งไฟล์ที่ผ่าน review **แทนต้นฉบับ** และบันทึก hash/ขนาด PDF ที่ส่งจริง; hash ไม่ตรง, part ขาด, manifest ผิด, timestamp อนาคต หรือ review เกิน 30 วันจะหยุด `privacy_review_required` ตรวจ approval ซ้ำก่อน retry ทุกครั้ง หาก prompt/context เปลี่ยนต้อง review ใหม่ ส่วนการทำงานของ backend ให้ตั้ง env ชื่อนี้ใน backend ตามปกติ โดยตัวอย่างหนึ่ง manifest ต้องรวม approvals ที่ต้องใช้จริงทั้งหมด

อย่าใส่ manifest/review files/PDF/ZIP ลง Git ให้เก็บใน `/tmp` หรือ `backend/secrets/` ที่ ignore แล้ว ด่านนี้เป็น **workflow ตรวจโดยคนพร้อมการบังคับใช้ในโค้ด** ไม่ใช่ระบบ OCR/redaction อัตโนมัติของภาพสแกนทั้งหมด

### Confidence evaluation และ OAuth state

Evaluator เพิ่ม `confidence` ใน `_report.json`: จำนวนตัวอย่าง, accuracy, Brier score, ECE และ bins 0–0.59/0.60–0.79/0.80–1 เทียบ scalar gold และ qualification pairing ที่ตรวจ attributes; เป็นตัวชี้วัดจาก heuristic ไม่ครอบคลุมคุณภาพ summary ต้องตรวจ label โดยคนและกำหนดเกณฑ์ก่อนให้ PASS ชุดว่างได้ count 0 และ metrics null การใช้ `--cached` ไม่เรียก AI หรือ DB

OAuth state เป็น transaction ใช้ครั้งเดียว อายุ 10 นาที ผูกกับ HttpOnly/SameSite=Lax cookie และเปิด Secure เมื่อ callback เป็น HTTPS เก็บใน process แบบจำกัดจำนวน: restart หรือ callback ไปอีก instance จะปฏิเสธ login อย่างปลอดภัย ต้องใช้ instance เดียว/sticky routing สำหรับ demo; หากขยายระบบให้ใช้ shared transaction store ที่ consume ได้แบบ atomic

รันเฉพาะ regression tests:

```bash
cd backend
node --import tsx --test --test-reporter=spec scripts/qa/check.test.ts
```

## รัน Chrome UI QA ด้วยข้อมูลจำลอง

1. เปิด frontend ที่พอร์ต 3100:

   ```bash
   cd frontend
   ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3100
   ```

2. เปิด Chrome **โปรไฟล์ทดสอบแยก** (คำสั่ง macOS) ในอีก terminal:

   ```bash
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
     --headless --disable-gpu --no-first-run --no-default-browser-check \
     --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 \
     --user-data-dir=/tmp/icheertor-qa-chrome about:blank
   ```

3. จาก repo root:

   ```bash
   node scripts/qa/browser-check.mjs
   ```

Script สร้าง tab ของตัวเองและปิดเมื่อจบ, ใส่ token จำลอง, intercept API ทุกคำขอ และบล็อกคำขอที่ไม่ใช่ localhost frontend. ผลและภาพเก็บใน `docs/qa/evidence/`; ใช้ `node scripts/qa/browser-check.mjs /tmp/icheertor-qa-evidence` เมื่อต้องการเก็บนอกรายงานเดิม

ภาพ PNG ใน `docs/qa/evidence/` เก็บเฉพาะในเครื่องและถูกละเว้นด้วย `.gitignore` จึงไม่ติดไปกับ `git add .` ส่วนรายงาน checklist สคริปต์ และผลข้อความ/JSON สามารถ commit ได้

เมื่อต้องแนบหลักฐานใน issue/PR ให้เลือกเฉพาะภาพที่แสดงปัญหา:

| ปัญหา | Issue ที่เกี่ยวข้อง | ไฟล์ในเครื่อง |
|---|---|---|
| BUG-11: ไม่แสดง confidence | #130 | `docs/qa/evidence/tor-detail-desktop.png` |
| BUG-12: privacy notice เป็น `#` | #147 | `docs/qa/evidence/login-privacy.png` |
| UI-01: เมนูมือถือไม่ครบ | #133 | `docs/qa/evidence/procurement-mobile.png` |

ตารางนี้เป็นรายการภาพสำหรับแนบ ยังไม่ได้อัปโหลดหรือโพสต์ไปยัง issue/PR เมื่อแนบแล้วให้เพิ่ม URL ของ attachment ในรายงานแทนชื่อไฟล์ในเครื่อง

นี่เป็น browser UI test ของ frontend จริงกับ **API จำลอง** ไม่ได้พิสูจน์การเข้าสู่ระบบจริง ผล query ของ backend หรือความถูกต้องของ LLM. เมื่อจบทดสอบให้หยุด Next และ Chrome ที่เปิดไว้

## Real MongoDB integration และ browser E2E

ต้องมี MongoDB ทดสอบบน `127.0.0.1:27019` แยกจากฐานข้อมูลจริง ตัวอย่างเริ่ม binary ที่ติดตั้งในเครื่องด้วย data directory ใหม่:

```bash
mkdir -p /tmp/icheertor-qa-db
mongod --dbpath /tmp/icheertor-qa-db --bind_ip 127.0.0.1 --port 27019
```

Integration script ไม่ใช้ `MONGODB_URI` จาก `.env` แต่สร้าง database ชื่อสุ่มบนพอร์ต QA นี้ และลบเฉพาะฐานสุ่มของตนเมื่อจบ:

```bash
cd backend
node --import tsx --test --test-reporter=spec scripts/qa/integration.test.ts
```

สำหรับ browser E2E เปิด API QA ที่พอร์ต 3101 (script จะสร้างบัญชีสมมติและเก็บ session เฉพาะใน `/tmp/icheertor-qa-ui-session.json`):

```bash
cd backend
node --import tsx scripts/qa/serve-ui.ts
```

จากนั้น build frontend สำหรับ API QA โดยไม่แก้ `.env`:

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:3101/api npm run build -- --webpack
```

ใช้ standalone output ตาม config ของโปรเจกต์ โดยคัดลอก public/static assets ไปยัง build output แล้วเริ่ม server (คำสั่งเหล่านี้เปลี่ยนเฉพาะไฟล์ build ที่ ignore แล้ว):

```bash
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
if [ -d public ]; then mkdir -p .next/standalone/public; cp -R public/. .next/standalone/public/; fi
PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

ใช้ Playwright package ที่ติดตั้งไว้และ Firefox/WebKit test engines แล้วรันจาก repo root:

```bash
QA_PLAYWRIGHT_PATH=/absolute/path/to/playwright-package \
PLAYWRIGHT_BROWSERS_PATH=/tmp/icheertor-qa-browsers \
node scripts/qa/cross-browser-check.mjs
```

ในรอบตรวจนี้ใช้ Playwright 1.50.1 ที่มีอยู่ในเครื่องและติดตั้ง engines แยกใน `/tmp` ไม่มีการเพิ่ม dependency ลง package.json/lockfile ต้องติดตั้ง engines ของ version เดียวกับ package ก่อนใช้ script ผลบอก version ของแต่ละ engine ไว้ใน `cross-browser-results.json`

คำสั่งเริ่ม browser tests แต่ละรอบต้องใช้ API QA ใหม่ เพราะ E2E ลบบัญชีสมมติของแต่ละ engine จริงตอนจบ เมื่อหยุด `serve-ui.ts` ด้วย Ctrl+C จะลบ database สุ่มและ session file ของรอบนั้น หยุด MongoDB QA หลังจบด้วย

E2E นี้ใช้ frontend/API/DB จริง แต่เริ่ม session ด้วย synthetic signed JWT ไม่ทดสอบ Google OAuth provider flow และ Playwright WebKit ไม่เท่ากับ installed Safari

## หลักฐาน source policy

```bash
node scripts/qa/source-policy-check.mjs
```

อ่าน robots.txt ครั้งเดียวต่อ source โดยไม่รัน scraper ผลอยู่ใน `source-policy-results.json` การอ่านได้ไม่ได้แปลว่า terms/permission ผ่าน; ดูข้อจำกัดและ path ที่พบในรายงาน retest

## หลักการบันทึกผล

- เก็บ commit, environment, input, expected/actual และหลักฐานให้ตรวจซ้ำได้
- ห้ามเปลี่ยน failure เป็น PASS เพียงเพราะ typecheck/build ผ่าน
- ห้ามใส่ `.env`, JWT จริง, key, ข้อมูลผู้ใช้จริง หรือ TOR ที่ยังไม่ตรวจข้อมูลส่วนบุคคลลง evidence
- ข้อที่ต้องใช้ฐานข้อมูลจริง, browser อื่น, policy owner หรือ source permission ให้คง PENDING/BLOCKED จนมีหลักฐาน
- การเพิ่มหรือแก้ checklist/test ไม่ใช่การปิด issue; branch นี้มี fixes หลัง baseline ตามที่รายงาน retest ระบุ แต่ไม่มีการปิด issue ใน GitHub อัตโนมัติ
