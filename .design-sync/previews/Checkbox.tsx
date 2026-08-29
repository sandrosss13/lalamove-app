import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function AddOnUnchecked() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="packaging-protection" />
      <Label htmlFor="packaging-protection">
        Add packaging protection (+HK$15)
      </Label>
    </div>
  );
}

export function AddOnChecked() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="proof-of-delivery" defaultChecked />
      <Label htmlFor="proof-of-delivery">
        Require photo proof of delivery
      </Label>
    </div>
  );
}

export function TermsWithDescription() {
  return (
    <div className="flex max-w-sm items-start gap-2">
      <Checkbox id="booking-terms" defaultChecked className="mt-0.5" />
      <div className="grid gap-1">
        <Label htmlFor="booking-terms">
          I agree to the terms of carriage
        </Label>
        <p className="text-sm text-muted-foreground">
          Prohibited goods, waiting-time charges and cancellation fees apply as
          described in the delivery agreement.
        </p>
      </div>
    </div>
  );
}

export function UnavailableAddOn() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="cash-on-delivery" disabled />
      <Label htmlFor="cash-on-delivery">
        Cash on delivery (unavailable for this vehicle)
      </Label>
    </div>
  );
}
