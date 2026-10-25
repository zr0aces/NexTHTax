import { useState } from "react";

interface Props {
  supported: boolean;
  setupPending: boolean;
  onOpen: () => void;
  onCreate: () => void;
  onSubmitName: (name: string) => void;
  onCancelSetup: () => void;
}

/** Entry screen: no login, folder chosen by the user, backup reminder always visible. */
export function WorkspaceScreen({ supported, setupPending, onOpen, onCreate, onSubmitName, onCancelSetup }: Props) {
  const [name, setName] = useState("");
  return (
    <section className="entry card" aria-labelledby="entry-title">
      <div className="entry-header">
        <span className="vault-badge">เก็บบนเครื่อง · ไม่ต้องเข้าสู่ระบบ</span>
        <h1 id="entry-title">NexTHTax เอกสารภาษีบนเครื่อง</h1>
        <p>ไม่ต้องสมัครสมาชิก ข้อมูลและไฟล์แนบเก็บในโฟลเดอร์ที่คุณเลือกบนเครื่องนี้ แอปไม่ส่งข้อมูลส่วนบุคคลไปยังเซิร์ฟเวอร์</p>
      </div>

      <p className="warning">ข้อมูลอยู่ในโฟลเดอร์ของคุณเท่านั้น โปรดสำรองข้อมูล (ZIP) เป็นระยะ และโฟลเดอร์ที่ซิงก์คลาวด์อาจอัปโหลดไฟล์เองตามการตั้งค่าของระบบ</p>

      {!supported && (
        <p role="alert" className="error alert-danger">
          เบราว์เซอร์นี้ไม่รองรับการเลือกโฟลเดอร์ กรุณาใช้ Chrome หรือ Edge บนคอมพิวเตอร์
        </p>
      )}

      {setupPending ? (
        <form
          className="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitName(name);
          }}
        >
          <label>
            ชื่อผู้เสียภาษี (สำหรับแสดงในโฟลเดอร์นี้)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="เช่น นาย สมชาย ใจดี หรือชื่อแฟ้มภาษี"
              required
              autoFocus
            />
          </label>
          <div className="actions">
            <button type="submit" className="btn-primary">สร้างข้อมูลในโฟลเดอร์นี้</button>
            <button type="button" onClick={onCancelSetup}>ยกเลิก</button>
          </div>
        </form>
      ) : (
        <div className="actions">
          <button type="button" className="btn-primary" disabled={!supported} onClick={onOpen}>
            เปิดโฟลเดอร์ข้อมูลที่มีอยู่
          </button>
          <button type="button" disabled={!supported} onClick={onCreate}>
            เลือกโฟลเดอร์ว่างเพื่อเริ่มใหม่
          </button>
        </div>
      )}
    </section>
  );
}
