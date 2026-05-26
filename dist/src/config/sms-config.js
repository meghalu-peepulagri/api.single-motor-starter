import envData from "../env.js";
const notificationConfig = {
    sms: {
        apiKey: envData.MSG91_SMS_API_KEY,
        apiUrl: "https://control.msg91.com/api/v5/flow",
        templateId: envData.MSG91_SMS_TEMPLATE_ID,
    },
};
export default notificationConfig;
