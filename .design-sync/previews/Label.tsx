import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Default() {
  return <Label htmlFor="preview-weight">Total weight</Label>;
}

export function WithInput() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-driver">Driver name</Label>
      <Input id="preview-driver" type="text" defaultValue="Giorgi Beridze" />
    </div>
  );
}

export function WithHint() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-contact" className="justify-between">
        <span>Pickup contact</span>
        <span className="text-xs font-normal text-muted-foreground">
          Optional
        </span>
      </Label>
      <Input
        id="preview-contact"
        type="tel"
        placeholder="Who the driver calls on arrival"
      />
    </div>
  );
}

export function WithCheckbox() {
  return (
    <div className="flex max-w-sm items-start gap-3">
      <Checkbox id="preview-helper" defaultChecked className="mt-0.5" />
      <Label
        htmlFor="preview-helper"
        className="flex flex-col items-start gap-1 leading-snug"
      >
        <span>Request a helper / mover</span>
        <span className="text-xs font-normal text-muted-foreground">
          An extra pair of hands for loading and unloading, charged as a flat
          fee on top of the fare.
        </span>
      </Label>
    </div>
  );
}

export function DisabledField() {
  // Column-reverse so the label sits above the field visually while following
  // it in the DOM — the order the `peer-disabled:` styling needs.
  return (
    <div className="flex max-w-sm flex-col-reverse gap-1.5">
      <Label htmlFor="preview-vehicle">Assigned vehicle</Label>
      <Input
        id="preview-vehicle"
        type="text"
        disabled
        defaultValue="Medium van — 1,500 kg"
        className="peer"
      />
    </div>
  );
}
