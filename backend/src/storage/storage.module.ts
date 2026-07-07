import { Module, Injectable, Logger, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly defaultExpires: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') as string;
    this.defaultExpires = Number(this.config.get('S3_PRESIGN_EXPIRES_SECONDS') ?? 300);

    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKey = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');

    if (!accessKey || !secretKey) {
      this.logger.warn('S3 credentials not set — uploads/downloads will fail until configured');
      this.client = null;
      return;
    }

   this.client = new S3Client({
  region: this.config.get<string>('S3_REGION') ?? 'eu-west-2',
  ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new Error('Storage not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env');
    }
    return this.client;
  }

  async getDownloadUrl(key: string, fileName?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(fileName ? { ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"` } : {}),
    });
    return getSignedUrl(this.requireClient(), cmd, { expiresIn: this.defaultExpires });
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: this.bucket,
    Key: key,
    ContentType: contentType,
    ChecksumAlgorithm: undefined,
  });
  return getSignedUrl(this.requireClient(), cmd, {
    expiresIn: this.defaultExpires,
    unhoistableHeaders: new Set(),
  });
}

  async delete(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Could not delete ${key}: ${(err as Error).message}`);
    }
  }

  async headSize(key: string): Promise<number> {
    const res = await this.requireClient().send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.ContentLength ?? 0;
  }

  /** Fetch full object bytes. Used server-side for preview generation. */
  async fetchBytes(key: string): Promise<Buffer> {
    const res = await this.requireClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  buildKey(slug: string, version: string, fileName: string): string {
    const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return `datasets/${slug}/${version}/${Date.now()}-${safe}`;
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
