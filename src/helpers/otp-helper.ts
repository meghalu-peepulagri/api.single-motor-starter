import moment from "moment";

function prepareOTPData(user: any, inputPhone: string, action: any, expireInMin = 15) {
  const OTP = randomOTP();
  // const OTP = "1234";
  const expires_at = moment().utc().add(expireInMin, "minutes");
  const data: any = { action, otp: OTP, expires_at, phone: inputPhone };
  return data;
}

function randomOTP() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}
export { prepareOTPData, randomOTP };
