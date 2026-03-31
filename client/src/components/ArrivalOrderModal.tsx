import React, { useState, useEffect } from 'react';
import { X, Users, CheckSquare, Square, PhoneCall, Hash, Loader2, Accessibility } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';

interface ArrivalOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    sectorId: string;
    maxBatchSize: number;
    currentInServiceCount: number;
    onCallSuccess: (calledCitizens: any[]) => void;
}

interface WaitingVisit {
    id: string;
    timestamp: string;
    citizen: {
        name: string;
        cpf: string;
    };
    isPriority?: boolean;
}

export const ArrivalOrderModal: React.FC<ArrivalOrderModalProps> = ({ 
    isOpen, 
    onClose, 
    sectorId, 
    maxBatchSize,
    currentInServiceCount,
    onCallSuccess 
}) => {
    const [loading, setLoading] = useState(false);
    const [calling, setCalling] = useState(false);
    const [waitingList, setWaitingList] = useState<WaitingVisit[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const availableSlots = Math.max(0, maxBatchSize - currentInServiceCount);

    const fetchWaiting = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sectorId}/waiting`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWaitingList(data);
                // Auto-select the first N based on maxBatchSize for convenience
                if (data.length > 0) {
                    setSelectedIds(data.slice(0, Math.min(data.length, maxBatchSize)).map((v: any) => v.id));
                }
            }
        } catch (error) {
            console.error("Error fetching waiting list", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchWaiting();
        } else {
            setSelectedIds([]);
        }
    }, [isOpen, sectorId]);

    const toggleSelect = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(prev => prev.filter(i => i !== id));
        } else {
            if (selectedIds.length >= availableSlots) {
                toast.warning(`Limite de ${maxBatchSize} pessoas atingido (${currentInServiceCount} já em atendimento).`);
                return;
            }
            setSelectedIds(prev => [...prev, id]);
        }
    };

    const handleCallBatch = async () => {
        if (selectedIds.length === 0) return;
        setCalling(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/sectors/${sectorId}/call-batch`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ visitIds: selectedIds })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`${data.length} cidadãos chamados com sucesso!`);
                onCallSuccess(data);
                onClose();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao chamar lote');
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setCalling(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <header className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30">
                            <Users className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">Chamar em Lote</h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                                {availableSlots} Vagas Disponíveis (Limite: {maxBatchSize})
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-2xl transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-500">
                            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                            <p className="font-bold uppercase tracking-widest text-[10px]">Carregando fila...</p>
                        </div>
                    ) : waitingList.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-500">
                            <Users className="w-16 h-16 mb-4 opacity-10" />
                            <p className="font-medium">Ninguém aguardando no momento.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                    {waitingList.length} Pessoas na Fila
                                </span>
                                <span className="text-[10px] font-bold text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full bg-indigo-500/10">
                                    Limite do Lote: {maxBatchSize}
                                </span>
                            </div>
                            
                            {waitingList.map((visit, index) => {
                                const isSelected = selectedIds.includes(visit.id);
                                return (
                                    <button
                                        key={visit.id}
                                        onClick={() => toggleSelect(visit.id)}
                                        className={`w-full group flex items-center gap-4 p-5 rounded-2xl border-2 transition-all duration-300 ${
                                            isSelected 
                                            ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.1)]' 
                                            : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-colors ${isSelected ? 'text-indigo-400 bg-indigo-500/20' : 'text-slate-600'}`}>
                                            {isSelected ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <p className={`font-bold text-lg transition-colors ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                                    {visit.citizen.name}
                                                </p>
                                                {visit.isPriority && (
                                                    <span className="flex items-center gap-1 bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest uppercase">
                                                        <Accessibility className="w-3 h-3" /> PREFERENCIAL
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                                                    <Hash className="w-3 h-3" /> {visit.citizen.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                                                    Registrado às {new Date(visit.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-2xl font-black text-slate-700/30 font-mono italic pr-2">
                                            #{index + 1}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <footer className="p-8 bg-slate-800/30 border-t border-slate-800">
                    <button
                        onClick={handleCallBatch}
                        disabled={calling || selectedIds.length === 0}
                        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-xl transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-95 duration-300"
                    >
                        {calling ? (
                            <Loader2 className="w-7 h-7 animate-spin" />
                        ) : (
                            <>
                                <PhoneCall className="w-7 h-7" />
                                <span>Chamar {selectedIds.length > 0 ? `${selectedIds.length} Selecionados` : 'Lote'}</span>
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-center text-slate-500 mt-4 font-bold uppercase tracking-widest">
                        Atenção: Os tickets serão chamados em ordem na recepção com intervalo de 6 segundos.
                    </p>
                </footer>
            </div>
        </div>
    );
};
