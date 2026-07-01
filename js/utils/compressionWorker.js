// compressionWorker.js — Off-thread image compression via OffscreenCanvas

let isWebpSupported = null;
async function checkWebpSupport() {
    if (isWebpSupported !== null) return isWebpSupported;
    try {
        const canvas = new OffscreenCanvas(1, 1);
        const blob = await canvas.convertToBlob({ type: 'image/webp' });
        isWebpSupported = (blob.type === 'image/webp');
    } catch (e) {
        isWebpSupported = false;
    }
    return isWebpSupported;
}

self.onmessage = async (e) => {
    const { imageData, maxWidth, quality, originalSize } = e.data;

    try {
        // Decode the image from ArrayBuffer
        const blob = new Blob([imageData]);
        const bitmap = await createImageBitmap(blob);

        let width = bitmap.width;
        let height = bitmap.height;

        let targetWidth = maxWidth || 1600;
        let targetQuality = quality || 0.8;
        const maxSizeBytes = 300 * 1024; // 300 KB target limit

        if (width > targetWidth) {
            height = Math.round((height * targetWidth) / width);
            width = targetWidth;
        }

        let canvas = new OffscreenCanvas(width, height);
        let ctx = canvas.getContext('2d');

        // Fill with white background for transparent images
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Detect supported format
        const webpSupported = await checkWebpSupport();
        const outputType = webpSupported ? 'image/webp' : 'image/jpeg';

        let resultBlob = await canvas.convertToBlob({
            type: outputType,
            quality: targetQuality
        });

        // Compression Loop: If size > 300KB, adaptively lower quality/dimensions (up to 8 attempts)
        let attempts = 0;
        while (resultBlob.size > maxSizeBytes && attempts < 8) {
            attempts++;
            if (targetQuality > 0.5) {
                // Lower quality step-by-step
                targetQuality -= 0.1;
            } else {
                // Resize image smaller by 30% if quality reduction isn't enough
                targetWidth = Math.round(targetWidth * 0.7);
                if (width > targetWidth) {
                    height = Math.round((height * targetWidth) / width);
                    width = targetWidth;
                    canvas = new OffscreenCanvas(width, height);
                    ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(bitmap, 0, 0, width, height);
                }
            }
            resultBlob = await canvas.convertToBlob({
                type: outputType,
                quality: targetQuality
            });
        }

        // Compare size: If compressed is larger than original, flag it to use original
        let useOriginal = false;
        if (originalSize && resultBlob.size > originalSize) {
            useOriginal = true;
        }

        // Transfer the blob back
        const buffer = await resultBlob.arrayBuffer();
        self.postMessage({ success: true, buffer, type: resultBlob.type, useOriginal }, [buffer]);
    } catch (err) {
        self.postMessage({ success: false, error: err.message });
    }
};
