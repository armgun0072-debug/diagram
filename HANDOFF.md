# ส่งต่องาน: Schema Studio

อัปเดตล่าสุด: **2026-11-02 (Asia/Bangkok)**

เริ่มจาก [AGENTS.md](AGENTS.md) สำหรับกติกาการทำงาน แล้วใช้เอกสารนี้เลือกอ่านเฉพาะไฟล์ที่เกี่ยวข้อง รายละเอียดวิธีใช้มีใน [README.md](README.md) และประวัติงานมีใน [CHANGELOG.md](CHANGELOG.md)

## สถานะปัจจุบัน

- แอป ER Diagram สำหรับ Windows รันในเครื่องด้วย React + TypeScript + Vite + React Flow + ELK.js และ CodeMirror
- เป็น frontend ที่บันทึกใน `localStorage` ไม่มี backend, บัญชีผู้ใช้ หรือการเชื่อมต่อฐานข้อมูลจริง
- มี Code Editor/Visual Designer และแท็บ **Business Flowchart** ที่อ้างอิงตาราง/คอลัมน์ ER พร้อมแก้ขั้นตอนและแขนงเงื่อนไขเอง
- รองรับการ deploy บน **Netlify** ผ่าน `netlify.toml` (SPA redirect และ build publish ไปที่ `dist`) สามารถ deploy ด้วย Netlify Drop, Git หรือ CLI
- งานโค้ดล่าสุดย้ายการคำนวณเส้นไป Web Worker แยก live drag state จากข้อมูลบันทึก และเพิ่ม Flowchart ตามแผนที่ผู้ใช้อนุมัติ
- สำรอง source ก่อนแก้ไว้ที่ `backups/schema-studio-before-flowchart-2026-10-31.zip` ใน workspace นี้ (28 entries, SHA-256 อยู่ใน backups/README.md); ไม่ได้สำรองโปรไฟล์เบราว์เซอร์ผู้ใช้ และไม่พบ `.erd.json` ในรากตอนสำรอง
- แอปเก็บ raw localStorage ก่อนเพิ่ม workflow เมื่อเปิดรุ่นใหม่ที่ origin เดิม พร้อมปุ่มดาวน์โหลด; ถ้าเก็บสำเนาไม่ได้จะไม่เขียนทับข้อมูลเดิม ข้อมูลของเบราว์เซอร์จริงต้องให้ผู้ใช้เปิดรุ่นใหม่/ดาวน์โหลดเอง
- ไม่มีงานโค้ดที่อนุมัติแล้วค้างอยู่จากเซสชันนี้
- ก่อนเริ่มแก้งานถัดไป ต้องเสนอแผนและรอผู้ใช้ approve ตาม AGENTS

## ทำอะไรเสร็จแล้ว

| ส่วนงาน | สิ่งที่ใช้ได้แล้ว |
| --- | --- |
| โค้ด ↔ Diagram | แปลง DBML subset เป็น schema; Visual แปลงกลับเป็นโค้ด; โค้ดผิดคง Diagram ที่อ่านสำเร็จล่าสุดและขึ้น PREVIEW PAUSED |
| ตาราง | เพิ่ม แก้ชื่อ/คอลัมน์/flags ลบ ลากย้าย และเลือกตารางเพื่อซูมดู |
| หัวตาราง | เลือกสีสำเร็จรูป/สีเอง/คืนค่าเดิม พื้นหลังเปลี่ยนเต็มพื้นที่ และปรับตัวอักษรดำ/ขาวให้อ่านชัด |
| ความสัมพันธ์ | แสดง N : 1, 1 : 1, N : N และ optional; จุดเชื่อมสลับด้านตามตำแหน่ง; Visual สร้าง N : 1 |
| การเดินเส้น | A* บนช่องแนวนอน/แนวตั้ง หลบกรอบตาราง และคิดต้นทุนเพิ่มสำหรับการหักมุม/ใช้ช่องเดิม/ตัดเส้นอื่น |
| การชี้เส้น | เส้นที่ชี้เป็นสีเขียวและเส้นประวิ่ง ยกขึ้นด้านหน้า พร้อมป้าย cardinality; เลื่อนเมาส์ออกแล้วหยุด |
| จัดตำแหน่ง | Left-right ด้วย ELK.js; Pipeline แบ่งขั้น dependency; Snowflake กระจายรอบ hub; Compact วางเป็นกลุ่มกระชับ |
| เมนูจัดตำแหน่ง | มีคำอธิบาย ตัวเลือกที่ใช้อยู่ คีย์บอร์ดลูกศร/Escape และปุ่ม 1–4 ขณะเปิดเมนู |
| การเก็บงาน | บันทึกอัตโนมัติในเบราว์เซอร์; JSON เก็บโค้ด ตำแหน่ง สี และรูปแบบจัดวาง; ส่งออก/นำเข้า DBML subset ได้ |
| ปัญหาที่แก้แล้ว | เก็บขนาดตารางที่วัดไว้เพื่อไม่ให้ตาราง/เส้นหายวูบขณะลาก; แยก CodeMirror จากการวาด Diagram ซ้ำ; รอขนาดครบก่อน fit โปรเจกต์ที่กู้คืน |
| การลากลื่นขึ้น | ระหว่างลากอัปเดต live positions ไม่ serialize เอกสารทุก event; ใช้เส้น preview แล้วคำนวณละเอียดหลังปล่อยใน worker; ไม่สะสมงานเก่า |
| Business Flowchart | Start/Process/Decision/End, สร้างขั้นตอนจากตาราง ER, เลือกคอลัมน์/ดู Enum, ลากเส้นใช่/ไม่ใช่, แก้ label, จัดแนวบนลงล่าง และเปิดตารางกลับใน ER |
| ลิงก์ข้ามแผนภาพ | Visual rename ปรับ tableRef ให้; ถ้าชื่อหายจาก schema จะเตือนโดยไม่ลบ Flow/เงื่อนไข; JSON เก็บทั้ง ER และ Workflow |

## แผนที่ไฟล์: เริ่มอ่านจากตรงไหน

| ต้องทำเรื่อง | ไฟล์ที่ควรอ่านก่อน |
| --- | --- |
| จัดการ state, สลับโหมด, event, import/export | [src/App.tsx](src/App.tsx) |
| ไวยากรณ์ DBML, validation, serialize และชนิดข้อมูลกลาง | [src/schema.ts](src/schema.ts) |
| กู้คืน/บันทึกโปรเจกต์และความเข้ากันได้ของไฟล์เก่า | [src/storage.ts](src/storage.ts) |
| ตารางและจุดเชื่อมแต่ละคอลัมน์ | [src/TableNode.tsx](src/TableNode.tsx), [src/TableEditor.tsx](src/TableEditor.tsx) |
| CodeMirror และ syntax highlighting | [src/SchemaEditor.tsx](src/SchemaEditor.tsx) |
| สีหัวตารางและความเปรียบต่างตัวอักษร | [src/appearance.ts](src/appearance.ts), [src/TableAppearance.tsx](src/TableAppearance.tsx) |
| จัดตำแหน่งตารางทั้ง 4 แบบ | [src/layout.ts](src/layout.ts), [src/layoutOptions.ts](src/layoutOptions.ts), [src/ArrangeMenu.tsx](src/ArrangeMenu.tsx) |
| เส้นหลบตารางและการเลือกฝั่งจุดเชื่อม | [src/obstacleRouting.ts](src/obstacleRouting.ts), [src/routing.ts](src/routing.ts) |
| วาดเส้น ป้าย ช่องว่างที่จุดตัด และ hover | [src/RelationshipEdge.tsx](src/RelationshipEdge.tsx), [src/styles.css](src/styles.css) |
| ความลื่นขณะลาก/งาน worker/ผลคำนวณเก่า | [src/useErRoutes.ts](src/useErRoutes.ts), [src/routeWorker.ts](src/routeWorker.ts), [src/edgePath.ts](src/edgePath.ts), App.tsx |
| โมเดลและข้อมูลอ้างอิงของ Business Flowchart | [src/workflow.ts](src/workflow.ts), [src/workflowLayout.ts](src/workflowLayout.ts) |
| หน้า Flowchart/กล่อง/ฟอร์ม | [src/FlowEditor.tsx](src/FlowEditor.tsx), [src/FlowStepNode.tsx](src/FlowStepNode.tsx), [src/FlowStepEditor.tsx](src/FlowStepEditor.tsx) |
| Flow validation, roundtrip และการสำรองข้อมูล | [src/workflow.test.ts](src/workflow.test.ts) |
| ชุดทดสอบที่รันด้วย npm test | [src/schema.test.ts](src/schema.test.ts) |
| ตัวอย่างข้อมูลจริงสำหรับ regression | [examples/durian-marketplace.dbml](examples/durian-marketplace.dbml) |
| คำสั่ง/แพ็กเกจ/การตั้งค่า/โฮสติ้ง | [package.json](package.json), [vite.config.ts](vite.config.ts), [tsconfig.json](tsconfig.json), [netlify.toml](netlify.toml) |

## ข้อมูลไหลอย่างไร

1. ข้อความจาก Editor → `parseSchema()` → `Schema` กลาง → React Flow nodes/edges
2. การแก้โครงสร้างจาก Visual → `validateSchema()` → `serializeSchema()` → อัปเดตข้อความและ schema
3. ระหว่างลากเก็บ `livePositions` ผ่าน requestAnimationFrame และวาด preview; หลังปล่อยอัปเดต `doc.positions` → worker เรียก `routeRelations()` → รับเฉพาะผลล่าสุดให้ `RelationshipEdge` วาดเส้นละเอียด
4. `layoutSchema()` คำนวณตำแหน่งเมื่อเลือกรูปแบบ หรือเมื่อมีตารางใหม่ที่ยังไม่มีตำแหน่ง (รอหยุดพิมพ์ 450 ms)
5. เปลี่ยนสี/จัดตำแหน่งไม่เขียน DBML ใหม่; บันทึกเอกสารในเบราว์เซอร์หลังเปลี่ยน 400 ms
6. Flowchart ใช้ provider ของตัวเอง มี state ภาพขณะลากเฉพาะ component และ commit ตำแหน่งหลังปล่อย; `workflow` ผูกกับ schema ด้วย `tableRef`/`fieldRef` ไม่ได้สร้าง business order จาก FK

### รูปแบบข้อมูลที่ต้องรักษา

- `DocumentState`: `source`, `validSource`, `schema`, `positions`, `tableColors`, `layoutAlgorithm`, `workflow`, `error`
- Storage key: **`schema-studio:v1`**
- ไฟล์ `.erd.json`: `version: 1`, `source`, `validSource`, `positions`, `tableColors`, `layoutAlgorithm`, `workflow`
- `workflow.nodes`: id/kind/label/description/tableRef/fieldRef/position; `workflow.edges`: id/source/target/sourceHandle/label; `yes`/`no` คือแขนง Decision, `out` คือทางออกปกติ
- ไฟล์เก่าที่ไม่มี workflow เปิดเป็น Flow ว่าง; คง version 1 และ storage key เดิม ข้อมูลสำรอง raw ก่อนอัปเดตอยู่ที่ **`schema-studio:backup:before-workflow:v1`** และไม่ถูกเขียนทับ
- `schema` สร้างใหม่จาก source ตอนนำเข้า/กู้คืน ไม่ได้บันทึกเป็นสำเนาในไฟล์ JSON
- เอกสารเก่าที่ไม่มีสี/รูปแบบจัดวางยังเปิดได้: สีเป็น `{}` และรูปแบบเป็น `left-right`
- หาก draft ผิดไวยากรณ์ ใช้ `validSource` กู้ schema ที่ถูกต้องโดยยังเก็บ draft ไว้
- ไฟล์ `.dbml` เก็บเฉพาะข้อความโครงสร้าง ไม่มีตำแหน่ง สี หรือรูปแบบจัดวาง
- นำเข้า `.dbml`, `.txt` หรือ `.json` ครั้งละไฟล์ ไม่เกิน 2,000,000 bytes

## ข้อจำกัดและจุดที่ควรระวัง

- **DBML ยังเป็น subset**: รองรับ Table, Enum, indexes แบบ columns พร้อม pk/unique, increment, inline ref, Ref แบบบรรทัด, quoted reference ชื่ออังกฤษ/ตัวเลข/underscore และ `?` optional ยังไม่มี Note/default/schema namespace/composite FK/Ref block/TablePartial/ชื่อมีช่องว่าง ดูขอบเขตใน README ก่อนขยาย parser
- Visual จัดรูปแบบโค้ดใหม่และนำคอมเมนต์ออก แต่ต้องเก็บ Enum/indexes/increment/optional refs ไว้ เปลี่ยนชื่อคอลัมน์ใน Visual จะลบ refs ที่อ้างชื่อเดิม; index ที่อ้างคอลัมน์นั้นต้องแก้ในโค้ดด้วย
- เส้นเป็นข้อมูลสำหรับภาพ ไม่ตรวจว่า FK กับปลายทางชนิดเดียวกัน หรือปลายทาง unique จริง ตัวอย่างมี self-reference จาก `license_number` ไป `id` ซึ่งเก็บตามต้นฉบับ
- **กราฟหนาแน่นยังมีจุดตัดได้** และเส้นที่เข้าคอลัมน์เดียวกันอาจใช้ช่วงสั้นร่วมกัน ระบบลดช่วงซ้อนและเว้นช่องว่างที่จุดตัด ไม่ได้รับประกันกราฟไม่มีจุดตัดทั้งหมด
- ถ้าลากตารางชิด/ซ้อนจนเดินเส้นไม่ได้ route จะเป็น `blocked` และมีข้อความให้จัดตำแหน่งใหม่ ไม่วาดเส้นทะลุตารางแทน
- ชุดข้อมูลจริงที่ใช้ตรวจมี 15 ตาราง/142 คอลัมน์/27 ความสัมพันธ์/12 Enum/5 indexes ยังไม่มีผลรับรองประสิทธิภาพกับกราฟขนาดใหญ่มาก
- ไม่มี Undo/Redo, SQL export, PNG/SVG export, cloud sync, backend หรือ authentication
- ระหว่างลาก ER อาจเห็น preview พาดผ่านสิ่งกีดขวางสั้น ๆ แล้วจัดทางละเอียดหลังปล่อย เป็น tradeoff ที่ผู้ใช้อนุมัติเพื่อลด lag; Worker ใช้ไม่ได้ยังมี fallback หลังปล่อย
- Business Flowchart เป็น editor ของขั้นตอนที่ผู้ใช้กำหนด ไม่รัน workflow ไม่อนุมานกฎธุรกิจจาก FK และไม่ใช้ข้อมูล record ในฐานข้อมูลจริง; เส้น Flow ใช้ smoothstep ส่วน obstacle router ใช้กับ ER
- เปลี่ยนชื่อตารางผ่านโค้ดไม่ได้เดาว่าเท่ากับ rename ใดใน Flow ให้เตือน missing reference แทน; ห้ามลบขั้นตอนของผู้ใช้อัตโนมัติ

### ระวัง regression เมื่อแก้โค้ด

- **อย่าทิ้ง `measured` ของ controlled nodes** ใน App: React Flow จะทิ้ง handle bounds และวัดใหม่ ทำให้ตาราง/เส้นหายวูบระหว่างลาก เก็บ `nodeMeasurements` ต่อไป
- คง `SchemaEditor` ที่ memo และ configuration คงที่ เพื่อไม่ให้ CodeMirror reconfigure ทุกครั้งที่ลากตาราง
- **ขนาดภาพกับ router ต้องตรงกัน**: ความกว้าง 270, หัวตาราง 51 px, แถว 34 px; router คำนวณศูนย์แถวจาก `y + 69 + index * 34` และใช้ clearance 16 px ถ้าเปลี่ยน padding/height/border ต้องตรวจทั้ง `styles.css`, `TableNode.tsx`, `layout.ts`, `obstacleRouting.ts` และทดสอบปลายเส้นกับ DOM จริง
- `routing.ts` ให้ด้านที่แนะนำ แต่ `obstacleRouting.ts` เป็นผู้เลือกฝั่งสุดท้ายเมื่อจำเป็นต้องหลบสิ่งกีดขวาง จุดเชื่อมที่ใช้เดินเส้นเฉพาะต้องซ่อนได้แต่ห้าม `display: none` เพราะต้องวัดตำแหน่ง
- คง guard ของ async layout (`layoutJob`/schema snapshot) เพื่อไม่ให้ผลเก่าทับโครงสร้างใหม่
- อย่าเปิดแอนิเมชันให้ทุกเส้นตลอดเวลา ความต้องการคือวิ่งเฉพาะเส้นที่เมาส์ชี้ และหยุดเมื่อออก
- ห้ามย้าย router กลับมาคำนวณทุกตำแหน่งบน render thread ระหว่างลาก คง backpressure/ตรวจ ID ผลลัพธ์ใน `useErRoutes` และแยกงาน render SVG ใน `edgePath.ts`
- อย่าบันทึกด้วย `localStorage.setItem(STORAGE_KEY, ...)` ตรง ๆ ให้ผ่าน `persistDocument()` เพื่อป้องกันเขียนทับ legacy data เมื่อ backup ล้มเหลว

## ผลตรวจล่าสุดที่มีอยู่

ผลต่อไปนี้ตรวจในการเพิ่ม Flowchart/ปรับความลื่นเมื่อ **2026-10-31**:

| การตรวจ | ผลที่บันทึกไว้ |
| --- | --- |
| `npm.cmd test` | ผ่าน 37 tests รวมของเดิม 30 และ Business Flow roundtrip/branch validation/missing refs/layout/backup exact/backup quota failure |
| `npm.cmd run build` | TypeScript + Vite ผ่าน มี warning เรื่อง chunk ใหญ่กว่า 500 kB; ELK.js แยกโหลดตามการใช้งาน |
| Chrome headless | ER import/Visual/invalid draft/refresh ผ่าน; Flow สร้าง 7 ขั้นตอน+ลากเชื่อมจริง 7 เส้น มี yes/no วนกลับ, Enum hints, จัดวาง, JSON, refresh, Visual rename และ missing refs หลังลบตาราง ผ่าน |
| ตรวจ SVG กับตำแหน่ง DOM | เส้น 27 เส้นไม่ผ่านตัวตาราง, เฉพาะเส้นที่ชี้มี animation และหยุดเมื่อออก, ลากตารางอื่นมาขวางแล้วเปลี่ยนทางได้ |
| Worker | แก้ schema รัวแล้วรับผลล่าสุด ไม่มีเส้นจาก schema เก่าค้าง; ปิด Worker จำลองแล้ว fallback/กลับโหมดปกติผ่าน |
| Benchmark ลาก 32 ช่วง | ก่อน: 3,011 ms, p95 frame 100.1 ms, max 127.8 ms; หลัง: 986 ms, p95 5.7 ms, max 22.2 ms บน Chrome headless ของเครื่องนี้ ไม่ใช่คำรับประกัน FPS บนเครื่องอื่น |
| จอแคบ | ที่ 390×844 header ไม่ล้น และพื้นที่ Flowchart ยังใช้งานได้ |

สำเนา raw legacy ถูกตรวจในโปรไฟล์ทดสอบว่าเก็บตรงทุก byte และยังอยู่หลัง import/rename/delete; ไม่ได้เข้าถึง localStorage ของ Chrome โปรไฟล์จริงของผู้ใช้

`.qa/` เป็นสคริปต์และภาพตรวจเฉพาะเซสชัน ถูก ignore และอาจไม่อยู่ในโปรเจกต์ที่ส่งต่อ บางไฟล์อ้างพาธ Windows และ Chrome/CDP port เฉพาะเครื่อง ไม่ใช่ browser test suite ที่ตั้งค่าพร้อมใช้บนทุกเครื่อง ผลการตรวจครั้งถัดไปต้องระบุสิ่งที่รันได้จริง

## คำสั่งเริ่มงาน

เปิด Terminal ในโฟลเดอร์โปรเจกต์ของเครื่องที่รับงาน:

```powershell
npm.cmd ci
npm.cmd run dev
```

```powershell
npm.cmd test
npm.cmd run build
```

- ใช้ Node.js ตั้งแต่ 22.12 ขึ้นไปตามคู่มือ; เครื่องที่พัฒนาก่อนหน้านี้ใช้ Node.js 26.7.0
- dev รับเฉพาะ `127.0.0.1` ปกติพอร์ต 5173; preview หลัง build ปกติพอร์ต 4173 ให้เปิด URL ที่ Terminal แสดง
- บน sandbox Windows เคยพบ `uv_os_get_passwd returned ENOMEM` ก่อน tsx เริ่มทดสอบ; รันด้วยสิทธิ์ที่สภาพแวดล้อมอนุญาต อย่าสรุปว่า tests ล้มเหลวจากโค้ดถ้ายังไม่เริ่มรัน
- ถ้าใช้ browser profile ชั่วคราวในโฟลเดอร์งาน ต้องไม่ให้ Vite watch ไฟล์ฐานข้อมูลที่ถูกล็อก; config ปัจจุบัน ignore `.browser-check/` และ `.qa/` แล้ว

## ส่งโปรเจกต์ให้คนอื่น

- ส่ง source, `examples/`, `index.html`, package/config files, `package-lock.json` และเอกสารทั้งสี่ไฟล์
- ไม่จำเป็นต้องส่ง `node_modules/`, `dist/`, `*.tsbuildinfo`, `.qa/` หรือ browser profile ชั่วคราว ผู้รับติดตั้งด้วย `npm.cmd ci`
- **ถ้าจะส่ง Diagram ที่ออกแบบอยู่ ให้ดาวน์โหลด `.erd.json` จากแอปแล้วส่งแนบด้วย** ข้อมูลใน localStorage ไม่ได้อยู่ในโฟลเดอร์โค้ดและไม่ติดไปกับการส่งโปรเจกต์
- การส่ง source ไม่จำเป็นต้องนำ `.git` ไปด้วย เว้นแต่ต้องการส่งประวัติ version control

ข้อความที่ใช้เริ่มงานกับ AI คนถัดไป:

> อ่าน AGENTS.md และ HANDOFF.md ก่อน แล้วตรวจเฉพาะไฟล์ที่เกี่ยวกับงานที่ฉันแจ้ง สรุปแนวทาง ไฟล์ที่จะเปลี่ยน ผลกระทบ และวิธีทดสอบ รอฉัน approve ก่อนแก้ไฟล์ เมื่อเสร็จให้อัปเดต HANDOFF.md และ CHANGELOG.md ด้วย

## จุดเริ่มต่อ

ไม่มีงานพัฒนาที่ได้รับอนุมัติแล้วค้างอยู่ รอความต้องการใหม่จากผู้ใช้ ตัวเลือกอย่าง parser DBML เต็มรูปแบบ, Undo/Redo, export และการวัดประสิทธิภาพกราฟใหญ่เป็นเพียงแนวทางต่อยอด **ยังไม่ได้อนุมัติให้ลงมือทำ**
