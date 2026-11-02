/**
 * Per-stop "Contact Info" (building, entrance, floor, elevators, comment):
 * what the booking form sends (`stop-contact.ts`), how a draft is read back,
 * and the display rows every surface shares (`stop-info.ts`). Pure — no
 * browser, server or database.
 */

import { expect, test } from "@playwright/test";

import {
  EMPTY_STOP_CONTACT,
  readStopContact,
  stopContactFromOrder,
  stopContactPayload,
} from "@/components/home/stop-contact";
import { stopInfoFromParts, stopInfoRows } from "@/lib/orders/stop-info";

const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? JSON.stringify(values) : ""}`;

const FILLED = {
  ...EMPTY_STOP_CONTACT,
  name: "Nino",
  buildingName: "Tower B",
  entrance: "2",
  comment: "Door code 1234",
};

test.describe("stopContactPayload", () => {
  test("an individual's comment is sent", () => {
    expect(stopContactPayload(FILLED, "INDIVIDUAL")).toEqual({
      name: "Nino",
      phone: "",
      buildingName: "Tower B",
      entrance: "2",
      comment: "Door code 1234",
    });
  });

  test("a business sends no comment (its dialog has none)", () => {
    expect(stopContactPayload(FILLED, "BUSINESS")).toEqual({
      name: "Nino",
      phone: "",
      buildingName: "Tower B",
      entrance: "2",
    });
    expect(
      stopContactPayload({ ...EMPTY_STOP_CONTACT, comment: "x" }, "BUSINESS"),
    ).toBeUndefined();
  });

  test("an empty or missing contact is omitted", () => {
    expect(stopContactPayload(null, "INDIVIDUAL")).toBeUndefined();
    expect(
      stopContactPayload({ ...EMPTY_STOP_CONTACT, name: "  " }, "INDIVIDUAL"),
    ).toBeUndefined();
  });

  test("an edited older order keeps its legacy details", () => {
    expect(
      stopContactPayload(
        { ...EMPTY_STOP_CONTACT, details: "Block 4, flat 12" },
        "INDIVIDUAL",
      ),
    ).toMatchObject({ details: "Block 4, flat 12" });
  });
});

test.describe("reading a contact back", () => {
  test("a draft value is parsed field by field and length-capped", () => {
    expect(
      readStopContact({ name: "Nino", entrance: "x".repeat(60), floor: 3 }),
    ).toEqual({
      ...EMPTY_STOP_CONTACT,
      name: "Nino",
      entrance: "x".repeat(40),
    });
    expect(readStopContact({ name: 5 })).toBeNull();
    expect(readStopContact("Nino")).toBeNull();
    expect(readStopContact(null)).toBeNull();
  });

  test("an order's columns re-open the dialog, or null when all empty", () => {
    expect(
      stopContactFromOrder({
        name: null,
        phone: "555",
        buildingName: "Tower B",
        entrance: null,
        comment: null,
        details: null,
      }),
    ).toEqual({ ...EMPTY_STOP_CONTACT, phone: "555", buildingName: "Tower B" });
    expect(
      stopContactFromOrder({
        name: null,
        phone: null,
        buildingName: null,
        entrance: null,
        comment: null,
        details: null,
      }),
    ).toBeNull();
  });
});

test.describe("stopInfoRows", () => {
  const work = { floor: 3, cargoElevator: true, passengerElevator: true };

  test("lists building, entrance, floor, elevators and comment in order", () => {
    const rows = stopInfoRows(
      stopInfoFromParts(
        {
          buildingName: "Tower B",
          entrance: "2",
          comment: "Door code\n1234",
          details: null,
        },
        work,
      ),
      t,
    );
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ["building", "Tower B"],
      ["entrance", "2"],
      ["floor", 'floorValue{"floor":3}'],
      ["elevator", "passengerElevator, cargoElevator"],
      ["comment", "Door code\n1234"],
    ]);
    expect(rows.find((row) => row.key === "comment")?.multiline).toBe(true);
  });

  test("a bare ground floor at the column default says nothing", () => {
    expect(
      stopInfoRows(
        stopInfoFromParts(
          { buildingName: null, entrance: null, comment: null, details: null },
          { floor: 0, cargoElevator: false, passengerElevator: false },
        ),
        t,
      ),
    ).toEqual([]);
  });

  test("a ground floor is named when the stop has other info", () => {
    const rows = stopInfoRows(
      stopInfoFromParts(
        {
          buildingName: "Tower B",
          entrance: null,
          comment: null,
          details: null,
        },
        { floor: 0, cargoElevator: false, passengerElevator: false },
      ),
      t,
    );
    expect(rows.map((row) => row.value)).toEqual(["Tower B", "groundFloor"]);
  });

  test("an older order shows its legacy details", () => {
    const rows = stopInfoRows(
      stopInfoFromParts(
        {
          buildingName: null,
          entrance: null,
          comment: null,
          details: "Block 4",
        },
        { floor: 0, cargoElevator: false, passengerElevator: false },
      ),
      t,
    );
    expect(rows).toEqual([
      { key: "details", label: "details", value: "Block 4", multiline: true },
    ]);
  });

  test("includeWork: false leaves floor and elevators to the work line", () => {
    const rows = stopInfoRows(
      stopInfoFromParts(
        {
          buildingName: "Tower B",
          entrance: null,
          comment: null,
          details: null,
        },
        work,
      ),
      t,
      { includeWork: false },
    );
    expect(rows.map((row) => row.key)).toEqual(["building"]);
  });
});
