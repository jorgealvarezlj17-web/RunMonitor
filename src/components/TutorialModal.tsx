import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, LayoutDashboard, ClipboardCheck, Users, Settings } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ElementType;
}

const steps: TutorialStep[] = [
  {
    title: "¡Bienvenido a Run Monitor!",
    description: "Esta es tu herramienta de gestión inteligente de equipos. Te mostraremos cómo usarla.",
    icon: LayoutDashboard,
  },
  {
    title: "Panel de Control",
    description: "Aquí verás el estado de tus equipos en tiempo real y podrás añadir nuevos equipos.",
    icon: LayoutDashboard,
  },
  {
    title: "Corte de Reporte",
    description: "Genera y envía tus reportes de guardia de forma rápida y sencilla.",
    icon: ClipboardCheck,
  },
  {
    title: "Panel de Equipo",
    description: "Administra los miembros de tu equipo y sus permisos (solo administradores).",
    icon: Users,
  },
  {
    title: "Configuración",
    description: "Ajusta tus preferencias y la configuración del sistema.",
    icon: Settings,
  },
];

interface TutorialModalProps {
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center">
              {React.createElement(steps[currentStep].icon, { size: 24 })}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">{steps[currentStep].title}</h3>
          <p className="text-slate-600 text-sm mb-8 leading-relaxed">{steps[currentStep].description}</p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all ${index === currentStep ? 'w-6 bg-cyan-600' : 'w-2 bg-slate-200'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                {currentStep === steps.length - 1 ? 'Finalizar' : 'Siguiente'}
                {currentStep < steps.length - 1 && <ChevronRight size={20} />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
