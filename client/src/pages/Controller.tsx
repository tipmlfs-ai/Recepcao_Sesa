import React, { useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeStatus } from '../useRealTimeStatus';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, CheckCircle2, AlertTriangle, ShieldAlert, Users } from 'lucide-react';

const Controller: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { sectors, updateStatus } = useRealTimeStatus();

    // Find the sector object that matches the logged-in user's sector name
    const sector = useMemo(() => {
        if (!user?.sectorName) return undefined;

        // Simple match by name (case insensitive)
        return sectors.find(s => s.name.toLowerCase() === user.sectorName?.toLowerCase());
    }, [sectors, user]);

    // Keep track of previous queue length to play sound on increment
    const prevQueueRef = useRef(sector?.queueCount || 0);

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const audioCtx = new AudioContext();

            const playTone = (freq: number, startTime: number, duration: number) => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, startTime);

                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            };

            // Classic notification double chime (E5 -> C5)
            playTone(659.25, audioCtx.currentTime, 0.4);
            playTone(523.25, audioCtx.currentTime + 0.25, 0.6);

        } catch (e) {
            console.error("Audio API not supported or blocked", e);
        }
    };

    useEffect(() => {
        if (sector && sector.queueCount > prevQueueRef.current) {
            // Fila aumentou, tocar som!
            playNotificationSound();
        }
        if (sector) {
            prevQueueRef.current = sector.queueCount;
        }
    }, [sector?.queueCount]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (!user?.sectorName) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <p className="text-white">Usuário do setor não identificado.</p>
            </div>
        );
    }

    if (sectors.length > 0 && !sector) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
                <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Setor não encontrado</h2>
                <p className="text-slate-400 mb-6">O setor "{user.sectorName}" não consta na base de dados.</p>
                <button onClick={handleLogout} className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700">
                    Sair
                </button>
            </div>
        );
    }

    if (!sector) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col p-4 md:p-8">
            <header className="flex justify-between items-center mb-12 max-w-lg mx-auto w-full">
                <div>
                    <p className="text-slate-400 text-sm font-semibold tracking-wider uppercase">Painel de Controle</p>
                    <h1 className="text-3xl font-bold text-white mt-1">{sector.name}</h1>
                </div>

                <button
                    onClick={handleLogout}
                    className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
                    title="Sair"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </header>

            <main className="flex-1 flex flex-col items-center max-w-lg mx-auto w-full gap-4">
                {/* Real-time Queue Display */}
                <div className="w-full bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 mb-2 flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 font-medium mb-1">Pessoas na fila de espera</p>
                        <p className="text-sm text-slate-500">Atualizado pela recepção instantaneamente</p>
                    </div>
                    <div className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-6 py-4 rounded-xl flex items-center gap-3">
                        <Users className="w-8 h-8 opacity-80" />
                        <span className="text-4xl font-black">{sector.queueCount || 0}</span>
                    </div>
                </div>

                <button
                    className={`w-full relative overflow-hidden flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all duration-300 ${sector.status === 'AVAILABLE'
                        ? 'bg-emerald-500/10 border-emerald-500 scale-100 shadow-[0_0_40px_rgba(16,185,129,0.2)]'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80 scale-95 opacity-70 hover:opacity-100'
                        }`}
                    onClick={() => updateStatus(sector.id, 'AVAILABLE')}
                >
                    <CheckCircle2 className={`w-12 h-12 mb-3 ${sector.status === 'AVAILABLE' ? 'text-emerald-500' : 'text-slate-400'}`} />
                    <span className={`text-2xl font-bold tracking-widest ${sector.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-slate-300'}`}>LIVRE</span>
                </button>

                <button
                    className={`w-full relative overflow-hidden flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all duration-300 ${sector.status === 'BUSY'
                        ? 'bg-rose-500/10 border-rose-500 scale-100 shadow-[0_0_40px_rgba(244,63,94,0.2)]'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80 scale-95 opacity-70 hover:opacity-100'
                        }`}
                    onClick={() => updateStatus(sector.id, 'BUSY')}
                >
                    <ShieldAlert className={`w-12 h-12 mb-3 ${sector.status === 'BUSY' ? 'text-rose-500' : 'text-slate-400'}`} />
                    <span className={`text-2xl font-bold tracking-widest ${sector.status === 'BUSY' ? 'text-rose-400' : 'text-slate-300'}`}>OCUPADO</span>
                </button>

                <button
                    className={`w-full relative overflow-hidden flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all duration-300 ${sector.status === 'AWAY'
                        ? 'bg-amber-500/10 border-amber-500 scale-100 shadow-[0_0_40px_rgba(245,158,11,0.2)]'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80 scale-95 opacity-70 hover:opacity-100'
                        }`}
                    onClick={() => updateStatus(sector.id, 'AWAY')}
                >
                    <AlertTriangle className={`w-12 h-12 mb-3 ${sector.status === 'AWAY' ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span className={`text-2xl font-bold tracking-widest ${sector.status === 'AWAY' ? 'text-amber-400' : 'text-slate-300'}`}>AUSENTE</span>
                </button>
            </main>
        </div>
    );
};

export default Controller;
