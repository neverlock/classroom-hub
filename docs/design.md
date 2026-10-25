# Classroom Hub — Design

เว็บเก็บการบ้าน/งานค้าง/สิ่งที่เรียนของนักเรียนหลายห้อง เน้นความเรียบง่าย
ใช้งานภายในห้องเรียน (เว็บปิด) ผู้ปกครองและนักเรียนเปิดดูได้โดยไม่ต้อง login

สถานะ: ร่างออกแบบ (ยังไม่มีโค้ด)

## 1. เป้าหมายและหลักการ

- Login จริงเฉพาะ admin เท่านั้น นักเรียน/ผู้ปกครองไม่ต้องมี account
- นักเรียนโพสต์โดยกรอก **รหัสนักเรียน** อย่างเดียว UI แสดงเป็น "เลขที่ N"
- ดูข้อมูลย้อนหลังได้
- ใช้ free tier ของ Cloudflare ให้ได้ยาวๆ
- ทำน้อยที่สุดที่ใช้งานได้ ฟีเจอร์เสริมอยู่ในหัวข้อ "Future" และเปิดใช้ภายหลังได้โดยไม่ต้องรื้อโครงสร้าง

## 2. บทบาทและสิทธิ์

| บทบาท | ยืนยันตัวตน | ทำอะไรได้ |
|---|---|---|
| Super admin | Cloudflare Access (email) อยู่ใน env `SUPER_ADMINS` | สร้าง/ปิด class, ตั้ง class admin, ทำได้ทุกอย่าง |
| Class admin | Cloudflare Access (email) อยู่ในตาราง `class_admins` | จัดการข้อมูลห้องตัวเอง, เพิ่ม/ลบนักเรียน, แก้/ลบ/ซ่อน post ของใครก็ได้ในห้อง |
| Member | รหัสนักเรียน (ไม่มี password) | สร้างและแก้ไข post ของตัวเอง, แนบรูป |
| ผู้เยี่ยมชม | ไม่ต้องทำอะไร | อ่านอย่างเดียว |

| การกระทำ | ผู้เยี่ยมชม | Member | Class admin | Super admin |
|---|:-:|:-:|:-:|:-:|
| อ่าน | ✓ | ✓ | ✓ | ✓ |
| สร้าง post | – | ✓ | ✓ | ✓ |
| แก้/ลบ post ตัวเอง | – | ✓ | ✓ | ✓ |
| แก้/ลบ/ซ่อน post คนอื่น | – | – | ✓ (ห้องตัวเอง) | ✓ |
| จัดการนักเรียน | – | – | ✓ | ✓ |
| สร้างห้อง / ตั้ง class admin | – | – | – | ✓ |

### ข้อสมมติเริ่มต้น (ยังเปลี่ยนได้)

- Member แก้ได้เฉพาะ post ของตัวเอง
- `homework` / `lesson` ลงโดย class admin เป็นหลัก ส่วน member โพสต์ `note` และแนบรูป
- อ่านได้ทุกคนโดยไม่ต้องกรอกอะไร
- รูป: ไม่เกิน 3 รูปต่อ post, ไม่เกิน ~2MB ต่อรูป, เฉพาะ jpg/png/webp

## 3. การยืนยันตัวตนของ member (ไม่มีรหัสห้อง)

เว็บเป็นเว็บปิดใช้ในห้อง จึง**ไม่ใช้รหัสห้อง** Member ระบุตัวตนด้วยรหัสนักเรียนเท่านั้น
ระบบนี้เป็นการ "ระบุตัวตน" ไม่ใช่การ "พิสูจน์ตัวตน" ใครรู้รหัสนักเรียนก็โพสต์แทนได้ จึงมีมาตรการรองรับแบบเบาๆ:

- เก็บ `student_id` และเวลาในทุก post เพื่อตรวจย้อนหลัง
- Class admin ซ่อน/ลบ post ได้
- จำรหัสนักเรียนใน cookie บนอุปกรณ์ เพื่อไม่ต้องกรอกซ้ำ
- ตรวจรหัสนักเรียนกับตาราง `students` ของห้องนั้นเสมอ (รหัสที่ไม่มีในห้อง โพสต์ไม่ได้)
- Rate limit ต่อ IP / ต่อ student เพื่อกัน spam

## 4. คำแนะนำสำหรับอนาคต (ยังไม่ทำ)

เผื่อมีการปรับปรุงเมื่อใช้งานจริง ฟีเจอร์ด้านล่างออกแบบให้เปิดใช้เพิ่มได้โดยไม่ต้องรื้อระบบ

### 4.1 รหัสห้อง (class passcode)

ใช้เมื่อ: URL หลุดออกนอกห้อง หรือมีคนนอกเข้ามาอ่าน/โพสต์

- เพิ่มคอลัมน์ `classes.passcode_hash` (nullable) — `null` = ไม่ใช้รหัสห้อง
- Class admin ตั้ง/เปลี่ยน/ปิดรหัสได้เอง
- ผู้ใช้กรอกครั้งเดียวต่ออุปกรณ์ แล้วเก็บเป็น signed cookie (เช่น 30 วัน)
- เลือกขอบเขตได้ 2 แบบ: ต้องมีรหัสก่อน **โพสต์** (อ่านได้ฟรี) หรือก่อน **อ่านและโพสต์**
- เก็บเฉพาะ hash (เช่น PBKDF2/scrypt ผ่าน Web Crypto) ห้ามเก็บ plaintext

### 4.2 PIN รายบุคคล

ใช้เมื่อ: มีการแอบอ้างเลขที่ของเพื่อนจริง

- เพิ่ม `students.pin_hash` (nullable) PIN 4 หลัก ตั้งโดย class admin
- ตรวจ PIN ร่วมกับรหัสนักเรียนเมื่อโพสต์ พร้อมจำกัดจำนวนครั้งที่ลองผิด

### 4.3 อื่นๆ

- Turnstile (CAPTCHA ฟรีของ Cloudflare) หน้าฟอร์มโพสต์
- เก็บประวัติการแก้ไข post (`post_revisions`)
- `noindex` ทั้งเว็บเพื่อไม่ให้ search engine เก็บ
- Backup D1 เป็น SQL เป็นระยะ (cron/GitHub Action) ไปเก็บใน R2

## 5. Deploy

Cloudflare ทั้งหมด:

| ส่วน | บริการ |
|---|---|
| Hosting / API | Workers (หรือ Pages) |
| ฐานข้อมูล | D1 (SQLite) |
| เก็บรูป | R2 |
| Login ของ admin | Cloudflare Access |
| CI/CD | GitHub → Cloudflare (auto deploy) |

โควตา free tier เปลี่ยนได้ ควรตรวจหน้า pricing ของ Cloudflare ก่อนใช้งานจริง

## 6. โครงสร้างข้อมูล

```
classes        id, slug (unique), name, active, created_at
class_admins   class_id, email                      -- unique(class_id, email)
students       id, class_id, student_code, seat_no, active
                                                    -- unique(class_id, student_code)
posts          id, class_id, student_id (null = admin โพสต์), author_email (null = member),
               kind, subject, title, body, due_date, status,
               hidden, created_at, updated_at
attachments    id, post_id, r2_key, size, created_at
```

- Super admin ไม่มีตาราง ใช้ env `SUPER_ADMINS=a@x.com,b@x.com`
- `kind`: `homework` (มี `due_date`, `status` = pending/done) | `lesson` | `note`
- แสดงผล "เลขที่ N" จาก join `posts.student_id → students.seat_no`
- ใช้ soft delete ผ่าน `hidden` เพื่อกู้คืนได้

## 7. เส้นทาง (routes)

```
/                      รายการห้อง (redirect ถ้ามีห้องเดียว)
/c/{slug}              ฟีดวันนี้: งานค้าง + สิ่งที่เรียน + note
/c/{slug}/archive      ย้อนหลัง กรองตามวัน/วิชา
/c/{slug}/new          ฟอร์มโพสต์ (กรอกรหัสนักเรียน)
/admin                 super admin: จัดการห้อง, class admin
/admin/c/{slug}        class admin: นักเรียน, post, ตั้งค่าห้อง
```

`/admin/*` และ API เขียนฝั่ง admin ป้องกันด้วย Cloudflare Access แล้วตรวจ email กับ `SUPER_ADMINS` / `class_admins` ใน Worker อีกชั้น

## 8. ลำดับการพัฒนา

1. Scaffold + เชื่อม Cloudflare + CI
2. Schema/migration + หน้าอ่าน (วันนี้, ย้อนหลัง)
3. หน้า admin (ห้อง, class admin, นักเรียน, post)
4. โพสต์ของ member + อัปโหลดรูป
5. Backup, moderation, ปรับ UI สำหรับมือถือ
