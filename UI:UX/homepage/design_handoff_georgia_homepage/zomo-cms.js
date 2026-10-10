// Home page CMS store, shared by the public home page and the admin.
// Mirrors HomePageSection rows (per locale) + Banner rows (placement home_hero / home_partner_logo / home_secondary).
(function () {
  var KEY = "zomo-home-cms-v1";
  var MAX_HERO = 6;

  var EN = {
    sections: [
      { key: "hero", type: "hero_carousel", label: "Hero banner carousel", active: true },
      { key: "booking", type: "quote_calculator", label: "Book a Delivery card", active: true, pinned: "hero" },
      { key: "offers", type: "home_secondary", label: "Offers and news", active: true },
      { key: "vehicles", type: "vehicle_types", label: "Vehicles", active: true },
      { key: "how", type: "how_it_works", label: "How it works", active: true },
      { key: "coverage", type: "coverage", label: "Top cities", active: true },
      { key: "partners", type: "partner_marquee", label: "Partner logos", active: true },
      { key: "app", type: "closing_cta", label: "App download", active: true },
      { key: "faq", type: "faq", label: "FAQ", active: true }
    ],
    hero: { intervalSec: 6 },
    banners: [
      { id: "v3-hero", live: true, tag: "Same hour", title: "Anything across Tbilisi, today.", body: "Book a courier in twelve seconds. Matched in under a minute, tracked door to door.", link: "/book" },
      { id: "v3-hero-2", live: true, tag: "Intercity", title: "Tbilisi to Batumi, overnight.", body: "Daily routes between the four largest cities, loaded in the evening.", link: "/book" },
      { id: "v3-hero-3", live: true, tag: "Every size", title: "Vans, trucks and specialised loads.", body: "From a few boxes to ten tonnes of pallets, in one app.", link: "#vehicles" },
      { id: "v3-hero-4", live: true, tag: "Multi-stop", title: "Twenty stops on one booking.", body: "Drag to reorder and the courier gets the optimised sequence.", link: "/book" },
      { id: "v3-hero-5", live: true, tag: "Drivers", title: "6,400 courier partners in Georgia.", body: "Your vehicle, your hours, paid every Wednesday.", link: "/drive" },
      { id: "v3-hero-6", live: true, tag: "Business", title: "Business dispatch, one invoice.", body: "Monthly invoicing in lari and a dashboard for your whole team.", link: "/business" }
    ],
    booking: { heading: "Book a Delivery", cta: "Continue to order" },
    offers: {
      heading: "Offers and news", linkLabel: "All offers",
      items: [
        { id: "v4-offer-1", tag: "New customers", title: "50% off your first three deliveries", body: "Use code MOVE50 on van bookings inside Tbilisi.", cta: "Claim offer", link: "/signup" },
        { id: "v4-offer-2", tag: "Business", title: "60 days of invoiced billing", body: "Open a business account and pay monthly in lari.", cta: "Open an account", link: "/business" },
        { id: "v4-offer-3", tag: "Intercity", title: "Tbilisi ⇄ Batumi every night", body: "Load in the evening, delivered the next morning.", cta: "Book a route", link: "/book" }
      ]
    },
    vehicles: { heading: "Every size, one app.", intro: "Choose a category, then the type that fits the load." },
    how: {
      heading: "How it works",
      items: [
        { title: "Enter two addresses", body: "Pickup and drop-off anywhere in the city. Add up to twenty stops." },
        { title: "Pick a vehicle", body: "Choose the category and type. You see the fare before you confirm." },
        { title: "Get matched", body: "The nearest available courier accepts, usually inside a minute." },
        { title: "Track to the door", body: "Live map, courier phone number and a proof-of-delivery photo." }
      ]
    },
    coverage: {
      heading: "Top Cities", intro: "Same-hour in four cities, scheduled and intercity routes across the rest of Georgia.", linkLabel: "Check your address",
      items: [
        { id: "v4-city-tbilisi", name: "Tbilisi", tag: "Same hour" },
        { id: "v4-city-batumi", name: "Batumi", tag: "Same hour" },
        { id: "v4-city-kutaisi", name: "Kutaisi", tag: "Same hour" },
        { id: "v4-city-rustavi", name: "Rustavi", tag: "Same hour" }
      ]
    },
    partners: {
      eyebrow: "Dispatching every day for",
      items: [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return { id: "v3-partner-" + n, name: "Partner " + n, live: true }; })
    },
    app: { heading: "Book and track from your phone", body: "Live courier location, proof-of-delivery photos and your order history in one app." },
    faq: {
      heading: "Frequently asked questions", intro: "Still stuck? Support is live 24/7.",
      items: [
        { q: "How fast will a courier accept?", a: "Median match time in Tbilisi is 54 seconds. If nobody accepts within five minutes the booking cancels automatically and you are not charged." },
        { q: "Which cities do you cover?", a: "Same-hour delivery in Tbilisi, Batumi, Kutaisi and Rustavi, with intercity routes between all four. Gori, Zugdidi, Telavi, Poti and others are served on scheduled bookings." },
        { q: "What can I not send?", a: "Live animals, hazardous goods, cash and restricted items. The full list is in the terms." },
        { q: "When do I see the price?", a: "As soon as you enter pickup, drop-off and vehicle. Nothing is charged until a courier accepts." },
        { q: "How do I get a business account?", a: "Talk to sales and a specialist replies within one working day. Business accounts get monthly invoicing in lari, seat-based access and a REST API." }
      ]
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaults() { return { EN: clone(EN), KA: clone(EN), updatedAt: null }; }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.EN && d.KA) return d;
      }
    } catch (e) {}
    return defaults();
  }

  function save(data) {
    data.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    listeners.forEach(function (fn) { fn(data); });
  }

  var listeners = [];
  function subscribe(fn) {
    listeners.push(fn);
    var onStorage = function (e) { if (e.key === KEY) fn(load()); };
    window.addEventListener("storage", onStorage);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
      window.removeEventListener("storage", onStorage);
    };
  }

  function reset() { var d = defaults(); save(d); return d; }

  window.ZomoCMS = { KEY: KEY, MAX_HERO: MAX_HERO, load: load, save: save, subscribe: subscribe, reset: reset, defaults: defaults };
})();
