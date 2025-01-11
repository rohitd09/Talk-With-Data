import { S3, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import streamToString from 'stream-to-string';
import dotenv from 'dotenv';

dotenv.config();

class S3BucketLoader {
  constructor(bucketName, fileExtensions = ['.txt']) {
    this.s3 = new S3({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = bucketName;
    this.fileExtensions = fileExtensions;
  }

  // List files in the S3 bucket
  async listFiles() {
    try {
      const params = {
        Bucket: this.bucketName,
      };

      const { Contents } = await this.s3.send(new ListObjectsV2Command(params));
      if (!Contents || Contents.length === 0) return [];

      // Filter files by extension
      return Contents.map((file) => file.Key).filter((key) =>
        this.fileExtensions.some((ext) => key.endsWith(ext))
      );
    } catch (error) {
      console.error('Error listing S3 bucket files:', error);
      throw error;
    }
  }

  // Load a single file from the S3 bucket
  async loadFile(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      const response = await this.s3.send(new GetObjectCommand(params));
      const fileContent = await streamToString(response.Body);

      return {
        content: fileContent,
        metadata: { source: key },
      };
    } catch (error) {
      console.error(`Error loading file from S3: ${key}`, error);
      throw error;
    }
  }

  // Load all files from the S3 bucket
  async load() {
    try {
      const files = await this.listFiles();
      if (files.length === 0) {
        console.warn('No files found in the S3 bucket.');
        return [];
      }

      console.log('Loading files from S3:', files);
      const documents = await Promise.all(files.map((file) => this.loadFile(file)));
      return documents;
    } catch (error) {
      console.error('Error loading documents from S3 bucket:', error);
      throw error;
    }
  }
}

export default S3BucketLoader;