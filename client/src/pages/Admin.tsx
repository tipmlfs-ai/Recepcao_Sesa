import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, Plus, Trash2, KeyRound, BarChart3 } from 'lucide-react';
import { API_URL } from '../config/apiConfig';

interface Resource {
    id: string;
    name: string;
    sectorId?: string;
}

interface Sector {
    id: string;
    name: string;
    callCooldown: number;
    soundUrl: string | null;
    hasWaitingRoom: boolean;
    waitingRoomCapacity: number;
    isHeterogeneous?: boolean;
    isVisibleOnPanel?: boolean;
    isVisibleInEntryLog?: boolean;
    resources?: Resource[];
}

interface UserData {
    id: string;
    email: string;
    role: 'ADMIN' | 'RECEPTION' | 'SECTOR';
    sectorId: string | null;
    sector: { name: string } | null;
    createdAt: string;
}

const Admin: React.FC = () => {
    const { token, logout, user: authUser } = useAuth();
    const navigate = useNavigate();

    const [users, setUsers] = useState<UserData[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form inputs state
    const [isCreating, setIsCreating] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'ADMIN' | 'RECEPTION' | 'SECTOR'>('SECTOR');
    const [newSectorId, setNewSectorId] = useState('');

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<{ id: string, email: string } | null>(null);
    const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');

    // Password Update Modal State
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [userToChangePwd, setUserToChangePwd] = useState<{ id: string, email: string } | null>(null);
    const [newUserPassword, setNewUserPassword] = useState('');

    // Sector Management State
    const [activeTab, setActiveTab] = useState<'users' | 'sectors' | 'entrylog'>('users');
    const [editingSector, setEditingSector] = useState<Sector | null>(null);
    const [editSectorName, setEditSectorName] = useState('');
    const [editCallCooldown, setEditCallCooldown] = useState(120);
    const [editHasWaitingRoom, setEditHasWaitingRoom] = useState(false);
    const [editWaitingRoomCapacity, setEditWaitingRoomCapacity] = useState(5);
    const [editIsHeterogeneous, setEditIsHeterogeneous] = useState(false);
    const [editIsVisibleOnPanel, setEditIsVisibleOnPanel] = useState(true);
    const [editIsVisibleInEntryLog, setEditIsVisibleInEntryLog] = useState(true);
    const [editResources, setEditResources] = useState<Resource[]>([]);
    const [newResourceName, setNewResourceName] = useState('');

    // New Sector State
    const [isCreatingSector, setIsCreatingSector] = useState(false);
    const [newSectorName, setNewSectorName] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [usersRes, sectorsRes] = await Promise.all([
                fetch(`${API_URL}/api/users`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_URL}/api/sectors`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (usersRes.ok) setUsers(await usersRes.json());
            if (sectorsRes.ok) setSectors(await sectorsRes.json());
        } catch (error) {
            console.error('Error fetching admin data', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    email: newEmail,
                    password: newPassword,
                    role: newRole,
                    sectorId: newRole === 'SECTOR' ? newSectorId || undefined : undefined
                })
            });

            if (res.ok) {
                const createdUser = await res.json();
                setUsers([createdUser, ...users]);
                setIsCreating(false);
                setNewEmail('');
                setNewPassword('');
                setNewRole('SECTOR');
                setNewSectorId('');
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao criar usuário');
            }
        } catch (error) {
            alert('Erro de conexão ao criar usuário');
        }
    };

    // ----- DELETE USER FUNCTIONS -----
    const openDeleteModal = (id: string, email: string) => {
        setUserToDelete({ id, email });
        setAdminPasswordConfirm('');
        setDeleteModalOpen(true);
    };

    const executeDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userToDelete) return;

        try {
            const res = await fetch(`${API_URL}/api/users/${userToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPassword: adminPasswordConfirm })
            });

            if (res.ok) {
                setUsers(users.filter(u => u.id !== userToDelete.id));
                setDeleteModalOpen(false);
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao deletar usuário');
            }
        } catch (error) {
            alert('Erro de conexão ao deletar usuário');
        }
    };

    // ----- CHANGE PASSWORD FUNCTIONS -----
    const openPasswordModal = (id: string, email: string) => {
        setUserToChangePwd({ id, email });
        setNewUserPassword('');
        setAdminPasswordConfirm('');
        setPasswordModalOpen(true);
    };

    const executePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userToChangePwd) return;

        try {
            const res = await fetch(`${API_URL}/api/users/${userToChangePwd.id}/password`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: newUserPassword, adminPassword: adminPasswordConfirm })
            });

            if (res.ok) {
                alert('Senha atualizada com sucesso!');
                setPasswordModalOpen(false);
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao atualizar senha');
            }
        } catch (error) {
            alert('Erro de conexão ao atualizar senha');
        }
    };

    const handleCreateSector = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/sectors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: newSectorName,
                    callCooldown: 120,
                    hasWaitingRoom: false,
                    waitingRoomCapacity: 5,
                    isHeterogeneous: false,
                    isVisibleOnPanel: true,
                    isVisibleInEntryLog: true
                })
            });

            if (res.ok) {
                const created = await res.json();
                setSectors([...sectors, created]);
                setIsCreatingSector(false);
                setNewSectorName('');
                alert('Setor criado com sucesso!');
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao criar setor');
            }
        } catch (error) {
            alert('Erro de conexão ao criar setor');
        }
    };

    const handleUpdateSector = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSector) return;

        try {
            const res = await fetch(`${API_URL}/api/sectors/${editingSector.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: editSectorName,
                    callCooldown: editCallCooldown,
                    hasWaitingRoom: editHasWaitingRoom,
                    waitingRoomCapacity: editWaitingRoomCapacity,
                    isHeterogeneous: editIsHeterogeneous,
                    isVisibleOnPanel: editIsVisibleOnPanel,
                    isVisibleInEntryLog: editIsVisibleInEntryLog
                })
            });

            if (res.ok) {
                const updated = await res.json();
                setSectors(sectors.map(s => s.id === updated.id ? updated : s));
                setEditingSector(null);
                alert('Setor atualizado com sucesso!');
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao atualizar setor');
            }
        } catch (error) {
            alert('Erro de conexão');
        }
    };

    const handleAddResource = async () => {
        if (!newResourceName.trim() || !editingSector) return;
        try {
            const res = await fetch(`${API_URL}/api/sectors/${editingSector.id}/resources`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: newResourceName })
            });
            if (res.ok) {
                const added = await res.json();
                setEditResources([...editResources, added]);
                setNewResourceName('');
                fetchData(); // Refresh the list
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao adicionar recurso');
            }
        } catch (error) {
            alert('Erro de conexão ao adicionar recurso');
        }
    };

    const handleDeleteResource = async (resourceId: string) => {
        if (!confirm('Deseja realmente deletar este guichê/analista?')) return;
        try {
            const res = await fetch(`${API_URL}/api/resources/${resourceId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setEditResources(editResources.filter(r => r.id !== resourceId));
                fetchData();
            } else {
                const err = await res.json();
                alert(err.error || 'Erro ao deletar recurso');
            }
        } catch (error) {
            alert('Erro de conexão');
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Common Input Styling (fixes the white-text bug on Light Mode / Tailwind base resets)
    const theInputStyle = "w-full bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400";

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col relative">
            <header className="bg-slate-900 text-white shadow-md py-4 px-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Logo Prefeitura" className="h-10 object-contain" />
                    <Users className="w-6 h-6 text-blue-400" />
                    <h1 className="text-xl font-bold">Painel de TI - Gestão de Acessos</h1>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-4 sm:mt-0">
                    <div className="flex bg-slate-800 p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Usuários
                        </button>
                        <button 
                            onClick={() => setActiveTab('sectors')}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'sectors' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Setores
                        </button>
                        <button 
                            onClick={() => setActiveTab('entrylog')}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'entrylog' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Caderno
                        </button>
                    </div>
                    <button onClick={() => navigate('/admin/analytics')} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm text-white">
                        <BarChart3 className="w-4 h-4" /> Analytics
                    </button>
                    <div className="flex gap-2">
                        <button onClick={() => { setIsCreating(true); setIsCreatingSector(false); setActiveTab('users'); }} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-xs text-white">
                            <Plus className="w-4 h-4" /> Novo Usuário
                        </button>
                        <button onClick={() => { setIsCreatingSector(true); setIsCreating(false); setActiveTab('sectors'); }} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-xs text-white">
                            <Plus className="w-4 h-4" /> Novo Setor
                        </button>
                    </div>
                    <button onClick={handleLogout} className="flex items-center gap-2 hover:text-red-400 font-medium transition-colors text-white">
                        Sair <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="flex-grow p-6 flex justify-center">
                <div className="w-full max-w-5xl">

                    {isCreating && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                            <h2 className="text-lg font-bold text-slate-800 mb-4">Adicionar Novo Acesso</h2>
                            <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">E-mail de Acesso</label>
                                    <input
                                        type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)}
                                        className={theInputStyle} placeholder="exemplo@sesa.pr.gov.br"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha Inicial</label>
                                    <input
                                        type="password" required minLength={4} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                        className={theInputStyle} placeholder="****"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Acesso (Cargo)</label>
                                    <select
                                        value={newRole} onChange={e => setNewRole(e.target.value as any)}
                                        className={theInputStyle}
                                    >
                                        <option value="SECTOR">Setor (Atendente)</option>
                                        <option value="RECEPTION">Recepcionista</option>
                                        <option value="ADMIN">Administrador de TI</option>
                                    </select>
                                </div>

                                {newRole === 'SECTOR' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Vincular a qual Setor?</label>
                                        <select
                                            required={newRole === 'SECTOR'} value={newSectorId} onChange={e => setNewSectorId(e.target.value)}
                                            className={theInputStyle}
                                        >
                                            <option value="">-- Selecione o Setor --</option>
                                            {sectors.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                                    <button type="button" onClick={() => setIsCreating(false)} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
                                    <button type="submit" className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-medium">Salvar Usuário</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {isCreatingSector && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                            <h2 className="text-lg font-bold text-slate-800 mb-4">Adicionar Novo Setor</h2>
                            <form onSubmit={handleCreateSector} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Setor</label>
                                    <input
                                        type="text" required value={newSectorName} onChange={e => setNewSectorName(e.target.value)}
                                        className={theInputStyle} placeholder="Ex: Protocolo, Recursos Humanos..."
                                    />
                                </div>
                                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                                    <button type="button" onClick={() => setIsCreatingSector(false)} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
                                    <button type="submit" className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-medium">Criar Setor</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {activeTab === 'users' ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold text-slate-700">E-mail</th>
                                        <th className="px-6 py-4 font-semibold text-slate-700">Cargo</th>
                                        <th className="px-6 py-4 font-semibold text-slate-700">Setor Vinculado</th>
                                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-800">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                                Carregando usuários...
                                            </td>
                                        </tr>
                                    ) : users.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-900">{u.email}</td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                                    u.role === 'RECEPTION' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {u.role === 'ADMIN' ? 'TI ADMIN' : u.role === 'RECEPTION' ? 'RECEPÇÃO' : 'ATENDENTE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {u.sector?.name || <span className="text-slate-400 italic">Sem vínculo</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button
                                                    onClick={() => openPasswordModal(u.id, u.email)}
                                                    className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                    title="Alterar Senha"
                                                >
                                                    <KeyRound className="w-5 h-5" />
                                                </button>

                                                {u.id !== authUser?.id && (
                                                    <button
                                                        onClick={() => openDeleteModal(u.id, u.email)}
                                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Deletar Usuário"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!isLoading && users.length === 0 && (
                                <div className="p-8 text-center text-slate-500">
                                    Nenhum usuário cadastrado.
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'sectors' ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold text-slate-700">Nome do Setor</th>
                                        <th className="px-6 py-4 font-semibold text-slate-700">Espera da Fila (Cooldown)</th>
                                        <th className="px-6 py-4 font-semibold text-slate-700 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-800">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                                                Carregando setores...
                                            </td>
                                        </tr>
                                    ) : sectors.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-900">{s.name}</td>
                                            <td className="px-6 py-4 font-mono text-blue-600 font-bold">
                                                {s.callCooldown || 120} segundos
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingSector(s);
                                                        setEditSectorName(s.name);
                                                        setEditCallCooldown(s.callCooldown || 120);
                                                        setEditHasWaitingRoom(s.hasWaitingRoom || false);
                                                        setEditWaitingRoomCapacity(s.waitingRoomCapacity || 5);
                                                        setEditIsHeterogeneous(s.isHeterogeneous || false);
                                                        setEditIsVisibleOnPanel(s.isVisibleOnPanel ?? true);
                                                        setEditIsVisibleInEntryLog(s.isVisibleInEntryLog ?? true);
                                                        setEditResources(s.resources || []);
                                                    }}
                                                    className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all font-bold text-sm"
                                                >
                                                    Configurar Intervalo
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6">
                            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Users className="w-6 h-6 text-emerald-600" />
                                Gestão do Caderno de Entrada
                            </h2>
                            <p className="text-slate-600 mb-6 text-sm">
                                Configure quais setores aparecem na aba "Caderno de Entrada" da recepção e gerencie os registros.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                                {sectors.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800">{s.name}</span>
                                            <span className={`text-[10px] font-bold uppercase ${s.isVisibleInEntryLog ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {s.isVisibleInEntryLog ? 'Visível no Caderno' : 'Oculto no Caderno'}
                                            </span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={s.isVisibleInEntryLog ?? true} 
                                                onChange={async (e) => {
                                                    const checked = e.target.checked;
                                                    try {
                                                        const res = await fetch(`${API_URL}/api/sectors/${s.id}`, {
                                                            method: 'PATCH',
                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                            body: JSON.stringify({ isVisibleInEntryLog: checked })
                                                        });
                                                        if (res.ok) {
                                                            setSectors(sectors.map(sec => sec.id === s.id ? { ...sec, isVisibleInEntryLog: checked } : sec));
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                    }
                                                }}
                                            />
                                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-slate-100 pt-8">
                                <h3 className="text-lg font-bold text-slate-800 mb-4">Relatório do Caderno</h3>
                                <p className="text-slate-500 text-sm mb-4 italic">
                                    Para gerar relatórios e exportar PDFs do Caderno de Entrada, utilize a aba "Data Analytics" clicando no botão acima, ou acesse a aba "Caderno de Entrada" na recepção.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* MODAL: DELETE CONFIRMATION */}
            {deleteModalOpen && userToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Usuário</h3>
                            <p className="text-slate-600 mb-6 font-medium">
                                Para excluir o acesso de <strong className="text-red-500">{userToDelete.email}</strong>, confirme a sua senha de Administrador:
                            </p>

                            <form onSubmit={executeDelete}>
                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Sua Senha Mestra (TI)</label>
                                    <input
                                        type="password" autoFocus required
                                        value={adminPasswordConfirm} onChange={e => setAdminPasswordConfirm(e.target.value)}
                                        className={theInputStyle} placeholder="Confirme sua senha..."
                                    />
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button type="button" onClick={() => setDeleteModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors">Cancelar</button>
                                    <button type="submit" className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors flex items-center gap-2">
                                        <Trash2 className="w-4 h-4" /> Excluir Pra Sempre
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CHANGE PASSWORD */}
            {passwordModalOpen && userToChangePwd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Alterar Senha</h3>
                            <p className="text-slate-600 mb-6 font-medium">
                                Redefinindo a senha de acesso para <strong className="text-amber-600">{userToChangePwd.email}</strong>.
                            </p>

                            <form onSubmit={executePasswordChange}>
                                <div className="space-y-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Nova Senha (para {userToChangePwd.email})</label>
                                        <input
                                            type="password" autoFocus required minLength={4}
                                            value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)}
                                            className={theInputStyle} placeholder="Nova senha segura..."
                                        />
                                    </div>

                                    <div className="pt-2 border-t border-slate-100">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Sua Senha Mestra (Admin TI)</label>
                                        <input
                                            type="password" required
                                            value={adminPasswordConfirm} onChange={e => setAdminPasswordConfirm(e.target.value)}
                                            className={theInputStyle} placeholder="Confirme a sua senha..."
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button type="button" onClick={() => setPasswordModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors">Cancelar</button>
                                    <button type="submit" className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors flex items-center gap-2">
                                        <KeyRound className="w-4 h-4" /> Atualizar Senha
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: EDIT SECTOR */}
            {editingSector && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Configurar Tempo de Espera</h3>
                            <p className="text-slate-600 mb-6 font-medium">
                                Definindo limites para o setor: <strong className="text-blue-600">{editingSector.name}</strong>
                            </p>

                            <form onSubmit={handleUpdateSector}>
                                <div className="space-y-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Setor</label>
                                        <input
                                            type="text" required
                                            value={editSectorName} onChange={e => setEditSectorName(e.target.value)}
                                            className={theInputStyle}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">
                                            Intevalo Mínimo entre as Chamadas (s)
                                        </label>
                                        <div className="flex items-center gap-4 mt-2">
                                            <input
                                                type="range" min={0} max={600} step={10}
                                                value={editCallCooldown} onChange={e => setEditCallCooldown(parseInt(e.target.value))}
                                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <div className="w-16 h-10 flex flex-col items-center justify-center bg-blue-600 text-white rounded-lg font-black leading-none">
                                                <span className="text-[16px] leading-[14px] pt-1">{editCallCooldown}</span>
                                                <span className="text-[9px] opacity-80 uppercase tracking-widest font-bold">segs</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 italic uppercase font-bold tracking-tighter leading-tight">
                                            * Define quantos segundos a recepção e demais usuários deste setor deverão obrigatoriamente aguardar para clicar em "Chamar Próximo" ou chamar para a sala de espera novamente.
                                        </p>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700">Painel Principal (Recepção)</label>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Exibir chamadas deste setor na tela da TV</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={editIsVisibleOnPanel} onChange={e => setEditIsVisibleOnPanel(e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-300 border border-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-400 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-md peer-checked:bg-green-600"></div>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700">Caderno de Entrada</label>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Exibir este setor na aba de registro manual (Caderno)</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={editIsVisibleInEntryLog} onChange={e => setEditIsVisibleInEntryLog(e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-300 border border-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-400 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-md peer-checked:bg-emerald-600"></div>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700">Sala de Espera Interna</label>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Ativar fluxo de sala de espera (pré-atendimento)</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={editHasWaitingRoom} onChange={e => setEditHasWaitingRoom(e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-300 border border-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-400 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-md peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        
                                        {editHasWaitingRoom && (
                                            <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                                                <label className="block text-sm font-bold text-slate-700 mb-1">
                                                    Capacidade da Sala (Pessoas)
                                                </label>
                                                <input
                                                    type="number" min={1} max={50} required
                                                    value={editWaitingRoomCapacity} onChange={e => setEditWaitingRoomCapacity(parseInt(e.target.value))}
                                                    className={theInputStyle}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700">Subfilas Heterogêneas (Mesas / Analistas)</label>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Ativar filas separadas mantendo a mesma ordem geral de chegada.</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={editIsHeterogeneous} onChange={e => setEditIsHeterogeneous(e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-300 border border-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-400 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-md peer-checked:bg-purple-600"></div>
                                            </label>
                                        </div>

                                        {editIsHeterogeneous && (
                                            <div className="animate-in pb-4 slide-in-from-top-2 fade-in duration-200">
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Ex: Mesa 1, Analista João..." 
                                                        className={theInputStyle}
                                                        value={newResourceName}
                                                        onChange={e => setNewResourceName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddResource(); } }}
                                                    />
                                                    <button type="button" onClick={handleAddResource} className="px-4 py-2 bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white rounded-lg font-bold transition-all whitespace-nowrap">
                                                        + Adicionar
                                                    </button>
                                                </div>
                                                <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                                                    {editResources.map(res => (
                                                        <div key={res.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 border border-slate-200 rounded-lg">
                                                            <span className="font-medium text-slate-700 text-sm">{res.name}</span>
                                                            <button type="button" onClick={() => handleDeleteResource(res.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {editResources.length === 0 && (
                                                        <div className="text-xs text-slate-500 italic text-center py-2">Nenhum recurso cadastrado.</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 mt-4">
                                    <button type="button" onClick={() => setEditingSector(null)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors">Cancelar</button>
                                    <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors">
                                        Salvar Configurações
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
