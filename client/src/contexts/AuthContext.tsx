import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

export interface User {
    id: string;
    email: string;
    role: 'ADMIN' | 'RECEPTION' | 'SECTOR';
    sectorName?: string;
    sectorId?: string;
}

interface AuthContextData {
    user: User | null;
    token: string | null;
    login: (token: string, userData: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        const storedToken = localStorage.getItem('@RecepcaoSesa:token');
        if (storedToken) {
            try {
                const decoded = jwtDecode<User>(storedToken);
                // Basic expiration check can be added here
                setToken(storedToken);
                setUser(decoded);
            } catch (e) {
                localStorage.removeItem('@RecepcaoSesa:token');
                setToken(null);
                setUser(null);
            }
        }
    }, []);

    const login = (newToken: string, userData: User) => {
        localStorage.setItem('@RecepcaoSesa:token', newToken);
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('@RecepcaoSesa:token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
