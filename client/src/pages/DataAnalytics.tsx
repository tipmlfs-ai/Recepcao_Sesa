import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config/apiConfig';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart, Line 
} from 'recharts';
import { 
    Activity, ShieldCheck, Clock, FileWarning, ArrowLeft, BarChart3, TrendingUp,
    Download, ChevronDown, FileText, FileSpreadsheet, Mail
} from 'lucide-react';
import { toast } from 'sonner';

interface VisitData {
    id: string;
    code: string | null;
    ticketStatus: string;
    timestamp: string;
    sectorId: string;
    citizenId: string;
    citizen: { cpf: string; name: string; phone: string | null };
    sector: { name: string };
}

const DataAnalytics: React.FC = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [visits, setVisits] = useState<VisitData[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            // Fetch ALL visits for the current month
            const res = await fetch(`${API_URL}/api/visits?filterType=month&date=${new Date().toISOString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setVisits(data);
            }
        } catch (error) {
            console.error("Error fetching analytics data", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Data Quality KPIs
    const qualityStats = useMemo(() => {
        if (!visits.length) return { completeness: 0, duplication: 0, latency: 0 };
        
        let missingPhones = 0;
        let nullCodes = 0;
        const uniqueCpfs = new Set();
        let totalTimeWaiting = 0;
        let finishedCount = 0;

        visits.forEach(v => {
            if (!v.citizen?.phone) missingPhones++;
            if (!v.code) nullCodes++;
            uniqueCpfs.add(v.citizenId);

            if (v.ticketStatus === 'FINISHED') {
                // Approximate wait time assuming code structure or logic.
                // Since we don't track finishTime in DB directly for this project, 
                // we simulate latency calculation based on timestamp age for demonstration,
                // or just measure average age of pending tickets.
                const ageMinutes = (Date.now() - new Date(v.timestamp).getTime()) / 60000;
                totalTimeWaiting += ageMinutes;
                finishedCount++;
            }
        });

        const completeness = 100 - ((missingPhones + nullCodes) / (visits.length * 2) * 100);
        const duplications = visits.length - uniqueCpfs.size;
        const avgLatency = finishedCount > 0 ? (totalTimeWaiting / finishedCount) : 0;

        return {
            completeness: completeness.toFixed(1),
            duplication: duplications,
            latency: avgLatency.toFixed(0)
        };
    }, [visits]);

    // Cross-Department Performance Data
    const crossDepartmentData = useMemo(() => {
        const sectorMap: Record<string, { name: string; finished: number; waiting: number }> = {};
        
        visits.forEach(v => {
            if (!v.sector) return;
            if (!sectorMap[v.sector.name]) {
                sectorMap[v.sector.name] = { name: v.sector.name, finished: 0, waiting: 0 };
            }
            if (v.ticketStatus === 'FINISHED') sectorMap[v.sector.name].finished++;
            if (v.ticketStatus === 'WAITING' || v.ticketStatus === 'IN_SERVICE') sectorMap[v.sector.name].waiting++;
        });

        return Object.values(sectorMap).sort((a, b) => b.finished - a.finished);
    }, [visits]);

    // Trend Analysis Data (Grouped by Date)
    const trendData = useMemo(() => {
        const datesMap: Record<string, any> = {};
        
        // Find top 3 sectors to plot lines
        const topSectors = crossDepartmentData.slice(0, 3).map(s => s.name);

        visits.forEach(v => {
            if (!v.sector || !topSectors.includes(v.sector.name)) return;
            const dateStr = new Date(v.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            
            if (!datesMap[dateStr]) {
                datesMap[dateStr] = { name: dateStr };
                topSectors.forEach(s => datesMap[dateStr][s] = 0);
            }
            datesMap[dateStr][v.sector.name]++;
        });

        return Object.values(datesMap).reverse(); // Oldest first
    }, [visits, crossDepartmentData]);

    const handleDrilldown = (data: any) => {
        // Navigates to the sector specific page or opens modal
        // For now, we alert the IT user or navigate to Admin Sector config
        alert(`Drill-down para o setor: ${data.name}. Isso abrirá o modal detalhado na visão de TI.`);
    };

    const handleExport = async (type: 'pdf' | 'xlsx') => {
        setExportMenuOpen(false);
        const loadingId = toast.loading(`Gerando exportação global ${type.toUpperCase()}...`);
        try {
            const res = await fetch(`${API_URL}/api/export/${type}?filterType=month&date=${new Date().toISOString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Falha ao exportar');
            }
            
            const blob = await res.blob();
            let filename = `Relatorio_Global_Export.${type}`;
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
            toast.success(`Exportação global ${type.toUpperCase()} concluída!`);
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

    const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6'];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-slate-900 text-white shadow-xl py-4 px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-0 z-40">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/admin')}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="w-6 h-6 text-indigo-400" />
                            Data Analytics Hub
                        </h1>
                        <p className="text-sm text-slate-400">Visão Transversal de Performance & Governança (Mês Atual)</p>
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setExportMenuOpen(!exportMenuOpen)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/50 hover:bg-indigo-500/20 text-indigo-300 font-bold rounded-lg transition-all"
                    >
                        <Download className="w-4 h-4" /> Exportar Global <ChevronDown className="w-4 h-4" />
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
            </header>

            <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
                
                {/* Data Quality Health Indicators */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="p-4 bg-emerald-50 rounded-xl text-emerald-600">
                            <ShieldCheck className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Completude de Dados</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-3xl font-black text-slate-800">{qualityStats.completeness}%</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="p-4 bg-amber-50 rounded-xl text-amber-600">
                            <FileWarning className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Risco de Duplicidade</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-3xl font-black text-slate-800">{qualityStats.duplication}</p>
                                <span className="text-sm text-slate-400 font-medium">cadastros</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="p-4 bg-purple-50 rounded-xl text-purple-600">
                            <Clock className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Latência / TME Estimado</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-3xl font-black text-slate-800">{qualityStats.latency}</p>
                                <span className="text-sm text-slate-400 font-medium">minutos (méd)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Cross-Department Bar Chart */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-[450px]">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                            <BarChart3 className="w-5 h-5 text-indigo-500" />
                            Visão Cross-Department
                        </h3>
                        <div className="flex-1 w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={crossDepartmentData}
                                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                    onClick={(data: any) => {
                                        if (data && data.activePayload && data.activePayload.length) {
                                            handleDrilldown(data.activePayload[0].payload);
                                        }
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                    <Tooltip 
                                        cursor={{fill: '#f1f5f9'}}
                                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'}} 
                                    />
                                    <Legend wrapperStyle={{paddingTop: '20px'}} />
                                    <Bar dataKey="finished" name="Finalizados" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} className="cursor-pointer" />
                                    <Bar dataKey="waiting" name="Em Espera" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} className="cursor-pointer" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-slate-400 text-center mt-4">Clique em uma barra para fazer o Drill-down (Detalhes do Setor)</p>
                    </div>

                    {/* Trend Analysis Line Chart */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-[450px]">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                            <TrendingUp className="w-5 h-5 text-indigo-500" />
                            Análise de Tendência Diária (Gargalos)
                        </h3>
                        {trendData.length > 0 ? (
                            <div className="flex-1 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={trendData}
                                        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                        <Tooltip 
                                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'}} 
                                        />
                                        <Legend wrapperStyle={{paddingTop: '20px'}} />
                                        {Object.keys(trendData[0] || {}).filter(k => k !== 'name').map((key, idx) => (
                                            <Line 
                                                key={key} 
                                                type="monotone" 
                                                dataKey={key} 
                                                stroke={COLORS[idx % COLORS.length]} 
                                                strokeWidth={3}
                                                dot={{r: 4, strokeWidth: 2}}
                                                activeDot={{r: 6}}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-400">
                                Nenhum volume de dados significativo para formar tendência.
                            </div>
                        )}
                        <p className="text-xs text-slate-400 text-center mt-4">Identificação cruzada de aumento de demanda nos top 3 setores</p>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default DataAnalytics;
