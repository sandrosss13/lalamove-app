# Georgian translation glossary

The agreed Georgian for this platform's domain vocabulary. Every string written
into `src/messages/ka/**` follows it, so that six people (or six agents)
translating different screens do not each invent their own word for "dispatch".

If a term here turns out to be wrong, fix it **here first**, then in the
catalogs — otherwise the next pass reintroduces it.

**Settled by the product owner, not by a translator's preference** — do not
change these without asking: the four-way Order/Load/Job/Cargo split below;
`Dispatch` = დანიშვნა; `თქვენ` throughout; `დისპეტჩერი` and `მაცივარ-ფურგონი`
kept over their alternatives.

---

## Conventions

| Rule                  | Decision                                                                                                                                                                                                                                   | Why                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Register              | **თქვენ** (formal), never შენ                                                                                                                                                                                                              | A commercial platform addressing businesses and drivers it has no relationship with. Mixing the two reads as careless.     |
| Buttons and actions   | Verbal noun (masdar): **შენახვა**, **გაუქმება**, **დადასტურება** — not imperatives (შეინახე)                                                                                                                                               | Standard Georgian UI register, and it keeps buttons short.                                                                 |
| Headings              | Nominative noun phrases, no trailing colon                                                                                                                                                                                                 | Matches the English source, which does the same.                                                                           |
| Errors                | Full sentence, final period, no blame                                                                                                                                                                                                      | English source says "Order not found." — Georgian keeps the shape.                                                         |
| Brand                 | **zomo** — always lowercase, even at the start of a sentence. In Georgian running text **ზომო**, declined like any noun (ზომოს, ზომოზე, ზომოთი). The standalone name (`shared.brandName`, page titles) stays Latin `zomo` in both locales. | The brand book's spelling. The logo itself is an SVG (`src/components/brand/zomo-logo.tsx`), never the word set in a font. |
| Never translated      | order/vehicle IDs, licence plates, `GEL`/`₾`, email addresses, `API`, `SMS`                                                                                                                                                                | Identifiers and marks, not words.                                                                                          |
| Numbers and dates     | Georgian locale formatting via `useFormatter`, never hand-built strings                                                                                                                                                                    | `Intl` already knows; hand-formatting is how a date ends up American on one screen.                                        |
| Latin inside Georgian | Left as-is, not transliterated                                                                                                                                                                                                             | A vehicle model or plate transliterated becomes unsearchable.                                                              |

---

## The four words that must stay distinct

The English source uses four overlapping terms for what a naive translation
would flatten into one. Keeping them apart is the single most important thing
in this document — the driver hub is unreadable if `Load` and `Job` become the
same word.

| English   | Georgian      | What it actually is                                                                      |
| --------- | ------------- | ---------------------------------------------------------------------------------------- |
| **Order** | **შეკვეთა**   | What the _client_ books and pays for. Client-facing surfaces only.                       |
| **Load**  | **გადაზიდვა** | The same work seen from the _board_: an open haul a fleet can claim. `/dashboard/loads`. |
| **Job**   | **რეისი**     | The same work again, once it is _assigned to a driver_: the run they drive. Driver hub.  |
| **Cargo** | **ტვირთი**    | The goods being moved — a property of the above three, never a substitute for them.      |

One booking is a შეკვეთა to the client, a გადაზიდვა on the board, and a რეისი to
the driver who takes it. That is not redundancy in the English; do not remove it
in the Georgian.

---

## People and organisations

| English                 | Georgian              |
| ----------------------- | --------------------- |
| Client                  | კლიენტი               |
| Driver                  | მძღოლი                |
| Dispatcher              | დისპეტჩერი            |
| Fleet manager           | ავტოპარკის მენეჯერი   |
| Logistics company       | ლოჯისტიკური კომპანია  |
| Seller                  | გამყიდველი            |
| Employee                | თანამშრომელი          |
| System user (admin)     | სისტემის მომხმარებელი |
| Individual              | ფიზიკური პირი         |
| Individual entrepreneur | ინდივიდუალური მეწარმე |
| Business                | იურიდიული პირი        |

## Core objects

| English               | Georgian            |
| --------------------- | ------------------- |
| Fleet                 | ავტოპარკი           |
| Vehicle               | ავტომობილი          |
| Wallet                | საფულე              |
| Booking (the act)     | დაჯავშნა            |
| Quote / estimate      | წინასწარი ფასი      |
| Job sheet             | რეისის ფურცელი      |
| Waybill               | ზედნადები           |
| Application (to join) | განაცხადი           |
| Document              | დოკუმენტი           |
| Pickup                | აღება               |
| Pickup address        | აღების მისამართი    |
| Drop-off              | ჩაბარება            |
| Drop-off address      | ჩაბარების მისამართი |
| Route                 | მარშრუტი            |
| Distance              | მანძილი             |

## Actions

| English                          | Georgian          |
| -------------------------------- | ----------------- |
| Book                             | დაჯავშნა          |
| Claim (a load)                   | აღება             |
| Dispatch (release to the driver) | დანიშვნა          |
| Assign (attach a vehicle/driver) | მიმაგრება         |
| Accept                           | მიღება            |
| Start                            | დაწყება           |
| Complete                         | დასრულება         |
| Cancel                           | გაუქმება          |
| Track                            | თვალყურის დევნება |
| Approve                          | დამტკიცება        |
| Flag                             | მონიშვნა          |
| Suspend                          | შეჩერება          |

### Assign and Dispatch are two steps, not one

The UI has all three of `Assign a vehicle`, `Assign later` and
`Assign and dispatch`, plus the state `Awaiting dispatch` — so attaching a
vehicle and releasing it to the driver are distinct operations that can also
happen together. They therefore need distinct verbs:

- **მიმაგრება** — attach a vehicle or driver to the load. Reversible, invisible
  to the driver.
- **დანიშვნა** — release it. This is what puts the run on a driver's screen.
- `Assign and dispatch` → **მიმაგრება და დანიშვნა**.

`Assign` moved off the more obvious **მიბმა** deliberately: beside დანიშვნა the
two read as near-synonyms, and the one string where both appear together is
exactly where that would confuse a dispatcher.

## Order status (`OrderStatus`)

| English    | Georgian      |
| ---------- | ------------- |
| Initiated  | ინიცირებული   |
| Pending    | მოლოდინში     |
| Claimed    | აღებული       |
| Accepted   | დადასტურებული |
| In transit | გზაში         |
| Completed  | დასრულებული   |
| Cancelled  | გაუქმებული    |

## Application and review status

| English         | Georgian           |
| --------------- | ------------------ |
| Draft           | მონახაზი           |
| Pending         | განხილვაში         |
| Action required | საჭიროებს ქმედებას |
| Approved        | დამტკიცებული       |
| Flagged         | მონიშნული          |
| Verified        | ვერიფიცირებული     |

Note: `Pending` is **მოლოდინში** for an order (waiting to be picked up) and
**განხილვაში** for an application (under review). Same English word, two
genuinely different meanings — the catalogs must not share a key for them.

## Service level (`ServiceLevel`)

| English  | Georgian      |
| -------- | ------------- |
| Priority | პრიორიტეტული  |
| Regular  | სტანდარტული   |
| Pooling  | გაერთიანებული |

## Vehicle class (`VehicleClass`)

| English             | Georgian              |
| ------------------- | --------------------- |
| Small van           | მცირე ფურგონი         |
| Large van           | დიდი ფურგონი          |
| Medium truck        | საშუალო სატვირთო      |
| Heavy freight truck | მძიმე სატვირთო        |
| Trailer truck       | მისაბმელიანი სატვირთო |

## Chassis and loading (`ChassisType`, `LoadingAccessType`)

| English                     | Georgian            |
| --------------------------- | ------------------- |
| Dry box                     | მშრალი ფურგონი      |
| Refrigerated                | მაცივარ-ფურგონი     |
| Open chassis / Open flatbed | ღია პლატფორმა       |
| Rear door                   | უკანა კარი          |
| Side door                   | გვერდითი კარი       |
| Ramp                        | რამპა               |
| Tail lift                   | ჰიდრავლიკური ბაქანი |

## Cargo handling (`CargoHandlingTag`)

| English       | Georgian            |
| ------------- | ------------------- |
| Fragile       | მსხვრევადი          |
| Cold chain    | ცივი ჯაჭვი          |
| Hazmat        | საშიში ტვირთი       |
| Time critical | სასწრაფო            |
| Upright only  | მხოლოდ ვერტიკალურად |
| Heavy item    | მძიმე ნივთი         |

## Money

| English          | Georgian            |
| ---------------- | ------------------- |
| Price            | ფასი                |
| Fare             | ღირებულება          |
| Total            | ჯამი                |
| Payout           | ანაზღაურება         |
| Earnings         | შემოსავალი          |
| Discount         | ფასდაკლება          |
| Promo code       | პრომო კოდი          |
| Payment method   | გადახდის მეთოდი     |
| Cash on delivery | გადახდა ჩაბარებისას |
| Bank transfer    | საბანკო გადარიცხვა  |

Currency is always the lari sign `₾`, placed by the existing `formatGel` helper.
Do not write `ლარი` in a price string — the symbol is what every price column is
aligned to.

## Back office (admin)

| English             | Georgian               |
| ------------------- | ---------------------- |
| Content management  | კონტენტის მართვა       |
| Static pages        | სტატიკური გვერდები     |
| Banners             | ბანერები               |
| Home page           | მთავარი გვერდი         |
| Messaging templates | შეტყობინების შაბლონები |
| Translations        | თარგმანები             |
| User management     | მომხმარებლების მართვა  |
| Sales analytics     | გაყიდვების ანალიტიკა   |
| Finances            | ფინანსები              |
| Payment methods     | გადახდის მეთოდები      |
| Promo campaigns     | სარეკლამო კამპანიები   |
| Segments            | სეგმენტები             |
| Surveys             | გამოკითხვები           |

## Cities

City and region names come from `src/lib/georgian-cities.ts`, which carries the
Georgian spelling per row — თბილისი, ბათუმი, ქუთაისი, აჭარა, იმერეთი and the
rest. They are data, not copy: never translate a city inside a message string,
read it from that module so both languages stay in step with the `GeorgianCity`
enum.

---

## City landing pages (SEO)

`src/messages/{ka,en}/cityLanding.json` holds the copy for the per-city cargo
pages at `/{locale}/gadazidva/{city}`. Each page is written for search, so a few
rules here are fixed rather than stylistic — `tests/city-landing-catalog.spec.ts`
enforces most of them.

**The keyword is fixed.** Every page's `keyword` (its `<h1>`, the start of its
`<title>`, the anchor text other pages link to it with) is exactly
**ტვირთის გადაზიდვა** + the city in the locative, and **Cargo delivery in** +
the city in English:

| City    | Georgian keyword           | English keyword           |
| ------- | -------------------------- | ------------------------- |
| Tbilisi | ტვირთის გადაზიდვა თბილისში | Cargo delivery in Tbilisi |
| Batumi  | ტვირთის გადაზიდვა ბათუმში  | Cargo delivery in Batumi  |
| Kutaisi | ტვირთის გადაზიდვა ქუთაისში | Cargo delivery in Kutaisi |
| Rustavi | ტვირთის გადაზიდვა რუსთავში | Cargo delivery in Rustavi |
| Gori    | ტვირთის გადაზიდვა გორში    | Cargo delivery in Gori    |
| Zugdidi | ტვირთის გადაზიდვა ზუგდიდში | Cargo delivery in Zugdidi |

Not ტვირთის გადატანა, not ტვირთის მიწოდება, not a synonym that "reads
better" — the point is that the pages rank for the phrase people search.

**City names are written inline, on purpose.** This is the one exception to the
"Cities" rule above. Georgian declines city names (თბილისი → თბილისში,
თბილისიდან, თბილისსა და…), and an ICU placeholder can only insert the
nominative, so `ტვირთის გადაზიდვა {city}` would read `… თბილისი` — wrong. Each
city therefore has its own fully written copy. The nominative display name still
comes from `cities.georgianCities.{slug}`.

**Cargo only — never household moving.** zomo carries cargo for businesses and
individuals; it is not a house-moving service, and these pages must not rank for
one. Banned in `cityLanding`:

- Georgian: ბინა / ბინის / ბინებ… as a word (კაბინა is fine), გადასვლა and its
  forms, საცხოვრებელი.
- English: house, apartment, relocation / relocate, removals, home moving /
  moving home, flat moving.

**Must read right before and after launch.** The pages are indexable while the
client app is still behind the coming-soon gate. So: describe the service in the
present tense, no "book now", and no prices, delivery times ("same hour",
"within the day"), counts of drivers/vehicles/orders, or any other number. The
only gated/live differences are the `shared.hero.chipGated`, `shared.cta.*` and
`shared.closing.body{Gated,Live}` strings the page picks between.

**Glossary terms still apply:** თქვენ throughout, ზომო declined in running
text (ზომოს, ზომომ), `zomo` lowercase in titles, Cargo = ტვირთი, Job = რეისი
(driver side), Order = შეკვეთა (client side), Pickup = აღება, Drop-off =
ჩაბარება, and the vehicle class names exactly as in the table above.

**Lengths.** `meta.title` ≤ 53 characters (the layout appends ` | zomo`, keeping
the full title ≤ 60); `meta.description` ≤ 155.
