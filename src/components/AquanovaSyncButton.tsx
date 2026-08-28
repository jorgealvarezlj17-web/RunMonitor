import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';

export const AquanovaSyncButton = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 transition-all font-bold text-sm shadow-md"
      >
        <Smartphone size={16} />
        Sincronizar Aquanova
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Smartphone className="text-indigo-600" size={20} />
              ¡Todo listo!
            </h3>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              La información que tenemos en el test es exactamente la que se cargará.
              <br /><br />
              Ve a la pestaña de <strong>Aquanova</strong> y presiona tu marcador para cargar los datos reales.
            </p>
            <button 
              onClick={() => setShowModal(false)}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
