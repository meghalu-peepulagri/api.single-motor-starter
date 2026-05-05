export function parseStatusHistoryFilters(c) {
    const q = c.req.query();
    return {
        starter_id: q.starter_id ? +q.starter_id : undefined,
        motor_id: q.motor_id ? +q.motor_id : undefined,
        from_date: q.from_date || undefined,
        to_date: q.to_date || undefined,
        status: q.status || undefined,
    };
}
