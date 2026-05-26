import { and, eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorScheduleOperations } from "../../database/schemas/motor-schedule-operations.js";
export async function insertScheduleOperation(data) {
    const [row] = await db
        .insert(motorScheduleOperations)
        .values({
        schedule_id: data.schedule_id,
        operation: data.operation,
        sent_at: data.sent_at ?? new Date(),
        ack_status: 0,
    })
        .returning();
    return row;
}
export async function updateOperationAck(scheduleId, operation, ackStatus) {
    const latest = await db.query.motorScheduleOperations.findFirst({
        where: and(eq(motorScheduleOperations.schedule_id, scheduleId), eq(motorScheduleOperations.operation, operation)),
        orderBy: (t, { desc }) => [desc(t.created_at)],
        columns: { id: true },
    });
    if (!latest)
        return null;
    const [row] = await db
        .update(motorScheduleOperations)
        .set({ ack_at: new Date(), ack_status: ackStatus })
        .where(eq(motorScheduleOperations.id, latest.id))
        .returning();
    return row;
}
export async function findLatestOperation(scheduleId, operation) {
    const conditions = operation
        ? and(eq(motorScheduleOperations.schedule_id, scheduleId), eq(motorScheduleOperations.operation, operation))
        : eq(motorScheduleOperations.schedule_id, scheduleId);
    return await db.query.motorScheduleOperations.findFirst({
        where: conditions,
        orderBy: (t, { desc }) => [desc(t.created_at)],
    });
}
export async function findOperationsByScheduleId(scheduleId) {
    return await db.query.motorScheduleOperations.findMany({
        where: eq(motorScheduleOperations.schedule_id, scheduleId),
        orderBy: (t, { desc }) => [desc(t.created_at)],
    });
}
