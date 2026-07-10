'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type Role } from '@/lib/auth';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from './GlobalSearch';
import { HelpButton } from './HelpButton';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  children: React.ReactNode;
  nav: NavItem[];
  allowedRoles: Role[];
}

export function DashboardShell({ children, nav, allowedRoles }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, hydrate, logout } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!allowedRoles.includes(user.role)) router.replace('/');
  }, [user, loading, router, allowedRoles]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-500 text-sm">
        Loading…
      </div>
    );
  }

  const initials = (user.fullName || user.email).slice(0, 2).toUpperCase();

  // Fire-and-forget sign-out — redirect immediately, run API call in background
  function handleSignOut() {
    router.push('/login');
    logout().catch(() => {});
  }

  return (
    <div className="min-h-screen bg-stone-100 p-3">
      {/* Top bar */}
      <header className="bg-white border border-stone-200 rounded-2xl px-5 py-2.5 flex items-center gap-4 mb-3">
        <Link href="/" className="flex items-center gap-2 min-w-[220px]">
          {/* "primaresearch" wordmark styled to match brand */}
          <span className="text-[15px] font-medium tracking-tight">
            <span className="text-brand-500">prima</span>
            <span className="text-stone-900">research</span>
          </span>
          <span className="text-stone-300 text-sm">·</span>
          <span className="text-[13px] text-stone-500">Data Portal</span>
        </Link>

        <GlobalSearch />

        <div className="flex items-center gap-1">
          <HelpButton />
          <Link
            href="/account"
            className="w-9 h-9 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-medium flex items-center justify-center transition ml-1"
            title="Account settings"
          >
            {initials}
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-[220px_1fr] gap-3">
        {/* Sidebar */}
        <aside className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-col h-[calc(100vh-92px)] sticky top-3">
          <div className="px-3 py-2 text-[11px] font-medium text-stone-400 uppercase tracking-wider">
            Menu
          </div>

          <nav className="space-y-0.5 flex-1">
            {nav.map((item) => {
              const active =
  pathname === item.href ||
  (item.href !== '/admin' && item.href !== '/portal' && pathname.startsWith(item.href + '/'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition',
                    active
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900',
                  )}
                >
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 mt-3 border-t border-stone-200">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-stone-900 truncate">
                  {user.fullName}
                </div>
                <div className="text-[11px] text-stone-500 truncate">
                  {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-[12px] text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
