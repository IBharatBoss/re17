// storageAdapter.js
import { CLOUDINARY_CONFIG } from '../config.js';

/**
 * Uploads images to Cloudinary natively with progress tracking.
 * @param {Blob[]} files - Array of raw file objects or Blobs.
 * @param {Function} onProgressCallback - Callback to report total progress percentage.
 * @returns {Promise<string[]>} - Promise resolving to an array of secure image URLs.
 */
export async function uploadImages(files, onProgressCallback) {
    const progressState = files.map(f => ({ loaded: 0, total: f.size }));

    const uploadPromises = files.map((file, index) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;
            
            xhr.open('POST', url, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    progressState[index].loaded = event.loaded;
                    progressState[index].total = event.total;
                    
                    let totalLoaded = 0;
                    let totalSize = 0;
                    progressState.forEach(p => {
                        totalLoaded += p.loaded;
                        totalSize += p.total;
                    });
                    
                    const percentage = Math.round((totalLoaded / totalSize) * 100);
                    if (onProgressCallback) {
                        onProgressCallback(percentage);
                    }
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    const secureUrl = response.secure_url;
                    // Apply Cloudinary's auto-compression
                    const optimizedUrl = secureUrl.replace('/upload/', '/upload/q_auto,f_auto/');
                    resolve(optimizedUrl);
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Network error during upload'));

            const formData = new FormData();
            formData.append('file', file, file.name || `image_${index}.webp`);
            formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

            xhr.send(formData);
        });
    });

    return Promise.all(uploadPromises);
}
