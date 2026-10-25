import { useEffect, useRef, type ReactNode } from "react";

export interface ModalDialogProps {
  isOpen: boolean;
  title: string;
  variant?: "danger" | "warning" | "info" | "primary";
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function ModalDialog({
  isOpen,
  title,
  variant = "primary",
  icon,
  confirmText = "ตกลง",
  cancelText = "ยกเลิก",
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            dialog.open = true;
          }
        } else {
          dialog.open = true;
        }
      }
    } else {
      if (dialog.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.open = false;
        }
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  if (!isOpen) return null;

  const confirmClass =
    variant === "danger"
      ? "btn-danger"
      : variant === "warning"
        ? "btn-warning"
        : "btn-primary";

  return (
    <dialog
      ref={dialogRef}
      className={`vault-modal vault-modal-${variant}`}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-header">
        <div className="modal-title-row">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2 id="modal-title" className="modal-title">{title}</h2>
        </div>
        <button
          type="button"
          className="modal-close-btn"
          aria-label="ปิดหน้าต่าง"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="modal-body">{children}</div>

      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {cancelText}
        </button>
        {onConfirm && (
          <button
            type="button"
            className={confirmClass}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        )}
      </div>
    </dialog>
  );
}
