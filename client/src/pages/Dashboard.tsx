import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeStatus } from '../useRealTimeStatus';
import { type Sector } from '../types';
import { Unlock, Lock, LogOut, Search, Users, Plus, Minus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const SectorCard = ({ sector, onUpdateQueue }: { sector: Sector, onUpdateQueue: (id: string, action: 'add' | 'remove') => void }) => {
    const getStatusConfig = (status: Sector['status']) => {
        switch (status) {
            case 'AVAILABLE':
                return {
                    icon: <Unlock className="w-16 h-16 text-emerald-500 fill-emerald-500/20" />,
                    color: 'border-emerald-500/30 bg-emerald-500/5',
                    text: 'LIVRE',
                    textColor: 'text-emerald-500',
                    shadow: 'shadow-[0_8px_32px_rgba(16,185,129,0.15)]'
                };
            case 'BUSY':
                return {
                    icon: <Lock className="w-16 h-16 text-rose-500 fill-rose-500/20" />,
                    color: 'border-rose-500/30 bg-rose-500/5',
                    text: 'OCUPADO',
                    textColor: 'text-rose-500',
                    shadow: 'shadow-[0_8px_32px_rgba(244,63,94,0.15)]'
                };
            case 'AWAY':
                return {
                    icon: <Lock className="w-16 h-16 text-amber-500 fill-amber-500/20" />,
                    color: 'border-amber-500/30 bg-amber-500/5',
                    text: 'AUSENTE',
                    textColor: 'text-amber-500',
                    shadow: 'shadow-[0_8px_32px_rgba(245,158,11,0.15)]'
                };
            default:
                return {
                    icon: null,
                    color: 'border-slate-700 bg-slate-800',
                    text: 'DESCONHECIDO',
                    textColor: 'text-slate-400',
                    shadow: ''
                };
        }
    };

    const config = getStatusConfig(sector.status);

    return (
        <div className={`rounded-2xl p-6 flex flex-col items-center justify-center text-center border transition-all duration-300 relative ${config.color} ${config.shadow} hover:-translate-y-1`}>
            {/* Queue Badge Indicator */}
            {sector.queueCount > 0 && (
                <div className="absolute -top-3 -right-3 bg-indigo-600 border-4 border-slate-900 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg font-bold">
                    <Users className="w-4 h-4 mr-1 opacity-70" /> {sector.queueCount}
                </div>
            )}

            <h2 className="text-xl font-semibold mb-6 text-slate-100">{sector.name}</h2>
            <div className="mb-4">
                {config.icon}
            </div>
            <span className={`text-lg font-bold tracking-widest ${config.textColor}`}>
                {config.text}
            </span>

            {/* Queue Controls */}
            <div className="mt-6 flex items-center gap-3 bg-slate-900/50 p-2 rounded-xl border border-slate-700/50 w-full justify-between">
                <button
                    onClick={() => onUpdateQueue(sector.id, 'remove')}
                    disabled={!sector.queueCount || sector.queueCount === 0}
                    className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
                    title="Remover da fila"
                >
                    <Minus className="w-4 h-4" />
                </button>

                <span className="text-sm text-slate-400 font-medium whitespace-nowrap">
                    Fila: <strong className="text-white text-base ml-1">{sector.queueCount || 0}</strong>
                </span>

                <button
                    onClick={() => onUpdateQueue(sector.id, 'add')}
                    className="p-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg border border-indigo-500/30 transition-colors"
                    title="Adicionar à fila"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const { sectors, updateQueue } = useRealTimeStatus();
    const { logout } = useAuth();
    const navigate = useNavigate();

    // Search & Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<Sector['status'] | 'ALL'>('ALL');

    // Derived filtered data
    const filteredSectors = useMemo(() => {
        return sectors.filter(sector => {
            const matchesSearch = sector.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || sector.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [sectors, searchTerm, statusFilter]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-50 p-6 md:p-10">
            <div className="max-w-[1600px] mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">
                            Painel Geral de Salas
                        </h1>
                        <p className="text-slate-400 text-lg">Recepção Sesa - Atualizado em tempo real</p>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Sair do Painel</span>
                    </button>
                </header>

                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-8 flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Pesquisar por nome do setor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${statusFilter === 'ALL' ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
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
                            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-400 text-xl animate-pulse">Sincronizando com os setores...</p>
                        </div>
                    ) : filteredSectors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="bg-slate-800 p-6 rounded-full mb-4">
                                <Search className="w-8 h-8 text-slate-500" />
                            </div>
                            <p className="text-slate-400 text-xl">Nenhum setor encontrado com esses filtros.</p>
                            <button onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }} className="mt-4 text-blue-400 hover:text-blue-300 underline">
                                Limpar filtros
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredSectors.map((sector) => (
                                <SectorCard key={sector.id} sector={sector} onUpdateQueue={updateQueue} />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Dashboard;
