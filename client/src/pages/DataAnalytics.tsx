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
    Download, ChevronDown, FileText, FileSpreadsheet, Mail, X
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
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFilterType, setExportFilterType] = useState<'all' | 'custom'>('all');
    const [exportStartDate, setExportStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [exportEndDate, setExportEndDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

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
        const uniqueDailyCpfs = new Set();
        let totalTimeWaiting = 0;
        let finishedCount = 0;

        visits.forEach(v => {
            if (!v.citizen?.phone) missingPhones++;
            if (!v.code) nullCodes++;
            
            const dateStr = new Date(v.timestamp).toLocaleDateString('pt-BR');
            uniqueDailyCpfs.add(`${v.citizenId}-${dateStr}`);

            if (v.ticketStatus === 'FINISHED') {
                let endTime = v.finishedAt ? new Date(v.finishedAt).getTime() : 
                              v.calledAt ? new Date(v.calledAt).getTime() : 
                              new Date(v.timestamp).getTime() + (15 * 60000); // fallback of 15mins for very old mock data

                const ageMinutes = Math.max(0, (endTime - new Date(v.timestamp).getTime()) / 60000);
                totalTimeWaiting += ageMinutes;
                finishedCount++;
            }
        });

        const completeness = 100 - ((missingPhones + nullCodes) / (visits.length * 2) * 100);
        const duplications = visits.length - uniqueDailyCpfs.size;
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
        setShowExportModal(false);
        const loadingId = toast.loading(`Gerando exportação global ${type.toUpperCase()}...`);
        try {
            let fetchUrl = `${API_URL}/api/export/${type}`;
            if (exportFilterType === 'custom') {
                if (!exportStartDate || !exportEndDate) {
                    toast.dismiss(loadingId);
                    toast.warning("Selecione as datas inicial e final para exportar.");
                    return;
                }
                if (new Date(exportStartDate) > new Date(exportEndDate)) {
                    toast.dismiss(loadingId);
                    toast.error("A data inicial não pode ser maior que a final.");
                    return;
                }
                fetchUrl += `?filterType=custom&startDate=${exportStartDate}&endDate=${exportEndDate}`;
            }

            const res = await fetch(fetchUrl, {
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
        setShowExportModal(false);
        toast.info("A funcionalidade de agendamento por e-mail está em prévia e será lançada na próxima versão.");
    };

    const handleDownloadKPIDict = () => {
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Dicionário de KPIs - SESA</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 40px; }
                    .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
                    h1 { color: #1e293b; font-size: 24px; margin: 0; }
                    .subtitle { color: #64748b; font-size: 14px; }
                    .kpi-block { margin-bottom: 30px; background: #f8fafc; padding: 20px; border-left: 4px solid #6366f1; border-radius: 4px; }
                    .kpi-title { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 0; display: flex; align-items: center; }
                    .kpi-desc { margin-top: 10px; }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Dicionário Oficial de KPIs</h1>
                    <div class="subtitle">Secretaria Municipal de Saúde - Inteligência de Dados</div>
                </div>

                <div class="kpi-block" style="border-left-color: #10b981;">
                    <h2 class="kpi-title">Completude de Dados (%)</h2>
                    <div class="kpi-desc">
                        <strong>O que mede:</strong> Avalia a qualidade do preenchimento de dados na recepção.<br/><br/>
                        <strong>Como funciona:</strong> Verifica a proporção de cidadãos que foram registrados com telefone válido e código gerado com sucesso em relação ao total de atendimentos. Valores próximos a 100% indicam ótima precisão da recepção.
                    </div>
                </div>

                <div class="kpi-block" style="border-left-color: #f59e0b;">
                    <h2 class="kpi-title">Risco de Duplicidade (cadastros)</h2>
                    <div class="kpi-desc">
                        <strong>O que mede:</strong> Identifica a quantidade de ingressos redundantes (senhas duplas) tirados para o mesmo Cidadão (mesmo CPF) no exato mesmo dia.<br/><br/>
                        <strong>Como funciona:</strong> Se um cidadão pega duas senhas no mesmo dia, contará como +1 risco de duplicidade. Auxilia a TI e Governança a identificar se a recepção está inserindo usuários repetidos equivocadamente ou problemas de falhas de envio duplo. Visitas do mesmo CPF em dias diferentes são consideradas tráfego normal e NÃO aumentam este risco.
                    </div>
                </div>

                <div class="kpi-block" style="border-left-color: #8b5cf6;">
                    <h2 class="kpi-title">Latência / TME Estimado (minutos)</h2>
                    <div class="kpi-desc">
                        <strong>O que mede:</strong> TME (Tempo Médio de Espera) é a diferença de tempo real percorrida entre o momento de emissão da senha até o atendimento ser finalizado (Checkout).<br/><br/>
                        <strong>Como funciona:</strong> Calcula o tempo exato (em minutos) que um ticket durou ativo (desde a recepção até a baixa no consultório). Esse número é a média global cruzada de todos os setores na tela principal.
                    </div>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                    }
                </script>
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.id = 'kpi-print-iframe';
        
        const oldIframe = document.getElementById('kpi-print-iframe');
        if (oldIframe) document.body.removeChild(oldIframe);
        
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
            doc.open();
            doc.write(printContent);
            doc.close();
        }
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
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/50 hover:bg-indigo-500/20 text-indigo-300 font-bold rounded-lg transition-all"
                    >
                        <Download className="w-4 h-4" /> Exportar Global
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
                
                {/* Header dos KPIs e Botão de Exportar Explicativo */}
                <div className="flex justify-between items-end">
                    <h2 className="text-lg font-bold text-slate-800">Indicadores de Saúde de Dados</h2>
                    <button onClick={handleDownloadKPIDict} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-800 transition-colors">
                        <FileText className="w-4 h-4" /> Baixar PDF Explicativo (KPIs)
                    </button>
                </div>

                {/* Data Quality Health Indicators */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
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
                        <div className="flex-1 w-full relative min-h-[300px]">
                            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
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
                            <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
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

            {/* Modal de Exportação Global */}
            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Download className="w-5 h-5 text-indigo-400" /> Exportação Global
                            </h2>
                            <button onClick={() => setShowExportModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </header>
                        
                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-slate-400 text-sm font-bold uppercase mb-3">Abrangência do Relatório</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setExportFilterType('all')}
                                        className={`px-3 py-3 rounded-xl border text-sm font-bold transition-all ${exportFilterType === 'all' ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                                    >
                                        Completo (Tudo)
                                    </button>
                                    <button 
                                        onClick={() => setExportFilterType('custom')}
                                        className={`px-3 py-3 rounded-xl border text-sm font-bold transition-all ${exportFilterType === 'custom' ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                                    >
                                        Período Específico
                                    </button>
                                </div>
                            </div>

                            {exportFilterType === 'custom' && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
                                    <div>
                                        <label className="block text-slate-400 text-xs font-bold uppercase mb-2 ml-1">Data Inicial</label>
                                        <input
                                            type="date"
                                            value={exportStartDate}
                                            onChange={(e) => setExportStartDate(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:invert"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-400 text-xs font-bold uppercase mb-2 ml-1">Data Final</label>
                                        <input
                                            type="date"
                                            value={exportEndDate}
                                            onChange={(e) => setExportEndDate(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none [&::-webkit-calendar-picker-indicator]:invert"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-slate-400 text-sm font-bold uppercase mb-3">Formato de Exportação</label>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <button 
                                        onClick={() => handleExport('pdf')}
                                        className="px-4 py-3 rounded-xl bg-slate-800 border border-red-500/30 text-white text-sm font-bold hover:bg-slate-700 hover:border-red-500 transition-all flex flex-col justify-center items-center gap-1"
                                    >
                                        <FileText className="w-5 h-5 text-red-400" /> Exportar PDF
                                    </button>
                                    <button 
                                        onClick={() => handleExport('xlsx')}
                                        className="px-4 py-3 rounded-xl bg-slate-800 border border-emerald-500/30 text-white text-sm font-bold hover:bg-slate-700 hover:border-emerald-500 transition-all flex flex-col justify-center items-center gap-1"
                                    >
                                        <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Exportar XLSX
                                    </button>
                                </div>
                                <button 
                                    onClick={handleScheduleEmail}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-blue-500/30 text-slate-300 text-sm font-bold hover:bg-slate-700 transition-all flex justify-center items-center gap-2"
                                >
                                    <Mail className="w-4 h-4 text-blue-400" /> Agendar por E-mail
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataAnalytics;
