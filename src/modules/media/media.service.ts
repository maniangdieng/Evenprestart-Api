import { Inject, Injectable } from '@nestjs/common';
import type { UploadApiResponse, v2 as CloudinaryClient } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.provider';

export type MediaFolder = 'avatars' | 'talent-media' | 'documents';

@Injectable()
export class MediaService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof CloudinaryClient,
  ) {}

  uploadBuffer(
    buffer: Buffer,
    folder: MediaFolder,
    resourceType: 'image' | 'video' | 'auto' = 'auto',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        { folder: `eventprestart/${folder}`, resource_type: resourceType },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new Error('Échec de l’upload Cloudinary'));
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async destroy(publicId: string) {
    await this.cloudinary.uploader.destroy(publicId);
  }
}
