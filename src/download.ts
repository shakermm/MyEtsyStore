import { createWriteStream, existsSync, mkdirSync } from 'fs';
import https from 'https';
import { join } from 'path';

/**
 * Downloads an image from a URL and saves it to the local images folder
 */
export async function downloadImage(url: string, filename: string): Promise<string> {
  const imagesDir = 'images';
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  const filepath = join(imagesDir, filename);
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(filepath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(filepath);
      });

      fileStream.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Creates a safe filename from a concept string
 */
export function createSafeFilename(concept: string, index: number = 0): string {
  let slug = concept
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')         // Replace spaces with hyphens
    .replace(/-+/g, '-')          // Remove duplicate hyphens
    .trim()
    .substring(0, 60);            // Limit length

  if (!slug) slug = 'banterwear-design';

  return `${String(index + 1).padStart(2, '0')}-${slug}.png`;
}
