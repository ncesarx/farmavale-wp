import "dotenv/config";
import { scanSlaAlerts } from "../lib/sla-alerts";

scanSlaAlerts()
  .then((result) => console.log("sla_alert_scan_completed", result))
  .catch((error) => {
    console.error("sla_alert_scan_failed", error instanceof Error ? error.name : "UnknownError");
    process.exitCode = 1;
  });
