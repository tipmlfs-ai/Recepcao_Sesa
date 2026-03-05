import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock } from 'lucide-react';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email.trim() || !password.trim()) {
            setError('Por favor, preencha o e-mail e a senha.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('http://localhost:3001/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro de autenticação');
            }

            // Save Token & User in Context
            login(data.token, data.user);

            // Redirect based on Role
            if (data.user.role === 'ADMIN') {
                navigate('/admin');
            } else if (data.user.role === 'RECEPTION') {
                navigate('/');
            } else {
                navigate('/painel');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao conectar com o servidor.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
                <div className="p-8">
                    <div className="flex justify-center mb-8">
                        <div className="bg-blue-500/10 p-4 rounded-full">
                            <Lock className="w-12 h-12 text-blue-500" />
                        </div>
                    </div>

                    <h2 className="text-3xl font-bold text-center text-white mb-2">Recepção Sesa</h2>
                    <p className="text-center text-slate-400 mb-8">Gestão de Salas e Setores</p>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                                E-mail
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError('');
                                }}
                                className="w-full bg-slate-700 text-white border border-slate-600 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                                placeholder="exemplo@sesa.pr.gov.br"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                placeholder="Sua senha secreta"
                                required
                            />
                            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            {isLoading ? 'Autenticando...' : 'Acessar Sistema'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
