# Ingestion — แหล่งข้อมูลและการดึง TOR

## สถานะ: pipeline หลักพิสูจน์แล้วว่าทำงานได้

```
govspending API  →  project_id
      ↓
e-GP approval-service  →  zipId
      ↓
e-GP upload-service    →  ZIP (1–5 MB)
      ↓
zip-reader + document-picker  →  TOR PDF
      ↓
tor-parser (Vertex AI)  →  ยังไม่ทดสอบ (รอ set up)
```

## เงื่อนไขสำคัญ: ต้องส่ง Referer

e-GP มี WAF ที่ตอบ **HTTP 200 พร้อม HTML ว่า "Request Rejected"** เมื่อไม่มี
`Referer` header — อ่านผิดง่ายมากว่าเป็นการบล็อกที่ต้อง login ทั้งที่ไม่ต้อง

`egp-client.ts` ใส่ header นี้ให้ทุก request แล้ว และตรวจจับหน้า rejection
เพื่อโยน error ที่อ่านรู้เรื่องแทนการคืนข้อมูลขยะ

## Endpoint ที่ยืนยันแล้ว

| ขั้น | endpoint |
|---|---|
| metadata | `opend.data.go.th/govspending/service/egp-contract?api-key=…` |
| หา zipId | `process5…/egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=…` (ประกาศเชิญชวนจริง — มีวันยื่น) ถ้าไม่มีใช้ `…ZipTemp` (ร่างช่วงรับฟังความเห็น — วันยื่นว่าง) |
| โหลด ZIP | `process5…/egp-upload-service/v1/downloadFileTest?fileId=<zipId>` |

ทดสอบแล้วได้ผล 4/4 โครงการ กทม.

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `egp-client.ts` | project_id → zipId → ZIP (จัดการ WAF/timeout/ตรวจ magic bytes) |
| `zip-reader.ts` | อ่าน ZIP ด้วย `zlib` ในตัว — ไม่เพิ่ม dependency |
| `document-picker.ts` | เลือกไฟล์ที่ควร parse จาก 3–17 ไฟล์ในชุด |
| `http-client.ts`, `types.ts` | fetch + retry, type ร่วม |

## ข้อควรรู้จากข้อมูลจริง

**ชื่อไฟล์ TOR ไม่คงที่** — เจอทั้ง `Attach_TOR_1.pdf` และ `TOR.pdf`
`document-picker` จึงจับหลาย pattern รวมถึงคำไทย "ขอบเขตงาน"

**บางชุดไม่มี TOR** — โครงการที่ประมูลจบแล้วจะมีแต่สัญญา/หลักประกัน
(`contract_24.pdf`, `Bid Bond.pdf`) กรณีนี้ **ไม่ใช่ error** — pipeline ต้อง
บันทึกเป็น completed พร้อมเหตุผล ไม่ใช่ failed

**ชื่อไฟล์ใน ZIP** — archive จริงตั้ง UTF-8 flag ไว้ แต่ `zip-reader` รองรับ
CP874 ด้วย เผื่อ archive เก่าที่ไม่ได้ตั้ง flag

## วิธีทดสอบ

```bash
# ทดสอบทั้ง pipeline (filter + phase + egp2 API + ดึงเอกสาร)
docker compose --profile tools run --rm tools npx tsx scripts/test-pipeline.ts

# เฉพาะส่วนที่ไม่ต้องต่อเน็ต (filter + phase)
docker compose --profile tools run --rm tools npx tsx scripts/test-pipeline.ts --offline
```

ขั้นที่ 4 ใช้ `projectId` จาก MongoDB ถ้ามีข้อมูลอยู่แล้ว (รัน `ingest-egp2.ts`
ก่อน) ถ้ายังไม่มีจะดึงจาก API มาทดสอบแทน

## ยังไม่ได้ทำ

- `deduplication.ts`, `pdpa-filter.ts`, `pipeline.ts` (orchestrator)
- `ingest-job.ts` model + cron routes — ตอนนี้รัน ingest ด้วยมือ
- TOR parsing ผ่าน Vertex AI (ยังไม่ได้ตั้งค่า)
