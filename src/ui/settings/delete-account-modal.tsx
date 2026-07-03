import { useEffect, useRef, useState } from 'react';
import { deleteAccount } from '@/api/repositories/account-repository';

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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div className="bg-zinc-900 border border-red-900/60 rounded-2xl p-5 max-w-md w-full mx-4 space-y-4">
        <h2 id="delete-account-modal-title" className="text-lg font-semibold text-zinc-100">
          Delete your account
        </h2>

        <p className="text-sm text-zinc-400 leading-relaxed">
          This permanently deletes your account and every vehicle, calibration,
          run, recording, and GPS data point associated with it. This cannot be
          undone.
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-confirm-email" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Type <span className="text-zinc-300">{userEmail}</span> to confirm
          </label>
          <input
            ref={firstInputRef}
            id="delete-confirm-email"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={deleting}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors text-sm disabled:opacity-60"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="flex-1 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
          <button
            type="button"
            onClick={attemptClose}
            disabled={deleting}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-3 rounded-xl transition-colors border border-zinc-700 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
