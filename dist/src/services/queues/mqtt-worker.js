// import { Worker, type Job } from "bullmq";
// import { redisConnection, type MqttJobData } from "./mqtt-queue.js";
// import { mqttServiceInstance } from "../mqtt-service.js";
// import { waitForAck } from "../db/mqtt-db-services.js";
// import { logger } from "../../utils/logger.js";
export {};
// const mqttWorker = new Worker(
//   "mqtt-maintenance-queue",
//   async (job: Job<MqttJobData>) => {
//     const { pcbNumber, payload, topic, type, expectedSequence } = job.data;
//     logger.mqtt(`[Queue] Processing ${type} for ${pcbNumber}. Attempt ${job.attemptsMade + 1}`);
//     try {
//       // 1. Publish the message via MQTT
//       mqttServiceInstance.publish(topic, JSON.stringify(payload));
//       // 2. Define validator if sequence is provided
//       const validator = expectedSequence ? (ackPayload: any) => {
//         return ackPayload && ackPayload.S === expectedSequence;
//       } : undefined;
//       // 3. Wait for Acknowledgment from the hardware
//       // We wait for 15 seconds for a response
//       const hasAck = await waitForAck(pcbNumber, 15000, validator);
//       if (!hasAck) {
//         throw new Error(`ACK timeout for ${pcbNumber} (Seq: ${expectedSequence}) on job ${job.id}`);
//       }
//       logger.mqtt(`[Queue] Successfully completed ${type} for ${pcbNumber}`);
//       return { success: true };
//     } catch (error) {
//       logger.error(`[Queue] Error in ${type} execution for ${pcbNumber}`, error);
//       // Re-throwing the error tells BullMQ to use its backoff strategy to retry later
//       throw error;
//     }
//   },
//   { connection: redisConnection }
// );
// mqttWorker.on("failed", (job: Job<MqttJobData> | undefined, err: Error) => {
//   logger.error(`[Queue] Job ${job?.id} failed after all retries`, err);
// });
// export default mqttWorker;
