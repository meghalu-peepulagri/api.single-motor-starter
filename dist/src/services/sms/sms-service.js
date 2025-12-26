import notificationConfig from "../../config/sms-config.js";
import BadRequestException from "../../exceptions/bad-request-exception.js";
import axios from "axios";
export class SmsService {
    authKey;
    apiUrl;
    templateId;
    constructor() {
        this.authKey = notificationConfig.sms.apiKey;
        this.apiUrl = notificationConfig.sms.apiUrl;
        this.templateId = notificationConfig.sms.templateId;
    }
    sendSms = async (phone, otp, signatureId) => {
        try {
            const data = {
                template_id: this.templateId,
                recipients: [
                    {
                        mobiles: `91${phone}`,
                        var1: otp,
                        var2: signatureId,
                    },
                ],
            };
            const options = {
                method: "POST",
                url: this.apiUrl,
                headers: {
                    "authkey": this.authKey,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                data,
            };
            const response = await axios.request(options);
            // TODO: handle error response from API properly
            if (response.data.type !== "success") {
                const errorMessage = response.data?.message || "SMS sending failed";
                console.error(400, response.data, errorMessage);
                throw new BadRequestException("SMS sending failed");
            }
            return response;
        }
        catch (error) {
            console.error("Error sending SMS:", error);
            throw error;
        }
    };
}
