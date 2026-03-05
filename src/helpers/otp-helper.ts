import moment from "moment";

function prepareOTPData(inputPhone: string, action: any, expireInMin = 15) {
  const DUMMY_PHONE = "6300303057";
  const OTP = inputPhone === DUMMY_PHONE ? "1234" : randomOTP();
  const expires_at = moment().utc().add(expireInMin, "minutes");
  const data: any = { action, otp: OTP, expires_at, phone: inputPhone };
  return data;
}

function randomOTP() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}
export { prepareOTPData, randomOTP };
