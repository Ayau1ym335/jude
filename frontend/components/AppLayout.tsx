"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import Button from "@/components/ui/Button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Главная" },
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

  const isViewer = pathname.includes("/viewer");

  return (
    <div className="flex min-h-screen flex-col bg-jude-bg">
      <header className="sticky top-0 z-50 border-b border-jude-border bg-jude-surface/95 shadow-jude-sm backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/jude-logo.png"
              alt="JUDE"
              width={32}
              height={32}
              className="h-8 w-8"
              priority
            />
            <span className="font-brand text-lg tracking-[0.2em] text-jude-accent uppercase">
              JUDE
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-jude-accent-soft text-jude-accent"
                      : "text-jude-muted hover:bg-jude-primary-soft hover:text-jude-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {email ? (
              <span className="hidden max-w-[200px] truncate text-xs text-jude-subtle xl:block">
                {email}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col",
          isViewer ? "max-w-none" : "max-w-[1600px] px-6 py-8",
        )}
      >
        {children}
      </main>
    </div>
  );
}
