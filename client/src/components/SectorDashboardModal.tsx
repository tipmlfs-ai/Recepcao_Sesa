import React, { useState, useEffect } from 'react';
import { X, Search, BarChart3, Users, Calendar, Clock, Filter, Phone, Hash, Download, FileText, FileSpreadsheet, Mail, ChevronDown } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';

interface SectorDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    sectorId: string;
    sectorName: string;
}

interface VisitData {
    id: string;
    code: string | null;
    timestamp: string;
    citizen: {
        cpf: string;
        name: string;
        phone: string | null;
    };
    user: {
        email: string;
    };
    ticketStatus: string;
    finishedAt?: string | null;
}

export const SectorDashboardModal: React.FC<SectorDashboardModalProps> = ({ isOpen, onClose, sectorId, sectorName }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, cpf, name, phone
    const [visits, setVisits] = useState<VisitData[]>([]);
    const [loading, setLoading] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // Date Range State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCustomDateApplied, setIsCustomDateApplied] = useState(false);

    const [stats, setStats] = useState({
        today: 0,
        week: 0,
        month: 0
    });

    useEffect(() => {
        if (isOpen && sectorId) {
            fetchStats();
            fetchHistoryData();
        }
    }, [isOpen, sectorId]);

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // Fetch today
            const resToday = await fetch(`${API_URL}/api/visits?sectorId=${sectorId}&ticketStatus=FINISHED&filterType=day&date=${new Date().toISOString()}`, { headers });
            const dataToday = await resToday.json();

            // Fetch week
            const resWeek = await fetch(`${API_URL}/api/visits?sectorId=${sectorId}&ticketStatus=FINISHED&filterType=week&date=${new Date().toISOString()}`, { headers });
            const dataWeek = await resWeek.json();

            // Fetch month
            const resMonth = await fetch(`${API_URL}/api/visits?sectorId=${sectorId}&ticketStatus=FINISHED&filterType=month&date=${new Date().toISOString()}`, { headers });
            const dataMonth = await resMonth.json();

            setStats({
                today: dataToday?.length || 0,
                week: dataWeek?.length || 0,
                month: dataMonth?.length || 0
            });
        } catch (error) {
            console.error("Error fetching stats data", error);
        }
    };

    const fetchHistoryData = async (isCustom = false) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const headers = { 'Authorization': `Bearer ${token}` };

            let url = '';

            if (isCustom && startDate && endDate) {
                // Fetch using custom date range
                url = `${API_URL}/api/visits?sectorId=${sectorId}&ticketStatus=FINISHED&filterType=custom&startDate=${startDate}&endDate=${endDate}`;
            } else {
                // Default to current month history
                url = `${API_URL}/api/visits?sectorId=${sectorId}&ticketStatus=FINISHED&filterType=month&date=${new Date().toISOString()}`;
            }

            const res = await fetch(url, { headers });
            const data = await res.json();

            if (res.ok) {
                setVisits(data || []);
            } else {
                toast.error("Erro ao carregar histórico.");
            }

        } catch (error) {
            console.error("Error fetching history data", error);
            toast.error("Falha de comunicação com o servidor.");
        } finally {
            setLoading(false);
        }
    };

    const handleApplyDateFilter = () => {
        if (!startDate || !endDate) {
            toast.warning("Por favor, selecione a data inicial e final.");
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            toast.error("A data inicial não pode ser superior à data final.");
            return;
        }

        setIsCustomDateApplied(true);
        fetchHistoryData(true);
    };

    const handleClearDateFilter = () => {
        setStartDate('');
        setEndDate('');
        setIsCustomDateApplied(false);
        fetchHistoryData(false); // fetch default month back
    };

    const getExportUrl = (type: 'pdf' | 'xlsx') => {
        let url = `${API_URL}/api/export/${type}?sectorId=${sectorId}`;
        if (isCustomDateApplied && startDate && endDate) {
            url += `&filterType=custom&startDate=${startDate}&endDate=${endDate}`;
        } else {
            url += `&filterType=month&date=${new Date().toISOString()}`;
        }
        return url;
    };

    const handleExport = async (type: 'pdf' | 'xlsx') => {
        setExportMenuOpen(false);
        const loadingId = toast.loading(`Gerando exportação ${type.toUpperCase()}...`);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(getExportUrl(type), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Falha ao exportar');
            }
            
            const blob = await res.blob();
            let filename = `Relatorio_Export.${type}`;
            const disposition = res.headers.get('content-disposition');
            if (disposition && disposition.indexOf('filename=') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.dismiss(loadingId);
            toast.success(`Exportação ${type.toUpperCase()} concluída!`);
        } catch (error: any) {
            toast.dismiss(loadingId);
            toast.error(error.message || 'Erro ao gerar exportação.');
            console.error(error);
        }
    };

    const handleScheduleEmail = () => {
        setExportMenuOpen(false);
        toast.info("A funcionalidade de agendamento por e-mail está em prévia e será lançada na próxima versão.");
    };

    if (!isOpen) return null;

    const filteredVisits = visits.filter(visit => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;

        switch (filterType) {
            case 'cpf':
                return visit.citizen.cpf.includes(term.replace(/\D/g, ''));
            case 'name':
                return visit.citizen.name.toLowerCase().includes(term);
            case 'phone':
                return visit.citizen.phone && visit.citizen.phone.replace(/\D/g, '').includes(term.replace(/\D/g, ''));
            default: // all
                return (
                    visit.citizen.name.toLowerCase().includes(term) ||
                    visit.citizen.cpf.includes(term.replace(/\D/g, '')) ||
                    (visit.citizen.phone && visit.citizen.phone.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
                );
        }
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <header className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                            <BarChart3 className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Análise de Dados</h2>
                            <p className="text-sm text-slate-400">Desempenho de atendimentos: {sectorName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-emerald-500/10 to-slate-800/50 border border-emerald-500/20 p-5 rounded-2xl flex items-center gap-4">
                            <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                                <Users className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-400">Atendimentos Hoje</p>
                                <p className="text-3xl font-black text-white">{loading ? '...' : stats.today}</p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-indigo-500/10 to-slate-800/50 border border-indigo-500/20 p-5 rounded-2xl flex items-center gap-4">
                            <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                                <Calendar className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-400">Nesta Semana</p>
                                <p className="text-3xl font-black text-white">{loading ? '...' : stats.week}</p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-purple-500/10 to-slate-800/50 border border-purple-500/20 p-5 rounded-2xl flex items-center gap-4">
                            <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
                                <Clock className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-400">Neste Mês</p>
                                <p className="text-3xl font-black text-white">{loading ? '...' : stats.month}</p>
                            </div>
                        </div>
                    </div>

                    {/* Search and Filters Array */}
                    <div className="flex flex-col gap-4">
                        {/* Date Range Filter */}
                        <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row items-end gap-4 h-fit">
                            <div className="w-full md:w-auto">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Data Inicial</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:invert"
                                />
                            </div>
                            <div className="w-full md:w-auto">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Data Final</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:invert"
                                />
                            </div>
                            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                                <button
                                    onClick={handleApplyDateFilter}
                                    disabled={loading}
                                    className="flex-1 md:flex-none px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Filter className="w-4 h-4" /> Aplicar
                                </button>
                                {isCustomDateApplied && (
                                    <button
                                        onClick={handleClearDateFilter}
                                        disabled={loading}
                                        className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                        title="Limpar Filtro de Data"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                                
                                {/* Export Dropdown */}
                                <div className="relative ml-auto md:ml-4">
                                    <button
                                        onClick={() => setExportMenuOpen(!exportMenuOpen)}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/50 hover:bg-indigo-500/20 text-indigo-300 font-bold rounded-lg transition-all"
                                    >
                                        <Download className="w-4 h-4" /> Exportar Relatório <ChevronDown className="w-4 h-4" />
                                    </button>
                                    
                                    {exportMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                                            <button 
                                                onClick={() => handleExport('pdf')}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-700 flex items-center gap-3 text-slate-200 font-medium border-b border-slate-700 transition-colors"
                                            >
                                                <div className="bg-red-500/20 p-2 rounded-lg border border-red-500/30"><FileText className="w-4 h-4 text-red-400" /></div>
                                                PDF Premium
                                            </button>
                                            <button 
                                                onClick={() => handleExport('xlsx')}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-700 flex items-center gap-3 text-slate-200 font-medium border-b border-slate-700 transition-colors"
                                            >
                                                <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/30"><FileSpreadsheet className="w-4 h-4 text-emerald-400" /></div>
                                                XLSX Inteligente
                                            </button>
                                            <button 
                                                onClick={handleScheduleEmail}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-700 flex items-center gap-3 text-slate-300 font-medium transition-colors"
                                            >
                                                <div className="bg-blue-500/20 p-2 rounded-lg border border-blue-500/30"><Mail className="w-4 h-4 text-blue-400" /></div>
                                                Agendar envio por e-mail
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Search and Text Filter */}
                        <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row gap-3 relative">
                            <div className="absolute -top-3 left-4 bg-slate-800 px-2 text-xs font-bold text-indigo-400 uppercase tracking-widest border border-slate-700/50 rounded-md">
                                {isCustomDateApplied ? 'Histórico: Período Personalizado' : 'Histórico: Mês Atual'} • {filteredVisits.length} registros
                            </div>

                            <div className="flex-1 relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Pesquisar histórico na tabela..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <Filter className="w-5 h-5 text-slate-400" />
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="all">Busca em Todos os Campos</option>
                                    <option value="name">Apenas Nome</option>
                                    <option value="cpf">Apenas CPF</option>
                                    <option value="phone">Apenas Telefone</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Data List */}
                    <div className="flex-1 min-h-[300px] border border-slate-700/50 bg-slate-800/30 rounded-xl overflow-hidden flex flex-col">
                        <div className="grid grid-cols-12 gap-x-4 px-6 py-3 border-b border-slate-700/50 bg-slate-800/80 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <div className="col-span-2">Entrada</div>
                            <div className="col-span-2">Saída</div>
                            <div className="col-span-1">Status</div>
                            <div className="col-span-3">Cidadão</div>
                            <div className="col-span-2">Cpf</div>
                            <div className="col-span-2">Contato</div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="h-full flex items-center justify-center">
                                    <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                </div>
                            ) : filteredVisits.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
                                    <Search className="w-12 h-12 mb-3 opacity-20" />
                                    <p>Nenhum registro encontrado.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/50">
                                    {filteredVisits.map((visit) => (
                                        <div key={visit.id} className="grid grid-cols-12 gap-x-4 px-6 py-4 items-center hover:bg-slate-800/50 transition-colors">
                                            <div className="col-span-2 text-sm text-slate-300">
                                                <div className="font-medium">{new Date(visit.timestamp).toLocaleDateString('pt-BR')}</div>
                                                <div className="text-xs text-slate-500">{new Date(visit.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                            <div className="col-span-2 text-sm text-slate-300">
                                                {visit.finishedAt ? (
                                                    <>
                                                        <div className="font-medium">{new Date(visit.finishedAt).toLocaleDateString('pt-BR')}</div>
                                                        <div className="text-xs text-slate-500">{new Date(visit.finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-600 italic text-xs">Em aberto</span>
                                                )}
                                            </div>
                                            <div className="col-span-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                                    visit.ticketStatus === 'FINISHED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                                    visit.ticketStatus === 'IN_SERVICE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                    visit.ticketStatus === 'EXPIRED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                                    'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                                }`}>
                                                    {visit.ticketStatus === 'FINISHED' ? 'Fin.' :
                                                     visit.ticketStatus === 'IN_SERVICE' ? 'Atend.' :
                                                     visit.ticketStatus === 'IN_WAITING_ROOM' ? 'Sala' :
                                                     visit.ticketStatus === 'EXPIRED' ? 'Exp.' :
                                                     'Aguard.'}
                                                </span>
                                            </div>
                                            <div className="col-span-3 text-sm font-medium text-white truncate pr-4">
                                                {visit.citizen.name}
                                            </div>
                                            <div className="col-span-2 flex items-center gap-2 text-sm text-slate-300 font-mono">
                                                <Hash className="w-3.5 h-3.5 text-slate-500" />
                                                {visit.citizen.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                            </div>
                                            <div className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
                                                {visit.citizen.phone ? (
                                                    <><Phone className="w-3.5 h-3.5 text-emerald-500" /><span>{visit.citizen.phone}</span></>
                                                ) : (
                                                    <span className="text-slate-600 italic">N/I</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
