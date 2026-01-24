import envData from "../env.js";
const mqttConfig = {
    brokerUrl: envData.EMQX_API_KEY,
    username: envData.EMQX_USERNAME,
    password: envData.EMQX_PASSWORD,
    clientId: envData.EMQX_CLIENT_ID,
};
export default mqttConfig;
