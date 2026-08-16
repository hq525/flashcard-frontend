import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface EntityFormValues {
  name: string;
  description: string;
}

interface EntityFormDialogProps {
  open: boolean;
  title: string;
  initial?: EntityFormValues;
  busy?: boolean;
  onSubmit: (values: EntityFormValues) => void;
  onClose: () => void;
}

export function EntityFormDialog({
  open,
  title,
  initial,
  busy = false,
  onSubmit,
  onClose,
}: EntityFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Depend on primitives: callers rebuild `initial` each render, and an
  // identity dep would reset in-progress edits on any parent re-render
  // (e.g. a toast expiring).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
    }
  }, [open, initial?.name, initial?.description]);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), description: description.trim() });
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          {/* Asterisk via pseudo-element: visual-only, aria-required carries
              the semantics and the accessible name stays "Name". */}
          <span className="after:ml-0.5 after:text-red-500 after:content-['*']">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            aria-required="true"
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
