import { CalendarDays, CircleQuestionMark } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The analytics date-range trigger: quick ranges above a custom range summary,
 * with apply/cancel actions in the footer.
 */
export function Default() {
  return (
    <div className="flex min-h-72 items-start justify-center p-6">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            <CalendarDays />
            Aug 1 – Aug 26
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end">
          <PopoverHeader>
            <PopoverTitle>Custom range</PopoverTitle>
            <PopoverDescription>Aug 1 – Aug 26, 2026</PopoverDescription>
          </PopoverHeader>

          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="sm" className="justify-start">
              Last 7 days
            </Button>
            <Button variant="ghost" size="sm" className="justify-start">
              Week to date
            </Button>
            <Button variant="ghost" size="sm" className="justify-start">
              Month to date
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm">
              Cancel
            </Button>
            <Button size="sm">Apply range</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Help popover hanging off an icon button — explains how a quoted fare was
 * built up, which is the most common "why is this number what it is" question.
 */
export function FareBreakdown() {
  return (
    <div className="flex min-h-72 items-start justify-center p-6">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm">
            <CircleQuestionMark />
            <span className="sr-only">How this fare is calculated</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>How this fare is calculated</PopoverTitle>
            <PopoverDescription>
              Quoted before pickup and only re-priced if the route changes.
            </PopoverDescription>
          </PopoverHeader>

          <dl className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Base fare (Cargo Van)</dt>
              <dd>25.00 GEL</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Distance · 11.4 km</dt>
              <dd>18.20 GEL</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Loading help · 30 min</dt>
              <dd>12.00 GEL</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-medium">
              <dt>Total</dt>
              <dd>55.20 GEL</dd>
            </div>
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  );
}
