import React, { useState, useEffect } from 'react';
import { type Sector } from '../types';
import { UserPlus, Download, Search, FileText, Calendar, CheckCheck } from 'lucide-react';
import { API_URL } from '../config/apiConfig';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface EntryLogTabProps {
    sectors: Sector[];
}

interface EntryLog {
    id: string;
    cpf: string;
    name: string;
    phone: string | null;
    sectorId: string;
    sector: { name: string };
    timestamp: string;
}

export const EntryLogTab: React.FC<EntryLogTabProps> = ({ sectors }) => {
    const [cpf, setCpf] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [selectedSector, setSelectedSector] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchingCpf, setSearchingCpf] = useState(false);
    const [logs, setLogs] = useState<EntryLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    
    // Filter states
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'custom'>('today');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [exporting, setExporting] = useState(false);

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

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            let url = `${API_URL}/api/entry-logs?`;
            
            if (filterPeriod === 'today') {
                url += `filterType=day`;
            } else if (filterPeriod === 'custom' && startDate && endDate) {
                url += `filterType=custom&startDate=${startDate}&endDate=${endDate}`;
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (error) {
            console.error('Error fetching logs', error);
            toast.error('Erro ao carregar registros.');
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filterPeriod, startDate, endDate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (cpf.length < 14 || !name || !selectedSector) {
            toast.error('Preencha CPF, Nome e Setor.');
            return;
        }
        if (!validateCpf(cpf)) {
            toast.error('CPF inválido. Verifique os números.');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('@RecepcaoSesa:token');
            const res = await fetch(`${API_URL}/api/entry-logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ cpf, name, phone, sectorId: selectedSector })
            });

            if (res.ok) {
                toast.success('Entrada registrada com sucesso no caderno!');
                setCpf('');
                setName('');
                setPhone('');
                setSelectedSector('');
                fetchLogs(); // Refresh the list
            } else {
                const err = await res.json();
                toast.error(err.error || 'Erro ao registrar entrada');
            }
        } catch (error) {
            toast.error('Erro de conexão');
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = async () => {
        try {
            setExporting(true);
            const token = localStorage.getItem('@RecepcaoSesa:token');
            let url = `${API_URL}/api/export/entry-logs/pdf?`;
            
            if (filterPeriod === 'today') {
                url += `filterType=day`;
            } else if (filterPeriod === 'custom' && startDate && endDate) {
                url += `filterType=custom&startDate=${startDate}&endDate=${endDate}`;
            }

            // Also pass search term if any
            if (searchTerm) {
                // We are searching locally, but if we wanted to filter on backend, we could pass it here.
                // The backend currently supports 'cpf'. We'll just pass 'cpf' if it looks like one.
                const cleanCpf = formatCpf(searchTerm);
                if (cleanCpf.length === 14) {
                    url += `&cpf=${cleanCpf}`;
                }
            }

            toast.info('Gerando PDF...', { id: 'pdf-toast' });
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Falha ao gerar o PDF');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Caderno_Entrada_${format(new Date(), 'yyyyMMdd')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            toast.success('PDF exportado com sucesso!', { id: 'pdf-toast' });
        } catch (error) {
            console.error('Error exporting PDF:', error);
            toast.error('Erro ao exportar PDF.', { id: 'pdf-toast' });
        } finally {
            setExporting(false);
        }
    };

    const filteredLogs = logs.filter(log => 
        log.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        log.cpf.includes(searchTerm) ||
        log.sector.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* REGISTRO FORM */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

                <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-3 relative z-10">
                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shadow-inner">
                        <FileText className="w-6 h-6 text-emerald-400" />
                    </div>
                    Caderno de Entrada (Registro Simples)
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-2 ml-1">CPF do Cidadão</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={cpf}
                                    onChange={handleCpfChange}
                                    placeholder="000.000.000-00"
                                    maxLength={14}
                                    className={`w-full bg-slate-900/50 border ${
                                        cpf.length === 14 
                                        ? (validateCpf(cpf) ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-rose-500 ring-1 ring-rose-500/30') 
                                        : 'border-slate-700'
                                    } text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600 font-medium font-mono shadow-inner group-hover:border-slate-600`}
                                    required
                                />
                                {cpf.length === 14 && (
                                    validateCpf(cpf) ? (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                                            <CheckCheck className="w-3 h-3" /> Válido
                                        </div>
                                    ) : (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 text-[10px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">Inválido</div>
                                    )
                                )}
                                {searchingCpf && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-bold animate-pulse">Buscando...</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-2 ml-1">Nome Completo</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome Completo do Cidadão"
                                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600 font-medium shadow-inner hover:border-slate-600"
                                required
                            />
                        </div>

                        <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-2 ml-1">Telefone (Opcional)</label>
                            <input
                                type="text"
                                value={phone}
                                onChange={handlePhoneChange}
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600 font-medium font-mono shadow-inner hover:border-slate-600"
                            />
                        </div>

                        <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-slate-400 text-sm font-bold tracking-wide uppercase mb-2 ml-1">Setor de Destino</label>
                            <select
                                value={selectedSector}
                                onChange={(e) => setSelectedSector(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all appearance-none font-medium shadow-inner hover:border-slate-600 cursor-pointer"
                                required
                            >
                                <option value="" disabled>Selecione um Setor...</option>
                                {sectors.filter(s => s.isVisibleInEntryLog !== false).map(s => (
                                    <option key={s.id} value={s.id} className="bg-slate-800 text-white">
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white tracking-wide font-bold py-3 px-8 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-400/20"
                        >
                            {loading ? 'Registrando...' : (
                                <>
                                    <UserPlus className="w-5 h-5" />
                                    Registrar Entrada
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* LISTA DE REGISTROS */}
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl relative">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-emerald-400" />
                        Histórico do Caderno
                    </h2>
                    
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64 min-w-[200px]">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Buscar por nome ou CPF..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                        
                        <select 
                            value={filterPeriod} 
                            onChange={(e) => setFilterPeriod(e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        >
                            <option value="today">Hoje</option>
                            <option value="custom">Personalizado</option>
                        </select>

                        {filterPeriod === 'custom' && (
                            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2">
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-transparent text-white text-sm py-2 focus:outline-none"
                                />
                                <span className="text-slate-500">até</span>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-transparent text-white text-sm py-2 focus:outline-none"
                                />
                            </div>
                        )}

                        <button 
                            onClick={handleExportPDF}
                            disabled={exporting}
                            className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-slate-600"
                        >
                            {exporting ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : <Download className="w-4 h-4" />}
                            {exporting ? 'Gerando...' : 'Exportar PDF'}
                        </button>
                    </div>
                </div>

                {loadingLogs ? (
                    <div className="text-center py-10">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-slate-400 font-medium">Carregando registros...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                        <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400 font-medium">Nenhum registro encontrado para este período.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Horário</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cidadão</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">CPF</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Destino</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-4 text-sm text-slate-300 whitespace-nowrap font-mono">
                                            {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm')}
                                        </td>
                                        <td className="py-3 px-4 text-sm font-medium text-white">
                                            {log.name}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-400 font-mono">
                                            {log.cpf}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-300">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-300">
                                                {log.sector.name}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EntryLogTab;
