# classroom-hub

เว็บบันทึกการเรียนการสอนและการบ้านของห้องเรียน ใช้ฟรีบน Cloudflare (Workers + D1 + R2)
ดูแนวคิดและหน้าจอทั้งหมดใน [`docs/design.md`](docs/design.md) และต้นแบบหน้าจอใน `docs/mockups/`

- **ผู้ใช้ทั่วไป/ผู้ปกครอง:** เปิดอ่านได้เลย เขียนความคิดเห็นและแนบรูปด้วย "รหัส" นักเรียน
- **แอดมินห้อง:** ล็อกอินด้วยชื่อผู้ใช้ + รหัสผ่าน บันทึกสิ่งที่เรียน/การบ้าน จัดการวิชา นักเรียน ภาคเรียน
- **ผู้ดูแลระบบ (super admin):** `/admin` อยู่หลัง Cloudflare Access สร้างห้อง จัดการแอดมินห้อง

## Stack

SvelteKit 3 + `@sveltejs/adapter-cloudflare` · D1 (SQLite) + Drizzle ORM · R2 (รูป) · jose (ตรวจ JWT ของ Access)

## พัฒนาในเครื่อง

```sh
npm install                      # ใช้ legacy-peer-deps ตาม .npmrc
cp .dev.vars.example .dev.vars   # ใส่ SESSION_SECRET (และ DEV_SUPER_ADMIN สำหรับ vite dev)
npm run db:migrate:local         # สร้างตารางใน D1 จำลอง
npm run dev                      # http://localhost:5173  (/admin ใช้ DEV_SUPER_ADMIN แทน Access)
npm run check && npm test        # ตรวจชนิดข้อมูลและ unit test
npm run build && npm run preview # ทดลองบน workerd จริง (ไม่มี Access จึงเข้า /admin ไม่ได้)
```

เปลี่ยน schema: แก้ `src/lib/server/db/schema.ts` แล้ว `npm run db:generate` จะได้ไฟล์ใหม่ใน `drizzle/`
เปลี่ยน `wrangler.jsonc` แล้วรัน `npm run gen` เพื่ออัปเดต `worker-configuration.d.ts`

## Deploy

ดู [`docs/deploy.md`](docs/deploy.md)
