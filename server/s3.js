import { S3, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { promisify } from 'util';

dotenv.config();

const randomBytes = promisify(crypto.randomBytes);

// Initialize S3 client
const s3 = new S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Generate a presigned upload URL
export async function generateUploadURL() {
  try {
    const rawBytes = await randomBytes(16);
    const transcriptName = `${rawBytes.toString('hex')}.txt`;
    
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: transcriptName,
      ContentType: 'text/plain',
    };

    const uploadURL = await getSignedUrl(s3, new PutObjectCommand(params), {
      expiresIn: 60, // URL expires in 60 seconds
    });

    return { uploadURL, transcriptName };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    throw error;
  }
}

export { s3 };