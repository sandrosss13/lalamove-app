import { Button } from "@/components/ui/button";

/** Small inline glyphs so the previews stay dependency-free. */
function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-icon="inline-end"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6v14h12V6" />
    </svg>
  );
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Book delivery</Button>
      <Button variant="secondary">Save draft</Button>
      <Button variant="outline">Edit route</Button>
      <Button variant="ghost">Back to orders</Button>
      <Button variant="destructive">Cancel order</Button>
      <Button variant="link">View fare breakdown</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">Assign</Button>
      <Button size="sm">Reassign driver</Button>
      <Button size="default">Calculate</Button>
      <Button size="lg">
        Book delivery
        <ArrowRightIcon />
      </Button>
    </div>
  );
}

export function IconButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon-xs" variant="ghost" aria-label="Add stop">
        <PlusIcon />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="Add stop">
        <PlusIcon />
      </Button>
      <Button size="icon" variant="outline" aria-label="Add stop">
        <PlusIcon />
      </Button>
      <Button size="icon-lg" variant="destructive" aria-label="Remove stop">
        <TrashIcon />
      </Button>
    </div>
  );
}

export function BookingBar() {
  return (
    <div className="flex w-full max-w-md items-end justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Estimated total
        </p>
        <p className="mt-1 text-3xl leading-none font-semibold">$48.60</p>
      </div>
      <Button size="lg">
        Book delivery
        <ArrowRightIcon />
      </Button>
    </div>
  );
}

export function DisabledAndPending() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled>Calculating…</Button>
      <Button variant="outline" disabled>
        Fill in both addresses
      </Button>
      <Button variant="destructive" disabled>
        Cancel order
      </Button>
    </div>
  );
}
