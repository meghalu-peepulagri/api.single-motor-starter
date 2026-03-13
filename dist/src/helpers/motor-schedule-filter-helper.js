import BadRequestException from "../exceptions/bad-request-exception.js";
export function buildMotorScheduleFilters(query) {
    const filters = {};
    if (query.starter_id) {
        const starterId = +query.starter_id;
        if (Number.isNaN(starterId) || starterId <= 0) {
            throw new BadRequestException("Invalid starter id");
        }
        filters.starter_id = starterId;
    }
    if (query.motor_id) {
        const motorId = +query.motor_id;
        if (Number.isNaN(motorId) || motorId <= 0) {
            throw new BadRequestException("Invalid motor id");
        }
        filters.motor_id = motorId;
    }
    if (query.status) {
        filters.status = query.status;
    }
    if (query.type) {
        filters.type = query.type;
    }
    if (query.start_date) {
        filters.start_date = query.start_date;
    }
    if (query.end_date) {
        filters.end_date = query.end_date;
    }
    if (query.repeat !== undefined) {
        const repeat = +query.repeat;
        if (repeat === 0 || repeat === 1) {
            filters.repeat = repeat;
        }
    }
    if (query.enabled !== undefined) {
        filters.enabled = query.enabled === "true";
    }
    if (query.day_of_week !== undefined) {
        const day = +query.day_of_week;
        if (!Number.isNaN(day) && day >= 0 && day <= 6) {
            filters.day_of_week = day;
        }
    }
    if (query.schedule_status) {
        filters.schedule_status = query.schedule_status;
    }
    return filters;
}
