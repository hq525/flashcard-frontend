import { Link, NavLink, Outlet } from 'react-router';

export function Layout() {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold">
            Flashcards
          </Link>
          <nav>
            <NavLink
              to="/tags"
              className={({ isActive }) =>
                `text-sm font-medium ${
                  isActive
                    ? 'text-indigo-700 underline underline-offset-4'
                    : 'text-gray-600 hover:text-gray-900'
                }`
              }
            >
              Tags
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
