import type { ValidatedAddStarterDispatch } from "../validations/schema/starter-dispatch-validations.js";
import type { NewStarterDispatch } from "../database/schemas/starter-dispatch.js";

function isDateWithin30Days(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const [day, month, year] = dateStr.split("-").map(Number);
  const expiryDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  return expiryDate >= today && expiryDate <= thirtyDaysLater;
}

export function formatExpiringRecords(records: any[], type?: string) {
  return records.map((record: any) => {
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
function addOneYearValidity(dateStr: string): string {
  const [day, month, year] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setFullYear(date.getFullYear() + 1);
  date.setDate(date.getDate() - 1);

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function preparedStarterBoxUpdateData(dispatchPayload: NewStarterDispatch) {
  return {
    sim_recharge_expires_at: dispatchPayload.sim_recharge_end_date,
    warranty_expiry_date: dispatchPayload.warranty_end_date,
    device_mobile_number: dispatchPayload.sim_no,
    hardware_version: dispatchPayload.hardware_version,
  };
}

export function preparedPayloadOfDispatchData(validDispatchReq: ValidatedAddStarterDispatch, createdBy: number): NewStarterDispatch {
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

    // Audit
    created_by: createdBy,
  };
}
