import { starterDispatch } from "../database/schemas/starter-dispatch.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { STARTER_BOX_NOT_FOUND, STARTER_DISPATCH_NOT_FOUND } from "../constants/app-constants.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { getSingleRecordByMultipleColumnValues } from "../services/db/base-db-services.js";
function isDateWithin30Days(dateStr) {
    if (!dateStr)
        return false;
    const [day, month, year] = dateStr.split("-").map(Number);
    const expiryDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    return expiryDate >= today && expiryDate <= thirtyDaysLater;
}
export function formatExpiringRecords(records, type) {
    return records.map((record) => {
        const base = {
            id: record.id,
            starter_id: record.starter_id,
            customer_name: record.customer_name,
            contact_number: record.contact_number,
            address: record.address,
            location: record.location,
        };
        const simExpiring = isDateWithin30Days(record.sim_recharge_end_date);
        const warrantyExpiring = isDateWithin30Days(record.warranty_end_date);
        if (type === "recharge") {
            return {
                ...base,
                recharge: { sim_no: record.sim_no, sim_recharge_end_date: record.sim_recharge_end_date },
            };
        }
        if (type === "warranty") {
            return {
                ...base,
                warranty: { warranty_end_date: record.warranty_end_date },
            };
        }
        return {
            ...base,
            recharge: simExpiring ? { sim_no: record.sim_no, sim_recharge_end_date: record.sim_recharge_end_date } : null,
            warranty: warrantyExpiring ? { warranty_end_date: record.warranty_end_date } : null,
        };
    });
}
/**
 * Add 12 months to a date string in DD-MM-YYYY format.
 * e.g., "22-02-2026" → "21-02-2027" (one year validity, day - 1)
 */
export function addOneYearValidity(dateStr) {
    const [day, month, year] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setFullYear(date.getFullYear() + 1);
    date.setDate(date.getDate() - 1);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}
export function preparedUpdatePayloadOfDispatchData(validDispatchReq, updatedBy, starterId) {
    const invoiceDate = validDispatchReq.invoice_date;
    const simRechargeEndDate = addOneYearValidity(invoiceDate);
    const warrantyEndDate = addOneYearValidity(invoiceDate);
    const dispatchUpdate = {
        ...(starterId !== undefined ? { starter_id: starterId } : {}),
        // Device details
        part_no: validDispatchReq.part_no,
        box_serial_no: validDispatchReq.box_serial_no,
        pcb_number: validDispatchReq.pcb_number,
        warranty_end_date: warrantyEndDate,
        sim_no: validDispatchReq.sim_no,
        sim_recharge_end_date: simRechargeEndDate,
        production_date: validDispatchReq.production_date,
        software_version: validDispatchReq.software_version,
        hardware_version: validDispatchReq.hardware_version,
        // Dispatch / Customer details
        dispatch_date: validDispatchReq.dispatch_date,
        customer_name: validDispatchReq.customer_name,
        contact_number: validDispatchReq.contact_number,
        address: validDispatchReq.address,
        location: validDispatchReq.location,
        product_name: validDispatchReq.product_name,
        qty: validDispatchReq.qty,
        // Payment & Invoice
        mode_of_dispatch: validDispatchReq.mode_of_dispatch,
        mode_of_payment: validDispatchReq.mode_of_payment,
        payment_status: validDispatchReq.payment_status,
        invoice_no: validDispatchReq.invoice_no,
        invoice_date: validDispatchReq.invoice_date,
        // Audit
        updated_by: updatedBy,
    };
    const starterBoxUpdate = {
        sim_recharge_expires_at: simRechargeEndDate,
        warranty_expiry_date: warrantyEndDate,
        device_mobile_number: validDispatchReq.sim_no,
        hardware_version: validDispatchReq.hardware_version,
    };
    return { dispatchUpdate, starterBoxUpdate };
}
export function preparedStarterBoxUpdateData(dispatchPayload) {
    return {
        sim_recharge_expires_at: dispatchPayload.sim_recharge_end_date,
        warranty_expiry_date: dispatchPayload.warranty_end_date,
        device_mobile_number: dispatchPayload.sim_no,
        hardware_version: dispatchPayload.hardware_version,
    };
}
export async function requireActiveDispatch(dispatchId) {
    const dispatch = await getSingleRecordByMultipleColumnValues(starterDispatch, ["id", "status"], ["=", "!="], [dispatchId, "ARCHIVED"]);
    if (!dispatch) {
        throw new NotFoundException(STARTER_DISPATCH_NOT_FOUND);
    }
    return dispatch;
}
export async function requireActiveStarterBoxIfAny(starterId) {
    if (starterId == null)
        return null;
    const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
    if (!starter) {
        throw new NotFoundException(STARTER_BOX_NOT_FOUND);
    }
    return starter;
}
export async function ensureUniqueSimNoForUpdate(simNo, dispatchId) {
    const existedSimNumberRecord = await getSingleRecordByMultipleColumnValues(starterDispatch, ["sim_no", "id", "status"], ["=", "!=", "!="], [simNo, dispatchId, "ARCHIVED"]);
    if (existedSimNumberRecord) {
        throw new ConflictException(`SIM number already existed.`);
    }
}
export function applyOptionalDispatchFields(dispatchUpdate, rawPayload, validDispatchReq) {
    const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
    if (hasOwn(rawPayload, "tracking_details"))
        dispatchUpdate.tracking_details = validDispatchReq.tracking_details;
    if (hasOwn(rawPayload, "remarks"))
        dispatchUpdate.remarks = validDispatchReq.remarks;
    if (hasOwn(rawPayload, "invoice_document"))
        dispatchUpdate.invoice_document = validDispatchReq.invoice_document;
}
export function preparedPayloadOfDispatchData(validDispatchReq, createdBy) {
    const invoiceDate = validDispatchReq.invoice_date;
    const simRechargeEndDate = addOneYearValidity(invoiceDate);
    const warrantyEndDate = addOneYearValidity(invoiceDate);
    return {
        // Device details
        starter_id: validDispatchReq.starter_id,
        part_no: validDispatchReq.part_no,
        box_serial_no: validDispatchReq.box_serial_no,
        pcb_number: validDispatchReq.pcb_number,
        warranty_end_date: warrantyEndDate,
        sim_no: validDispatchReq.sim_no,
        sim_recharge_end_date: simRechargeEndDate,
        production_date: validDispatchReq.production_date,
        software_version: validDispatchReq.software_version,
        hardware_version: validDispatchReq.hardware_version,
        // Dispatch / Customer details
        dispatch_date: validDispatchReq.dispatch_date,
        customer_name: validDispatchReq.customer_name,
        contact_number: validDispatchReq.contact_number,
        address: validDispatchReq.address,
        location: validDispatchReq.location,
        product_name: validDispatchReq.product_name,
        qty: validDispatchReq.qty,
        remarks: validDispatchReq.remarks,
        // Payment & Invoice
        mode_of_dispatch: validDispatchReq.mode_of_dispatch,
        tracking_details: validDispatchReq.tracking_details,
        mode_of_payment: validDispatchReq.mode_of_payment,
        payment_status: validDispatchReq.payment_status,
        invoice_no: validDispatchReq.invoice_no,
        invoice_date: validDispatchReq.invoice_date,
        invoice_document: validDispatchReq.invoice_document,
        // Audit
        created_by: createdBy,
    };
}
