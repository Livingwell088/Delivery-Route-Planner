import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const RECEIPT_CROP = Object.freeze({
  originXRatio: 0.08,
  originYRatio: 0.05,
  widthRatio: 0.84,
  heightRatio: 0.9,
});

export async function cropReceiptImage(photo) {
  if (!photo?.uri || !photo.width || !photo.height) {
    throw new TypeError('A captured photo with a URI and dimensions is required.');
  }

  const crop = {
    originX: Math.round(photo.width * RECEIPT_CROP.originXRatio),
    originY: Math.round(photo.height * RECEIPT_CROP.originYRatio),
    width: Math.round(photo.width * RECEIPT_CROP.widthRatio),
    height: Math.round(photo.height * RECEIPT_CROP.heightRatio),
  };
  const context = ImageManipulator.manipulate(photo.uri);
  context.crop(crop);
  const renderedImage = await context.renderAsync();
  return renderedImage.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
}
