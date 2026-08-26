import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Default() {
  return (
    <Input
      type="text"
      placeholder="e.g. Rustaveli Ave 12, Tbilisi"
      className="max-w-sm"
    />
  );
}

export function RouteFields() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-pickup">Pickup address</Label>
        <Input
          id="preview-pickup"
          type="text"
          placeholder="e.g. Rustaveli Ave 12, Tbilisi"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-dropoff">Dropoff address</Label>
        <Input
          id="preview-dropoff"
          type="text"
          defaultValue="Aghmashenebeli Ave 88, Tbilisi"
        />
      </div>
    </div>
  );
}

export function ProfileFields() {
  return (
    <div className="grid max-w-md gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-company">Company name</Label>
        <Input
          id="preview-company"
          type="text"
          autoComplete="organization"
          defaultValue="Caucasus Freight LLC"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-phone">Cell number</Label>
        <Input
          id="preview-phone"
          type="tel"
          autoComplete="tel"
          defaultValue="+995 555 12 34 56"
        />
      </div>
    </div>
  );
}

export function Invalid() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-vat">VAT ID</Label>
      <Input
        id="preview-vat"
        type="text"
        aria-invalid
        aria-describedby="preview-vat-error"
        defaultValue="4051 02"
      />
      <p id="preview-vat-error" className="text-xs text-destructive">
        Enter a 9-digit VAT ID.
      </p>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-email">Email</Label>
        <Input
          id="preview-email"
          type="email"
          disabled
          defaultValue="dispatch@caucasusfreight.ge"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-order-id">Order reference</Label>
        <Input
          id="preview-order-id"
          type="text"
          disabled
          placeholder="Assigned after booking"
        />
      </div>
    </div>
  );
}
