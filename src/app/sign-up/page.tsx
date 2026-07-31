"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signUp } from "@/lib/auth-client";

type Role = "CLIENT" | "DRIVER";

/**
 * Selectable driver cities. Values mirror the `GeorgianCity` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
const GEORGIAN_CITY_OPTIONS = [
  { value: "TBILISI", label: "Tbilisi" },
  { value: "BATUMI", label: "Batumi" },
  { value: "KUTAISI", label: "Kutaisi" },
  { value: "RUSTAVI", label: "Rustavi" },
  { value: "ZUGDIDI", label: "Zugdidi" },
  { value: "GORI", label: "Gori" },
  { value: "POTI", label: "Poti" },
  { value: "SAMTREDIA", label: "Samtredia" },
  { value: "KHASHURI", label: "Khashuri" },
  { value: "SENAKI", label: "Senaki" },
  { value: "ZESTAPONI", label: "Zestaponi" },
  { value: "MARNEULI", label: "Marneuli" },
  { value: "TELAVI", label: "Telavi" },
  { value: "AKHALTSIKHE", label: "Akhaltsikhe" },
  { value: "OZURGETI", label: "Ozurgeti" },
  { value: "KOBULETI", label: "Kobuleti" },
  { value: "CHIATURA", label: "Chiatura" },
  { value: "TSKALTUBO", label: "Tskaltubo" },
  { value: "SAGAREJO", label: "Sagarejo" },
  { value: "GARDABANI", label: "Gardabani" },
  { value: "BOLNISI", label: "Bolnisi" },
  { value: "AKHALKALAKI", label: "Akhalkalaki" },
  { value: "BORJOMI", label: "Borjomi" },
  { value: "KASPI", label: "Kaspi" },
  { value: "MTSKHETA", label: "Mtskheta" },
] as const;

/**
 * Selectable vehicle types. Values mirror the `VehicleType` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
const VEHICLE_TYPE_OPTIONS = [
  { value: "BIKE", label: "Bike" },
  { value: "CAR", label: "Car" },
  { value: "VAN", label: "Van" },
] as const;

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");
  const [city, setCity] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>("");
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

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message ?? "Something went wrong. Please try again.");
      return;
    }

    // Better Auth has created the account and a session by this point. Drivers
    // must additionally create a DriverProfile with their city and vehicle. If
    // that step fails we surface the error and stay put — the account exists,
    // so we don't navigate away as if everything succeeded.
    if (role === "DRIVER") {
      const response = await fetch("/api/driver-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, vehicleType }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(
          payload?.error ??
            "Could not save your driver details. Please try again.",
        );
        setLoading(false);
        return;
      }
    }

    setLoading(false);
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

        {role === "DRIVER" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              City
              <select
                required
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="rounded border px-3 py-2"
              >
                <option value="" disabled>
                  Select a city…
                </option>
                {GEORGIAN_CITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Vehicle type
              <select
                required
                value={vehicleType}
                onChange={(event) => setVehicleType(event.target.value)}
                className="rounded border px-3 py-2"
              >
                <option value="" disabled>
                  Select a vehicle type…
                </option>
                {VEHICLE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

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
