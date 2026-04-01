import * as v from "valibot";
import { requiredNumber } from "./common-validations.js";
import { paymentStatusEnum } from "../../database/schemas/starter-dispatch.js";
const STARTER_ID_REQUIRED = "Starter id is required";
const CUSTOMER_NAME_REQUIRED = "Customer name is required";
const CUSTOMER_NAME_MIN_LEN = "Customer name should be min 3 characters";
const QTY_REQUIRED = "Quantity is required";
const QTY_MIN = "Quantity should be min 1";
const CONTACT_NUMBER_REQUIRED = "Contact number is required";
const CONTACT_NUMBER_INVALID = "Contact number must contain digits only";
const CONTACT_NUMBER_VALID_LENGTH = "Contact number must be 10 digits";
const DISPATCH_DATE_REQUIRED = "Dispatch date is required";
const PART_NO_REQUIRED = "Part no is required";
const BOX_SERIAL_NO_REQUIRED = "Box serial no is required";
const PCB_NUMBER_REQUIRED = "PCB number is required";
const PRODUCT_NAME_REQUIRED = "Product name is required";
const MODE_OF_DISPATCH_REQUIRED = "Mode of dispatch is required";
const MODE_OF_PAYMENT_REQUIRED = "Mode of payment is required";
const PAYMENT_STATUS_REQUIRED = "Payment status is required";
const INVALID_PAYMENT_STATUS = "Invalid payment status";
const INVOICE_NO_REQUIRED = "Invoice no is required";
const INVOICE_DATE_REQUIRED = "Invoice date is required";
const SIM_NO_REQUIRED = "Sim no is required";
const PRODUCTION_DATE_REQUIRED = "Production date is required";
const SOFTWARE_VERSION_REQUIRED = "Software version is required";
const HARDWARE_VERSION_REQUIRED = "Hardware version is required";
const ADDRESS_REQUIRED = "Address is required";
const LOCATION_REQUIRED = "Location is required";
// Required string helper
const requiredStr = (msg) => v.pipe(v.string(msg), v.trim(), v.nonEmpty(msg));
// Required string with min length
const requiredStrMin = (msg, minLen, minMsg) => v.pipe(v.string(msg), v.trim(), v.nonEmpty(msg), v.minLength(minLen, minMsg));
// Contact number validator
const contactNumberValidator = v.pipe(v.string(CONTACT_NUMBER_REQUIRED), v.trim(), v.nonEmpty(CONTACT_NUMBER_REQUIRED), v.regex(/^\d+$/, CONTACT_NUMBER_INVALID), v.regex(/^\d{10}$/, CONTACT_NUMBER_VALID_LENGTH));
// Payment status validator
const paymentStatusValidator = v.pipe(v.string(PAYMENT_STATUS_REQUIRED), v.trim(), v.nonEmpty(PAYMENT_STATUS_REQUIRED), v.picklist(paymentStatusEnum.enumValues, INVALID_PAYMENT_STATUS));
export const vAddStarterDispatch = v.object({
    // Required fields
    starter_id: v.nullish(requiredNumber(STARTER_ID_REQUIRED)),
    part_no: requiredStr(PART_NO_REQUIRED),
    box_serial_no: requiredStr(BOX_SERIAL_NO_REQUIRED),
    pcb_number: requiredStr(PCB_NUMBER_REQUIRED),
    dispatch_date: requiredStr(DISPATCH_DATE_REQUIRED),
    customer_name: requiredStrMin(CUSTOMER_NAME_REQUIRED, 3, CUSTOMER_NAME_MIN_LEN),
    contact_number: contactNumberValidator,
    product_name: requiredStr(PRODUCT_NAME_REQUIRED),
    qty: v.pipe(v.number(QTY_REQUIRED), v.minValue(1, QTY_MIN)),
    mode_of_dispatch: requiredStr(MODE_OF_DISPATCH_REQUIRED),
    mode_of_payment: requiredStr(MODE_OF_PAYMENT_REQUIRED),
    payment_status: paymentStatusValidator,
    invoice_no: requiredStr(INVOICE_NO_REQUIRED),
    invoice_date: requiredStr(INVOICE_DATE_REQUIRED),
    sim_no: requiredStr(SIM_NO_REQUIRED),
    production_date: requiredStr(PRODUCTION_DATE_REQUIRED),
    software_version: requiredStr(SOFTWARE_VERSION_REQUIRED),
    hardware_version: requiredStr(HARDWARE_VERSION_REQUIRED),
    address: requiredStr(ADDRESS_REQUIRED),
    location: requiredStr(LOCATION_REQUIRED),
    // Optional fields (nullish — can be null, undefined, or omitted)
    // sim_recharge_end_date and warranty_end_date are auto-calculated from invoice_date + 12 months
    tracking_details: v.nullish(v.optional(v.string())),
    remarks: v.nullish(v.optional(v.string())),
    invoice_document: v.nullish(v.optional(v.string())), // S3 key returned from invoice-upload-url endpoint
});
