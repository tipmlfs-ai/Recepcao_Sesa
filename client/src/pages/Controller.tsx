import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeStatus } from '../useRealTimeStatus';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, CheckCircle2, AlertTriangle, ShieldAlert, Users, PhoneCall, Hash, CheckCheck, BarChart3, Loader2 } from 'lucide-react';
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
    const [currentCitizen, setCurrentCitizen] = useState<{ name: string, calledAt?: string, code?: string } | null>(null);
    const [citizenWaitSeconds, setCitizenWaitSeconds] = useState(0);
    const [showNoShowModal, setShowNoShowModal] = useState(false);
    const [noShowLoading, setNoShowLoading] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);
    const [waitingRoomPatients, setWaitingRoomPatients] = useState<any[]>([]);
    const [callingToWaitingRoom, setCallingToWaitingRoom] = useState(false);

    // Fetch the oldest IN_SERVICE visit to set as current and count them
    const fetchNextInService = useCallback(async (sId: string) => {
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sId}/in-service`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.length > 0) {
                    setCurrentCitizen({ name: data[0].citizen.name, calledAt: data[0].calledAt, code: data[0].code });
                } else {
                    setCurrentCitizen(null);
                }
            }
        } catch (error) {
            console.error("Error auto-fetching next in service:", error);
        }
    }, []);

    const fetchWaitingRoom = useCallback(async (sId: string) => {
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sId}/waiting`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const inRoom = data.filter((v: any) => v.ticketStatus === 'IN_WAITING_ROOM');
                setWaitingRoomPatients(inRoom);
            }
        } catch (error) {
            console.error("Error fetching waiting room:", error);
        }
    }, []);

    const sector = useMemo(() => {
        if (!user?.sectorName) return undefined;
        return sectors.find(s => s.name.toLowerCase() === user.sectorName?.toLowerCase());
    }, [sectors, user]);

    // Initial fetch when sector is ready
    useEffect(() => {
        if (sector?.id) {
            fetchNextInService(sector.id);
            if (sector.hasWaitingRoom) {
                fetchWaitingRoom(sector.id);
            }
        }
    }, [sector?.id, sector?.hasWaitingRoom, fetchNextInService, fetchWaitingRoom]);

    // Handle Cooldown Timer (For general call / waiting room call)
    useEffect(() => {
        if (!sector) return;

        const storageKey = `@RecepcaoSesa:cooldown:${sector.id}`;

        const updateTimer = () => {
            const lastCall = localStorage.getItem(storageKey);
            if (lastCall) {
                const diff = Math.floor((Date.now() - parseInt(lastCall)) / 1000);
                const maxCool = (sector as any).callCooldown ?? 120; // Fallback para 120s
                if (diff < maxCool) {
                    setCooldown(maxCool - diff);
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

    // Citizen Wait Timer
    useEffect(() => {
        if (!currentCitizen || !currentCitizen.calledAt) {
            setCitizenWaitSeconds(0);
            return;
        }

        const calledAtDate = new Date(currentCitizen.calledAt).getTime();
        
        const updateCitizenTimer = () => {
            const diff = Math.floor((Date.now() - calledAtDate) / 1000);
            setCitizenWaitSeconds(diff > 0 ? diff : 0);
        };

        updateCitizenTimer();
        const timer = setInterval(updateCitizenTimer, 1000);
        return () => clearInterval(timer);
    }, [currentCitizen]);

    const prevQueueRef = useRef(sector?.queueCount || 0);
    const audioCtxRef = useRef<AudioContext | null>(null);

    const playNotificationSound = () => {
        try {
            if (!audioCtxRef.current) {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                audioCtxRef.current = new AudioContext();
            }

            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {
                    console.warn("Autoplay prevented sound playback. A user interaction is required first.");
                });
            }

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
                        setCurrentCitizen({ name: visits[0].citizen.name, calledAt: visits[0].calledAt, code: visits[0].code });
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
                    setCurrentCitizen({ name: data.citizen.name, calledAt: data.calledAt, code: data.code });
                }

                // Clear cooldown immediately on checkout to allow calling next
                setCooldown(0);
                if (sector) {
                    localStorage.removeItem(`@RecepcaoSesa:cooldown:${sector.id}`);
                }
            } else {
                const err = await res.json();
                toast.error(err.error || 'Nenhum cidadão na fila / ou na sala de espera.');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setCallingNext(false);
        }
    };

    const handleCallToWaitingRoom = async () => {
        if (!sector || cooldown > 0) return;
        setCallingToWaitingRoom(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sector.id}/call-to-waiting-room`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`${data.citizen?.name || 'Próximo'} chamado para a Sala de Espera`);

                // Update waiting room list
                fetchWaitingRoom(sector.id);

                // Start cooldown
                const timestamp = Date.now();
                localStorage.setItem(`@RecepcaoSesa:cooldown:${sector.id}`, timestamp.toString());
                setCooldown((sector as any).callCooldown ?? 120);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao chamar para a sala de espera.');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setCallingToWaitingRoom(false);
        }
    };

    const handleNoShowConfirm = async () => {
        if (!currentCitizen?.code) return;
        setNoShowLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/visits/${currentCitizen.code}/no-show`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success(`Atendimento encerrado (Não Comparecimento)`);
                setShowNoShowModal(false);
                
                // Clear current citizen explicitly
                setCurrentCitizen(null);

                // Fetch next
                if (sector) {
                    fetchNextInService(sector.id);
                    if (sector.hasWaitingRoom) {
                        fetchWaitingRoom(sector.id);
                    }
                }

                // Clear cooldown immediately
                setCooldown(0);
                if (sector) {
                    localStorage.removeItem(`@RecepcaoSesa:cooldown:${sector.id}`);
                }
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao registrar não comparecimento');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setNoShowLoading(false);
        }
    };

    // Helper to get sector prefix (matching backend logic)
    const sectorPrefix = useMemo(() => {
        if (!sector?.name) return '';
        const prefix = sector.name
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-zA-Z]/g, '') // remove non-letters
            .substring(0, 3)
            .toUpperCase() || 'GER';
        return `${prefix}-`;
    }, [sector?.name]);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutCode.trim()) { toast.error('Digite o número do ticket'); return; }
        setCheckoutLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const fullCode = `${sectorPrefix}${checkoutCode.trim().padStart(3, '0')}`;

            const res = await fetch(`${API_URL}/api/visits/${fullCode}/checkout`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success(`Ticket ${fullCode} finalizado!`);
                setCheckoutCode('');

                // Automatically fetch next in service
                if (sector) {
                    fetchNextInService(sector.id);
                    if (sector.hasWaitingRoom) {
                        fetchWaitingRoom(sector.id);
                    }
                }

                // Clear cooldown immediately on checkout to allow calling next
                setCooldown(0);
                if (sector) {
                    localStorage.removeItem(`@RecepcaoSesa:cooldown:${sector.id}`);
                }
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
                    <div className="w-full bg-gradient-to-br from-indigo-900/40 to-slate-800/80 border border-indigo-500/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(79,70,229,0.1)] animate-in slide-in-from-bottom-4 fade-in duration-500 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-indigo-400 text-sm font-bold tracking-widest uppercase">Em Atendimento</p>
                            {citizenWaitSeconds > 0 && (
                                <div className="bg-slate-900/80 border border-slate-700 px-3 py-1 rounded-lg flex items-center gap-2 shadow-inner">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-emerald-400 font-mono text-sm font-bold">
                                        {Math.floor(citizenWaitSeconds / 60).toString().padStart(2, '0')}:{(citizenWaitSeconds % 60).toString().padStart(2, '0')}
                                    </span>
                                </div>
                            )}
                        </div>
                        <p className="text-2xl font-bold text-white mb-1 truncate pr-20">{currentCitizen.name}</p>
                        <p className="text-slate-400 text-sm mb-4">O cidadão acima foi chamado. Aguarde o comparecimento e digite o código do ticket para dar baixa.</p>
                        
                        {cooldown === 0 && (
                            <button
                                onClick={() => setShowNoShowModal(true)}
                                className="w-full mt-2 py-3 px-4 bg-rose-500/10 hover:bg-rose-500/20 border-2 border-rose-500/30 hover:border-rose-500/50 rounded-xl text-rose-400 font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" />
                                <span>Encerrar por Tempo Esgotado</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Waiting Room View */}
                {sector.hasWaitingRoom && (
                    <div className="w-full bg-slate-800/20 border border-slate-700/50 rounded-2xl p-5 shadow-inner mt-2">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <Users className="w-4 h-4 text-emerald-400" />
                                Sala de Espera Interna
                            </h3>
                            <span className="text-sm font-mono bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-slate-300">
                                {waitingRoomPatients.length} / {sector.waitingRoomCapacity || 5}
                            </span>
                        </div>

                        {waitingRoomPatients.length > 0 ? (
                            <ul className="space-y-2 mb-4">
                                {waitingRoomPatients.map(p => (
                                    <li key={p.id} className="bg-slate-900/50 border border-slate-700 p-3 rounded-lg flex justify-between items-center">
                                        <div>
                                            <span className="text-white font-bold block">{p.citizen.name}</span>
                                            <span className="text-xs text-slate-400 font-mono">CPF: {p.citizen.cpf}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-slate-500 italic mb-4 text-center py-2 bg-slate-900/30 rounded-lg">A sala está vazia.</p>
                        )}

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleCallToWaitingRoom}
                                disabled={callingToWaitingRoom || sector.queueCount === 0 || cooldown > 0 || (waitingRoomPatients.length >= (sector.waitingRoomCapacity || 5))}
                                className={`w-full group relative overflow-hidden flex items-center justify-center gap-2 p-4 rounded-xl font-bold transition-all duration-300 active:scale-[0.98] ${(waitingRoomPatients.length >= (sector.waitingRoomCapacity || 5))
                                        ? 'bg-amber-900/40 border border-amber-500/30 text-amber-500 cursor-not-allowed'
                                        : cooldown > 0 || sector.queueCount === 0
                                            ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                                            : 'bg-emerald-600/20 border-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600 hover:text-white cursor-pointer'
                                    }`}
                            >
                                <Users className="w-5 h-5 flex-shrink-0" />
                                <span className="text-sm tracking-wide">
                                    {waitingRoomPatients.length >= (sector.waitingRoomCapacity || 5)
                                        ? 'Sala Cheia'
                                        : callingToWaitingRoom
                                            ? 'Chamando...'
                                            : cooldown > 0
                                                ? `Aguarde ${Math.floor(cooldown / 60)}:${(cooldown % 60).toString().padStart(2, '0')}`
                                                : 'Chamar da Recepção (P/ Sala)'}
                                </span>
                            </button>

                            <button
                                onClick={handleCallNext}
                                disabled={callingNext || waitingRoomPatients.length === 0 || currentCitizen !== null}
                                className={`w-full group relative overflow-hidden flex items-center justify-center gap-2 p-4 rounded-xl font-bold transition-all duration-300 active:scale-[0.98] ${(waitingRoomPatients.length === 0 || currentCitizen !== null)
                                        ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-600 border-2 border-indigo-500 text-white hover:bg-indigo-500 cursor-pointer shadow-[0_5px_20px_-5px_rgba(79,70,229,0.4)]'
                                    }`}
                            >
                                <PhoneCall className="w-5 h-5 flex-shrink-0" />
                                <span className="text-sm tracking-wide">
                                    {currentCitizen !== null
                                        ? 'Finalize o atendimento atual'
                                        : callingNext 
                                            ? 'Encaminhando...' 
                                            : 'Atender da Sala de Espera'}
                                </span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Legacy Chamar Próximo (If no waiting room) */}
                {!sector.hasWaitingRoom && (
                    <button
                        onClick={handleCallNext}
                        disabled={callingNext || sector.queueCount === 0 || cooldown > 0 || sector.status !== 'AVAILABLE' || currentCitizen !== null}
                        className={`w-full group relative overflow-hidden flex flex-col items-center justify-center gap-2 p-6 rounded-2xl font-bold transition-all duration-300 active:scale-[0.98] ${sector.status !== 'AVAILABLE'
                            ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                            : (cooldown > 0 || currentCitizen !== null)
                                ? 'bg-slate-800 border-2 border-slate-700 text-slate-500 cursor-not-allowed'
                                : sector.queueCount === 0
                                    ? 'bg-slate-800/50 border-2 border-slate-700/50 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-600 border-2 border-indigo-500 text-white hover:bg-indigo-500 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(79,70,229,0.6)] cursor-pointer'
                            }`}
                    >
                        <div className="flex items-center gap-3 relative z-10">
                            <PhoneCall className={`w-7 h-7 transition-transform duration-300 ${(cooldown > 0 || sector.queueCount === 0 || sector.status !== 'AVAILABLE' || currentCitizen !== null) ? 'opacity-30' : 'group-hover:scale-110 group-hover:rotate-12'}`} />
                            <span className="text-xl tracking-wide">
                                {sector.status !== 'AVAILABLE'
                                    ? 'Mude o status para Livre'
                                    : currentCitizen !== null
                                        ? 'Finalize o atendimento atual'
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
                )}



                {/* Botões de Status */}
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

                {/* Seção Operacional: Dar Baixa */}
                <div className="w-full bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 mt-4 shadow-2xl transition-all duration-300 hover:border-emerald-500/20">
                    <div className="flex items-center gap-3 mb-5 px-1">
                        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <CheckCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-sm uppercase tracking-widest">Finalizar Atendimento</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Digite o ticket para dar baixa no sistema</p>
                        </div>
                    </div>

                    <form onSubmit={handleCheckout} className="flex flex-col sm:flex-row gap-3 items-stretch">
                        <div className="flex-1 relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none z-10">
                                <Hash className="w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                                <span className="text-slate-500 font-black text-xs border-r border-slate-700/50 pr-2 group-focus-within:text-emerald-500/50 group-focus-within:border-emerald-500/30 transition-all uppercase">{sectorPrefix}</span>
                            </div>
                            <input
                                type="text"
                                value={checkoutCode}
                                onChange={(e) => setCheckoutCode(e.target.value.toUpperCase())}
                                placeholder="000"
                                className="w-full h-14 bg-slate-900/50 border-2 border-slate-700/50 rounded-2xl pl-20 pr-4 text-white placeholder-slate-700 focus:outline-none focus:border-emerald-500/50 focus:bg-slate-900 transition-all font-black text-xl tracking-[0.2em] shadow-inner"
                                maxLength={4}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={checkoutLoading || !checkoutCode}
                            className={`h-14 px-8 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-2 shadow-lg active:scale-95 min-w-[180px] ${checkoutLoading || !checkoutCode
                                    ? 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/20 hover:-translate-y-0.5 border border-emerald-400/20'
                                }`}
                        >
                            {checkoutLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span>Dar Baixa</span>
                                    <CheckCheck className="w-4 h-4 opacity-50" />
                                </>
                            )}
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

            {showNoShowModal && currentCitizen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-800 border-2 border-rose-500/30 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-600 to-rose-400"></div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30 flex-shrink-0">
                                <AlertTriangle className="w-6 h-6 text-rose-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-1">Encerrar Atendimento</h3>
                                <p className="text-rose-400 font-mono text-sm font-bold tracking-widest">{currentCitizen.code}</p>
                            </div>
                        </div>
                        
                        <p className="text-slate-300 mb-6 font-medium text-sm leading-relaxed">
                            O cidadão <strong className="text-white">{currentCitizen.name}</strong> não compareceu. Deseja encerrar este atendimento por falta de comparecimento?
                        </p>

                        <div className="bg-slate-900/80 rounded-2xl p-4 mb-6 border border-slate-700">
                            <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold flex justify-between">
                                <span>Tempo Aguardado</span>
                                <span className={`font-mono ${citizenWaitSeconds >= 300 ? 'text-rose-400' : 'text-amber-400'}`}>
                                    {Math.floor(citizenWaitSeconds / 60).toString().padStart(2, '0')}:{(citizenWaitSeconds % 60).toString().padStart(2, '0')}
                                </span>
                            </p>
                            
                            <div className="flex gap-2">
                                <div className="w-1.5 rounded-full bg-indigo-500/50"></div>
                                <p className="text-xs text-slate-400 flex-1 leading-snug">
                                    Recomendamos aguardar pelo menos <strong className="text-indigo-300">5 minutos</strong> antes de confirmar o encerramento.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowNoShowModal(false)}
                                disabled={noShowLoading}
                                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-bold transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleNoShowConfirm}
                                disabled={noShowLoading}
                                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl text-white font-bold tracking-wide transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-rose-900/20"
                            >
                                {noShowLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Controller;
