import React, { useState } from 'react';
import { type Sector } from '../types';
import { Printer, UserPlus, AlertTriangle } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);
    const [searchingCpf, setSearchingCpf] = useState(false);

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

    const printTicket = (data: { code: string, sectorName: string, citizenName: string, date: Date }) => {
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
                    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 0; background: white; color: black; line-height: 1.2; }
                    .ticket { width: 100%; max-width: 250px; margin: 0 auto; padding: 5px; text-align: center; overflow: hidden; }
                    img { width: 100px; height: auto; margin-bottom: 5px; display: inline-block; }
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
                   
                   <div class="divider"></div>
                   
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cpf.length < 14 || !name || !selectedSector) {
            toast.error('Preencha todos os campos corretamente.');
            return;
        }
        if (isAwayBlocked) {
            toast.error('Setor ausente. Não é possível adicionar à fila.');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ cpf, name, phone, sectorId: selectedSector })
            });

            if (res.ok) {
                const data = await res.json();

                // Print using unified style
                printTicket({
                    code: data.code,
                    sectorName: data.sector.name,
                    citizenName: data.citizen.name,
                    date: new Date(data.timestamp)
                });

                toast.success(`Ticket ${data.code} gerado com sucesso!`);

                setCpf('');
                setName('');
                setPhone('');
                setSelectedSector('');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao registrar atendimento');
            }
        } catch (error) {
            toast.error('Erro de conexão');
        } finally {
            setLoading(false);
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
                                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 font-medium font-mono text-lg shadow-inner group-hover:border-slate-600"
                                    required
                                />
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
                                {sectors.map(s => (
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
        </div>
    );
};

export default AttendanceTab;
