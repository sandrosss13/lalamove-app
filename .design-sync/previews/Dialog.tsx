import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Destructive confirmation — the shape used when a customer cancels an order
 * that already has a driver on the way.
 */
export function Default() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="outline">Cancel booking</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking #TB-4821?</DialogTitle>
          <DialogDescription>
            Giorgi K. has already accepted this order and is 6 minutes from the
            pickup point. Cancelling now charges a 15 GEL late-cancellation fee.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep booking</Button>
          </DialogClose>
          <Button variant="destructive">Cancel and pay fee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A form inside a dialog — the saved-address editor from the account screens.
 */
export function AddressForm() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit address
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit pickup address</DialogTitle>
          <DialogDescription>
            Drivers see these details when they arrive, so keep the entrance and
            floor accurate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address-label">Label</Label>
            <Input id="address-label" defaultValue="Warehouse — Didi Dighomi" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address-street">Street address</Label>
            <Input id="address-street" defaultValue="12 Beliashvili St, Tbilisi" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address-notes">Notes for the driver</Label>
            <Textarea
              id="address-notes"
              rows={3}
              defaultValue="Loading bay is behind the building — call on arrival, the gate is kept closed."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Discard</Button>
          </DialogClose>
          <Button>Save address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Informational dialog with a single dismissing action — uses `DialogFooter`'s
 * built-in close button rather than composing one.
 */
export function DriverAssigned() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          View driver
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Driver assigned</DialogTitle>
          <DialogDescription>
            Tbilisi Freight Co. dispatched a driver for your Closed Box Van
            booking. You can track the vehicle from the order page.
          </DialogDescription>
        </DialogHeader>

        <dl className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Driver</dt>
            <dd className="font-medium">Giorgi Kapanadze</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Vehicle</dt>
            <dd className="font-medium">Closed Box Van · AB-123-CD</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pickup window</dt>
            <dd className="font-medium">Today, 14:00 – 15:00</dd>
          </div>
        </dl>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
