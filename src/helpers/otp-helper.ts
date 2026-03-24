import { addMinutes } from "date-fns";

function prepareOTPData(inputPhone: string, action: any, expireInMin = 15) {
  const DUMMY_PHONE = "6300303057";
  const OTP = inputPhone === DUMMY_PHONE ? "1234" : "1234"; // For testing, use a fixed OTP. In production, use randomOTP().
  const expires_at = addMinutes(new Date(), expireInMin);
  const data: any = { action, otp: OTP, expires_at, phone: inputPhone };
  return data;
}

function randomOTP() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}
export { prepareOTPData, randomOTP };
