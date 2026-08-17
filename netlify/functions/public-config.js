export default async () => new Response(JSON.stringify({
  appVersion: process.env.APP_VERSION || "v2",
  gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
}), {
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});
