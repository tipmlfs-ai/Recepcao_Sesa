import React, { useState, useRef } from 'react';
import { type Sector } from '../types';
import { Printer, UserPlus, AlertTriangle, Accessibility, User } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';

interface AttendanceTabProps {
    sectors: Sector[];
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({ sectors }) => {
    const [cpf, setCpf] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedSector, setSelectedSector] = useState('');
    const [selectedResource, setSelectedResource] = useState<string | null>(null);
    const [showResourceModal, setShowResourceModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searchingCpf, setSearchingCpf] = useState(false);
    const [isPriority, setIsPriority] = useState(false);

    const validateCpf = (val: string) => {
        const cleanCpf = val.replace(/\D/g, '');
        if (cleanCpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
        let sum = 0, remainder;
        for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cleanCpf.substring(9, 10))) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cleanCpf.substring(10, 11))) return false;
        return true;
    };

    const formatCpf = (val: string) => {
        return val.replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatCpf(e.target.value);
        setCpf(formatted);
        if (formatted.length === 14) searchCitizen(formatted);
        else {
            setName('');
            setPhone('');
        }
    };

    const formatPhone = (val: string) => {
        const digits = val.replace(/\D/g, '');
        if (digits.length <= 10) {
            return digits.replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2');
        }
        return digits.replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .slice(0, 15);
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(formatPhone(e.target.value));
    };

    const searchCitizen = async (searchCpf: string) => {
        setSearchingCpf(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/citizens/${searchCpf}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setName(data.name);
                setPhone(data.phone || '');
                toast.success(`Cidadão encontrado: ${data.name}`);
            }
        } catch (error) {
            console.error('Error fetching citizen', error);
        } finally {
            setSearchingCpf(false);
        }
    };

    const printTicket = (data: { code: string, sectorName: string, citizenName: string, date: Date, isPriority: boolean }) => {
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
                    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 0; background: white; color: black; line-height: 1.2; }
                    .ticket { width: 100%; max-width: 250px; margin: 0 auto; padding: 5px; text-align: center; overflow: hidden; }
                    img { width: 150px; height: auto; margin-bottom: 5px; display: inline-block; }
                    h1 { font-size: 11px; font-weight: bold; margin: 0 0 2px 0; }
                    p.header-subtitle { font-size: 9px; margin: 0; font-weight: 500; }
                    .divider { border-top: 1px dashed #000; margin: 5px 0; width: 100%; }
                    .code { font-size: 32px; font-weight: bold; margin: 5px 0; letter-spacing: 1px; }
                    .info { font-size: 11px; margin: 3px 0; }
                    .citizen { font-size: 13px; font-weight: bold; margin: 5px 0; text-transform: uppercase; word-break: break-word; }
                    .footer { font-size: 9px; margin-top: 8px; color: #000; }
                    @media print {
                        @page { margin: 0; size: auto; }
                        body { margin: 0; padding: 0; }
                        .ticket { border: none !important; width: 100%; }
                    }
                </style>
            </head>
            <body>
               <div class="ticket">
                   <img src="${window.location.origin}/logo.png" alt="Logo" id="logo_img">
                   <h1>SECRETARIA MUNICIPAL DE SAÚDE</h1>
                   <p class="header-subtitle">PREFEITURA DE LAURO DE FREITAS</p>
                   
                   
                   ${data.isPriority ? '<div style="font-size: 14px; font-weight: bold; padding: 4px; background: #000; color: #fff; margin: 4px 0;">PREFERENCIAL ♿</div>' : ''}
                   <div class="info">Setor: <strong>${data.sectorName}</strong></div>
                   <div class="citizen">${data.citizenName}</div>
                   <div class="code">${data.code}</div>
                   
                   <div class="divider"></div>

                   <div class="footer">
                       <div>Data: ${data.date.toLocaleDateString('pt-BR')} ${data.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                       <div style="margin-top: 5px; font-style: italic; font-weight: bold;">Aguarde ser chamado.</div>
                    </div>
               </div>
               <script>
                   function triggerPrint() {
                       window.focus();
                       window.print();
                       // We don't close the window here because it's an iframe
                   }
                   
                   const logo = document.getElementById('logo_img');
                   if (logo.complete) {
                       triggerPrint();
                   } else {
                       logo.onload = triggerPrint;
                       logo.onerror = triggerPrint; // Print anyway if logo fails
                   }
               </script>
            </body>
            </html>
        `;

        // Professional Iframe Printing Method
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.id = 'print-iframe';
        
        // Remove existing iframe if any
        const oldIframe = document.getElementById('print-iframe');
        if (oldIframe) document.body.removeChild(oldIframe);
        
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
            doc.open();
            doc.write(printContent);
            doc.close();
        }
    };

    const selectedSectorObj = sectors.find(s => s.id === selectedSector);
    const isAwayBlocked = selectedSectorObj?.status === 'AWAY';
    const isSubmittingRef = useRef(false);

    const handleSubmit = async (e?: React.FormEvent, forceResourceId?: string | null) => {
        if (e) e.preventDefault();
        if (isSubmittingRef.current) return;
        
        if (cpf.length < 14 || !name || !selectedSector) {
            toast.error('Preencha todos os campos corretamente.');
            return;
        }
        if (!validateCpf(cpf)) {
            toast.error('CPF inválido. Verifique os números digitados.');
            return;
        }
        if (isAwayBlocked) {
            toast.error('Setor ausente. Não é possível adicionar à fila.');
            return;
        }

        if (selectedSectorObj?.isHeterogeneous && forceResourceId === undefined && selectedResource === null) {
            setShowResourceModal(true);
            return;
        }

        const finalResourceId = forceResourceId !== undefined ? forceResourceId : selectedResource;

        isSubmittingRef.current = true;
        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ cpf, name, phone, sectorId: selectedSector, isPriority, resourceId: finalResourceId })
            });

            if (res.ok) {
                const data = await res.json();

                // Print using unified style
                printTicket({
                    code: data.code,
                    sectorName: data.sector.name,
                    citizenName: data.citizen.name,
                    date: new Date(data.timestamp),
                    isPriority: data.isPriority
                });

                toast.success(`Ticket ${data.code} gerado com sucesso!`);

                setCpf('');
                setName('');
                setPhone('');
                setSelectedSector('');
                setSelectedResource(null);
                setShowResourceModal(false);
                setIsPriority(false);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao registrar atendimento');
            }
        } catch (error) {
            toast.error('Erro de conexão');
            isSubmittingRef.current = false;
        } finally {
            setLoading(false);
            isSubmittingRef.current = false;
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* REGISTRO */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

                <h2 className="text-3xl font-black text-white mb-10 flex items-center gap-4 relative z-10">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-inner">
                        <UserPlus className="w-7 h-7 text-indigo-400" />
                    </div>
                    Registro de Cidadão
                </h2>

                <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                    
                    {/* TOGGLE PREFERENCIAL */}
                    <div>
                        <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-3 ml-1">Tipo de Atendimento</label>
                        <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-slate-700/80 shadow-inner">
                            <button
                                type="button"
                                onClick={() => setIsPriority(false)}
                                className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-black tracking-wide transition-all duration-300 ${
                                    !isPriority 
                                    ? 'bg-indigo-600 text-white shadow-[0_4px_20px_-5px_rgba(79,70,229,0.5)]' 
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                            >
                                <User className="w-5 h-5" />
                                NORMAL
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPriority(true)}
                                className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-black tracking-wide transition-all duration-300 ${
                                    isPriority 
                                    ? 'bg-amber-500 text-white shadow-[0_4px_20px_-5px_rgba(245,158,11,0.5)]' 
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                            >
                                <Accessibility className="w-5 h-5" />
                                PREFERENCIAL
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-3 ml-1">CPF do Cidadão</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={cpf}
                                    onChange={handleCpfChange}
                                    placeholder="000.000.000-00"
                                    maxLength={14}
                                    className={`w-full bg-slate-900/50 border ${cpf.length === 14 && !validateCpf(cpf) ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-slate-700'} text-white rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 font-medium font-mono text-lg shadow-inner group-hover:border-slate-600`}
                                    required
                                />
                                {cpf.length === 14 && !validateCpf(cpf) && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-400 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20">Inválido</div>
                                )}
                                {searchingCpf && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 text-xs font-bold animate-pulse bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">Buscando...</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-3 ml-1">Nome Completo</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome Completo do Cidadão"
                                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 font-medium text-lg shadow-inner hover:border-slate-600"
                                required
                            />
                        </div>

                        <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-3 ml-1">Telefone (Opcional)</label>
                            <input
                                type="text"
                                value={phone}
                                onChange={handlePhoneChange}
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 font-medium font-mono text-lg shadow-inner hover:border-slate-600"
                            />
                        </div>

                        {/* SETOR */}
                        <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-3 ml-1">Setor de Destino</label>
                            <select
                                value={selectedSector}
                                onChange={(e) => setSelectedSector(e.target.value)}
                                className={`w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all appearance-none font-medium text-lg shadow-inner hover:border-slate-600 cursor-pointer ${!selectedSector ? 'text-slate-500' : ''}`}
                                required
                            >
                                <option value="" disabled>Selecione um Setor...</option>
                                {sectors.filter(s => s.isVisibleOnPanel !== false).map(s => (
                                    <option key={s.id} value={s.id} disabled={s.status === 'AWAY'} className="text-white bg-slate-800">
                                        {s.name} — {s.status === 'AVAILABLE' ? '✅ Livre' : s.status === 'BUSY' ? '🔴 Ocupado' : '⚠️ Ausente (bloqueado)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isAwayBlocked && (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-medium">O setor selecionado está ausente e não pode receber novos cidadãos no momento.</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || isAwayBlocked}
                        className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white tracking-wide font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-[0_15px_40px_-10px_rgba(79,70,229,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-8 text-xl border border-indigo-400/20"
                    >
                        {loading ? 'Gerando Ticket...' : (
                            <>
                                <Printer className="w-6 h-6" />
                                GERAR TICKET DE ATENDIMENTO
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* MODAL FAST DISPATCH */}
            {showResourceModal && selectedSectorObj && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-800 border border-slate-600 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-white mb-2">Roteamento Rápido (Dispatch)</h3>
                            <p className="text-slate-400 mb-6 font-medium">
                                O setor <strong>{selectedSectorObj.name}</strong> utiliza subfilas. Escolha a mesa ou analista de destino, ou envie para a triagem geral.
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2 pb-2">
                                <button
                                    type="button"
                                    onClick={() => handleSubmit(undefined, null)}
                                    className="bg-slate-700/50 border border-slate-600 hover:bg-indigo-600 hover:border-indigo-500 hover:shadow-lg p-5 rounded-2xl flex flex-col items-start gap-2 text-left transition-all duration-300 group relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <span className="text-xl font-bold text-white group-hover:text-white relative z-10">Geral</span>
                                    <span className="text-sm font-medium text-slate-400 group-hover:text-indigo-100 relative z-10">Triagem Documental ou Destino Desconhecido</span>
                                </button>
                                
                                {selectedSectorObj.resources?.map(res => (
                                    <button
                                        key={res.id}
                                        type="button"
                                        onClick={() => handleSubmit(undefined, res.id)}
                                        className="bg-slate-700/50 border border-slate-600 hover:bg-indigo-600 hover:border-indigo-500 hover:shadow-lg p-5 rounded-2xl flex flex-col items-start gap-2 text-left transition-all duration-300 group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <span className="text-xl font-bold text-white group-hover:text-white relative z-10">{res.name}</span>
                                        <span className="text-sm font-medium text-slate-400 group-hover:text-indigo-100 relative z-10">Atendimento Direto Específico</span>
                                    </button>
                                ))}
                            </div>
                            
                            <div className="mt-8 flex justify-end">
                                <button type="button" onClick={() => setShowResourceModal(false)} className="px-6 py-3 text-slate-300 hover:bg-slate-700/50 rounded-xl font-bold transition-colors">
                                    Voltar e Editar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceTab;
