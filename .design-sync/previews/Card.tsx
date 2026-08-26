import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OrderSummary() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Order #A4821</CardTitle>
        <CardDescription>Van &middot; 2 stops &middot; 14.2 km</CardDescription>
        <CardAction>
          <Badge variant="secondary">In transit</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="grid gap-0.5">
          <span className="text-xs text-muted-foreground">Pickup</span>
          <span>12 Kingsway, Sheung Wan</span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-xs text-muted-foreground">Drop-off</span>
          <span>388 Nathan Rd, Yau Ma Tei</span>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="font-medium">HK$248.00</span>
        <Button>Track order</Button>
      </CardFooter>
    </Card>
  );
}

export function DriverAssigned() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Marcus Tang</CardTitle>
        <CardDescription>
          4.9 &middot; 1,842 deliveries &middot; Toyota HiAce
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Plate</span>
          <span className="font-medium">LM 7734</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Arriving at pickup</span>
          <span className="font-medium">7 min</span>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Message
        </Button>
        <Button className="flex-1">Call driver</Button>
      </CardFooter>
    </Card>
  );
}

export function DeliveriesToday() {
  return (
    <Card className="w-64">
      <CardHeader>
        <CardDescription>Deliveries today</CardDescription>
        <CardTitle className="font-display text-3xl">1,284</CardTitle>
        <CardAction>
          <Badge variant="outline">+12.4%</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        318 completed in the last hour
      </CardContent>
    </Card>
  );
}

export function VehicleOption() {
  return (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Motorcycle</CardTitle>
        <CardDescription>Up to 20 kg &middot; 40 &times; 40 cm</CardDescription>
        <CardAction>
          <span className="font-medium">HK$62</span>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        Fastest option for documents and small parcels across Kowloon.
      </CardContent>
    </Card>
  );
}
