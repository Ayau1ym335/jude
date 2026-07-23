"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/patients", label: "Пациенты" },
  { href: "/upload", label: "Загрузка скана" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
    });
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {/* Brand */}
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            AFO Platform
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {email && (
            <p className="mb-2 truncate text-xs text-zinc-400 dark:text-zinc-600">
              {email}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
          >
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
