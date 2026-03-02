# Interface Documentation (TORA UI)

เอกสารนี้อธิบายการทำงานของหน้า interface ใน `src/App.jsx` ว่าฟังก์ชันและส่วนประกอบหลักทำอะไรบ้าง รวมถึงลำดับการไหลของผู้ใช้ใน UI

## ภาพรวมการทำงาน

หน้าหลักประกอบด้วย 4 view หลักที่สลับด้วย state `currentView`
- `dashboard`: หน้า Landing/เริ่มต้น เลือก Upload หรือ Interactive Chat
- `review`: หน้า Review ข้อความที่ OCR/Extracted ได้ก่อนวิเคราะห์
- `workspace`: หน้า Workspace แสดง Chat และตาราง BOM เปรียบเทียบค่าใช้จ่าย
- `documentation`: หน้าเอกสารภายในระบบ

## State หลักที่ควรรู้

- `currentView`: ควบคุมการสลับหน้า
- `activeTab`: แท็บผู้ให้บริการคลาวด์ที่กำลังดู (aws/azure/huawei)
- `isProcessing`: แสดงสถานะกำลังประมวลผล (spinner/overlay)
- `activeProcessType`: ประเภทงานที่กำลังทำ (`upload` หรือ `chat`)
- `projectTitle`: ชื่อโปรเจกต์ (มาจากชื่อไฟล์หรือ session)
- `extractedText`: ข้อความที่ดึงจากไฟล์ TOR เพื่อให้ผู้ใช้ตรวจสอบ
- `bomData`: ข้อมูล BOM ของแต่ละ provider
- `chatHistory`: ประวัติข้อความในแชท

## ฟังก์ชันหลักใน logic

1. `adjustTextareaHeight()`
   ปรับความสูงของกล่องข้อความในแชทให้พอดีกับเนื้อหา โดยจำกัดสูงสุด 200px เพื่อคุม UX

2. `getTotal(cloud)`
   รวมค่า `total` ของรายการ BOM ใน provider ที่ระบุ แล้วคืนค่าเป็นตัวเลขทศนิยม 2 ตำแหน่ง

3. `getCheapestProvider()`
   เทียบยอดรวมของ AWS/Azure/Huawei แล้วคืน provider ที่ถูกที่สุด เพื่อใช้ติดป้าย `BEST PRICE`

4. `handleFileUpload(event)`
   ทำงานเมื่อผู้ใช้อัปโหลดไฟล์ TOR
   - ตั้ง `projectTitle` จากชื่อไฟล์
   - เปิดสถานะ `isProcessing` และประเภท `upload`
   - จำลองการ OCR/Extract ด้วย mock text (ใช้ `setTimeout`)
   - เมื่อเสร็จ สลับไปหน้า `review` และเติม `extractedText`

5. `handleConfirmAnalysis()`
   กดปุ่ม “Confirm & Analyze” เพื่อส่งข้อมูลไปเซิร์ฟเวอร์
   - เรียก `POST /api/analyze` พร้อม `{ text, model }`
   - ถ้าได้ `bom` จะอัปเดต `bomData`
   - ตั้งข้อความตอบกลับใน `chatHistory`
   - สลับไปหน้า `workspace`

6. `handleStartChat()`
   เริ่มโหมดแชทแบบไม่ใช้ไฟล์
   - ตั้ง `projectTitle` เป็น “Interactive Session”
   - รีเซ็ต `bomData`
   - เติมข้อความเริ่มต้นของผู้ช่วยใน `chatHistory`
   - สลับไปหน้า `workspace`

7. `handleSendMessage()`
   ส่งข้อความแชทจากผู้ใช้
   - เพิ่มข้อความผู้ใช้ใน `chatHistory`
   - เรียก `POST /api/chat` พร้อม `{ messages, bom, model }`
   - อัปเดต `bomData` ถ้ามี
   - เพิ่มข้อความตอบกลับของผู้ช่วย

8. `handleExport()`
   สร้างไฟล์ CSV จาก `bomData` ของแท็บที่กำลังดู
   - สร้าง `Blob` และ trigger download
   - ชื่อไฟล์รูปแบบ `BOM_Export_<PROVIDER>_YYYY-MM-DD.csv`

## ส่วนประกอบ UI (Component Functions)

1. `Navbar`
   แถบบนสุดของหน้า
   - ลิงก์ไปหน้า `documentation`
   - โลโก้/ชื่อระบบ

2. `DocumentationView`
   หน้าเอกสารภายในระบบ
   - เมนูซ้ายสำหรับ section ต่างๆ
   - เนื้อหา Getting Started / Core Features / API / Support

3. `ReviewView`
   หน้า Review ข้อความที่ extract ได้
   - ให้ผู้ใช้แก้ไขข้อความก่อนวิเคราะห์
   - ปุ่ม Confirm & Analyze เพื่อเรียก `handleConfirmAnalysis`

4. `DashboardView`
   หน้า Landing
   - ปุ่ม “Upload TOR” ใช้ `handleFileUpload`
   - ปุ่ม “Interactive Chat” ใช้ `handleStartChat`
   - แสดง overlay loading ตอนประมวลผล

5. `WorkspaceView`
   หน้าทำงานหลักหลังวิเคราะห์
   - แถบซ้ายเป็นแชท (เรียก `handleSendMessage`)
   - แถบขวาเป็นตาราง BOM และสรุปราคา
   - ปุ่ม Export BOM ใช้ `handleExport`
   - ใช้ `getCheapestProvider` เพื่อป้าย “BEST PRICE”

## ลำดับการใช้งาน (User Flow)

1. เริ่มที่ `dashboard`
2. เลือก
   - Upload TOR → ไป `review` → Confirm & Analyze → ไป `workspace`
   - Interactive Chat → ไป `workspace`
3. ใน `workspace`
   - แชทเพื่อปรับ BOM
   - เปลี่ยนแท็บ provider เพื่อดูราคา
   - Export CSV ได้ทุกเวลา

## Endpoint ที่ถูกเรียกจาก UI

- `POST /api/analyze` ใช้สำหรับวิเคราะห์ TOR และสร้าง BOM
- `POST /api/chat` ใช้สำหรับสนทนา/ปรับ BOM แบบ interactive
