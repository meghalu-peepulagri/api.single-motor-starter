import { and, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors } from "../../database/schemas/motors.js";
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
            },
        },
    });
}
