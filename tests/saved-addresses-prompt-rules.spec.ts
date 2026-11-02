/**
 * The after-booking "save these addresses?" prompt's decisions, pinned without
 * a server or a database: which ends of a booking are still worth offering,
 * how addresses are compared, and what a contact summary says.
 *
 * `src/components/saved-addresses/saved-address-format.ts` is the single
 * statement of each.
 */

import { expect, test } from "@playwright/test";

import {
  addressKey,
  contactSummaryParts,
  unsavedEnds,
  type SavedAddressContact,
} from "@/components/saved-addresses/saved-address-format";

const EMPTY_CONTACT: SavedAddressContact = {
  contactName: "",
  contactPhone: "",
  buildingName: "",
  entrance: "",
  floor: 0,
  passengerElevator: false,
  cargoElevator: false,
  comment: "",
};

/** Echoes the key and its values, so assertions read the summary's shape. */
const echo = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${Object.values(values).join(",")}` : key;

function end(name: "pickup" | "dropoff", address: string) {
  return { end: name, input: { address } };
}

test("addresses compare case- and whitespace-insensitively", () => {
  expect(addressKey("  Rustaveli  Ave 12,\tTbilisi ")).toBe(
    addressKey("rustaveli ave 12, tbilisi"),
  );
  expect(addressKey("Rustaveli Ave 12")).not.toBe(
    addressKey("Rustaveli Ave 14"),
  );
});

test("ends already saved are not offered again", () => {
  const ends = [end("pickup", "Rustaveli Ave 12"), end("dropoff", "Pekini 5")];

  expect(unsavedEnds(ends, ["  RUSTAVELI ave 12 "])).toEqual([ends[1]]);
  expect(unsavedEnds(ends, ["Rustaveli Ave 12", "pekini 5"])).toEqual([]);
  expect(unsavedEnds(ends, [])).toEqual(ends);
});

test("a round trip to the same place is offered once, and a blank never", () => {
  const ends = [end("pickup", "Pekini 5"), end("dropoff", " pekini  5")];
  expect(unsavedEnds(ends, [])).toEqual([ends[0]]);
  expect(unsavedEnds([end("pickup", "   ")], [])).toEqual([]);
});

test("the contact summary leaves out what was never filled in", () => {
  expect(contactSummaryParts(EMPTY_CONTACT, echo)).toEqual([]);

  expect(
    contactSummaryParts(
      {
        contactName: " Nino ",
        contactPhone: "555 12 34 56",
        buildingName: "Block B",
        entrance: "2",
        floor: 4,
        passengerElevator: true,
        cargoElevator: false,
        comment: "Door code 1234",
      },
      echo,
    ),
  ).toEqual([
    "Nino",
    "555 12 34 56",
    "Block B",
    "entrance:2",
    "floor:4",
    "passengerElevator",
  ]);
});
