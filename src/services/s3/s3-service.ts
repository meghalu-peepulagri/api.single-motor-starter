import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Config from "../../config/s3-config.js";
import S3ErrorException from "../../exceptions/s3-exceptions.js";

const s3Client = new S3Client({
  region: s3Config.region,
  credentials: {
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
  },
});

const BUCKET_NAME = s3Config.bucketName;

/**
 * Generate a pre-signed PUT URL for uploading an installation photo
 */
export async function generateUploadUrl(deviceId: number, contentType: string = "image/jpeg", expiresIn: number = 900) {
  try {
    const key = `iDhara/installation-photos/${deviceId}/${Date.now()}.${getExtension(contentType)}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return { uploadUrl, key };
  } catch (error: any) {
    throw new S3ErrorException(500, `Failed to generate upload URL: ${error.message}`);
  }
}

/**
 * Generate a pre-signed GET URL for viewing an installation photo
 */
export async function generateDownloadUrl(key: string, expiresIn: number = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error: any) {
    throw new S3ErrorException(500, `Failed to generate download URL: ${error.message}`);
  }
}

/**
 * Delete an installation photo from S3
 */
export async function deleteObject(key: string) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await s3Client.send(command);
  } catch (error: any) {
    throw new S3ErrorException(500, `Failed to delete object: ${error.message}`);
  }
}

/**
 * Upload a file buffer directly to S3 and return the key
 */
export async function uploadObject(key: string, buffer: Buffer, contentType: string) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    return key;
  } catch (error: any) {
    throw new S3ErrorException(500, `Failed to upload file: ${error.message}`);
  }
}

/**
 * Generate a pre-signed PUT URL for uploading an invoice document
 */
export async function generateInvoiceUploadUrl(dispatchId: number | string, contentType: string = "application/pdf", expiresIn: number = 900) {
  try {
    const key = `iDhara/invoices/${dispatchId}/${Date.now()}.${getExtension(contentType)}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return { uploadUrl, key };
  } catch (error: any) {
    throw new S3ErrorException(500, `Failed to generate invoice upload URL: ${error.message}`);
  }
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return map[contentType] || "pdf";
}
