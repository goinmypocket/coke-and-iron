import { useEffect, useRef, type ReactNode } from "react";

/** Native modal keeps focus inside the active choice and restores its trigger.
 * It stays under .ci-game in the DOM, including when promoted to the top layer. */
export function Modal({ label, className, onClose, children }: {
  label: string;
  className: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if ((trigger instanceof HTMLElement || trigger instanceof SVGElement) && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className={`ci-dialog ${className}`} aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || !onClose) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      {children}
    </dialog>
  );
}
