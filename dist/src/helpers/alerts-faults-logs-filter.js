import { and, eq, isNotNull, ne, notInArray } from "drizzle-orm";
import { alertsFaults } from "../database/schemas/alerts-faults.js";
export function alertsAndFaultsLogsFilter(motorId, starterId, query) {
    if (query.logs === "faults") {
        return and(eq(alertsFaults.starter_id, starterId), eq(alertsFaults.motor_id, motorId), ne(alertsFaults.fault_code, 0), isNotNull(alertsFaults.fault_code), isNotNull(alertsFaults.fault_description), notInArray(alertsFaults.fault_description, ["Unknown Fault", "No Fault"]));
    }
    else {
        return and(eq(alertsFaults.starter_id, starterId), eq(alertsFaults.motor_id, motorId), ne(alertsFaults.alert_code, 0), isNotNull(alertsFaults.alert_code), isNotNull(alertsFaults.alert_description), notInArray(alertsFaults.alert_description, ["Unknown Alert", "No Alert"]));
    }
}
