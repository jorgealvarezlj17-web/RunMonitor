import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, 
  Zap, 
  ZapOff, 
  AlertTriangle, 
  Clock, 
  Activity, 
  ShieldCheck, 
  Cpu, 
  Layers,
  Sparkles,
  ArrowRight,
  RotateCcw,
  BarChart3,
  Calendar,
  PieChart,
  HelpCircle,
  TrendingDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInMinutes, subDays, startOfDay, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface LogEntry {
  id: string;
  equipmentId: string;
  action: 'on' | 'off' | 'manual' | 'enabled' | 'disabled';
  timestamp: any;
  userUid?: string;
  details?: string;
}

interface Equipment {
  id: string;
  name: string;
  status: 'on' | 'off';
  disabled?: boolean;
  totalUsageTime?: number; // In seconds
  categoryId?: string;
  categoryName?: string;
  lastStatusChange?: any;
}

interface PowerEvent {
  id: string;
  type: 'falla' | 'corte' | 'ok';
  timestamp: any;
  details?: string;
}

interface Category {
  id: string;
  name: string;
}

interface OutageRecord {
  id: string;
  type: 'falla' | 'corte';
  start: Date;
  end: Date | null;
  durationMinutes: number | null;
  details?: string;
}

export const StatsPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'usage' | 'incidents'>('usage');
  const [viewMode, setViewMode] = useState<'general' | 'weekly' | 'hourly'>('general');
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [powerEvents, setPowerEvents] = useState<PowerEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [outages, setOutages] = useState<OutageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Hover states for interactive charts
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [hoveredCategoryIndex, setHoveredCategoryIndex] = useState<number | null>(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(3);
  const [hoveredWeeklyIndex, setHoveredWeeklyIndex] = useState<number | null>(null);
  const [hoveredHourlyIndex, setHoveredHourlyIndex] = useState<number | null>(null);

  // Load Realtime Data
  useEffect(() => {
    setLoading(true);

    const qEquip = query(collection(db, 'equipment'));
    const qCats = query(collection(db, 'categories'));
    const qPower = query(collection(db, 'power_events'), orderBy('timestamp', 'asc'));
    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'asc'));

    const unsubscribeEquip = onSnapshot(qEquip, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Equipment[];
      setEquipments(items);
    });

    const unsubscribeCats = onSnapshot(qCats, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      setCategories(items);
    });

    const unsubscribePower = onSnapshot(qPower, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type,
          timestamp: data.timestamp,
          details: data.details
        } as PowerEvent;
      });
      setPowerEvents(items);
    });

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as LogEntry;
      });
      setLogs(items);
      setLoading(false);
    });

    return () => {
      unsubscribeEquip();
      unsubscribeCats();
      unsubscribePower();
      unsubscribeLogs();
    };
  }, []);

  // Process Outages (Fallas & Cortes) duration
  useEffect(() => {
    if (powerEvents.length === 0) {
      setOutages([]);
      return;
    }

    const processedOutages: OutageRecord[] = [];
    let activeOutage: { type: 'falla' | 'corte'; start: Date; id: string; details?: string } | null = null;

    powerEvents.forEach((event) => {
      const eventDate = event.timestamp ? event.timestamp.toDate() : new Date();
      
      if (event.type === 'falla' || event.type === 'corte') {
        // If there was an active outage of another type, close it with the new outage start time
        if (activeOutage) {
          const duration = differenceInMinutes(eventDate, activeOutage.start);
          processedOutages.push({
            id: activeOutage.id,
            type: activeOutage.type,
            start: activeOutage.start,
            end: eventDate,
            durationMinutes: duration,
            details: activeOutage.details
          });
        }
        activeOutage = {
          type: event.type,
          start: eventDate,
          id: event.id,
          details: event.details
        };
      } else if (event.type === 'ok') {
        if (activeOutage) {
          const duration = differenceInMinutes(eventDate, activeOutage.start);
          processedOutages.push({
            id: activeOutage.id,
            type: activeOutage.type,
            start: activeOutage.start,
            end: eventDate,
            durationMinutes: duration,
            details: activeOutage.details
          });
          activeOutage = null;
        }
      }
    });

    // If there's an ongoing outage
    if (activeOutage) {
      processedOutages.push({
        id: (activeOutage as any).id,
        type: (activeOutage as any).type,
        start: (activeOutage as any).start,
        end: null,
        durationMinutes: differenceInMinutes(new Date(), (activeOutage as any).start),
        details: (activeOutage as any).details
      });
    }

    // Sort outages by date descending (newest first)
    processedOutages.sort((a, b) => b.start.getTime() - a.start.getTime());
    setOutages(processedOutages);
  }, [powerEvents]);

  // Calculations for Usage Tab
  const totalUsageSeconds = equipments.reduce((sum, eq) => {
    let extraSeconds = 0;
    // If equipment is currently ON, we add the elapsed time of the active session
    if (eq.status === 'on' && !eq.disabled && eq.lastStatusChange) {
      const startTime = eq.lastStatusChange.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange);
      extraSeconds = Math.max(0, Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
    }
    return sum + (eq.totalUsageTime || 0) + extraSeconds;
  }, 0);

  const totalUsageHours = (totalUsageSeconds / 3600).toFixed(1);
  const activeCount = equipments.filter(eq => eq.status === 'on' && !eq.disabled).length;
  const disabledCount = equipments.filter(eq => eq.disabled).length;
  const totalCount = equipments.length;
  const activePercentage = totalCount > 0 ? Math.round(((totalCount - disabledCount) / totalCount) * 100) : 100;

  // Group Usage by Category
  const categoryUsageData = categories.map(cat => {
    const catEquip = equipments.filter(e => e.categoryId === cat.id);
    const totalSecs = catEquip.reduce((sum, eq) => {
      let extra = 0;
      if (eq.status === 'on' && !eq.disabled && eq.lastStatusChange) {
        const startTime = eq.lastStatusChange.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange);
        extra = Math.max(0, Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
      }
      return sum + (eq.totalUsageTime || 0) + extra;
    }, 0);
    return {
      id: cat.id,
      name: cat.name,
      hours: +(totalSecs / 3600).toFixed(1),
      count: catEquip.length
    };
  }).filter(c => c.hours > 0 || c.count > 0);

  // Reconstruct equipment active sessions from logs
  const equipmentSessions = React.useMemo(() => {
    const sessionsMap: { [eqId: string]: { start: Date; end: Date }[] } = {};
    equipments.forEach(eq => {
      sessionsMap[eq.id] = [];
    });

    // Sort logs chronologically to reconstruct sessions
    const sortedLogs = [...logs].sort((a, b) => {
      const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
      const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
      return tA - tB;
    });

    const tempActive: { [eqId: string]: Date } = {};

    sortedLogs.forEach(log => {
      const eqId = log.equipmentId;
      const logTime = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
      
      if (log.action === 'on') {
        tempActive[eqId] = logTime;
      } else if (log.action === 'off') {
        const start = tempActive[eqId];
        if (start) {
          if (!sessionsMap[eqId]) sessionsMap[eqId] = [];
          sessionsMap[eqId].push({ start, end: logTime });
          delete tempActive[eqId];
        }
      }
    });

    // Handle currently active equipments (status === 'on')
    const now = new Date();
    equipments.forEach(eq => {
      if (eq.status === 'on' && !eq.disabled) {
        const start = tempActive[eq.id] || (eq.lastStatusChange?.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange || now));
        if (start) {
          if (!sessionsMap[eq.id]) sessionsMap[eq.id] = [];
          sessionsMap[eq.id].push({ start, end: now });
        }
      }
    });

    return sessionsMap;
  }, [logs, equipments]);

  // Compute Weekly Statistics (last 4 weeks)
  const weeklyStats = React.useMemo(() => {
    const now = new Date();
    
    // Create 4 week-long ranges
    const weeks = Array.from({ length: 4 }).map((_, i) => {
      const start = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 }); // Monday start
      const end = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      return {
        index: i,
        start,
        end,
        label: i === 0 ? 'Esta Semana' : `Hace ${i} ${i === 1 ? 'semana' : 'semanas'}`,
        rangeLabel: `${format(start, 'dd MMM', { locale: es })} - ${format(end, 'dd MMM', { locale: es })}`
      };
    }).reverse();

    // Group hours and power incidents for each week
    return weeks.map(wk => {
      let totalUsageHours = 0;
      const equipmentHours: { [eqId: string]: number } = {};

      equipments.forEach(eq => {
        let eqSecs = 0;
        const sessions = equipmentSessions[eq.id] || [];
        
        sessions.forEach(session => {
          const overlapStart = new Date(Math.max(session.start.getTime(), wk.start.getTime()));
          const overlapEnd = new Date(Math.min(session.end.getTime(), wk.end.getTime()));
          
          if (overlapStart < overlapEnd) {
            eqSecs += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 1000);
          }
        });
        
        const hrs = +(eqSecs / 3600).toFixed(1);
        equipmentHours[eq.id] = hrs;
        totalUsageHours += hrs;
      });

      // Filter power events in this week range
      const weekEvents = powerEvents.filter(ev => {
        const evTime = ev.timestamp?.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
        return evTime >= wk.start && evTime <= wk.end;
      });

      const cortes = weekEvents.filter(e => e.type === 'corte').length;
      const fallas = weekEvents.filter(e => e.type === 'falla').length;

      return {
        ...wk,
        totalUsageHours: +totalUsageHours.toFixed(1),
        equipmentHours,
        cortes,
        fallas,
        totalIncidents: cortes + fallas
      };
    });
  }, [equipmentSessions, equipments, powerEvents]);

  // Compute Hourly Statistics (24-hour cycle)
  const hourlyStats = React.useMemo(() => {
    const hourlyUsageBins = Array.from({ length: 24 }).map((_, hour) => ({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      activeMinutes: 0
    }));

    // Map each session's active minutes to the 24 hours of the day
    Object.values(equipmentSessions).forEach(sessions => {
      sessions.forEach(session => {
        let current = new Date(session.start);
        const end = new Date(session.end);
        
        while (current < end) {
          const currentHour = current.getHours();
          const nextHour = new Date(current);
          nextHour.setHours(currentHour + 1, 0, 0, 0);
          
          const boundary = nextHour < end ? nextHour : end;
          const diffMins = Math.floor((boundary.getTime() - current.getTime()) / 60000);
          
          hourlyUsageBins[currentHour].activeMinutes += Math.max(0, diffMins);
          current = boundary;
        }
      });
    });

    const hourlyUsage = hourlyUsageBins.map(bin => ({
      ...bin,
      hours: +(bin.activeMinutes / 60).toFixed(1)
    }));

    const hourlyIncidents = Array.from({ length: 24 }).map((_, hour) => {
      const hourEvents = powerEvents.filter(ev => {
        const evTime = ev.timestamp?.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
        return evTime.getHours() === hour && (ev.type === 'corte' || ev.type === 'falla');
      });

      const cortes = hourEvents.filter(e => e.type === 'corte').length;
      const fallas = hourEvents.filter(e => e.type === 'falla').length;

      return {
        hour,
        label: `${hour.toString().padStart(2, '0')}:00`,
        cortes,
        fallas,
        total: cortes + fallas
      };
    });

    return {
      hourlyUsage,
      hourlyIncidents
    };
  }, [equipmentSessions, powerEvents]);

  // Incidents Counts
  const totalCortes = powerEvents.filter(e => e.type === 'corte').length;
  const totalFallas = powerEvents.filter(e => e.type === 'falla').length;
  const currentPowerState = powerEvents.length > 0 ? powerEvents[powerEvents.length - 1].type : 'ok';

  // Helper to format duration
  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return 'Activo';
    if (minutes < 1) return 'Menos de 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // --- SVG GRAPHICS PRE-CALCULATIONS ---

  // 1. Equipment Usage Bar Chart (Vertical SVG)
  const sortedEquipmentsForBarChart = [...equipments]
    .sort((a, b) => {
      const getSecs = (eq: Equipment) => {
        let s = eq.totalUsageTime || 0;
        if (eq.status === 'on' && !eq.disabled && eq.lastStatusChange) {
          const startTime = eq.lastStatusChange.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange);
          s += Math.max(0, Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
        }
        return s;
      };
      return getSecs(b) - getSecs(a);
    })
    .slice(0, 6); // Top 6 equipments

  const barChartWidth = 600;
  const barChartHeight = 280;
  const barPaddingLeft = 50;
  const barPaddingRight = 20;
  const barPaddingTop = 30;
  const barPaddingBottom = 50;
  const barGraphWidth = barChartWidth - barPaddingLeft - barPaddingRight;
  const barGraphHeight = barChartHeight - barPaddingTop - barPaddingBottom;

  const barMaxHours = Math.max(
    ...sortedEquipmentsForBarChart.map(eq => {
      let s = eq.totalUsageTime || 0;
      if (eq.status === 'on' && !eq.disabled && eq.lastStatusChange) {
        const startTime = eq.lastStatusChange.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange);
        s += Math.max(0, Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
      }
      return s / 3600;
    }),
    5 // default minimum scale of 5 hours
  );

  const barData = sortedEquipmentsForBarChart.map((eq, idx) => {
    let s = eq.totalUsageTime || 0;
    if (eq.status === 'on' && !eq.disabled && eq.lastStatusChange) {
      const startTime = eq.lastStatusChange.toDate ? eq.lastStatusChange.toDate() : new Date(eq.lastStatusChange);
      s += Math.max(0, Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
    }
    const hours = s / 3600;
    const barWidth = Math.floor(barGraphWidth / sortedEquipmentsForBarChart.length) - 16;
    const x = barPaddingLeft + idx * (barGraphWidth / sortedEquipmentsForBarChart.length) + 8;
    const barHeight = (hours / barMaxHours) * barGraphHeight;
    const y = (barPaddingTop + barGraphHeight) - barHeight;

    return {
      id: eq.id,
      name: eq.name,
      hours: +hours.toFixed(1),
      status: eq.status,
      x,
      y,
      width: barWidth,
      height: barHeight
    };
  });

  // 2. Category Distribution Donut Chart calculations
  const donutR = 60;
  const donutCX = 100;
  const donutCY = 100;
  const donutCircumference = 2 * Math.PI * donutR;
  const totalCatHours = categoryUsageData.reduce((sum, c) => sum + c.hours, 0) || 1;

  let accumulatedPercent = 0;
  const donutSegments = categoryUsageData.map((cat, idx) => {
    const percent = cat.hours / totalCatHours;
    const strokeDasharray = `${(percent * donutCircumference).toFixed(2)} ${donutCircumference}`;
    const strokeDashoffset = `${(-accumulatedPercent * donutCircumference).toFixed(2)}`;
    accumulatedPercent += percent;

    // Elegant colors for segments
    const colors = [
      'stroke-cyan-500', 
      'stroke-indigo-500', 
      'stroke-purple-500', 
      'stroke-emerald-500', 
      'stroke-amber-500', 
      'stroke-pink-500'
    ];
    const hoverBgColors = [
      'bg-cyan-500', 
      'bg-indigo-500', 
      'bg-purple-500', 
      'bg-emerald-500', 
      'bg-amber-500', 
      'bg-pink-500'
    ];
    const textColors = [
      'text-cyan-600', 
      'text-indigo-600', 
      'text-purple-600', 
      'text-emerald-600', 
      'text-amber-600', 
      'text-pink-600'
    ];

    return {
      ...cat,
      percent: Math.round(percent * 100),
      strokeDasharray,
      strokeDashoffset,
      colorClass: colors[idx % colors.length],
      bgClass: hoverBgColors[idx % hoverBgColors.length],
      textClass: textColors[idx % textColors.length]
    };
  });

  // 3. Incidents 7-Day Trend Line Chart (SVG Area/Line)
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const trendData = last7Days.map((date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayLabel = format(date, 'eee dd', { locale: es });

    // Filter incidents starting on this day
    const dayIncidents = outages.filter(o => {
      const oDateStr = format(o.start, 'yyyy-MM-dd');
      return oDateStr === dateStr;
    });

    const cortes = dayIncidents.filter(o => o.type === 'corte').length;
    const fallas = dayIncidents.filter(o => o.type === 'falla').length;

    return {
      dayLabel,
      cortes,
      fallas,
      total: cortes + fallas,
      dateFormatted: format(date, "dd 'de' MMMM", { locale: es })
    };
  });

  const trendWidth = 600;
  const trendHeight = 250;
  const trendPaddingLeft = 40;
  const trendPaddingRight = 20;
  const trendPaddingTop = 30;
  const trendPaddingBottom = 40;
  const trendGraphWidth = trendWidth - trendPaddingLeft - trendPaddingRight;
  const trendGraphHeight = trendHeight - trendPaddingTop - trendPaddingBottom;

  const trendMaxVal = Math.max(...trendData.map(d => d.total), 3); // min scale of 3

  const trendPoints = trendData.map((d, idx) => {
    const x = trendPaddingLeft + (idx / 6) * trendGraphWidth;
    const y = (trendPaddingTop + trendGraphHeight) - (d.total / trendMaxVal) * trendGraphHeight;
    return { ...d, x, y };
  });

  // Generate SVG Line path command
  const trendLinePath = trendPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  // Generate Area underfill path command
  const trendAreaPath = trendPoints.length > 0 
    ? `${trendLinePath} L ${trendPoints[trendPoints.length - 1].x} ${trendPaddingTop + trendGraphHeight} L ${trendPoints[0].x} ${trendPaddingTop + trendGraphHeight} Z`
    : '';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-transparent rounded-[2.5rem] border border-slate-200/60">
        <div className="relative flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-100 border-t-cyan-500"></div>
          <Activity size={24} className="text-cyan-500 animate-pulse absolute" />
        </div>
        <p className="mt-5 text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Procesando Métricas Gráficas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title & Description */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 id="stats-title" className="text-3xl font-black tracking-tight text-slate-900 mb-2">Métricas y Análisis Gráfico</h2>
          <p className="text-slate-500 font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-cyan-500" />
            Monitoreo interactivo de rendimiento, horas de uso e incidencias eléctricas
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100/80 rounded-2xl border border-slate-200 shrink-0 self-start md:self-auto">
          <button
            id="btn-tab-usage"
            onClick={() => setActiveSubTab('usage')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeSubTab === 'usage'
                ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cpu size={14} />
            Uso de Equipos
          </button>
          <button
            id="btn-tab-incidents"
            onClick={() => setActiveSubTab('incidents')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeSubTab === 'incidents'
                ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap size={14} />
            Fallas y Cortes
          </button>
        </div>
      </div>

      {/* Rango de Análisis Sub Selector */}
      <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <BarChart3 size={16} />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900 leading-tight">Nivel de Detalle del Análisis</h4>
            <p className="text-[11px] text-slate-500 font-semibold">Selecciona la dimensión de tiempo para las estadísticas</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/60 rounded-xl border border-slate-200/30">
          <button
            onClick={() => setViewMode('general')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'general'
                ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📊 General
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'weekly'
                ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📅 Por Semana
          </button>
          <button
            onClick={() => setViewMode('hourly')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              viewMode === 'hourly'
                ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            🕐 Por Horas
          </button>
        </div>
      </div>

      {activeSubTab === 'usage' ? (
        <div className="space-y-8">
          {viewMode === 'general' ? (
            <>
              {/* Metrics Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Hours */}
                <div id="stat-card-hours" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-bl-[4rem]" />
                  <div className="w-10 h-10 rounded-xl bg-cyan-100/80 text-cyan-600 flex items-center justify-center mb-4">
                    <Clock size={20} />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tiempo Operativo</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">{totalUsageHours}<span className="text-lg font-bold text-slate-400 ml-1">hrs</span></h3>
                  <p className="text-xs font-medium text-slate-500 mt-2">Uso activo acumulado en tiempo real</p>
                </div>

                {/* Active Equipments */}
                <div id="stat-card-active" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-[4rem]" />
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center mb-4">
                    <Activity size={20} className="animate-pulse" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Equipos Encendidos</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">{activeCount}<span className="text-lg font-bold text-slate-400 ml-1">/ {totalCount}</span></h3>
                  <p className="text-xs font-medium text-emerald-600 mt-2 font-bold">Consumiendo energía actualmente</p>
                </div>

                {/* Disables */}
                <div id="stat-card-disabled" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-[4rem]" />
                  <div className="w-10 h-10 rounded-xl bg-red-100/80 text-red-500 flex items-center justify-center mb-4">
                    <ZapOff size={20} />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Equipos Deshabilitados</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">{disabledCount}</h3>
                  <p className="text-xs font-medium text-red-500 mt-2 font-bold">{disabledCount > 0 ? `${disabledCount} fuera de servicio` : 'Todo el equipo disponible'}</p>
                </div>

                {/* Availability Percentage */}
                <div id="stat-card-availability" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-[4rem]" />
                  <div className="w-10 h-10 rounded-xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center mb-4">
                    <ShieldCheck size={20} />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Disponibilidad de Red</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">{activePercentage}%</h3>
                  <p className="text-xs font-medium text-indigo-600 mt-2 font-bold">Porcentaje de flota habilitada</p>
                </div>
              </div>

              {/* SVG Graphics block for Usage */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Interactive SVG Bar Chart */}
                <div id="usage-chart-container" className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                          <BarChart3 className="text-cyan-500" size={20} />
                          Horas de Uso por Equipo
                        </h4>
                        <p className="text-xs text-slate-500 font-medium">Estadística visual comparativa de los equipos más activos</p>
                      </div>
                      {/* Legend indicator */}
                      <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-gradient-to-tr from-emerald-400 to-cyan-500 rounded-full" />
                          Encendido
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full" />
                          Apagado
                        </span>
                      </div>
                    </div>

                    {barData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <BarChart3 size={48} className="stroke-1 mb-3" />
                        <p className="text-xs font-bold uppercase tracking-wider">No hay registros suficientes</p>
                      </div>
                    ) : (
                      <div className="relative w-full overflow-x-auto sm:overflow-visible">
                        {/* SVG Graphic */}
                        <svg viewBox={`0 0 ${barChartWidth} ${barChartHeight}`} className="w-full min-w-[500px] h-auto overflow-visible select-none">
                          {/* Grid lines */}
                          {Array.from({ length: 5 }).map((_, i) => {
                            const val = (barMaxHours / 4) * i;
                            const y = barPaddingTop + barGraphHeight - (i / 4) * barGraphHeight;
                            return (
                              <g key={i} className="opacity-40">
                                <line 
                                  x1={barPaddingLeft} 
                                  y1={y} 
                                  x2={barChartWidth - barPaddingRight} 
                                  y2={y} 
                                  className="stroke-slate-100 stroke-[1.5]"
                                  strokeDasharray="4 4"
                                />
                                <text 
                                  x={barPaddingLeft - 10} 
                                  y={y + 4} 
                                  className="fill-slate-400 font-mono text-[10px] font-black text-right" 
                                  textAnchor="end"
                                >
                                  {val.toFixed(0)}h
                                </text>
                              </g>
                            );
                          })}

                          {/* Bar groups */}
                          {barData.map((bar, idx) => {
                            const isHovered = hoveredBarIndex === idx;
                            const isCurrentActive = bar.status === 'on';

                            return (
                              <g 
                                key={bar.id}
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredBarIndex(idx)}
                                onMouseLeave={() => setHoveredBarIndex(null)}
                              >
                                {/* Glow backing on hover */}
                                {isHovered && (
                                  <rect
                                    x={bar.x - 4}
                                    y={bar.y - 4}
                                    width={bar.width + 8}
                                    height={bar.height + 8}
                                    rx={10}
                                    ry={10}
                                    className={`${isCurrentActive ? 'fill-emerald-500/10' : 'fill-cyan-500/10'} transition-all`}
                                  />
                                )}

                                {/* Main Bar */}
                                <motion.rect
                                  x={bar.x}
                                  y={bar.y}
                                  width={bar.width}
                                  height={Math.max(bar.height, 4)} // minimum height of 4px so it's always visible
                                  rx={8}
                                  ry={8}
                                  className={`transition-all duration-300 ${
                                    isHovered 
                                      ? isCurrentActive 
                                        ? 'fill-emerald-400' 
                                        : 'fill-cyan-400'
                                      : isCurrentActive
                                      ? 'fill-url(#gradient-active-bar)'
                                      : 'fill-url(#gradient-inactive-bar)'
                                  }`}
                                  initial={{ height: 0, y: barPaddingTop + barGraphHeight }}
                                  animate={{ height: Math.max(bar.height, 4), y: bar.y }}
                                  transition={{ duration: 0.6, delay: idx * 0.05, ease: "easeOut" }}
                                />

                                {/* Value label on top of bar */}
                                <text
                                  x={bar.x + bar.width / 2}
                                  y={bar.y - 8}
                                  className={`text-center font-mono text-[11px] font-black transition-all ${
                                    isHovered ? 'fill-slate-900 scale-105' : 'fill-slate-400'
                                  }`}
                                  textAnchor="middle"
                                >
                                  {bar.hours}h
                                </text>

                                {/* Label along X Axis */}
                                <text
                                  x={bar.x + bar.width / 2}
                                  y={barChartHeight - 20}
                                  className={`font-sans text-[10px] font-black transition-all ${
                                    isHovered ? 'fill-slate-900 font-extrabold' : 'fill-slate-500'
                                  }`}
                                  textAnchor="middle"
                                >
                                  {bar.name.length > 9 ? `${bar.name.substring(0, 8)}...` : bar.name}
                                </text>
                              </g>
                            );
                          })}

                          {/* Line separating axis */}
                          <line 
                            x1={barPaddingLeft} 
                            y1={barPaddingTop + barGraphHeight} 
                            x2={barChartWidth - barPaddingRight} 
                            y2={barPaddingTop + barGraphHeight} 
                            className="stroke-slate-200 stroke-[1.5]"
                          />

                          {/* SVG definitions for beautiful gradients */}
                          <defs>
                            <linearGradient id="gradient-active-bar" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#06b6d4" />
                            </linearGradient>
                            <linearGradient id="gradient-inactive-bar" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" />
                              <stop offset="100%" stopColor="#2563eb" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Tooltip detail / advice box */}
                  <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>
                      {hoveredBarIndex !== null ? (
                        <span className="flex items-center gap-2">
                          <Sparkles size={14} className="text-amber-500 animate-spin" />
                          El equipo <strong className="text-slate-800">"{barData[hoveredBarIndex].name}"</strong> acumula <strong className="text-slate-900">{barData[hoveredBarIndex].hours} horas</strong> de uso total.
                        </span>
                      ) : (
                        "Pasa el cursor sobre las barras para ver detalles interactivos de cada equipo."
                      )}
                    </span>
                    <span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest hidden sm:inline">Gráfico Activo</span>
                  </div>
                </div>

                {/* Interactive Category Distribution SVG Donut Chart */}
                <div id="category-donut-container" className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 flex flex-col justify-between">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 mb-1">
                      <PieChart className="text-indigo-500" size={20} />
                      Horas por Categoría
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mb-6">Distribución porcentual de horas de operación</p>

                    {categoryUsageData.length === 0 ? (
                      <div className="text-center py-16 text-slate-400">
                        <Layers size={36} className="mx-auto mb-2 opacity-40" />
                        <p className="text-xs font-bold uppercase tracking-wider">Sin categorías registradas</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-6">
                        {/* SVG Circular Donut */}
                        <div className="relative w-44 h-44 flex items-center justify-center">
                          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90 overflow-visible">
                            {/* Gray backing circle */}
                            <circle
                              cx={donutCX}
                              cy={donutCY}
                              r={donutR}
                              className="fill-none stroke-slate-50 stroke-[14]"
                            />

                            {/* Interactive segments */}
                            {donutSegments.map((seg, idx) => {
                              const isHovered = hoveredCategoryIndex === idx;
                              return (
                                <motion.circle
                                  key={seg.id}
                                  cx={donutCX}
                                  cy={donutCY}
                                  r={donutR}
                                  className={`fill-none stroke-[14] transition-all duration-300 ${seg.colorClass} cursor-pointer`}
                                  strokeDasharray={seg.strokeDasharray}
                                  strokeDashoffset={seg.strokeDashoffset}
                                  strokeLinecap="round"
                                  onMouseEnter={() => setHoveredCategoryIndex(idx)}
                                  onMouseLeave={() => setHoveredCategoryIndex(null)}
                                  animate={{
                                    strokeWidth: isHovered ? 18 : 14
                                  }}
                                />
                              );
                            })}
                          </svg>

                          {/* Inside center text content */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                            {hoveredCategoryIndex !== null ? (
                              <div className="animate-fade-in">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[100px]">
                                  {donutSegments[hoveredCategoryIndex].name}
                                </p>
                                <p className={`text-2xl font-black ${donutSegments[hoveredCategoryIndex].textClass}`}>
                                  {donutSegments[hoveredCategoryIndex].percent}%
                                </p>
                                <p className="text-[10px] font-bold text-slate-500">
                                  {donutSegments[hoveredCategoryIndex].hours} hrs
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Uso Total
                                </p>
                                <p className="text-2xl font-black text-slate-900">
                                  {totalUsageHours}h
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                  Categorías
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Compact Interactive Custom Legends */}
                        <div className="w-full space-y-2">
                          {donutSegments.map((seg, idx) => {
                            const isHovered = hoveredCategoryIndex === idx;
                            return (
                              <div 
                                key={seg.id}
                                className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                                  isHovered 
                                    ? 'bg-slate-100/50 border-slate-200/40 translate-x-1 shadow-sm' 
                                    : 'bg-transparent border-transparent hover:bg-slate-100/30'
                                }`}
                                onMouseEnter={() => setHoveredCategoryIndex(idx)}
                                onMouseLeave={() => setHoveredCategoryIndex(null)}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className={`w-3 h-3 rounded-full shrink-0 ${seg.bgClass}`} />
                                  <span className={`text-xs font-bold truncate ${isHovered ? 'text-slate-900' : 'text-slate-700'}`}>
                                    {seg.name}
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-black text-slate-900">{seg.hours}h</span>
                                  <span className="text-[10px] text-slate-400 font-bold ml-1.5">({seg.percent}%)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : viewMode === 'weekly' ? (
            <>
              {/* Weekly Usage Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono">Uso Acumulado (4 Sem)</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">
                    {weeklyStats.reduce((sum, w) => sum + w.totalUsageHours, 0).toFixed(1)}
                    <span className="text-lg font-bold text-slate-400 ml-1">hrs</span>
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-2">Suma de tiempo de operación de toda la planta</p>
                </div>

                <div className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono">Promedio Semanal</p>
                  <h3 className="text-3xl font-black text-slate-900 mt-1">
                    {(weeklyStats.reduce((sum, w) => sum + w.totalUsageHours, 0) / 4).toFixed(1)}
                    <span className="text-lg font-bold text-slate-400 ml-1">hrs</span>
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-2">Tiempo de ejecución promedio por semana</p>
                </div>

                <div className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono">Semana Más Activa</p>
                  {(() => {
                    const maxWeek = [...weeklyStats].sort((a, b) => b.totalUsageHours - a.totalUsageHours)[0];
                    return (
                      <>
                        <h3 className="text-2xl font-black text-slate-900 mt-1 truncate">{maxWeek?.label}</h3>
                        <p className="text-xs font-bold text-cyan-600 mt-1">{maxWeek?.totalUsageHours} hrs registradas</p>
                      </>
                    );
                  })()}
                </div>

                <div className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono">Cambio Intersemanal</p>
                  {(() => {
                    const currentHours = weeklyStats[3]?.totalUsageHours || 0;
                    const prevHours = weeklyStats[2]?.totalUsageHours || 0;
                    const diff = currentHours - prevHours;
                    const percent = prevHours > 0 ? Math.round((diff / prevHours) * 100) : 0;
                    return (
                      <>
                        <h3 className={`text-3xl font-black mt-1 flex items-center gap-1.5 ${diff >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {diff >= 0 ? `+${percent}%` : `${percent}%`}
                          {diff >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        </h3>
                        <p className="text-xs font-medium text-slate-500 mt-1">Comparado con la semana anterior</p>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Weekly Usage Charts and Details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Interactive SVG Bar Chart for Weekly Usage */}
                <div className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 mb-1">
                      <Calendar className="text-indigo-500" size={20} />
                      Consumo Operativo Semanal
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mb-6">Comparativa de horas de uso acumuladas en las últimas 4 semanas</p>

                    <div className="relative w-full overflow-x-auto sm:overflow-visible">
                      {(() => {
                        const maxHours = Math.max(...weeklyStats.map(w => w.totalUsageHours), 10);
                        const chartW = 500;
                        const chartH = 220;
                        const padL = 40;
                        const padR = 20;
                        const padT = 30;
                        const padB = 40;
                        const graphW = chartW - padL - padR;
                        const graphH = chartH - padT - padB;

                        return (
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[400px] h-auto overflow-visible select-none">
                            {/* Grid lines */}
                            {Array.from({ length: 4 }).map((_, i) => {
                              const val = (maxHours / 3) * i;
                              const y = padT + graphH - (i / 3) * graphH;
                              return (
                                <g key={i} className="opacity-45">
                                  <line x1={padL} y1={y} x2={chartW - padR} y2={y} className="stroke-slate-100 stroke-[1.5]" strokeDasharray="4 4" />
                                  <text x={padL - 10} y={y + 4} className="fill-slate-400 font-mono text-[9px] font-black" textAnchor="end">{val.toFixed(0)}h</text>
                                </g>
                              );
                            })}

                            {/* Bars */}
                            {weeklyStats.map((wk, idx) => {
                              const colW = Math.floor(graphW / 4) - 24;
                              const x = padL + idx * (graphW / 4) + 12;
                              const barH = (wk.totalUsageHours / maxHours) * graphH;
                              const y = padT + graphH - barH;
                              const isHovered = hoveredWeeklyIndex === idx;
                              const isSelected = selectedWeekIndex === idx;

                              return (
                                <g
                                  key={idx}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredWeeklyIndex(idx)}
                                  onMouseLeave={() => setHoveredWeeklyIndex(null)}
                                  onClick={() => setSelectedWeekIndex(idx)}
                                >
                                  {isHovered && (
                                    <rect x={x - 4} y={y - 4} width={colW + 8} height={barH + 8} rx={10} className="fill-indigo-500/5 transition-all" />
                                  )}
                                  <motion.rect
                                    x={x}
                                    y={y}
                                    width={colW}
                                    height={Math.max(barH, 4)}
                                    rx={8}
                                    className={`transition-all duration-200 ${
                                      isSelected 
                                        ? 'fill-indigo-600 shadow-lg shadow-indigo-100' 
                                        : isHovered 
                                        ? 'fill-indigo-400' 
                                        : 'fill-slate-200 hover:fill-indigo-300'
                                    }`}
                                    initial={{ height: 0, y: padT + graphH }}
                                    animate={{ height: Math.max(barH, 4), y }}
                                  />
                                  <text x={x + colW / 2} y={y - 8} className={`font-mono text-[10px] font-black text-center ${isSelected ? 'fill-indigo-600 font-extrabold' : 'fill-slate-500'}`} textAnchor="middle">{wk.totalUsageHours}h</text>
                                  <text x={x + colW / 2} y={chartH - 20} className={`font-sans text-[10px] font-black text-center capitalize ${isSelected ? 'fill-indigo-950 font-extrabold' : 'fill-slate-500'}`} textAnchor="middle">{wk.label}</text>
                                  <text x={x + colW / 2} y={chartH - 8} className="fill-slate-400 font-sans text-[8px] font-bold text-center" textAnchor="middle">{wk.rangeLabel}</text>
                                </g>
                              );
                            })}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                      <span>Haz clic en una barra para filtrar el desglose de equipos de esa semana específica.</span>
                    </span>
                  </div>
                </div>

                {/* Equipment details for the selected week */}
                <div className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 flex flex-col justify-between">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 mb-1">
                      <Cpu className="text-cyan-500" size={18} />
                      Detalle: {weeklyStats[selectedWeekIndex]?.label}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mb-4">Horas de uso de cada máquina en este rango</p>

                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {equipments.map(eq => {
                        const hrs = weeklyStats[selectedWeekIndex]?.equipmentHours[eq.id] || 0;
                        return (
                          <div key={eq.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${eq.disabled ? 'bg-red-400' : eq.status === 'on' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              <span className="text-xs font-bold text-slate-800 truncate">{eq.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-slate-900">{hrs}h</span>
                              <span className="text-[10px] text-slate-400 font-bold">({weeklyStats[selectedWeekIndex]?.totalUsageHours > 0 ? Math.round((hrs / weeklyStats[selectedWeekIndex].totalUsageHours) * 100) : 0}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 text-xs font-semibold text-slate-500 flex justify-between">
                    <span>Total Semana:</span>
                    <strong className="text-indigo-600 font-black">{weeklyStats[selectedWeekIndex]?.totalUsageHours} hrs</strong>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Hourly Usage Analysis */}
              <div className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Clock className="text-cyan-500" size={20} />
                      Distribución de Uso por Hora del Día (Ciclo de 24h)
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">Uso acumulado en horas en cada franja horaria para planificar eficiencia energética</p>
                  </div>
                  
                  {/* Insights indicators */}
                  {(() => {
                    const sorted = [...hourlyStats.hourlyUsage].sort((a, b) => b.hours - a.hours);
                    const peak = sorted[0];
                    const offPeak = sorted[sorted.length - 1];
                    return (
                      <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600">
                        <span className="flex items-center gap-1.5 bg-cyan-50 border border-cyan-100 p-2 rounded-xl">
                          🔥 Pico: <strong className="text-cyan-700">{peak?.label} ({peak?.hours}h)</strong>
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 p-2 rounded-xl">
                          ❄️ Mínimo: <strong className="text-slate-600">{offPeak?.label} ({offPeak?.hours}h)</strong>
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* 24-Hour Column Chart */}
                <div className="relative w-full overflow-x-auto select-none py-4">
                  {(() => {
                    const maxVal = Math.max(...hourlyStats.hourlyUsage.map(h => h.hours), 1);
                    const chartW = 750;
                    const chartH = 200;
                    const padL = 30;
                    const padR = 20;
                    const padT = 20;
                    const padB = 30;
                    const graphW = chartW - padL - padR;
                    const graphH = chartH - padT - padB;

                    return (
                      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[700px] h-auto overflow-visible">
                        {/* Grid lines */}
                        {Array.from({ length: 4 }).map((_, i) => {
                          const val = (maxVal / 3) * i;
                          const y = padT + graphH - (i / 3) * graphH;
                          return (
                            <line key={i} x1={padL} y1={y} x2={chartW - padR} y2={y} className="stroke-slate-100 stroke-[1]" strokeDasharray="3 3" />
                          );
                        })}

                        {/* 24 Columns */}
                        {hourlyStats.hourlyUsage.map((item, idx) => {
                          const colW = Math.floor(graphW / 24) - 4;
                          const x = padL + idx * (graphW / 24) + 2;
                          const barH = (item.hours / maxVal) * graphH;
                          const y = padT + graphH - barH;
                          const isHovered = hoveredHourlyIndex === idx;

                          return (
                            <g
                              key={idx}
                              onMouseEnter={() => setHoveredHourlyIndex(idx)}
                              onMouseLeave={() => setHoveredHourlyIndex(null)}
                              className="cursor-pointer"
                            >
                              <rect
                                x={x}
                                y={y}
                                width={colW}
                                height={Math.max(barH, 3)}
                                rx={3}
                                className={`transition-colors duration-150`}
                                style={{ fill: isHovered ? '#22d3ee' : 'url(#cyan-grad)' }}
                              />
                              {isHovered && (
                                <text x={x + colW / 2} y={Math.max(12, y - 6)} className="fill-slate-900 font-mono text-[9px] font-black text-center" textAnchor="middle">{item.hours}h</text>
                              )}
                              <text x={x + colW / 2} y={chartH - 12} className={`font-mono text-[8px] font-black text-center ${isHovered ? 'fill-slate-900 font-extrabold' : 'fill-slate-400'}`} textAnchor="middle">{item.hour}</text>
                            </g>
                          );
                        })}
                        <defs>
                          <linearGradient id="cyan-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                      </svg>
                    );
                  })()}
                </div>

                {/* Dynamic Information / Efficiency Tips based on active hours */}
                <div className="mt-6 p-5 rounded-3xl bg-cyan-50/40 border border-cyan-100/60 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-cyan-950 mb-1">Diagnóstico Operativo de Distribución Diaria</h5>
                    <p className="text-xs text-cyan-800 leading-relaxed font-semibold">
                      El análisis demuestra la distribución de energía horaria de la planta. Para optimizar la vida útil del equipo y reducir costos en tarifas eléctricas por demanda máxima, se recomienda espaciar los ciclos de lavado o encendido alterno fuera de la hora pico detectada (<strong>{hourlyStats.hourlyUsage.sort((a, b) => b.hours - a.hours)[0]?.label}</strong>).
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Incidents Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total Incidents */}
            <div id="incident-card-total" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-[4rem]" />
              <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center mb-4">
                <AlertTriangle size={20} />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Eventos Eléctricos</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{totalCortes + totalFallas}</h3>
              <p className="text-xs font-medium text-slate-500 mt-2 font-semibold">Cortes e inestabilidades del suministro</p>
            </div>

            {/* Cortes count */}
            <div id="incident-card-cortes" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-[4rem]" />
              <div className="w-10 h-10 rounded-xl bg-red-100/80 text-red-600 flex items-center justify-center mb-4">
                <ZapOff size={20} />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cortes de Energía</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{totalCortes}</h3>
              <p className="text-xs font-medium text-red-500 mt-2 font-bold">Apagones totales de suministro</p>
            </div>

            {/* Fallas count */}
            <div id="incident-card-fallas" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-[4rem]" />
              <div className="w-10 h-10 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center mb-4">
                <AlertTriangle size={20} />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Fallas de Voltaje</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{totalFallas}</h3>
              <p className="text-xs font-medium text-orange-600 mt-2 font-bold">Inestabilidades / bajones de tensión</p>
            </div>

            {/* Current Power State */}
            <div id="incident-card-power" className="bg-transparent p-6 rounded-[2rem] border border-slate-200/60 relative overflow-hidden group transition-all">
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-[4rem] group-hover:scale-110 transition-transform ${
                currentPowerState === 'ok' ? 'bg-emerald-500/5' : currentPowerState === 'falla' ? 'bg-orange-500/5' : 'bg-red-500/5'
              }`} />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                currentPowerState === 'ok' 
                  ? 'bg-emerald-100 text-emerald-600' 
                  : currentPowerState === 'falla' 
                  ? 'bg-orange-100 text-orange-600 animate-pulse' 
                  : 'bg-red-100 text-red-600 animate-pulse'
              }`}>
                {currentPowerState === 'ok' ? <ShieldCheck size={20} /> : currentPowerState === 'falla' ? <AlertTriangle size={20} /> : <ZapOff size={20} />}
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Suministro Actual</p>
              <h3 className={`text-xl font-black mt-1 uppercase tracking-wide ${
                currentPowerState === 'ok' ? 'text-emerald-600' : currentPowerState === 'falla' ? 'text-orange-500' : 'text-red-600'
              }`}>
                {currentPowerState === 'ok' ? 'Estable (OK)' : currentPowerState === 'falla' ? 'Falla Activa' : 'Corte Activo'}
              </h3>
              <p className="text-xs font-medium text-slate-500 mt-2 font-semibold">Estado de la red eléctrica</p>
            </div>
          </div>

          {/* Incidents Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 7-Day Trend SVG Line Chart */}
            <div id="trend-chart-container" className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Calendar className="text-cyan-500" size={20} />
                      Tendencia de Incidencias (Últimos 7 Días)
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">Volumen acumulado de cortes y fallas eléctricas por día</p>
                  </div>

                  {/* Trend Indicator */}
                  <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-1 bg-cyan-500 rounded" />
                      Línea de Tendencia
                    </span>
                  </div>
                </div>

                <div className="relative w-full overflow-x-auto sm:overflow-visible">
                  <svg viewBox={`0 0 ${trendWidth} ${trendHeight}`} className="w-full min-w-[500px] h-auto overflow-visible select-none">
                    {/* Background grid lines along Y */}
                    {Array.from({ length: 4 }).map((_, i) => {
                      const val = (trendMaxVal / 3) * i;
                      const y = trendPaddingTop + trendGraphHeight - (i / 3) * trendGraphHeight;
                      return (
                        <g key={i} className="opacity-40">
                          <line
                            x1={trendPaddingLeft}
                            y1={y}
                            x2={trendWidth - trendPaddingRight}
                            y2={y}
                            className="stroke-slate-100 stroke-[1.5]"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={trendPaddingLeft - 10}
                            y={y + 4}
                            className="fill-slate-400 font-mono text-[10px] font-black text-right"
                            textAnchor="end"
                          >
                            {val.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Shaded gradient area below curve */}
                    {trendAreaPath && (
                      <path
                        d={trendAreaPath}
                        className="fill-url(#trend-gradient-area) opacity-20"
                      />
                    )}

                    {/* Smooth glowing trend line */}
                    {trendLinePath && (
                      <path
                        d={trendLinePath}
                        className="fill-none stroke-cyan-500 stroke-[3.5]"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Circular points for days */}
                    {trendPoints.map((pt, idx) => {
                      const isHovered = hoveredTrendIndex === idx;
                      return (
                        <g
                          key={idx}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredTrendIndex(idx)}
                          onMouseLeave={() => setHoveredTrendIndex(null)}
                        >
                          {/* Outer glow ring on hover */}
                          {isHovered && (
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={12}
                              className="fill-cyan-500/15 animate-ping"
                            />
                          )}

                          {/* Inner circle point */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isHovered ? 7 : 5}
                            className="fill-white stroke-cyan-500 stroke-[3] transition-all"
                          />

                          {/* Invisible larger hover trigger area */}
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={24}
                            className="fill-transparent"
                          />

                          {/* Daily Label on X Axis */}
                          <text
                            x={pt.x}
                            y={trendHeight - 15}
                            className={`font-sans text-[10px] font-black capitalize transition-all ${
                              isHovered ? 'fill-slate-900 font-extrabold' : 'fill-slate-400'
                            }`}
                            textAnchor="middle"
                          >
                            {pt.dayLabel}
                          </text>
                        </g>
                      );
                    })}

                    {/* SVG Gradient definitions */}
                    <defs>
                      <linearGradient id="trend-gradient-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* Dynamic Trend Tooltip */}
              <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 min-h-[56px] flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  {hoveredTrendIndex !== null ? (
                    <span className="flex items-center gap-2">
                      <Calendar size={14} className="text-cyan-500" />
                      <span>
                        El <strong className="text-slate-800">{trendPoints[hoveredTrendIndex].dateFormatted}</strong> hubo{' '}
                        <strong className="text-slate-950">{trendPoints[hoveredTrendIndex].total} incidencias</strong>:{' '}
                        <span className="text-red-500 font-black">{trendPoints[hoveredTrendIndex].cortes} cortes</span> y{' '}
                        <span className="text-orange-500 font-black">{trendPoints[hoveredTrendIndex].fallas} fallas</span>.
                      </span>
                    </span>
                  ) : (
                    "Pasa el cursor sobre los puntos de la línea de tiempo para ver la cantidad exacta de fallas y cortes cada día."
                  )}
                </span>
                <span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest hidden sm:inline">Gráfico Histórico</span>
              </div>
            </div>

            {/* Side summary and distribution analysis */}
            <div id="incidents-analysis-donut" className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 flex flex-col justify-between">
              <div>
                <h4 className="text-lg font-black text-slate-900 tracking-tight mb-1">Distribución de Eventos</h4>
                <p className="text-xs text-slate-500 font-medium mb-8">Participación según el tipo de desconexión</p>

                {totalCortes === 0 && totalFallas === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <Activity size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-bold uppercase tracking-wider">Sin incidencias registradas</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Visual Pie-style Horizontal Distribution */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-xs font-black uppercase tracking-wider text-slate-400">
                        <span className="text-red-600 font-black">Cortes ({totalCortes})</span>
                        <span className="text-orange-500 font-black">Fallas ({totalFallas})</span>
                      </div>
                      
                      {/* Interactive stacked bar representing percentages */}
                      <div className="h-5 w-full bg-slate-50 border border-slate-100 rounded-full flex overflow-hidden shadow-inner p-0.5">
                        <div 
                          style={{ width: `${Math.max(5, Math.round((totalCortes / (totalCortes + totalFallas || 1)) * 100))}%` }} 
                          className="bg-gradient-to-r from-red-500 to-rose-600 h-full rounded-l-full transition-all duration-500" 
                        />
                        <div 
                          style={{ width: `${Math.max(5, Math.round((totalFallas / (totalCortes + totalFallas || 1)) * 100))}%` }} 
                          className="bg-gradient-to-r from-orange-400 to-amber-500 h-full rounded-r-full transition-all duration-500" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-center">
                      <div className="p-3 bg-red-50 border border-red-100 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-8 h-8 bg-red-500/5 rounded-bl-[1rem]" />
                        <p className="text-2xl font-black text-red-600">{totalCortes}</p>
                        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-0.5">Cortes de Luz</p>
                      </div>
                      <div className="p-3 bg-orange-50 border border-orange-100 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-8 h-8 bg-orange-500/5 rounded-bl-[1rem]" />
                        <p className="text-2xl font-black text-orange-600">{totalFallas}</p>
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-0.5">Fallas Voltaje</p>
                      </div>
                    </div>

                    {/* Recovery & Stability metrics */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600 space-y-2.5">
                      <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b border-slate-200 pb-1.5 mb-1">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        Estadísticas de Resolución
                      </p>
                      <p className="flex justify-between">
                        <span>Cortes resueltos:</span>
                        <strong className="text-slate-800">{outages.filter(o => o.type === 'corte' && o.end !== null).length}</strong>
                      </p>
                      <p className="flex justify-between">
                        <span>Fallas resueltas:</span>
                        <strong className="text-slate-800">{outages.filter(o => o.type === 'falla' && o.end !== null).length}</strong>
                      </p>
                      <p className="flex justify-between text-red-500 font-bold bg-red-500/5 p-1 px-1.5 rounded-lg border border-red-100/30">
                        <span>Incidencias sin resolver:</span>
                        <span>{outages.filter(o => o.end === null).length}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-3">
                <Clock size={18} className="text-amber-600 shrink-0" />
                <p className="text-xs font-bold text-amber-800 leading-relaxed">
                  Las duraciones se calculan automáticamente emparejando eventos de falla/corte con el siguiente restablecimiento (OK).
                </p>
              </div>
            </div>
          </div>

          {/* List of past Outages */}
          <div id="outages-list-container" className="bg-transparent p-6 sm:p-8 rounded-[2.5rem] border border-slate-200/60 flex flex-col max-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Activity size={20} className="text-cyan-500" />
                  Registro Detallado de Interrupciones Eléctricas
                </h4>
                <p className="text-xs text-slate-500 font-medium">Historial calculado de desconexiones y su duración en tiempo real</p>
              </div>
            </div>

            <div className="overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {outages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Zap size={40} className="stroke-1 mb-3" />
                  <p className="text-xs font-bold uppercase tracking-wider">No hay cortes o fallas registrados</p>
                </div>
              ) : (
                outages.map((outage) => (
                  <div key={outage.id} className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    {/* Left icon status */}
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                      outage.type === 'corte' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-orange-50 text-orange-600 border border-orange-100'
                    }`}>
                      {outage.type === 'corte' ? <ZapOff size={20} /> : <AlertTriangle size={20} />}
                      <span className="text-[8px] font-black uppercase mt-1">
                        {outage.type === 'corte' ? 'Corte' : 'Falla'}
                      </span>
                    </div>

                    {/* Content details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                        <h5 className="font-bold text-sm text-slate-900 truncate">
                          {outage.type === 'corte' ? 'Corte de Luz' : 'Falla / Fluctuación Eléctrica'}
                        </h5>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full self-start sm:self-auto ${
                          outage.end 
                            ? 'bg-slate-100 text-slate-600' 
                            : outage.type === 'corte' 
                            ? 'bg-red-100 text-red-600 animate-pulse' 
                            : 'bg-orange-100 text-orange-600 animate-pulse'
                        }`}>
                          {outage.end ? formatDuration(outage.durationMinutes) : 'Activo'}
                        </span>
                      </div>

                      {/* Timing steps */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-2 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {format(outage.start, "dd 'de' MMMM 'a' HH:mm", { locale: es })}
                        </span>
                        {outage.end && (
                          <>
                            <ArrowRight size={10} className="text-slate-300" />
                            <span className="flex items-center gap-1">
                              Restablecido: {format(outage.end, 'HH:mm', { locale: es })}
                            </span>
                          </>
                        )}
                      </div>

                      {outage.details && (
                        <p className="mt-2 text-xs text-slate-600 font-medium italic border-l-2 border-slate-200 pl-2">
                          "{outage.details}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
