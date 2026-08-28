import React from 'react';
import { 
  LayoutDashboard, 
  ClipboardCheck, 
  Settings, 
  LogOut, 
  ChevronRight,
  Users,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';
import { useProfile } from '../context/ProfileContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, setIsOpen }) => {
  const { profile, logout } = useProfile();

  const isAdmin = profile?.role === 'admin';

  const menuItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard },
    { id: 'corte', label: 'Corte de Reporte', icon: ClipboardCheck },
    ...(isAdmin ? [
      { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
      { id: 'team', label: 'Panel de Equipo', icon: Users },
      { id: 'settings', label: 'Configuración', icon: Settings },
    ] : []),
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-50
        transition-all duration-200 ease-out flex flex-col
        ${isOpen ? 'w-64 translate-x-0' : 'w-20 -translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full p-4">
          {/* Logo Section */}
          <div className="flex items-center gap-3 mb-10 px-2">
            {isOpen && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xl font-black tracking-tight text-slate-900"
              >
                Run<span className="text-cyan-600">Monitor</span>
              </motion.span>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl transition-all group
                    ${isActive 
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' 
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
                  `}
                >
                  <Icon size={22} className={isActive ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
                  {isOpen && (
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="font-bold text-sm"
                    >
                      {item.label}
                    </motion.span>
                  )}
                  {isActive && isOpen && (
                    <ChevronRight size={16} className="ml-auto opacity-50" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Section / Logout */}
          <div className="mt-auto pt-4 border-t border-slate-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group"
            >
              <LogOut size={22} className="group-hover:rotate-12 transition-transform" />
              {isOpen && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-bold text-sm"
                >
                  Cerrar Sesión
                </motion.span>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
