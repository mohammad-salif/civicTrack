import React from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm Action',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  children,
  disabled = false,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#202938]/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-md border border-[#E5E7EB] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
          <h3 id="confirm-dialog-title" className="text-sm font-semibold text-[#202938]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-[#687385] hover:bg-[#F5F6F8] hover:text-[#202938]"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm leading-relaxed text-[#687385]">{description}</p>
          {children}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-xs font-medium text-[#202938] hover:bg-[#F5F6F8] whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className={`rounded px-3.5 py-1.5 text-xs font-medium text-white whitespace-nowrap disabled:opacity-50 ${
              confirmVariant === 'danger'
                ? 'bg-[#D94B4B] hover:bg-[#C03E3E]'
                : 'bg-[#2457C5] hover:bg-[#1D46A3]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
