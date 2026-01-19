// import { Queue } from "bullmq";
// import { redisConfig } from "../../config/redis-config.js";
// import IORedis from "ioredis";

// // Reuse the same connection to avoid leaks
// export const redisConnection = new IORedis(redisConfig);

// export const mqttQueue = new Queue("mqtt-maintenance-queue", {
//   connection: redisConnection,
//   defaultJobOptions: {
//     attempts: 3,
//     backoff: {
//       type: "exponential",
//       delay: 5000, // Start with 5s, then 10s, then 20s...
//     },
//     removeOnComplete: true, // Auto-clean finished tasks
//     removeOnFail: false,    // Keep failed tasks for debugging
//   },
// });

// export interface MqttJobData {
//   type: "MOTOR_CONTROL" | "SETTINGS_SYNC";
//   starterId: number;
//   pcbNumber: string;
//   payload: any;
//   topic: string;
//   expectedSequence?: number;
// }

// export async function addMqttMaintenanceJob(data: MqttJobData) {
//   const jobId = `${data.type}_${data.starterId}_${Date.now()}`;
//   return await mqttQueue.add(data.type, data, { jobId });
// }
