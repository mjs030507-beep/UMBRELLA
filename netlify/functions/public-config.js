import { json } from "./_shared.js";

export default async () => json({
  appVersion: process.env.APP_VERSION || "v2",
  gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
});
