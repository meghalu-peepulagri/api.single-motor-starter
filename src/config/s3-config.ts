import envData from "../env.js";

const s3Config = {
  accessKeyId: envData.AWS_S3_ACCESS_KEY_ID!,
  secretAccessKey: envData.AWS_S3_SECRET_ACCESS_KEY!,
  region: envData.AWS_S3_BUCKET_REGION!,
  bucketName: envData.AWS_S3_BUCKET!,
};

export default s3Config;
