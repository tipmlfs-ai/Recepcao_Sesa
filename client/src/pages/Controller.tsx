import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeStatus } from '../useRealTimeStatus';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, CheckCircle2, AlertTriangle, ShieldAlert, Users, PhoneCall, Hash, CheckCheck, BarChart3 } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';
import { SectorDashboardModal } from '../components/SectorDashboardModal';

const Controller: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { sectors, updateStatus } = useRealTimeStatus();

    // Checkout state
    const [checkoutCode, setCheckoutCode] = useState('');
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [callingNext, setCallingNext] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [currentCitizen, setCurrentCitizen] = useState<{ name: string } | null>(null);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

    const sector = useMemo(() => {
        if (!user?.sectorName) return undefined;
        return sectors.find(s => s.name.toLowerCase() === user.sectorName?.toLowerCase());
    }, [sectors, user]);

    // Handle Cooldown Timer
    useEffect(() => {
        if (!sector) return;

        const storageKey = `@RecepcaoSesa:cooldown:${sector.id}`;

        const updateTimer = () => {
            const lastCall = localStorage.getItem(storageKey);
            if (lastCall) {
                const diff = Math.floor((Date.now() - parseInt(lastCall)) / 1000);
                if (diff < 300) { // 5 minutes = 300 seconds
                    setCooldown(300 - diff);
                } else {
                    setCooldown(0);
                    localStorage.removeItem(storageKey);
                }
            } else {
                setCooldown(0);
            }
        };

        // Initial check
        updateTimer();

        // Check every second
        const timer = setInterval(updateTimer, 1000);

        return () => clearInterval(timer);
    }, [sector?.id]);

    const prevQueueRef = useRef(sector?.queueCount || 0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Creates the audio element; browsers relax autoplay rules slightly if it's playing a quick, user-initiated DOM action indirectly (like via Realtime).
        audioRef.current = new Audio('/notification.mp3');
        audioRef.current.load();
    }, []);

    const playNotificationSound = () => {
        try {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn("Autoplay prevented sound playback. A user interaction is required first.", error);
                    });
                }
            }
        } catch (e) {
            console.warn("Sound play failed", e);
        }
    };

    useEffect(() => {
        if (sector && sector.queueCount > prevQueueRef.current) {
            playNotificationSound();
        }
        if (sector) prevQueueRef.current = sector.queueCount;
    }, [sector?.queueCount]);

    // Persist current citizen on reload
    useEffect(() => {
        const fetchCurrentActiveCitizen = async () => {
            if (!sector) return;
            try {
                const token = localStorage.getItem('@RecepcaoSesa:token');
                const res = await fetch(`${API_URL}/api/visits?sectorId=${sector.id}&ticketStatus=IN_SERVICE`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const visits = await res.json();
                    if (visits.length > 0) {
                        setCurrentCitizen({ name: visits[0].citizen.name });
                    }
                }
            } catch (error) {
                console.error("Failed to fetch active citizen", error);
            }
        };
        fetchCurrentActiveCitizen();
    }, [sector?.id]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleCallNext = async () => {
        if (!sector || cooldown > 0) return;
        setCallingNext(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sector.id}/call-next`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Chamando: ${data.citizen?.name || 'Próximo'}`);

                // Set the persistent citizen info
                if (data.citizen?.name) {
                    setCurrentCitizen({ name: data.citizen.name });
                }

                // Start cooldown
                const timestamp = Date.now();
                localStorage.setItem(`@RecepcaoSesa:cooldown:${sector.id}`, timestamp.toString());
                setCooldown(300);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Nenhum cidadão na fila');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setCallingNext(false);
        }
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutCode.trim()) { toast.error('Digite o código'); return; }
        setCheckoutLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/visits/${checkoutCode.toUpperCase()}/checkout`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success(`Ticket ${checkoutCode.toUpperCase()} finalizado!`);
                setCheckoutCode('');
                setCurrentCitizen(null); // Clear the active citizen on checkout

                // Clear cooldown immediately on checkout to allow calling next
                setCooldown(0);
                localStorage.removeItem(`@RecepcaoSesa:cooldown:${sector.id}`);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Código não encontrado');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setCheckoutLoading(false);
        }
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
                <AlertTriangle className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
                <h2 className="text-2xl font-bold text-white mb-2">Setor não encontrado</h2>
                <p className="text-slate-400 mb-6 text-center">O setor "{user.sectorName}" não consta na base de dados.</p>
                <button onClick={handleLogout} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg">Sair</button>
            </div>
        );
    }

    if (!sector) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col p-4 md:p-8 font-sans selection:bg-indigo-500/30">
            <header className="flex justify-between items-center mb-10 max-w-lg mx-auto w-full">
                <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-xl shadow-lg shadow-white/5">
                        <img src="/logo.png" alt="Logo Prefeitura" className="h-10 w-[80px] object-contain" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-black tracking-widest uppercase mb-0.5">Painel do Setor</p>
                        <h1 className="text-2xl font-black text-white tracking-tight">{sector.name}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsDashboardOpen(true)}
                        className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 hover:text-indigo-300 border border-transparent hover:border-indigo-500/30 rounded-xl text-indigo-400 transition-all duration-300 hover:scale-105 active:scale-95 group"
                        title="Análise de Dados do Setor"
                    >
                        <BarChart3 className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="p-3 bg-slate-800/80 hover:bg-rose-500/10 hover:text-rose-400 border border-transparent hover:border-rose-500/30 rounded-xl text-slate-400 transition-all duration-300 hover:scale-105 active:scale-95 group"
                        title="Sair do Sistema"
                    >
                        <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center max-w-lg mx-auto w-full gap-5">
                {/* Queue count */}
                <div className="w-full bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between shadow-2xl gap-4">
                    <div className="text-center sm:text-left">
                        <p className="text-slate-300 font-bold mb-1.5 flex items-center justify-center sm:justify-start gap-2">
                            Pessoas na fila de espera
                        </p>
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1">
                                ATUALIZAÇÃO EM TEMPO REAL
                            </p>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-900/40 border border-indigo-500/20 px-8 py-3 rounded-2xl flex items-center justify-center min-w-[120px] shadow-inner font-mono relative overflow-hidden">
                        <div className="absolute inset-0 bg-indigo-400/10 blur-xl"></div>
                        <Users className="w-4 h-4 text-indigo-400/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <span className="text-4xl font-black text-indigo-400 relative z-10 drop-shadow-md">{sector ? sector.queueCount : 0}</span>
                    </div>
                </div>

                {/* Persistent Called Citizen Card */}
                {currentCitizen && (
                    <div className="w-full bg-gradient-to-br from-indigo-900/40 to-slate-800/80 border border-indigo-500/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(79,70,229,0.1)] animate-in slide-in-from-bottom-4 fade-in duration-500">
                        <p className="text-indigo-400 text-sm font-bold tracking-widest uppercase mb-2">Em Atendimento</p>
                        <p className="text-2xl font-bold text-white mb-1 truncate">{currentCitizen.name}</p>
                        <p className="text-slate-400 text-sm">O cidadão acima foi chamado. Aguarde o comparecimento e digite o código do ticket para dar baixa.</p>
                    </div>
                )}

                {/* Chamar Próximo */}
                <button
                    onClick={handleCallNext}
                    disabled={callingNext || sector.queueCount === 0 || cooldown > 0 || sector.status !== 'AVAILABLE'}
                    className={`w-full group relative overflow-hidden flex flex-col items-center justify-center gap-2 p-6 rounded-2xl font-bold transition-all duration-300 active:scale-[0.98] ${sector.status !== 'AVAILABLE'
                        ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                        : cooldown > 0
                            ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                            : sector.queueCount === 0
                                ? 'bg-slate-800/50 border-2 border-slate-700/50 text-slate-500 cursor-not-allowed'
                                : 'bg-indigo-600 border-2 border-indigo-500 text-white hover:bg-indigo-500 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(79,70,229,0.6)] cursor-pointer'
                        }`}
                >
                    <div className="flex items-center gap-3 relative z-10">
                        <PhoneCall className={`w-7 h-7 transition-transform duration-300 ${cooldown > 0 || sector.queueCount === 0 || sector.status !== 'AVAILABLE' ? 'opacity-30' : 'group-hover:scale-110 group-hover:rotate-12'}`} />
                        <span className="text-xl tracking-wide">
                            {sector.status !== 'AVAILABLE'
                                ? 'Mude o status para Livre'
                                : callingNext
                                    ? 'Chamando...'
                                    : cooldown > 0
                                        ? 'Aguarde para chamar'
                                        : 'Chamar Próximo'}
                        </span>
                    </div>
                    {cooldown > 0 && sector.status === 'AVAILABLE' && (
                        <span className="relative z-10 text-sm font-mono bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-700 text-indigo-400 shadow-inner">
                            Disponível em ⏱ {Math.floor(cooldown / 60)}:{(cooldown % 60).toString().padStart(2, '0')}
                        </span>
                    )}
                </button>

                {/* Status buttons */}
                <div className="grid grid-cols-3 gap-3 w-full mt-2">
                    <button
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 ${sector.status === 'AVAILABLE'
                            ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] scale-100 z-10'
                            : 'bg-slate-800/50 border-slate-700 hover:border-emerald-500/30 hover:bg-slate-800 scale-95 opacity-70 hover:opacity-100'
                            }`}
                        onClick={() => updateStatus(sector.id, 'AVAILABLE')}
                        title="Marcar como Livre"
                    >
                        <CheckCircle2 className={`w-8 h-8 mb-2 transition-transform ${sector.status === 'AVAILABLE' ? 'text-emerald-500 scale-110' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold tracking-widest ${sector.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-slate-400'}`}>LIVRE</span>
                    </button>

                    <button
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 ${sector.status === 'BUSY'
                            ? 'bg-rose-500/10 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.2)] scale-100 z-10'
                            : 'bg-slate-800/50 border-slate-700 hover:border-rose-500/30 hover:bg-slate-800 scale-95 opacity-70 hover:opacity-100'
                            }`}
                        onClick={() => updateStatus(sector.id, 'BUSY')}
                        title="Marcar como Ocupado"
                    >
                        <ShieldAlert className={`w-8 h-8 mb-2 transition-transform ${sector.status === 'BUSY' ? 'text-rose-500 scale-110' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold tracking-widest ${sector.status === 'BUSY' ? 'text-rose-400' : 'text-slate-400'}`}>OCUP.</span>
                    </button>

                    <button
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 ${sector.status === 'AWAY'
                            ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.2)] scale-100 z-10'
                            : 'bg-slate-800/50 border-slate-700 hover:border-amber-500/30 hover:bg-slate-800 scale-95 opacity-70 hover:opacity-100'
                            }`}
                        onClick={() => updateStatus(sector.id, 'AWAY')}
                        title="Marcar como Ausente"
                    >
                        <AlertTriangle className={`w-8 h-8 mb-2 transition-transform ${sector.status === 'AWAY' ? 'text-amber-500 scale-110' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold tracking-widest ${sector.status === 'AWAY' ? 'text-amber-400' : 'text-slate-400'}`}>AUSENTE</span>
                    </button>
                </div>

                {/* Dar Baixa */}
                <div className="w-full bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 mt-4 shadow-xl transition-all duration-300 hover:border-emerald-500/30 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                    <h3 className="text-slate-300 font-semibold mb-4 flex items-center gap-2">
                        <CheckCheck className="w-5 h-5 text-emerald-400" />
                        Finalizar Atendimento (Dar Baixa)
                    </h3>
                    <form onSubmit={handleCheckout} className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative group">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
                            <input
                                type="text"
                                value={checkoutCode}
                                onChange={(e) => setCheckoutCode(e.target.value.toUpperCase())}
                                placeholder="CÓDIGO (EX: A-045)"
                                maxLength={6}
                                className="w-full bg-slate-900 border-2 border-slate-700 text-white rounded-xl pl-12 pr-4 py-3 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono tracking-widest uppercase transition-all placeholder:text-slate-600"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={checkoutLoading || !checkoutCode.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:hover:-translate-y-0 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-emerald-500/30 active:scale-95 flex-shrink-0"
                        >
                            {checkoutLoading ? <span className="animate-pulse">...</span> : 'Dar Baixa'}
                        </button>
                    </form>
                </div>
            </main>

            {sector && (
                <SectorDashboardModal
                    isOpen={isDashboardOpen}
                    onClose={() => setIsDashboardOpen(false)}
                    sectorId={sector.id}
                    sectorName={sector.name}
                />
            )}
        </div>
    );
};

export default Controller;
