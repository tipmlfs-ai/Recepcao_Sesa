import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, TrendingUp, TrendingDown, Users, Printer, Search, Hash, UserCircle } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';

interface Visit {
    id: string;
    code?: string | null;
    citizen: {
        cpf: string;
        name: string;
    };
    sector: {
        name: string;
    };
    timestamp: string;
    ticketStatus?: string | null;
    user?: {
        email: string;
    };
}

export const HistoryTab: React.FC = () => {
    const [filterType, setFilterType] = useState<'day' | 'week' | 'month'>('day');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Search states
    const [searchCode, setSearchCode] = useState('');
    const [searchCpf, setSearchCpf] = useState('');

    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchVisits = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            let url = `${API_URL}/api/visits?`;

            if (searchCode.trim()) {
                url += `code=${searchCode.trim()}`;
            } else if (searchCpf.trim()) {
                url += `cpf=${searchCpf.trim().replace(/\D/g, '')}`;
            } else {
                url += `date=${selectedDate}&filterType=${filterType}`;
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setVisits(data);
            }
        } catch (error) {
            console.error('Failed to fetch visits', error);
            toast.error('Erro ao buscar registros');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVisits();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType, selectedDate]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchVisits();
    };

    const handleClearSearch = () => {
        setSearchCode('');
        setSearchCpf('');
        fetchVisits();
    };

    const handleReprint = (visit: Visit) => {
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 20px; display: flex; justify-content: center; background: white; color: black; }
                    .ticket { width: 280px; padding: 20px; border: 2px solid #000; text-align: center; }
                    img { width: 150px; margin-bottom: 10px; }
                    h1 { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; }
                    .divider { border-top: 1px dashed #000; margin: 10px 0; }
                    .code { font-size: 40px; font-weight: bold; margin: 10px 0; letter-spacing: 2px; }
                    .info { font-size: 13px; margin: 5px 0; }
                    .footer { font-size: 11px; margin-top: 15px; color: #555; }
                    @media print {
                        @page { margin: 0; }
                        body { margin: 0; padding: 0; }
                        .ticket { border: none; }
                    }
                </style>
            </head>
            <body>
               <div class="ticket">
                   <img src="/logo.png" alt="Logo">
                   <h1>SECRETARIA MUNICIPAL DE SAÚDE</h1>
                   <p style="font-size: 10px; margin: 0;">PREFEITURA DE LAURO DE FREITAS</p>
                   
                   <div class="divider"></div>
                   
                   <div class="info">Setor: <strong>${visit.sector.name}</strong></div>
                   <div class="code">${visit.code}</div>
                   
                   <div class="divider"></div>

                   <div class="footer">
                       <div>Data: ${new Date(visit.timestamp).toLocaleDateString('pt-BR')}</div>
                       <div>Hora: ${new Date(visit.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                       <div style="margin-top: 10px; font-style: italic;">* REIMPRESSÃO *</div>
                   </div>
               </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    };

    const metrics = useMemo(() => {
        if (!visits.length) return { total: 0, highPeak: null, lowPeak: null };

        const groups: Record<string, number> = {};

        visits.forEach(v => {
            const date = new Date(v.timestamp);
            let key = '';

            if (filterType === 'day') {
                key = `${date.getHours()}:00`;
            } else {
                key = date.toLocaleDateString('pt-BR');
            }

            groups[key] = (groups[key] || 0) + 1;
        });

        let max = -1;
        let min = Infinity;
        let highPeakStr = '-';
        let lowPeakStr = '-';

        Object.entries(groups).forEach(([key, count]) => {
            if (count > max) { max = count; highPeakStr = key; }
            if (count < min) { min = count; lowPeakStr = key; }
        });

        if (Object.keys(groups).length === 1) {
            lowPeakStr = highPeakStr;
        }

        return {
            total: visits.length,
            highPeak: { label: highPeakStr, count: max },
            lowPeak: { label: lowPeakStr, count: min === Infinity ? 0 : min }
        };
    }, [visits, filterType]);

    return (
        <div className="space-y-6">
            {/* Search and Filters Area */}
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 space-y-6">
                <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                    {/* Date Filters */}
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
                            {(['day', 'week', 'month'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => { setFilterType(type); handleClearSearch(); }}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filterType === type ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                >
                                    {type === 'day' ? 'Dia' : type === 'week' ? 'Semana' : 'Mês'}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2">
                            <Calendar className="text-indigo-400 w-5 h-5" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent text-white outline-none text-sm font-medium"
                            />
                        </div>
                    </div>

                    {/* Advanced Search */}
                    <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div className="relative flex-1 min-w-[150px]">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Código Ticket"
                                value={searchCode}
                                onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div className="relative flex-1 min-w-[150px]">
                            <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="CPF"
                                value={searchCpf}
                                onChange={(e) => setSearchCpf(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                            <Search className="w-4 h-4" />
                            Buscar
                        </button>
                        {(searchCode || searchCpf) && (
                            <button type="button" onClick={handleClearSearch} className="text-slate-400 hover:text-white text-xs underline">Limpar</button>
                        )}
                    </form>
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-800 border-l-4 border-l-blue-500 border border-slate-700 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-400 font-semibold text-sm uppercase">Total Atendimentos</p>
                        <Users className="w-6 h-6 text-blue-500 opacity-50" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-4xl font-black text-white">{metrics.total}</h3>
                        <span className="text-slate-500 text-xs font-medium">unidades</span>
                    </div>
                </div>

                <div className="bg-slate-800 border-l-4 border-l-emerald-500 border border-slate-700 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-400 font-semibold text-sm uppercase">Pico de Fluxo (Alto)</p>
                        <TrendingUp className="w-6 h-6 text-emerald-500 opacity-50" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-1">{metrics.highPeak?.label || '-'}</h3>
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <span className="text-lg">{metrics.highPeak?.count || 0}</span>
                        <span className="text-xs uppercase">pessoas</span>
                    </div>
                </div>

                <div className="bg-slate-800 border-l-4 border-l-rose-500 border border-slate-700 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-slate-400 font-semibold text-sm uppercase">Pico de Fluxo (Baixo)</p>
                        <TrendingDown className="w-6 h-6 text-rose-500 opacity-50" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-1">{metrics.lowPeak?.label || '-'}</h3>
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                        <span className="text-lg">{metrics.lowPeak?.count || 0}</span>
                        <span className="text-xs uppercase">pessoas</span>
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-bold text-white">Registros de Visitas</h2>
                    <span className="text-xs text-slate-500 font-mono">Total: {visits.length} registros</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Ticket</th>
                                <th className="px-6 py-4">Cidadão / CPF</th>
                                <th className="px-6 py-4">Setor Destino</th>
                                <th className="px-6 py-4">Data / Hora</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-20 text-center text-slate-400"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div><span>Buscando registros...</span></div></td></tr>
                            ) : visits.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-20 text-center text-slate-400"><div className="flex flex-col items-center gap-3"><Search className="w-10 h-10 opacity-20" /><p>Nenhum registro encontrado.</p></div></td></tr>
                            ) : (
                                visits.map(visit => (
                                    <tr key={visit.id} className="hover:bg-slate-700/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1.5 rounded-lg border font-mono font-black text-base shadow-sm group-hover:border-indigo-500/50 transition-colors ${visit.code ? 'bg-slate-900 text-white border-slate-700' : 'bg-slate-800/50 text-slate-500 border-slate-700/50'}`}>
                                                {visit.code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-white font-bold">{visit.citizen.name}</div>
                                            <div className="text-slate-400 text-xs font-mono">{visit.citizen.cpf}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                {visit.sector.name}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-white font-medium">{new Date(visit.timestamp).toLocaleDateString('pt-BR')}</div>
                                            <div className="text-slate-500 text-xs">{new Date(visit.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleReprint(visit)}
                                                disabled={!visit.code}
                                                className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 ml-auto ${!visit.code ? 'bg-slate-700/50 text-slate-500 border-slate-700/50 cursor-not-allowed' : 'bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border-indigo-500/20'}`}
                                                title={visit.code ? "Reimprimir Ticket (Sem CPF)" : "Não disponível para este registro"}
                                            >
                                                <Printer className="w-4 h-4" />
                                                <span className="text-xs font-bold uppercase tracking-tighter">Reimprimir</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default HistoryTab;
