import { useEffect, useRef, useState } from 'react';
import { deleteAccount } from '@/api/repositories/account-repository';
import { Advisory, PlateField } from '@/ui/plate';

export interface DeleteAccountModalProps {
  open: boolean;
  userEmail: string;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}

export function DeleteAccountModal({ open, userEmail, onClose, onDeleted }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setConfirmText('');
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deleting, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const confirmed = confirmText.trim().toLowerCase() === userEmail.toLowerCase();

  function attemptClose() {
    if (deleting) return;
    onClose();
  }

  async function handleDelete() {
    if (deleting || !confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not delete account');
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
      style={{ background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div className="plate w-full max-w-md">
        <div className="rule-b px-4 py-3">
          <p className="t-annotation mb-1">Irreversible</p>
          <h2 id="delete-account-modal-title" className="t-plate-title">
            Delete your account
          </h2>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <Advisory>
            This permanently deletes your account and every vehicle, calibration, run,
            recording, and GPS data point associated with it. This cannot be undone.
          </Advisory>

          <PlateField label={`Type ${userEmail} to confirm`} id="delete-confirm-email">
            <input
              ref={firstInputRef}
              id="delete-confirm-email"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              className="field"
            />
          </PlateField>

          {error && (
            <p role="alert" className="t-body m-0 text-[0.8125rem] leading-6" style={{ color: 'var(--color-caution)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              className="ctl flex-1"
              style={
                confirmed && !deleting
                  ? { background: 'var(--color-caution)', borderColor: 'var(--color-caution)', color: '#ffffff' }
                  : undefined
              }
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
            <button
              type="button"
              onClick={attemptClose}
              disabled={deleting}
              className="ctl flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
