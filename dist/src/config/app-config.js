import envData from "../env.js";
const appData = {
    port: Number(envData.PORT),
    api_version: envData.API_VERSION,
};
export default appData;
