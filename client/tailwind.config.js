/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'status-available': '#10b981',
                'status-busy': '#ef4444',
                'status-away': '#f59e0b',
                'status-available-bg': 'rgba(16, 185, 129, 0.1)',
                'status-busy-bg': 'rgba(239, 68, 68, 0.1)',
                'status-away-bg': 'rgba(245, 158, 11, 0.1)',
            }
        },
    },
    plugins: [],
}
