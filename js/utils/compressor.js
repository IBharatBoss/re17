// compressor.js — Smart Image Compression with Web Worker offloading
/**
 * Compresses an image file.
 * Uses OffscreenCanvas Web Worker for off-thread processing when supported.
 * Falls back to main-thread Canvas API for older browsers.
 * @param {File} file - The original image file.
 * @returns {Promise<Blob>} - A promise that resolves with the compressed WebP Blob.
 */

const MAX_WIDTH = 1600;
const QUALITY = 0.8;

// Feature detection for Web Worker + OffscreenCanvas
const supportsWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

function compressViaWorker(file) {
    return new Promise((resolve, reject) => {
        // Create a dedicated worker for this file to prevent race conditions during parallel compression
        const w = new Worker(new URL('./compressionWorker.js', import.meta.url), { type: 'classic' });

        w.onmessage = (e) => {
            w.terminate(); // Clean up the worker immediately
            if (e.data.success) {
                if (e.data.useOriginal) {
                    // Resolve with the original File object if compressed size is larger
                    resolve(file);
                } else {
                    const blob = new Blob([e.data.buffer], { type: e.data.type });
                    resolve(blob);
                }
            } else {
                // Fallback to main thread if worker fails
                compressOnMainThread(file).then(resolve).catch(reject);
            }
        };

        w.onerror = () => {
            w.terminate(); // Clean up the worker immediately
            // Fallback to main thread
            compressOnMainThread(file).then(resolve).catch(reject);
        };

        file.arrayBuffer().then(buffer => {
            w.postMessage({ 
                imageData: buffer, 
                maxWidth: MAX_WIDTH, 
                quality: QUALITY,
                originalSize: file.size 
            }, [buffer]);
        }).catch(err => {
            w.terminate();
            compressOnMainThread(file).then(resolve).catch(reject);
        });
    });
}

/**
 * Compress on main thread (Canvas API fallback with adaptive loop)
 */
function compressOnMainThread(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            return reject(new Error('Invalid file type'));
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = async () => {
                let width = img.width;
                let height = img.height;
                let targetWidth = MAX_WIDTH;
                let targetQuality = QUALITY;
                const maxSizeBytes = 300 * 1024; // 300 KB limit

                if (width > targetWidth) {
                    height = Math.round((height * targetWidth) / width);
                    width = targetWidth;
                }

                let canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                let ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Detect if canvas supports exporting as image/webp
                const isWebPSupported = () => {
                    try {
                        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
                    } catch(e) {
                        return false;
                    }
                };

                const webpSupported = isWebPSupported();
                const outputType = webpSupported ? 'image/webp' : 'image/jpeg';

                const getBlob = (q) => {
                    return new Promise(res => canvas.toBlob(res, outputType, q));
                };

                let resultBlob = await getBlob(targetQuality);
                let attempts = 0;

                // Main thread fallback loop: Reduce quality or dimensions until < 300 KB (up to 8 attempts)
                while (resultBlob.size > maxSizeBytes && attempts < 8) {
                    attempts++;
                    if (targetQuality > 0.5) {
                        targetQuality -= 0.1;
                        resultBlob = await getBlob(targetQuality);
                    } else {
                        targetWidth = Math.round(targetWidth * 0.7);
                        if (width > targetWidth) {
                            height = Math.round((height * targetWidth) / width);
                            width = targetWidth;
                            canvas.width = width;
                            canvas.height = height;
                            ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                        }
                        resultBlob = await getBlob(targetQuality);
                    }
                }

                // If compressed blob is larger than original, return the original file
                if (resultBlob.size > file.size) {
                    resolve(file);
                } else {
                    resolve(resultBlob);
                }
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * Public API — automatically picks the best compression strategy
 */
export async function compressImage(file) {
    if (supportsWorker) {
        return compressViaWorker(file);
    }
    return compressOnMainThread(file);
}
