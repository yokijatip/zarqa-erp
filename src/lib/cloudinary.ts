import {
  PUBLIC_CLOUDINARY_CLOUD_NAME,
  PUBLIC_CLOUDINARY_UPLOAD_PRESET,
} from '$env/static/public';

export type CloudinaryFolder = 'profile' | 'products';

export async function uploadToCloudinary(file: File, folder: CloudinaryFolder): Promise<string> {
  if (!PUBLIC_CLOUDINARY_CLOUD_NAME || !PUBLIC_CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary belum dikonfigurasi. Isi cloud name dan upload preset di file .env.');
  }

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', PUBLIC_CLOUDINARY_UPLOAD_PRESET);
  body.append('folder', `zarqa-erp/${folder}`);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body },
  );

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json() as { error?: { message?: string } };
      detail = data.error?.message ? ` ${data.error.message}` : '';
    } catch {
      // Keep a stable user-facing error when Cloudinary returns a non-JSON response.
    }
    throw new Error(`Upload foto ke Cloudinary gagal.${detail}`);
  }

  const data = await response.json() as { secure_url?: string };
  if (!data.secure_url) throw new Error('Cloudinary tidak mengembalikan URL foto.');
  return data.secure_url;
}
