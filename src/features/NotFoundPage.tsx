import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <p className="mb-6 text-sm text-gray-500">Nothing lives at this address.</p>
      <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">
        Back to categories
      </Link>
    </div>
  );
}
