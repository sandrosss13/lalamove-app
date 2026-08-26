import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RecentOrders() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="text-muted-foreground">A4821</TableCell>
          <TableCell>Harbour Foods Ltd</TableCell>
          <TableCell className="text-muted-foreground">
            Sheung Wan &rarr; Yau Ma Tei
          </TableCell>
          <TableCell>Marcus Tang</TableCell>
          <TableCell>
            <Badge variant="secondary">In transit</Badge>
          </TableCell>
          <TableCell className="text-right">HK$248</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">A4820</TableCell>
          <TableCell>Kwun Tong Print Co</TableCell>
          <TableCell className="text-muted-foreground">
            Kwun Tong &rarr; Central
          </TableCell>
          <TableCell className="text-muted-foreground">Unassigned</TableCell>
          <TableCell>
            <Badge variant="outline">Pending</Badge>
          </TableCell>
          <TableCell className="text-right">HK$96</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">A4818</TableCell>
          <TableCell>Nadia Cheung</TableCell>
          <TableCell className="text-muted-foreground">
            Tsim Sha Tsui &rarr; Sha Tin
          </TableCell>
          <TableCell>Priya Ramesh</TableCell>
          <TableCell>
            <Badge>Completed</Badge>
          </TableCell>
          <TableCell className="text-right">HK$412</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">A4815</TableCell>
          <TableCell>Lantau Supply Group</TableCell>
          <TableCell className="text-muted-foreground">
            Tung Chung &rarr; Kowloon Bay
          </TableCell>
          <TableCell>Wei Lam</TableCell>
          <TableCell>
            <Badge>Completed</Badge>
          </TableCell>
          <TableCell className="text-right">HK$1,180</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">A4811</TableCell>
          <TableCell>Sai Ying Pun Pharmacy</TableCell>
          <TableCell className="text-muted-foreground">
            Sai Ying Pun &rarr; Wan Chai
          </TableCell>
          <TableCell className="text-muted-foreground">Unassigned</TableCell>
          <TableCell>
            <Badge variant="destructive">Cancelled</Badge>
          </TableCell>
          <TableCell className="text-right">HK$0</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={5}>Billed this week</TableCell>
          <TableCell className="text-right">HK$1,936</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function FleetUtilisation() {
  return (
    <Table>
      <TableCaption>
        Fleet utilisation for the week of 9 March 2026, Hong Kong region.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle class</TableHead>
          <TableHead className="text-right">Active drivers</TableHead>
          <TableHead className="text-right">Deliveries</TableHead>
          <TableHead className="text-right">Avg. pickup wait</TableHead>
          <TableHead className="text-right">Utilisation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Motorcycle</TableCell>
          <TableCell className="text-right">312</TableCell>
          <TableCell className="text-right">8,420</TableCell>
          <TableCell className="text-right">4 min</TableCell>
          <TableCell className="text-right">86%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Car</TableCell>
          <TableCell className="text-right">148</TableCell>
          <TableCell className="text-right">2,915</TableCell>
          <TableCell className="text-right">7 min</TableCell>
          <TableCell className="text-right">71%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Van</TableCell>
          <TableCell className="text-right">96</TableCell>
          <TableCell className="text-right">1,204</TableCell>
          <TableCell className="text-right">11 min</TableCell>
          <TableCell className="text-right">64%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">5.5t truck</TableCell>
          <TableCell className="text-right">24</TableCell>
          <TableCell className="text-right">186</TableCell>
          <TableCell className="text-right">18 min</TableCell>
          <TableCell className="text-right">42%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
