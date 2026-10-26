import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal built on the native <dialog>; mount it to open, unmount to close. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby={titleId}>
      <h2 id={titleId} className="panel__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
