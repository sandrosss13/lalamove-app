"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signUp } from "@/lib/auth-client";

type Role = "CLIENT" | "DRIVER";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      role,
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message ?? "Something went wrong. Please try again.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Create an account</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">I am a…</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="role"
              value="CLIENT"
              checked={role === "CLIENT"}
              onChange={() => setRole("CLIENT")}
            />
            Client
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="role"
              value="DRIVER"
              checked={role === "DRIVER"}
              onChange={() => setRole("DRIVER")}
            />
            Driver
          </label>
        </fieldset>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>
    </main>
  );
}
