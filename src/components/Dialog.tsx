"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * 浮層對話框。用原生 <dialog> 拿到焦點鎖定與 Esc 關閉，
 * 手機上貼底變成 bottom sheet。
 */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-0 p-0 bg-transparent backdrop:bg-black/40 open:flex fixed inset-0 h-full max-h-full w-full max-w-full items-end sm:items-center justify-center`}
    >
      <div className={`w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[90vh] overflow-y-auto bg-surface text-primary rounded-t-container sm:rounded-container shadow-overlay border border-border safe-bottom`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" icon="x" iconOnly aria-label="關閉" onClick={onClose} />
        </div>
        <div className="px-5 pb-4 text-sm text-primary">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 pb-5">{footer}</div>}
      </div>
    </dialog>
  );
}
