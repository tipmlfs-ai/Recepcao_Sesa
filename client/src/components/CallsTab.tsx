import React, { useEffect, useState } from 'react';
import { Clock, User, ArrowRight, History, Bell } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';
import { supabase } from '../config/supabaseConfig';

interface CallRecord {
    id: string;
    code: string | null;
    timestamp: string;
    ticketStatus: string | null;
    citizen: { name: string };
    sector: { name: string };
    calledAt?: string | null;
    calledToWaitingRoomAt?: string | null;
}

const CallsTab: React.FC = () => {
    const [calls, setCalls] = useState<CallRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTodayCalls = async () => {
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const todayObj = new Date();
            const year = todayObj.getFullYear();
            const month = String(todayObj.getMonth() + 1).padStart(2, '0');
            const day = String(todayObj.getDate()).padStart(2, '0');
            const todayFilter = `${year}-${month}-${day}`;
            const res = await fetch(`${API_URL}/api/visits?filterType=custom&startDate=${todayFilter}&endDate=${todayFilter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data: CallRecord[] = await res.json();
                // Filter all visits that have been called (have a code)
                const filtered = data
                    .filter(v => {
                        if (!v.code) return false;
                        // Determine if this visit was called from reception
                        // If it has calledToWaitingRoomAt, that was the call from reception.
                        // If it doesn't, but has calledAt, then calledAt was the direct call from reception.
                        const hasReceptionCall = v.calledToWaitingRoomAt || (v.calledAt && !v.calledToWaitingRoomAt);
                        return !!hasReceptionCall;
                    })
                    .sort((a, b) => {
                        const timeA = new Date(a.calledToWaitingRoomAt || a.calledAt || a.timestamp).getTime();
                        const timeB = new Date(b.calledToWaitingRoomAt || b.calledAt || b.timestamp).getTime();
                        return timeB - timeA;
                    });
                setCalls(filtered);
            }
        } catch (error) {
            console.error('Failed to fetch calls history', error);
            toast.error('Erro ao buscar histórico de chamados');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodayCalls();
        const interval = setInterval(fetchTodayCalls, 60000); // Polling as fallback (less frequent)

        const channel = supabase
            .channel('calls-tab')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'Visit' },
                () => {
                    fetchTodayCalls();
                }
            )
            .subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, []);

    if (loading && calls.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <p>Carregando histórico de chamados...</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Bell className="text-indigo-400 w-6 h-6" />
                        Histórico de Chamados (Hoje)
                    </h2>
                    <p className="text-slate-400 text-sm">Todos os cidadãos convocados pelos setores no dia de hoje.</p>
                </div>
                <button
                    onClick={fetchTodayCalls}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                    title="Atualizar"
                >
                    <Clock className="w-5 h-5" />
                </button>
            </div>

            {calls.length === 0 ? (
                <div className="bg-slate-800/30 border-2 border-dashed border-slate-700/50 rounded-2xl py-12 flex flex-col items-center text-slate-500">
                    <History className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-lg">Nenhum chamado realizado até o momento hoje.</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {calls.map((call) => (
                        <div
                            key={call.id}
                            className="group bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between transition-all hover:bg-slate-800 border-l-4 border-l-indigo-500"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 rounded-lg bg-indigo-600/20 text-indigo-400">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-bold text-lg">{call.code}</span>
                                        <ArrowRight className="w-3 h-3 text-slate-600" />
                                        <span className="text-indigo-300 font-semibold">{call.sector.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                                        <User className="w-3.5 h-3.5" />
                                        <span>{call.citizen.name}</span>
                                        <span className="text-slate-600">•</span>
                                        <span className="font-mono">
                                            {call.calledToWaitingRoomAt || call.calledAt ? (
                                                <>Chamado em {new Date(call.calledToWaitingRoomAt || call.calledAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>
                                            ) : (
                                                <>Registrado em {new Date(call.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                    call.ticketStatus === 'IN_SERVICE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                                    call.ticketStatus === 'IN_WAITING_ROOM' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    call.ticketStatus === 'NO_SHOW' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                    'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                }`}>
                                    {call.ticketStatus === 'IN_SERVICE' ? 'Em Atendimento' : 
                                     call.ticketStatus === 'IN_WAITING_ROOM' ? 'Na Sala de Espera' :
                                     call.ticketStatus === 'FINISHED' ? 'Finalizado' :
                                     call.ticketStatus === 'NO_SHOW' ? 'Não Compareceu' :
                                     'Aguardando'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CallsTab;
