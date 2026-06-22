import { useI18n } from "../i18n/context.js";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/** Centered modal confirmation. Render conditionally from a parent. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 20,
          minWidth: 320,
          maxWidth: 480,
          width: "90%",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p style={{ color: "var(--text-muted)", whiteSpace: "pre-line" }}>{message}</p>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            className={danger ? "btn-danger" : ""}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
