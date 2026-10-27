"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { HelmetScreen } from "@/features/helmet";
import Spinner from "@/components/ui/Spinner";

export default function ProjectViewerPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setSession(data.session);
      setAuthLoading(false);
    }
    loadSession();
  }, [router]);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner label="Авторизация в системе Jude..." />
      </div>
    );
  }

  if (!session || !projectId) {
    return null;
  }

  return <HelmetScreen projectId={projectId} session={session} />;
}
