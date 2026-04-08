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
const DISPATCH_DATE_MIN_LEN = "Dispatch date should be min 3 characters";
const PART_NO_REQUIRED = "Part no is required";
const PART_NO_MIN_LEN = "Part no should be min 3 characters";
const BOX_SERIAL_NO_REQUIRED = "Box serial no is required";
const BOX_SERIAL_NO_MIN_LEN = "Box serial no should be min 3 characters";
const PCB_NUMBER_REQUIRED = "PCB number is required";
const PCB_NUMBER_MIN_LEN = "PCB number should be min 3 characters";
const PRODUCT_NAME_REQUIRED = "Product name is required";
const PRODUCT_NAME_MIN_LEN = "Product name should be min 3 characters";
const MODE_OF_DISPATCH_REQUIRED = "Mode of dispatch is required";
const MODE_OF_DISPATCH_MIN_LEN = "Mode of dispatch should be min 3 characters";
const MODE_OF_PAYMENT_REQUIRED = "Mode of payment is required";
const MODE_OF_PAYMENT_MIN_LEN = "Mode of payment should be min 3 characters";
const PAYMENT_STATUS_REQUIRED = "Payment status is required";
const INVALID_PAYMENT_STATUS = "Invalid payment status";
const INVOICE_NO_REQUIRED = "Invoice no is required";
const INVOICE_NO_MIN_LEN = "Invoice no should be min 3 characters";
const INVOICE_DATE_REQUIRED = "Invoice date is required";
const INVOICE_DATE_MIN_LEN = "Invoice date should be min 3 characters";
const SIM_NO_REQUIRED = "Sim no is required";
const SIM_NO_MIN_LEN = "Sim no should be min 3 characters";
const PRODUCTION_DATE_REQUIRED = "Production date is required";
const PRODUCTION_DATE_MIN_LEN = "Production date should be min 3 characters";
const SOFTWARE_VERSION_REQUIRED = "Software version is required";
const SOFTWARE_VERSION_MIN_LEN = "Software version should be min 3 characters";
const HARDWARE_VERSION_REQUIRED = "Hardware version is required";
const HARDWARE_VERSION_MIN_LEN = "Hardware version should be min 3 characters";
const ADDRESS_REQUIRED = "Address is required";
const ADDRESS_MIN_LEN = "Address should be min 3 characters";
const LOCATION_REQUIRED = "Location is required";
const LOCATION_MIN_LEN = "Location should be min 3 characters";
const TRACKING_DETAILS_MIN_LEN = "Tracking details should be min 3 characters";
const REMARKS_MIN_LEN = "Remarks should be min 3 characters";
const INVOICE_DOCUMENT_MIN_LEN = "Invoice document should be min 3 characters";
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
    part_no: requiredStrMin(PART_NO_REQUIRED, 3, PART_NO_MIN_LEN),
    box_serial_no: requiredStrMin(BOX_SERIAL_NO_REQUIRED, 3, BOX_SERIAL_NO_MIN_LEN),
    pcb_number: requiredStrMin(PCB_NUMBER_REQUIRED, 3, PCB_NUMBER_MIN_LEN),
    dispatch_date: requiredStrMin(DISPATCH_DATE_REQUIRED, 3, DISPATCH_DATE_MIN_LEN),
    customer_name: requiredStrMin(CUSTOMER_NAME_REQUIRED, 3, CUSTOMER_NAME_MIN_LEN),
    contact_number: contactNumberValidator,
    product_name: requiredStrMin(PRODUCT_NAME_REQUIRED, 3, PRODUCT_NAME_MIN_LEN),
    qty: v.pipe(v.number(QTY_REQUIRED), v.minValue(1, QTY_MIN)),
    mode_of_dispatch: requiredStrMin(MODE_OF_DISPATCH_REQUIRED, 3, MODE_OF_DISPATCH_MIN_LEN),
    mode_of_payment: requiredStrMin(MODE_OF_PAYMENT_REQUIRED, 3, MODE_OF_PAYMENT_MIN_LEN),
    payment_status: paymentStatusValidator,
    invoice_no: requiredStrMin(INVOICE_NO_REQUIRED, 3, INVOICE_NO_MIN_LEN),
    invoice_date: requiredStrMin(INVOICE_DATE_REQUIRED, 3, INVOICE_DATE_MIN_LEN),
    sim_no: requiredStrMin(SIM_NO_REQUIRED, 3, SIM_NO_MIN_LEN),
    production_date: requiredStrMin(PRODUCTION_DATE_REQUIRED, 3, PRODUCTION_DATE_MIN_LEN),
    software_version: requiredStrMin(SOFTWARE_VERSION_REQUIRED, 3, SOFTWARE_VERSION_MIN_LEN),
    hardware_version: requiredStrMin(HARDWARE_VERSION_REQUIRED, 3, HARDWARE_VERSION_MIN_LEN),
    address: requiredStrMin(ADDRESS_REQUIRED, 3, ADDRESS_MIN_LEN),
    location: requiredStrMin(LOCATION_REQUIRED, 3, LOCATION_MIN_LEN),
    // Optional fields (nullish — can be null, undefined, or omitted)
    // sim_recharge_end_date and warranty_end_date are auto-calculated from invoice_date + 12 months
    tracking_details: v.nullish(v.optional(v.pipe(v.string(), v.trim(), v.minLength(3, TRACKING_DETAILS_MIN_LEN)))),
    remarks: v.nullish(v.optional(v.pipe(v.string(), v.trim(), v.minLength(3, REMARKS_MIN_LEN)))),
    invoice_document: v.nullish(v.optional(v.pipe(v.string(), v.trim(), v.minLength(3, INVOICE_DOCUMENT_MIN_LEN)))), // S3 key returned from invoice-upload-url endpoint
});
