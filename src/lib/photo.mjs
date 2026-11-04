export const MAX_PRODUCT_PHOTOS = 6;

export async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Selecione uma imagem JPG, PNG ou WebP.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Cada foto pode ter até 12 MB.");
  const image = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      url: canvas.toDataURL("image/jpeg", 0.82),
    };
  } finally {
    image.close();
  }
}
