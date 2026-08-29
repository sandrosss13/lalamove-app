import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export function OrderStatus() {
  return (
    <Tabs defaultValue="active" className="w-96">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
        <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="grid gap-2">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-foreground/10">
          <div className="grid gap-0.5">
            <span className="font-medium">#A4821 &middot; Van</span>
            <span className="text-xs text-muted-foreground">
              Sheung Wan &rarr; Yau Ma Tei
            </span>
          </div>
          <Badge variant="secondary">In transit</Badge>
        </div>
        <div className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-foreground/10">
          <div className="grid gap-0.5">
            <span className="font-medium">#A4820 &middot; Motorcycle</span>
            <span className="text-xs text-muted-foreground">
              Kwun Tong &rarr; Central
            </span>
          </div>
          <Badge variant="outline">Pending</Badge>
        </div>
      </TabsContent>
      <TabsContent value="completed" className="text-muted-foreground">
        18 orders delivered in the last 30 days.
      </TabsContent>
      <TabsContent value="cancelled" className="text-muted-foreground">
        1 order cancelled before dispatch.
      </TabsContent>
    </Tabs>
  );
}

export function DeliveryPreferences() {
  return (
    <Tabs defaultValue="notifications" className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="text-muted-foreground">
        Name, contact number and default pickup address.
      </TabsContent>
      <TabsContent value="notifications" className="grid gap-3 pt-1">
        <div className="flex items-center gap-2">
          <Checkbox id="notify-driver-assigned" defaultChecked />
          <Label htmlFor="notify-driver-assigned">
            Notify me when a driver accepts
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="notify-arrival" defaultChecked />
          <Label htmlFor="notify-arrival">Alert me on arrival at pickup</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="notify-promotions" />
          <Label htmlFor="notify-promotions">Promotions and fare offers</Label>
        </div>
      </TabsContent>
      <TabsContent value="billing" className="text-muted-foreground">
        Visa &bull;&bull;&bull;&bull; 4417 &middot; billed monthly.
      </TabsContent>
    </Tabs>
  );
}

export function DispatchQueue() {
  return (
    <Tabs orientation="vertical" defaultValue="unassigned" className="w-96">
      <TabsList variant="line" className="w-36">
        <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
        <TabsTrigger value="dispatched">Dispatched</TabsTrigger>
        <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
      </TabsList>
      <TabsContent value="unassigned" className="grid gap-1">
        <span className="font-medium">6 orders awaiting a driver</span>
        <span className="text-muted-foreground">
          Oldest has been queued for 12 minutes.
        </span>
      </TabsContent>
      <TabsContent value="dispatched" className="text-muted-foreground">
        24 orders currently with a driver.
      </TabsContent>
      <TabsContent value="exceptions" className="text-muted-foreground">
        2 orders flagged for a failed drop-off attempt.
      </TabsContent>
    </Tabs>
  );
}
