import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Vehicle picker from the booking flow, grouped by duty class — the split that
 * decides which cargo categories a vehicle may legally carry.
 */
export function Default() {
  return (
    <div className="flex min-h-80 items-start justify-center p-6">
      <div className="flex w-64 flex-col gap-1.5">
        <Label htmlFor="booking-vehicle">Vehicle type</Label>
        <Select defaultOpen defaultValue="closed-box-van">
          <SelectTrigger id="booking-vehicle" className="w-full">
            <SelectValue placeholder="Choose a vehicle" />
          </SelectTrigger>

          <SelectContent>
            <SelectGroup>
              <SelectLabel>Medium duty</SelectLabel>
              <SelectItem value="cargo-van">Cargo Van</SelectItem>
              <SelectItem value="closed-box-van">Closed Box Van</SelectItem>
              <SelectItem value="refrigerated-van">Refrigerated Van</SelectItem>
            </SelectGroup>

            <SelectSeparator />

            <SelectGroup>
              <SelectLabel>Heavy duty</SelectLabel>
              <SelectItem value="box-truck">Box Truck</SelectItem>
              <SelectItem value="flatbed-truck">Flatbed Truck</SelectItem>
              <SelectItem value="curtainsider-truck">
                Curtainsider Truck
              </SelectItem>
              <SelectItem value="large-freight-truck">
                Large Freight Truck
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * Compact status filter above the orders table, including a disabled option for
 * a state the current operator is not permitted to filter on.
 */
export function OrderStatusFilter() {
  return (
    <div className="flex min-h-80 items-start justify-center p-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="orders-status">Status</Label>
        <Select defaultOpen defaultValue="in-transit">
          <SelectTrigger id="orders-status" size="sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>

          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="claimed">Claimed</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="in-transit">In transit</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled" disabled>
                Cancelled
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
