# ตั้งค่า Vertex AI (Gemini) สำหรับ TOR extraction

อัปเดต: 30 ก.ย. 2569

เป้าหมาย: ให้ backend ส่ง TOR PDF ไปให้ Gemini บน Vertex AI ได้ แล้วตรวจด้วย
`scripts/vertex-smoke-test.ts` ว่าใช้งานได้จริงตั้งแต่ต้นจนจบ

ใช้เวลาประมาณ 20–30 นาที ต้องมีบัญชี Google และบัตรสำหรับผูก billing

---

## ภาพรวม

```
Google Cloud project ──(billing)──> เปิด Vertex AI API
        │
        └─ Service Account "icheertor-backend"
              role: Vertex AI User
              └─ JSON key ──> backend/secrets/gcp-key.json  (ห้าม commit)
                                     │
backend/.env ────────────────────────┘
  VERTEX_AI_PROJECT_ID / LOCATION / MODEL
  GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcp-key.json
```

backend ใช้ SDK `@google/genai` (ดู `src/services/ai/vertex-client.ts`)
**ไม่ใช้** `@google-cloud/vertexai` แล้ว เพราะ class `VertexAI` ถูกถอดออกเมื่อ 24 มิ.ย. 2026

---

## ทางลัด: express mode (ไม่ต้องผูก billing)

ใช้ฟรี 90 วันตาม quota ต้องใช้บัญชี @gmail.com ได้ **API key** แทน service account
เหมาะกับช่วงพัฒนา/ทดสอบ ถ้าจะใช้ต่อเกิน 90 วันหรืออยากได้ quota เพิ่ม ต้องผูก billing ทีหลัง

1. สมัคร Vertex AI express mode ด้วย Gmail → คัดลอก API key (ขึ้นต้นด้วย `AQ.`)
2. ดู model ID ที่ใช้ได้ใน Vertex AI Studio ของ express mode
3. `backend/.env`:
   ```env
   VERTEX_AI_API_KEY=<API key>
   VERTEX_AI_MODEL=<model ID>
   ```
   ไม่ต้องตั้ง `GOOGLE_APPLICATION_CREDENTIALS` (ลบหรือเว้นว่าง) — ถ้ามี `VERTEX_AI_API_KEY`
   ระบบจะใช้ express mode และไม่สนใจ project/location/key file
4. ข้ามไปขั้นที่ 7 (rebuild) และ 8 (ทดสอบ) ได้เลย — `[1] config` ต้องขึ้น `mode express`

API key เป็นความลับเท่ากับ JSON key — ห้าม commit ห้ามส่งในแชท

---

## 1. สร้าง project และผูก billing

1. เข้า <https://console.cloud.google.com> → เมนูบนซ้าย เลือก project → **New Project**
2. ตั้งชื่อ เช่น `icheertor` แล้วจด **Project ID** ไว้ (ไม่ใช่ชื่อ project — ID เป็นตัวพิมพ์เล็กมีขีด เช่น `icheertor-471203`)
3. **Billing** → Link a billing account (บัญชีใหม่มี free trial credit)
4. **ตั้ง budget alert ทันที**: Billing → Budgets & alerts → Create budget
   ตั้งวงเงินต่ำ ๆ เช่น 300 บาท แจ้งเตือนที่ 50% / 90% / 100%
   กันกรณีสคริปต์วนเรียก API ผิดพลาด

> ถ้าใช้อีเมลมหาวิทยาลัย (Google Workspace) อาจติด org policy ห้ามสร้าง key
> ในขั้นที่ 4 — แนะนำใช้ Gmail ส่วนตัวสร้าง project แยก

## 2. เปิด Vertex AI API

Console: **APIs & Services → Library** → ค้นหา `Vertex AI API` → **Enable**

หรือใช้ gcloud:
```bash
gcloud config set project <PROJECT_ID>
gcloud services enable aiplatform.googleapis.com
```

## 3. เลือก model และ location

1. Console → **Vertex AI → Model Garden** → ค้นหา `Gemini`
2. เลือกรุ่น **Flash ตัวล่าสุดที่เป็น GA** (ไม่ใช่ `-preview`) — เร็วและถูกพอสำหรับงานสกัด TOR
3. จด **model ID** ตามที่หน้า model แสดง (รูปแบบ `gemini-X.Y-flash`)
4. เปิดหน้า [Model versions and lifecycle](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions)
   เช็ก **วันเลิกให้บริการ** ของรุ่นที่เลือก

**ระวัง:** model ID หมดอายุได้ — `gemini-2.0-flash` ที่โค้ดเดิมใช้ถูกปิดไปแล้วเมื่อ 1 มิ.ย. 2026
และ Gemini 2.5 ถูกกำหนดปิดช่วง ต.ค. 2026 จึงไม่ควรเลือก 2.x

**Location:** ใช้ `global` — รุ่นใหม่มักเปิดที่ global endpoint ก่อน (บางรุ่นมีแค่ที่นั่น)
TOR เป็นเอกสารราชการที่เปิดเผยต่อสาธารณะอยู่แล้ว ไม่ติดเรื่องที่ตั้งข้อมูล
ถ้าต้องการให้ประมวลผลในภูมิภาคให้ใช้ `asia-southeast1` แต่ต้องเช็กว่ารุ่นที่เลือกเปิดใน region นั้น

## 4. สร้าง Service Account และ key

1. **IAM & Admin → Service Accounts → Create service account**
   - Name: `icheertor-backend`
2. **Grant access**: role **Vertex AI User** (`roles/aiplatform.user`)
   ให้แค่ role นี้ — ไม่ต้องให้ Owner/Editor
3. เข้า service account ที่สร้าง → แท็บ **Keys → Add key → Create new key → JSON**
   ไฟล์ `.json` จะถูกดาวน์โหลด — **มีได้ครั้งเดียว** ถ้าหายต้องสร้างใหม่

หรือใช้ gcloud:
```bash
gcloud iam service-accounts create icheertor-backend
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:icheertor-backend@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
gcloud iam service-accounts keys create gcp-key.json \
  --iam-account=icheertor-backend@<PROJECT_ID>.iam.gserviceaccount.com
```

## 5. วาง key ในโปรเจกต์

```
backend/secrets/gcp-key.json
```

ตรวจว่า git ไม่เห็นไฟล์นี้ **ก่อน** ทำอย่างอื่น:
```bash
git check-ignore -v backend/secrets/gcp-key.json
# ต้องขึ้นว่า ignore ด้วยกฎ secrets/ — ถ้าไม่ขึ้นอะไรเลย ห้าม commit
```

container เห็นไฟล์ที่ `/app/secrets/gcp-key.json`
(`docker-compose.yml` mount `./backend/secrets` ให้แล้วแบบอ่านอย่างเดียว)

**key นี้คือรหัสผ่านของ project** — ใครได้ไปก็เรียก Gemini โดยคิดเงินบัญชีเรา
ห้ามส่งในแชท ห้ามใส่ Docker image ถ้าหลุดให้ลบ key ทิ้งในหน้า Keys แล้วสร้างใหม่

## 6. ตั้งค่า `backend/.env`

```env
VERTEX_AI_PROJECT_ID=<PROJECT_ID>
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL=<model ID จากขั้นที่ 3>
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcp-key.json
```

`GOOGLE_APPLICATION_CREDENTIALS` ต้องเป็น **path ใน container** ไม่ใช่ path Windows

## 7. Rebuild image

เพิ่ม dependency `@google/genai` แล้ว ต้อง build ใหม่หนึ่งครั้ง:
```bash
docker compose --profile tools build tools backend
```

## 8. ทดสอบ

**ขั้นที่ 1–2** — config + ส่งข้อความสั้น ๆ:
```bash
docker compose --profile tools run --rm tools npm run vertex:check
```
ควรเห็น:
```
[1] config
  project  icheertor-471203
  location global
  model    gemini-…-flash
  key      icheertor-backend@icheertor-471203.iam.gserviceaccount.com
  ✓ ครบ

[2] text
  ✓ "OK" ใน 900 ms (tokens in 8 / out 1)
```

**ขั้นที่ 3** — TOR จริงจาก e-GP (ไม่เขียนไฟล์ ไม่เขียน DB):
```bash
docker compose --profile tools run --rm tools npm run vertex:check -- --pdf=69049097411
```
ใช้เลข `metadata.projectId` ของโครงการไหนก็ได้ใน DB ที่ยังเปิดรับ
ผลที่ได้มี token ที่ใช้จริงต่อ 1 TOR — เอาไปคูณราคาในหน้า
[Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) เพื่อประเมินค่าใช้จ่ายทั้งชุด

## แก้ปัญหา

สคริปต์พิมพ์สาเหตุที่น่าจะเป็นไว้ใต้ error ทุกครั้ง สรุปที่พบบ่อย:

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `Could not load the default credentials` / `ENOENT` | path ของ key ผิด — ต้องเป็น `/app/secrets/gcp-key.json` และไฟล์ต้องอยู่ใน `backend/secrets/` |
| `SERVICE_DISABLED` / `has not been used in project` | ยังไม่ได้ Enable Vertex AI API (ขั้นที่ 2) — เพิ่งเปิดต้องรอ 1–2 นาที |
| `PERMISSION_DENIED` (403) | service account ไม่มี role Vertex AI User หรือ key มาจากคนละ project |
| `NOT_FOUND` (404) ที่ model | model ID พิมพ์ผิด, รุ่นถูกปิดแล้ว, หรือไม่มีใน location นั้น → ลอง `global` |
| `RESOURCE_EXHAUSTED` (429) | ติด quota — รอแล้วลองใหม่ pipeline จริงจะ retry ให้เอง |
| billing error | project ยังไม่ผูก billing account |
| `Key creation is not allowed` ตอนสร้าง key | ติด org policy ของ Workspace → ใช้ Gmail ส่วนตัว |

## ทางเลือก: ไม่ใช้ key file (เครื่อง dev)

ถ้าติดตั้ง gcloud อยู่แล้ว รันบนเครื่องตรง ๆ (ไม่ผ่าน container) ได้โดยไม่ต้องมี key:
```bash
gcloud auth application-default login
```
แล้วเว้น `GOOGLE_APPLICATION_CREDENTIALS` ว่างไว้ — SDK จะใช้สิทธิ์ของบัญชีเราเอง
วิธีนี้ปลอดภัยกว่า แต่ใช้ใน container ไม่ได้โดยตรง

## เสร็จแล้วทำอะไรต่อ

เมื่อ `--pdf` ผ่าน ขั้นต่อไปคือ extraction pipeline (`tor-extraction-pipeline.ts`)
ที่ส่ง TOR ทุกรายการที่ยังเปิดรับไปสกัด scope of work, คุณสมบัติ ฯลฯ แล้วเก็บลง DB
