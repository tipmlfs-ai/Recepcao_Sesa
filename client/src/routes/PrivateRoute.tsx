import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const PrivateRoute: React.FC = () => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

export const AdminRoute: React.FC = () => {
    const { user } = useAuth();

    if (user?.role !== 'ADMIN') {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export const ReceptionRoute: React.FC = () => {
    const { user } = useAuth();

    if (user?.role !== 'RECEPTION' && user?.role !== 'ADMIN') {
        return <Navigate to="/painel" replace />;
    }

    return <Outlet />;
};

export const SectorRoute: React.FC = () => {
    const { user } = useAuth();

    if (user?.role !== 'SECTOR') {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};
