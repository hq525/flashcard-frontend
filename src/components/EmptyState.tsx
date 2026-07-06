import type { ReactNode } from 'react';

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-12 text-sm text-gray-500">
      <p>{message}</p>
      {children}
    </div>
  );
}
