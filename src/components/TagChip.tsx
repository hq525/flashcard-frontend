export function TagChip({ name }: { name: string }) {
  return (
    <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {name}
    </span>
  );
}
