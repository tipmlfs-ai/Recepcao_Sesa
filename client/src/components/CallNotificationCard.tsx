import React, { useEffect, useState, useRef } from 'react';
import { type Ticket } from '../types';
import { supabase } from '../config/supabaseConfig';
import { Bell, X } from 'lucide-react';

/**
 * Painel de Notificação de Chamada — exibido na tela da Recepção.
 * Quando um setor chama o próximo (ticketStatus → IN_SERVICE),
 * este card aparece com: Nome, CPF e Código do Ticket.
 * Também toca o som específico do setor.
 */
const CallNotificationCard: React.FC = () => {
    const [notification, setNotification] = useState<Ticket | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const channel = supabase
            .channel('visit-call-notifications')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'Visit' },
                async (payload) => {
                    const updated = payload.new as any;
                    if (updated.ticketStatus === 'IN_SERVICE') {
                        try {
                            const token = localStorage.getItem('@RecepcaoSesa:token');
                            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

                            // Fetch Citizen and Sector details in parallel
                            const [citizenRes, sectorRes] = await Promise.all([
                                fetch(`${apiUrl}/api/citizens/${updated.citizenId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                                fetch(`${apiUrl}/api/sectors/${updated.sectorId}`, { headers: { 'Authorization': `Bearer ${token}` } })
                            ]);

                            const citizen = await citizenRes.json();
                            const sector = await sectorRes.json();

                            setNotification({
                                ...updated,
                                citizen: { cpf: citizen.cpf, name: citizen.name },
                                sector: { id: sector.id, name: sector.name, soundUrl: sector.soundUrl }
                            });

                            // Play sound
                            if (sector.soundUrl) {
                                if (audioRef.current) audioRef.current.pause();
                                audioRef.current = new Audio(sector.soundUrl);
                                audioRef.current.play().catch(() => { });
                            } else {
                                playDefaultChime();
                            }
                        } catch (error) {
                            console.error('Error fetching call details:', error);
                        }
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const playDefaultChime = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const playTone = (freq: number, start: number, dur: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.4, start + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
                osc.start(start);
                osc.stop(start + dur);
            };
            playTone(880, ctx.currentTime, 0.4);
            playTone(660, ctx.currentTime + 0.3, 0.4);
            playTone(440, ctx.currentTime + 0.6, 0.6);
        } catch { }
    };

    if (!notification) return null;

    return (
        <div className="animate-in fade-in zoom-in slide-in-from-top-4 duration-500 bg-slate-900/90 backdrop-blur-md border-2 border-indigo-500 rounded-2xl p-4 mb-4 relative shadow-2xl shadow-indigo-500/30 overflow-hidden group">
            {/* Glossy top highlight */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-50" />

            <button
                onClick={() => setNotification(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-lg border border-white/10"
                aria-label="Fechar notificação"
            >
                <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col md:flex-row items-center gap-4">
                {/* Visual Indicator */}
                <div className="flex-shrink-0 p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/40 relative">
                    <Bell className="w-7 h-7 text-white animate-bounce" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900" />
                </div>

                {/* Main Content */}
                <div className="flex-grow text-center md:text-left">
                    <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 mb-1">
                        <span className="text-indigo-400 text-[11px] font-bold uppercase tracking-[0.2em]">Chamada Próximo</span>
                        <h3 className="text-white font-black text-xl tracking-tight uppercase">
                            Setor {notification.sector?.name || 'Setor'}
                        </h3>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-xs font-medium uppercase">Cidadão:</span>
                            <span className="text-slate-100 font-bold text-lg">{notification.citizen?.name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                            <span className="text-slate-500 text-[10px] font-bold uppercase">CPF:</span>
                            <span className="text-slate-300 font-mono text-xs">{notification.citizen?.cpf || '—'}</span>
                        </div>
                    </div>
                </div>

                {/* Ticket Badge */}
                <div className="flex-shrink-0 bg-gradient-to-b from-indigo-500 to-indigo-700 p-1 rounded-xl shadow-xl">
                    <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg px-6 py-2 border border-white/10 flex flex-col items-center">
                        <span className="text-indigo-200 text-[10px] font-black uppercase tracking-tighter mb-0.5">Ticket</span>
                        <span className="text-white font-black text-3xl tracking-wide font-mono leading-none">
                            {notification.code}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CallNotificationCard;
