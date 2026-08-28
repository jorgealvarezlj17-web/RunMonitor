import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperModalProps {
  image: string;
  onCropComplete: (croppedImage: string) => void;
  onCancel: () => void;
  aspect?: number;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ 
  image, 
  onCropComplete, 
  onCancel,
  aspect = 16 / 9
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropChange = (crop: { x: number, y: number }) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: any
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return '';
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleDone = async () => {
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedImage);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-[#0F172A] w-full max-w-2xl aspect-square md:aspect-video rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl"
        >
          <div className="p-4 flex items-center justify-between border-b border-white/5">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Ajustar Imagen</h3>
            <button onClick={onCancel} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="relative flex-1 bg-black">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={onCropChange}
              onCropComplete={onCropCompleteInternal}
              onZoomChange={onZoomChange}
              objectFit="contain"
            />
          </div>

          <div className="p-6 space-y-6 bg-[#0F172A]">
            <div className="flex items-center gap-4">
              <ZoomOut size={18} className="text-gray-500" />
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <ZoomIn size={18} className="text-gray-500" />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                Cancelar
              </button>
              <button
                onClick={handleDone}
                className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Confirmar
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
