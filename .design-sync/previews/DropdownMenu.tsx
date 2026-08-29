import {
  Ban,
  Bell,
  CircleUser,
  Columns3,
  CreditCard,
  Ellipsis,
  LogOut,
  MapPin,
  Phone,
  Receipt,
  Repeat2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Row actions on an order in the ops console — a destructive item is kept
 * below a separator so it is never the neighbour of a routine action.
 */
export function Default() {
  return (
    <div className="flex min-h-72 items-start justify-center p-6">
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm">
            <Ellipsis />
            <span className="sr-only">Order actions</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52">
          <DropdownMenuLabel>Order #TB-4821</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <MapPin />
              Track driver
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Phone />
              Call Giorgi K.
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Receipt />
              Download invoice
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Repeat2 />
              Book again
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive">
            <Ban />
            Cancel booking
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Account menu in the header: identity block, then account destinations, then
 * sign-out on its own.
 */
export function AccountMenu() {
  return (
    <div className="flex min-h-72 items-start justify-center p-6">
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <CircleUser />
            Nino B.
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <div className="px-1.5 py-1">
            <p className="text-sm font-medium">Nino Beridze</p>
            <p className="text-xs text-muted-foreground">
              nino@tbilisifreight.ge
            </p>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem>
              <CircleUser />
              My account
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCard />
              Payment methods
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Bell />
              Notifications
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Checkbox items driving which columns the orders table shows. Checked state is
 * fixed here so the story renders the same on every pass.
 */
export function ColumnVisibility() {
  return (
    <div className="flex min-h-72 items-start justify-center p-6">
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Columns3 />
            Columns
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-52">
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>Order ID</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Status</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Driver</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            Vehicle type
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            Total weight
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Fare</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
