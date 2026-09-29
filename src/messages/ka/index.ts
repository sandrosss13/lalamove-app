// Barrel for the `ka` catalogs. Static imports (rather than a dynamic
// `import(\`./${namespace}.json\`)`) so the bundler resolves every namespace at
// build time: a dynamic template import creates a context module that pulls
// *every* JSON file in this directory into the bundle regardless of locale,
// which is exactly the opposite of what splitting the catalogs per locale is
// for.
//
// Adding a namespace means adding it here and in the sibling locale's barrel.
// `tests/i18n-catalogs.spec.ts` fails if the two ever drift apart.
import account from "./account.json";
import admin from "./admin.json";
import auth from "./auth.json";
import booking from "./booking.json";
import checkout from "./checkout.json";
import cities from "./cities.json";
import common from "./common.json";
import dashboard from "./dashboard.json";
import driverHub from "./driverHub.json";
import errors from "./errors.json";
import fleet from "./fleet.json";
import home from "./home.json";
import landing from "./landing.json";
import onboarding from "./onboarding.json";
import orders from "./orders.json";
import wallet from "./wallet.json";

const messages = {
  account,
  admin,
  auth,
  booking,
  checkout,
  cities,
  common,
  dashboard,
  driverHub,
  errors,
  fleet,
  home,
  landing,
  onboarding,
  orders,
  wallet,
};

export default messages;
