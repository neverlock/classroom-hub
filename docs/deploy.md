# Deploy บน Cloudflare

โครงที่ตั้งค่าไว้แล้วใน `wrangler.jsonc`: Worker `classroom-hub`, โดเมน `classroom.conf.in.th`,
D1 `classroom-hub`, R2 `classroom-hub-images`, ตัวแปรของ Cloudflare Access (ไม่ใช่ความลับ)

> repo นี้เป็น **public** อย่า commit ความลับ (`SESSION_SECRET`, `SUPER_ADMINS`, รหัสผ่าน) ลงไฟล์ใดๆ

## ครั้งเดียว (ใน Cloudflare dashboard)

1. **Secret ของ Worker** (Workers & Pages → `classroom-hub` → Settings → Variables and Secrets → Add → Secret)
   - `SESSION_SECRET` ค่าสุ่มยาวอย่างน้อย 32 ตัว (ใช้เซ็น cookie ของแอดมินห้องและนักเรียน) เปลี่ยนค่านี้ = ทุกคนต้องล็อกอินใหม่
   - `SUPER_ADMINS` (ไม่บังคับ) อีเมล super admin คั่นด้วยจุลภาค ใช้ล็อกซ้ำนอกเหนือจากนโยบายของ Access
2. **Cloudflare Access** ครอบ `classroom.conf.in.th/admin` และ `/admin/*` เท่านั้น (นโยบาย Allow เฉพาะอีเมล super admin)
   ค่า AUD และชื่อทีมอยู่ใน `wrangler.jsonc` (`CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`)
3. **Build settings** (Workers & Pages → `classroom-hub` → Settings → Build)
   - Build command: `npm run build`
   - Deploy command: `npm run deploy`  (รัน migration ของ D1 แล้วค่อย `wrangler deploy`)
   - Production branch: branch ที่ต้องการ deploy

ถ้า token ของ Workers Builds ไม่มีสิทธิ์แก้ D1 ขั้น migration จะล้มเหลว ให้ตั้ง Deploy command เป็น `npx wrangler deploy`
แล้วรัน migration เองจากเครื่องที่ล็อกอิน `wrangler` ไว้: `npm run db:migrate:remote`

## ใช้งานครั้งแรก

1. เปิด `https://classroom.conf.in.th/admin` (ล็อกอินผ่าน Access ด้วยอีเมลรหัสครั้งเดียว)
2. สร้างห้อง: ชื่อลิงก์ ชื่อห้อง ภาคเรียนแรก และแอดมินห้องคนแรก (จดชื่อผู้ใช้/รหัสผ่านที่แสดงครั้งเดียว)
3. แอดมินห้องเข้า `https://classroom.conf.in.th/c/<ชื่อลิงก์>/manage` เพิ่มวิชาและรายชื่อนักเรียน
4. แชร์ลิงก์ `https://classroom.conf.in.th/c/<ชื่อลิงก์>` ให้ผู้ปกครองและนักเรียน

## สำรองข้อมูล

```sh
npx wrangler d1 export classroom-hub --remote --output backup.sql
```

ควรสำรองก่อนสิ้นภาคเรียนทุกครั้ง รูปอยู่ใน R2 (bucket `classroom-hub-images`)

## ข้อควรรู้

- `wrangler.jsonc` ปิด `workers.dev` และ preview URL (`workers_dev: false`, `preview_urls: false`) เพราะ Access
  ป้องกันเฉพาะโดเมนหลัก ถ้าเปิดไว้ `/admin` จะเข้าได้โดยไม่ผ่าน Access (โค้ดตรวจ JWT ของ Access ซ้ำอีกชั้น จึงยังเข้าไม่ได้ แต่ไม่ควรเปิดไว้)
- การเก็บรหัสผ่านใช้ PBKDF2 ที่ `PBKDF2_ITERATIONS` (ค่าเริ่มต้น 20000) เพราะ Worker แผนฟรีมีเวลา CPU 10 ms ต่อคำขอ
  ควรวัดเวลาล็อกอินจริงหลัง deploy (ดู Observability) ถ้าเกินเพดานให้ลดค่าลงและใช้รหัสผ่านสุ่มยาว
  รหัสผ่านเดิมที่แฮชไว้แล้วยังใช้ได้ (เก็บจำนวนรอบไว้ต่อรหัส) และจะถูกแฮชใหม่ตามค่าปัจจุบันเมื่อล็อกอินสำเร็จครั้งถัดไป
- ล็อกอินผิดซ้ำ 5 ครั้งต่อ (ห้อง + ชื่อผู้ใช้) ภายใน 15 นาที จะถูกล็อกชั่วคราว รหัสนักเรียนผิด 10 ครั้งต่อ IP ก็เช่นกัน
