"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-jude-bg px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/jude-logo.png"
            alt="JUDE"
            width={56}
            height={56}
            className="h-14 w-14"
            priority
          />
          <h1 className="font-brand text-3xl tracking-[0.25em] text-jude-accent uppercase">
            JUDE
          </h1>
          <p className="text-sm text-jude-muted">
            Платформа ортезирования для клиники
          </p>
        </div>

        <Card>
          <h2 className="mb-6 text-xl font-semibold text-jude-ink">Вход</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />

            <Input
              label="Пароль"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Button type="submit" variant="accent" size="lg" disabled={loading} className="mt-2 w-full">
              {loading ? "Вход..." : "Войти"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
