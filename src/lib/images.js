/** data: URL for an attached image ({ mimeType, data(base64) }). */
export const imageSrc = (img) => `data:${img.mimeType};base64,${img.data}`;

const MAX_SIDE = 1536;

/**
 * Reads an image file and shrinks it to at most 1536px on its longest side as
 * a JPEG, so chats with images stay well under the server's request size limit.
 */
export async function readImage(file) {
  const name = file.name;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { name, mimeType: "image/jpeg", data: dataUrl.split(",")[1] };
  } catch {
    // Format the browser can't decode: send it as-is.
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { name, mimeType: file.type, data: dataUrl.split(",")[1] };
  }
}
