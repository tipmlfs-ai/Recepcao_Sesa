import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, Plus, Trash2, KeyRound } from 'lucide-react';

interface Sector {
    id: string;
    name: string;
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

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [usersRes, sectorsRes] = await Promise.all([
                fetch('http://localhost:3001/api/users', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('http://localhost:3001/api/sectors', { headers: { 'Authorization': `Bearer ${token}` } })
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
            const res = await fetch('http://localhost:3001/api/users', {
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
            const res = await fetch(`http://localhost:3001/api/users/${userToDelete.id}`, {
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
            const res = await fetch(`http://localhost:3001/api/users/${userToChangePwd.id}/password`, {
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
                    <Users className="w-6 h-6 text-blue-400" />
                    <h1 className="text-xl font-bold">Painel de TI - Gestão de Acessos</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsCreating(true)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4" /> Novo Usuário
                    </button>
                    <button onClick={handleLogout} className="flex items-center gap-2 hover:text-red-400 font-medium transition-colors">
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
        </div>
    );
};

export default Admin;
