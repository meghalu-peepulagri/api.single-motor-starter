import { eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorScheduleLiveData } from "../../database/schemas/motor-schedule-live-data.js";
export async function upsertScheduleLiveData(data) {
    const now = new Date();
    const [row] = await db
        .insert(motorScheduleLiveData)
        .values({
        schedule_id: data.schedule_id,
        motor_id: data.motor_id,
        starter_id: data.starter_id ?? null,
        device_start_time: data.device_start_time ?? null,
        device_end_time: data.device_end_time ?? null,
        device_run_time: data.device_run_time ?? null,
        device_missed_minutes: data.device_missed_minutes ?? 0,
        failure_reason: data.failure_reason ?? null,
        failure_code: data.failure_code ?? null,
        received_at: now,
        updated_at: now,
    })
        .onConflictDoUpdate({
        target: motorScheduleLiveData.schedule_id,
        set: {
            device_start_time: data.device_start_time ?? null,
            device_end_time: data.device_end_time ?? null,
            device_run_time: data.device_run_time ?? null,
            device_missed_minutes: data.device_missed_minutes ?? 0,
            failure_reason: data.failure_reason ?? null,
            failure_code: data.failure_code ?? null,
            updated_at: now,
        },
    })
        .returning();
    return row;
}
export async function findScheduleLiveData(scheduleId) {
    return await db.query.motorScheduleLiveData.findFirst({
        where: eq(motorScheduleLiveData.schedule_id, scheduleId),
    });
}
