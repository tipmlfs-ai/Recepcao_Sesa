import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeStatus } from '../useRealTimeStatus';
import { type Sector } from '../types';
import { Unlock, Lock, LogOut, Search, Users, LayoutDashboard, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabaseConfig';
import AttendanceTab from '../components/AttendanceTab';
import HistoryTab from '../components/HistoryTab';
import CallFlowTab from '../components/CallFlowTab';
import CallsTab from '../components/CallsTab';
import CallNotificationCard from '../components/CallNotificationCard';
import { Bell, CheckCheck } from 'lucide-react';

const SectorCard = ({ sector }: { sector: Sector }) => {
    const getStatusConfig = (status: Sector['status']) => {
        switch (status) {
            case 'AVAILABLE':
                return {
                    icon: <Unlock className="w-14 h-14 text-emerald-400 group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />,
                    color: 'border-emerald-500/20 bg-emerald-500/5',
                    text: 'LIVRE',
                    textColor: 'text-emerald-400',
                    shadow: 'hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.2)]'
                };
            case 'BUSY':
                return {
                    icon: <Lock className="w-14 h-14 text-rose-400 group-hover:scale-110 transition-transform duration-500" />,
                    color: 'border-rose-500/20 bg-rose-500/5',
                    text: 'OCUPADO',
                    textColor: 'text-rose-400',
                    shadow: 'hover:shadow-[0_20px_40px_-15px_rgba(244,63,94,0.2)]'
                };
            case 'AWAY':
                return {
                    icon: <Lock className="w-14 h-14 text-amber-400 group-hover:scale-110 transition-transform duration-500" />,
                    color: 'border-amber-500/20 bg-amber-500/5',
                    text: 'AUSENTE',
                    textColor: 'text-amber-400',
                    shadow: 'hover:shadow-[0_20px_40px_-15px_rgba(245,158,11,0.2)]'
                };
            default:
                return {
                    icon: null,
                    color: 'border-slate-800 bg-slate-800/50',
                    text: 'DESCONHECIDO',
                    textColor: 'text-slate-500',
                    shadow: ''
                };
        }
    };

    const config = getStatusConfig(sector.status);

    return (
        <div className={`rounded-[2rem] p-8 flex flex-col items-center justify-center text-center border transition-all duration-500 relative backdrop-blur-xl group ${config.color} ${config.shadow} hover:-translate-y-2`}>
            {/* Queue Badge Indicator */}
            {sector.queueCount > 0 && (
                <div className="absolute -top-4 -right-4 bg-gradient-to-br from-indigo-500 to-purple-600 border-[6px] border-slate-900 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl font-bold transition-transform group-hover:scale-110">
                    <Users className="w-4 h-4 mr-0.5" /> <span className="text-lg">{sector.queueCount}</span>
                </div>
            )}

            <h2 className="text-xl font-bold mb-8 text-white tracking-wide">{sector.name}</h2>

            <div className="mb-6 relative">
                <div className={`absolute inset-0 blur-2xl opacity-40 mix-blend-screen bg-current ${config.textColor}`}></div>
                <div className="relative bg-slate-900/50 p-6 rounded-3xl border border-white/5 shadow-inner">
                    {config.icon}
                </div>
            </div>

            <span className={`text-[11px] font-black tracking-[0.3em] uppercase mb-8 ${config.textColor}`}>
                {config.text}
            </span>

            {/* Queue Display */}
            <div className="mt-6 flex items-center justify-center gap-3 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-700/50 w-full">
                <Users className="w-5 h-5 text-indigo-400 opacity-70" />
                <span className="text-sm text-slate-400 font-medium">
                    Fila de espera: <strong className="text-white text-lg ml-1">{sector.queueCount || 0}</strong>
                </span>
            </div>
        </div>
    );
};

// Extracted Panel Component
const PanelTab = ({ sectors }: { sectors: Sector[] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<Sector['status'] | 'ALL'>('ALL');

    const filteredSectors = useMemo(() => {
        return sectors.filter(sector => {
            if (sector.isVisibleOnPanel === false) return false;
            const matchesSearch = sector.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || sector.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [sectors, searchTerm, statusFilter]);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-8 flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Pesquisar por nome do setor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${statusFilter === 'ALL' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Todos ({sectors.length})
                    </button>
                    <button
                        onClick={() => setStatusFilter('AVAILABLE')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${statusFilter === 'AVAILABLE' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Livre
                    </button>
                    <button
                        onClick={() => setStatusFilter('BUSY')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${statusFilter === 'BUSY' ? 'bg-rose-500/20 border-rose-500 text-rose-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Ocupado
                    </button>
                    <button
                        onClick={() => setStatusFilter('AWAY')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${statusFilter === 'AWAY' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Ausente
                    </button>
                </div>
            </div>

            <main>
                {sectors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-400 text-xl animate-pulse">Sincronizando com os setores...</p>
                    </div>
                ) : filteredSectors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="bg-slate-800 p-6 rounded-full mb-4 border border-slate-700">
                            <Search className="w-8 h-8 text-slate-500" />
                        </div>
                        <p className="text-slate-400 text-xl">Nenhum setor encontrado com esses filtros.</p>
                        <button onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }} className="mt-4 text-indigo-400 hover:text-indigo-300 underline font-medium">
                            Limpar filtros
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredSectors.map((sector) => (
                            <SectorCard key={sector.id} sector={sector} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const { sectors } = useRealTimeStatus();
    const { logout } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<'attendance' | 'panel' | 'history' | 'flow' | 'calls'>('attendance');
    const [hasNewCall, setHasNewCall] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Listen for new calls to alert the attendant with a badge on the tab
    useEffect(() => {
        const channel = supabase
            .channel('dashboard-new-calls-alert')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'Visit' },
                (payload) => {
                    const updated = payload.new as any;
                    
                    // Find the sector in our existing state to check its configuration
                    const visitSector = sectors.find(s => s.id === updated.sectorId);
                    if (!visitSector) return;

                    // SENIOR LOGIC: Only alert if it's the INITIAL move from reception to sector
                    // 1. If status is IN_WAITING_ROOM, it's always from reception.
                    // 2. If status is IN_SERVICE, it's from reception ONLY IF the sector has no waiting room.
                    const isReceptionToSectorCall = 
                        updated.ticketStatus === 'IN_WAITING_ROOM' || 
                        (updated.ticketStatus === 'IN_SERVICE' && !visitSector.hasWaitingRoom);

                    if (isReceptionToSectorCall) {
                        // Only alert if we're not already on the calls tab
                        if (activeTab !== 'calls') {
                            setHasNewCall(true);
                        }
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [activeTab]);

    const handleTabChange = (tab: typeof activeTab) => {
        setActiveTab(tab);
        if (tab === 'calls') setHasNewCall(false);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-50 p-6 md:p-10 font-sans selection:bg-indigo-500/30 print:p-0 print:bg-white">
            <div className="max-w-[1600px] mx-auto print:hidden">
                <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                    <div className="flex items-center gap-5">
                        <div className="bg-white p-3 rounded-2xl shadow-lg shadow-white/5">
                            <img src="/logo.png" alt="Logo Prefeitura" className="h-12 w-[100px] object-contain" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-1">
                                Recepção Sesa
                            </h1>
                            <p className="text-slate-400 text-sm font-medium">Gestão de Fluxo e Atendimentos</p>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800/50 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/30 rounded-xl text-slate-300 hover:text-rose-400 transition-all font-bold text-sm shadow-sm"
                    >
                        Sair do Sistema <LogOut className="w-4 h-4 ml-1" />
                    </button>
                </header>

                {/* TABS NAVIGATION */}
                <div className="flex flex-wrap items-center gap-2 mb-10 bg-slate-800/40 p-2 rounded-2xl border border-slate-700/50 backdrop-blur-md w-fit shadow-xl">
                    <button
                        onClick={() => handleTabChange('attendance')}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        <UserCheck className="w-4 h-4" /> Atendimento
                    </button>
                    <button
                        onClick={() => handleTabChange('panel')}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'panel' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        <LayoutDashboard className="w-4 h-4" /> Painel de Setores
                    </button>
                    <button
                        onClick={() => handleTabChange('calls')}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 relative ${activeTab === 'calls' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        <Bell className={`w-4 h-4 ${hasNewCall && activeTab !== 'calls' ? 'text-amber-400 animate-bounce' : ''}`} /> 
                        Chamados
                        {hasNewCall && activeTab !== 'calls' && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-slate-800 animate-pulse"></span>
                        )}
                    </button>
                    <button
                        onClick={() => handleTabChange('flow')}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'flow' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        <CheckCheck className="w-4 h-4" /> Finalizados
                    </button>
                    <button
                        onClick={() => handleTabChange('history')}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        <Search className="w-4 h-4" /> Pesquisa & Métricas
                    </button>
                </div>

                {/* GLOBAL NOTIFICATION POP-UP */}
                <CallNotificationCard />

                {/* TAB CONTENT */}
                <div className="transition-all">
                    {activeTab === 'attendance' && <AttendanceTab sectors={sectors} />}
                    {activeTab === 'panel' && <PanelTab sectors={sectors} />}
                    {activeTab === 'calls' && <CallsTab />}
                    {activeTab === 'flow' && <CallFlowTab />}
                    {activeTab === 'history' && <HistoryTab />}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
