"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      setUser(data.session.user);
      setLoading(false);
    }

    loadSession();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Signed in as{" "}
          <span className="font-medium text-zinc-950 dark:text-zinc-50">
            {user?.email ?? "unknown user"}
          </span>
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/patients")}
            className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Пациенты
          </button>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Upload Scan
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Logout
          </button>
        </div>
      </main>
    </div>
  );
}
