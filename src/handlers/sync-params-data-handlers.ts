import type { Context } from "hono";
import { sendResponse } from "../utils/send-response.js";
import { syncQuery } from "../services/db/settings-services.js";



export class SyncParamsDataHandlers {

  async syncParamsData(c: Context) {
    try {
      const batchSize = 1000;

      while (true) {
        const deletedRows = await syncQuery(batchSize);
        if (deletedRows === 0)
          break;
      }

      return sendResponse(c, 200, "Data synchronized successfully");
    }
    catch (error: any) {
      console.error("Error at sync the data:", error);
      throw error;
    }
  }

} 