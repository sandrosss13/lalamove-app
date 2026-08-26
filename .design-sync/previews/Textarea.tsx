import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Default() {
  return (
    <Textarea
      rows={3}
      placeholder="Anything the driver should know"
      className="max-w-sm"
    />
  );
}

export function DeliveryNotes() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-description">Description (optional)</Label>
      <Textarea
        id="preview-description"
        rows={3}
        placeholder="Anything the driver should know"
      />
      <p className="text-xs text-muted-foreground">
        Access notes, floor number, or how fragile the load is.
      </p>
    </div>
  );
}

export function WithValue() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-instructions">Pickup instructions</Label>
      <Textarea
        id="preview-instructions"
        rows={4}
        defaultValue={
          "Two-seater sofa and four dining chairs, all wrapped.\nLoading bay is behind the building — buzz unit 4B.\nNo lift, third floor: please send a helper."
        }
      />
    </div>
  );
}

export function Invalid() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-cancel-reason">Cancellation reason</Label>
      <Textarea
        id="preview-cancel-reason"
        rows={3}
        aria-invalid
        aria-describedby="preview-cancel-reason-error"
        defaultValue="n/a"
      />
      <p id="preview-cancel-reason-error" className="text-xs text-destructive">
        Tell the client why this order was cancelled — at least 10 characters.
      </p>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor="preview-completed-notes">Driver notes</Label>
      <Textarea
        id="preview-completed-notes"
        rows={3}
        disabled
        defaultValue="Delivered to reception at 14:20, signed for by G. Beridze."
      />
      <p className="text-xs text-muted-foreground">
        Notes are locked once the order is completed.
      </p>
    </div>
  );
}
