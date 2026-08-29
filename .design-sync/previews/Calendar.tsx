import { Calendar } from "@/components/ui/calendar";

/**
 * Every date below is constructed from fixed year/month/day arguments rather
 * than `new Date()` so the rendered month, the "today" highlight and the
 * selection land on the same cells on every capture.
 */

export function PickupDate() {
  return (
    <Calendar
      mode="single"
      defaultMonth={new Date(2026, 2, 1)}
      selected={new Date(2026, 2, 12)}
      today={new Date(2026, 2, 9)}
      // Same-day pickup is the earliest a courier can be dispatched, so the
      // past is unbookable.
      disabled={{ before: new Date(2026, 2, 9) }}
    />
  );
}

export function DeliveryWindow() {
  return (
    <Calendar
      mode="range"
      numberOfMonths={2}
      defaultMonth={new Date(2026, 2, 1)}
      selected={{ from: new Date(2026, 2, 10), to: new Date(2026, 2, 16) }}
      today={new Date(2026, 2, 9)}
    />
  );
}

export function ScheduleWithMonthDropdown() {
  return (
    <Calendar
      mode="single"
      captionLayout="dropdown"
      defaultMonth={new Date(2026, 5, 1)}
      selected={new Date(2026, 5, 24)}
      today={new Date(2026, 5, 18)}
      startMonth={new Date(2026, 0, 1)}
      endMonth={new Date(2026, 11, 31)}
    />
  );
}
