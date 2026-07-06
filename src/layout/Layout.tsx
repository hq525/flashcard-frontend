import { Link, Outlet } from 'react-router';

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold">
            Flashcards
          </Link>
          <nav>
            <Link to="/tags" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Tags
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
