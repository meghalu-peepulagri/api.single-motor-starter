import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors } from "../../database/schemas/motors.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
import { updateRecordByIdWithTrx } from "./base-db-services.js";
import { locations } from "../../database/schemas/locations.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
export async function getMotorWithStarterDetails(motorId) {
    if (!motorId)
        return null;
    return await db.query.motors.findFirst({
        where: and(eq(motors.id, motorId), ne(motors.status, 'ARCHIVED')),
        columns: {
            id: true,
            name: true,
            hp: true,
            state: true,
            mode: true,
            created_by: true,
            alias_name: true,
        },
        with: {
            location: {
                where: ne(motors.status, 'ARCHIVED'),
                columns: {
                    id: true,
                    name: true,
                },
            },
            starter: {
                where: ne(motors.status, 'ARCHIVED'),
                columns: {
                    id: true,
                    name: true,
                    status: true,
                    mac_address: true,
                    signal_quality: true,
                    power: true,
                    network_type: true,
                },
                with: {
                    starterParameters: {
                        where: isNotNull(starterBoxParameters.time_stamp),
                        orderBy: desc(starterBoxParameters.time_stamp),
                        limit: 1,
                        columns: {
                            id: true,
                            line_voltage_r: true,
                            line_voltage_y: true,
                            line_voltage_b: true,
                            current_r: true,
                            current_y: true,
                            current_b: true,
                            time_stamp: true,
                            fault: true,
                            fault_description: true,
                        },
                    },
                },
            },
        },
    });
}
