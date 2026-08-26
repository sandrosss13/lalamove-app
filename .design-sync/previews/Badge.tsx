import { Badge } from "@/components/ui/badge";

/** Small inline glyphs so the previews stay dependency-free. */
function DotIcon() {
  return (
    <svg
      viewBox="0 0 8 8"
      aria-hidden="true"
      data-icon="inline-start"
      fill="currentColor"
    >
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-icon="inline-start"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 17V6h11v11" />
      <path d="M13 9h4l4 4v4" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>In transit</Badge>
      <Badge variant="secondary">Active</Badge>
      <Badge variant="destructive">Cancelled</Badge>
      <Badge variant="outline">Draft</Badge>
      <Badge variant="ghost">Unassigned</Badge>
      <Badge variant="link">View order</Badge>
    </div>
  );
}

export function OrderStatuses() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">ord_8f31a2c4</span>
        <span>Rustaveli Ave 12 → Aghmashenebeli Ave 88</span>
        <Badge variant="secondary">Pending</Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">ord_2b7de910</span>
        <span>Chavchavadze Ave 37 → Vazha-Pshavela 76</span>
        <Badge>In transit</Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">ord_5c04ff81</span>
        <span>Marjanishvili St 5 → Tsereteli Ave 140</span>
        <Badge variant="destructive">Cancelled</Badge>
      </div>
    </div>
  );
}

export function WithIcon() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>
        <DotIcon />
        Driver en route
      </Badge>
      <Badge variant="outline">
        <TruckIcon />
        Van 1.5t
      </Badge>
      <Badge variant="destructive">
        <DotIcon />
        Payment failed
      </Badge>
    </div>
  );
}

export function VehicleCapabilities() {
  return (
    <div className="flex max-w-xs flex-col gap-2">
      <p className="text-sm font-medium">Medium van — up to 1,500 kg</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">3.0 × 1.7 × 1.8 m</Badge>
        <Badge variant="outline">Tail lift</Badge>
        <Badge variant="outline">Helper available</Badge>
        <Badge variant="secondary">Best fit</Badge>
      </div>
    </div>
  );
}
