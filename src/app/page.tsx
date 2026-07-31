"use client";

import { useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/auth-client";

/**
 * Selectable package types. Values mirror the `PackageType` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
const PACKAGE_TYPE_OPTIONS = [
  { value: "DOCUMENT", label: "Document" },
  { value: "SMALL_PARCEL", label: "Small parcel" },
  { value: "MEDIUM_PARCEL", label: "Medium parcel" },
  { value: "LARGE_PARCEL", label: "Large parcel" },
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

/** Fields of the created order the form surfaces back to the user. */
type CreatedOrder = {
  id: string;
  distanceKm: number;
  price: number;
  pickupAddress: string;
  dropoffAddress: string;
};

export default function Home() {
  const { data: session, isPending } = useSession();

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [packageType, setPackageType] = useState<string>("SMALL_PARCEL");
  const [vehicleType, setVehicleType] = useState<string>("CAR");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          packageType,
          vehicleType,
          description: description.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        | CreatedOrder
        | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Could not create the order. Please try again.";
        setError(message);
        return;
      }

      setResult(payload as CreatedOrder);
      setPickupAddress("");
      setDropoffAddress("");
      setDescription("");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isPending) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
        <p className="text-center opacity-50">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Book a delivery</h1>
        <p className="opacity-70">
          Please sign in to create a delivery order.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  // Drivers don't book deliveries — they fulfil them. Point them at their
  // available-deliveries view instead of showing the client booking form.
  if (session.user.role === "DRIVER") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">You&apos;re signed in as a driver</h1>
        <p className="opacity-70">
          Clients book deliveries here — drivers fulfil them. Head to your
          deliveries to see what&apos;s available and accept a job.
        </p>
        <div className="flex justify-center">
          <Link
            href="/orders"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            View available deliveries →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Book a delivery</h1>
        <Link href="/orders" className="text-sm font-medium hover:opacity-70">
          My orders →
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Pickup address
          <input
            type="text"
            required
            value={pickupAddress}
            onChange={(event) => setPickupAddress(event.target.value)}
            placeholder="e.g. 10 Downing Street, London"
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Dropoff address
          <input
            type="text"
            required
            value={dropoffAddress}
            onChange={(event) => setDropoffAddress(event.target.value)}
            placeholder="e.g. Buckingham Palace, London"
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Package type
          <select
            value={packageType}
            onChange={(event) => setPackageType(event.target.value)}
            className="rounded border px-3 py-2"
          >
            {PACKAGE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Vehicle type
          <select
            value={vehicleType}
            onChange={(event) => setVehicleType(event.target.value)}
            className="rounded border px-3 py-2"
          >
            {VEHICLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Anything the driver should know"
            className="rounded border px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Getting a quote…" : "Get quote & book"}
        </button>
      </form>

      {result ? (
        <div className="rounded border border-green-600 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Order created!</p>
          <p className="mt-1 text-green-900">
            Distance: {result.distanceKm.toFixed(2)} km · Total: $
            {result.price.toFixed(2)}
          </p>
          <Link
            href="/orders"
            className="mt-2 inline-block font-medium underline hover:opacity-70"
          >
            View your orders
          </Link>
        </div>
      ) : null}
    </main>
  );
}
