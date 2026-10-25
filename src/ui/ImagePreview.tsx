import { useEffect, useMemo, useState } from "react";
import { readImageHeader } from "../domain/imageHeaders";

/** Shows a JPEG/PNG only after the bounded header check passes. Object URL is revoked on cleanup. */
export function ImagePreview({ bytes, mediaType }: { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" }) {
  const header = useMemo(() => readImageHeader(bytes, mediaType), [bytes, mediaType]);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!header.ok) return;
    const objectUrl = URL.createObjectURL(new Blob([bytes.slice()], { type: mediaType }));
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [bytes, mediaType, header]);

  if (!header.ok) return <p role="status" className="preview">ไม่มีตัวอย่างสำหรับรูปนี้ (ขนาดหรือหัวไฟล์เกินกำหนด) ไฟล์ยังเก็บไว้ได้</p>;
  if (failed || !url) return <p role="status" className="preview">ไม่สามารถแสดงตัวอย่างรูปนี้ได้</p>;
  return (
    <div className="preview">
      <img src={url} alt="ตัวอย่างไฟล์แนบ" onError={() => setFailed(true)} />
    </div>
  );
}
