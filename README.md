# classroom-hub

เว็บบันทึกการเรียนการสอนและการบ้านของห้องเรียน ใช้ฟรีบน Cloudflare (Workers + D1 + R2)
เว็บจริง: <https://classroom.conf.in.th> · แนวคิดและหน้าจอทั้งหมดอยู่ใน [`docs/design.md`](docs/design.md) (ต้นแบบหน้าจอใน `docs/mockups/`)

## ใครทำอะไรได้

- **ทุกคนในห้อง (นักเรียน/ผู้ปกครอง):** เปิดอ่านได้เลย บันทึกสิ่งที่เรียน/การบ้านและเขียนความคิดเห็นพร้อมรูปได้ด้วย "รหัส" ของนักเรียน (กรอกครั้งเดียว เครื่องจำไว้) แก้/ซ่อนได้เฉพาะของตัวเอง
- **แอดมินห้อง:** ล็อกอินด้วยชื่อผู้ใช้ + รหัสผ่าน แก้/ซ่อน/ลบถาวรได้ทุกการ์ด จัดการวิชา นักเรียน ภาคเรียน (`/c/<ลิงก์>/manage`)
- **ผู้ดูแลระบบ (super admin):** `/admin` อยู่หลัง Cloudflare Access สร้างห้อง จัดการบัญชีแอดมินห้อง

## Stack

SvelteKit 3 + `@sveltejs/adapter-cloudflare` · D1 (SQLite) + Drizzle ORM · R2 (รูป) · jose (ตรวจ JWT ของ Access)

## พัฒนาในเครื่อง

```sh
npm install                      # ใช้ legacy-peer-deps ตาม .npmrc
cp .dev.vars.example .dev.vars   # ใส่ SESSION_SECRET (และ DEV_SUPER_ADMIN สำหรับ vite dev)
npm run db:migrate:local         # สร้างตารางใน D1 จำลอง
npm run dev                      # http://localhost:5173  (/admin ใช้ DEV_SUPER_ADMIN แทน Access)
npm run check                    # ตรวจชนิดข้อมูล (svelte-check)
npm test                         # unit test + test ที่รันกับ D1 จำลองจริง (ใช้เวลาไม่กี่วินาที)
npm run build && npm run preview # ทดลองบน workerd จริง (ไม่มี Access จึงเข้า /admin ไม่ได้)
```

เปลี่ยน schema: แก้ `src/lib/server/db/schema.ts` แล้ว `npm run db:generate` จะได้ไฟล์ใหม่ใน `drizzle/` (ให้เพิ่มอย่างเดียว เพื่อให้ย้อนโค้ดได้)
เปลี่ยน `wrangler.jsonc` แล้วรัน `npm run gen` เพื่ออัปเดต `worker-configuration.d.ts`

## ข้อควรระวังเวลาแก้โค้ด

- **คำสั่ง D1 แบบ batch ห้ามเลือกคอลัมน์ชื่อซ้ำ** (เช่น `entries.id` กับ `subjects.id` ในคำสั่งเดียว): D1 ส่งแถวกลับเป็นออบเจ็กต์ตามชื่อคอลัมน์ ชื่อซ้ำจะรวมกันแล้วค่าที่ตามมาเลื่อนผิดช่อง ให้ตั้งชื่อแยกด้วย `.as()` และให้เพิ่มการตรวจใน `src/lib/server/queries.integration.spec.ts` โดยตั้ง id ให้ไม่ตรงกันจงใจ
- SvelteKit 3 ไม่มี `$lib` ให้ใช้ `#lib/…` และต่อท้าย `.js` (เช่น `#lib/dates.js`) ส่วน binding ของ Cloudflare (`DB`, `IMAGES`, secret) ใช้ `import { env } from 'cloudflare:workers'` ผ่าน `useEnv()` ไม่ใช่ `event.platform`
- ฟอร์มใช้ `actionUrl(page.url, 'ชื่อ action')` แทน `?/ชื่อ` เพื่อไม่ให้ query string (`?d=…`, `?tab=…`) หายหลังกดส่ง
- ข้อความยาวเกินกำหนดต้องแจ้ง error (`lengthError`) ห้ามตัดทิ้งเงียบๆ

## Branch และ deploy

`main` คือ production: เว็บจริงเปลี่ยนเมื่อมีคอมมิตใหม่เข้า `main` เท่านั้น ทำงานบน branch แยกแล้วเปิด Pull Request เข้า `main`
รายละเอียดการตั้งค่า Cloudflare, secret, migration, สำรองข้อมูลและย้อนกลับ: [`docs/deploy.md`](docs/deploy.md)


